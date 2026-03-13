import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiError,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextInvoiceNumber } from '@/lib/utils/invoice-number';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string; milestoneId: string }> };

/**
 * POST /api/finance/contracts/[id]/milestones/[milestoneId]/generate-invoice
 * Auto-create an invoice from a completed milestone.
 */
export async function POST(
  req: NextRequest,
  context: RouteContext
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id, milestoneId } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    // 1. Fetch milestone and validate status
    const { data: milestone, error: mErr } = await supabase
      .from('pyra_contract_milestones')
      .select('id, contract_id, title, description, percentage, amount, status, invoice_id')
      .eq('id', milestoneId)
      .eq('contract_id', id)
      .maybeSingle();

    if (mErr || !milestone) return apiNotFound('المرحلة غير موجودة');

    // Guard: check if invoice already generated (race-condition safe)
    if (milestone.invoice_id) {
      return apiError('تم إنشاء فاتورة لهذه المرحلة مسبقاً', 400);
    }

    if (milestone.status !== 'completed') {
      return apiError(
        milestone.status === 'invoiced'
          ? 'تم إنشاء فاتورة لهذه المرحلة مسبقاً'
          : 'يجب اكتمال المرحلة قبل إنشاء الفاتورة',
        400
      );
    }

    // 2. Fetch contract data
    const { data: contract, error: cErr } = await supabase
      .from('pyra_contracts')
      .select('id, title, client_id, currency, vat_rate, amount_billed')
      .eq('id', id)
      .maybeSingle();

    if (cErr || !contract) return apiNotFound('العقد غير موجود');

    // 3. Fetch client data if client_id exists
    let clientData: Record<string, string | null> = {
      client_name: null,
      client_email: null,
      client_company: null,
      client_phone: null,
    };

    if (contract.client_id) {
      const { data: client } = await supabase
        .from('pyra_clients')
        .select('name, email, phone, company')
        .eq('id', contract.client_id)
        .maybeSingle();

      if (client) {
        clientData = {
          client_name: client.name,
          client_email: client.email,
          client_company: client.company,
          client_phone: client.phone,
        };
      }
    }

    // 4. Fetch settings (same pattern as invoices/route.ts POST)
    const { data: settings } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', [
        'vat_rate',
        'bank_name',
        'bank_account_name',
        'bank_account_no',
        'bank_iban',
        'company_name',
        'company_logo',
        'payment_terms_days',
      ]);

    const settingsMap: Record<string, string> = {};
    for (const s of settings || []) settingsMap[s.key] = s.value;

    // Use contract vat_rate if explicitly set (even 0), otherwise fall back to settings
    const taxRate = contract.vat_rate != null ? Number(contract.vat_rate) : parseFloat(settingsMap.vat_rate || '5');

    const bankDetails = {
      bank: settingsMap.bank_name || '',
      account_name: settingsMap.bank_account_name || '',
      account_no: settingsMap.bank_account_no || '',
      iban: settingsMap.bank_iban || '',
    };

    // 5. Generate invoice number
    const invoiceNumber = await generateNextInvoiceNumber(supabase);

    // 6. Calculate totals
    const subtotal = milestone.amount || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // 7. Determine due date
    const paymentTermsDays = parseInt(settingsMap.payment_terms_days || '30');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTermsDays);

    const invoiceId = generateId('inv');

    // 8. Insert invoice
    const { data: invoice, error: insertError } = await supabase
      .from('pyra_invoices')
      .insert({
        id: invoiceId,
        invoice_number: invoiceNumber,
        client_id: contract.client_id || null,
        project_name: contract.title || null,
        status: 'draft',
        issue_date: new Date().toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        currency: contract.currency || 'AED',
        subtotal,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total,
        amount_paid: 0,
        amount_due: total,
        notes: `فاتورة تلقائية من العقد: ${contract.title} - المرحلة: ${milestone.title}`,
        bank_details: bankDetails,
        company_name: settingsMap.company_name || null,
        company_logo: settingsMap.company_logo || null,
        contract_id: id,
        milestone_type: null,
        parent_invoice_id: null,
        created_by: auth.pyraUser.username,
        ...clientData,
      })
      .select(INVOICE_FIELDS)
      .single();

    if (insertError) {
      console.error('Invoice insert error:', insertError);
      return apiServerError();
    }

    // 9. Insert invoice item
    const { error: itemError } = await supabase
      .from('pyra_invoice_items')
      .insert({
        id: generateId('ii'),
        invoice_id: invoiceId,
        sort_order: 1,
        description: milestone.title,
        quantity: 1,
        rate: milestone.amount || 0,
        amount: milestone.amount || 0,
      });

    if (itemError) {
      console.error('Invoice item insert error:', itemError);
    }

    // 10. Update milestone: status → invoiced, set invoice_id
    const { error: mUpdateErr } = await supabase
      .from('pyra_contract_milestones')
      .update({
        status: 'invoiced',
        invoice_id: invoiceId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', milestoneId)
      .eq('contract_id', id);

    if (mUpdateErr) {
      console.error('Milestone update error:', mUpdateErr);
    }

    // 11. Update contract: amount_billed += milestone.amount
    const { error: cUpdateErr } = await supabase
      .from('pyra_contracts')
      .update({
        amount_billed: (contract.amount_billed || 0) + (milestone.amount || 0),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (cUpdateErr) {
      console.error('Contract update error:', cUpdateErr);
    }

    // 12. Log activity
    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'milestone_invoice_generated',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/invoices/${invoiceId}`,
      details: {
        contract_id: id,
        contract_title: contract.title,
        milestone_id: milestoneId,
        milestone_title: milestone.title,
        invoice_number: invoiceNumber,
        total,
      },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    return apiSuccess(invoice, undefined, 201);
  } catch (err) {
    console.error('POST generate-invoice error:', err);
    return apiServerError();
  }
}
