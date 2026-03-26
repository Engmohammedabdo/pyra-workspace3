import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextInvoiceNumber } from '@/lib/utils/invoice-number';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/finance/contracts/[id]/generate-invoice
 * Generate an invoice for a retainer contract period.
 * Body: { period_label?, amount?, description?, display_client_name?, items? }
 */
export async function POST(req: NextRequest, context: RouteContext) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await context.params;
  const body = await req.json().catch(() => ({}));
  const supabase = createServiceRoleClient();

  try {
    // 1. Fetch contract
    const { data: contract, error: cErr } = await supabase
      .from('pyra_contracts')
      .select('id, title, client_id, currency, vat_rate, total_value, amount_billed, retainer_amount, retainer_cycle, billing_structure, status')
      .eq('id', id)
      .maybeSingle();

    if (cErr || !contract) return apiNotFound('العقد غير موجود');
    if (contract.status !== 'active') return apiError('العقد غير نشط', 400);

    // 2. Determine invoice amount
    const amount = body.amount
      ? Number(body.amount)
      : (contract.billing_structure?.amount_per_period || contract.retainer_amount || 0);

    if (!amount || amount <= 0) return apiError('المبلغ غير صالح', 400);

    // 3. Fetch client
    let clientData: Record<string, string | null> = {
      client_name: null, client_email: null, client_company: null, client_phone: null,
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

    // 4. Fetch settings
    const { data: settings } = await supabase
      .from('pyra_settings')
      .select('key, value')
      .in('key', [
        'vat_rate', 'bank_name', 'bank_account_name', 'bank_account_no',
        'bank_iban', 'company_name', 'company_logo', 'payment_terms_days',
      ]);
    const sm: Record<string, string> = {};
    for (const s of settings || []) sm[s.key] = s.value;

    const taxRate = contract.vat_rate != null ? Number(contract.vat_rate) : parseFloat(sm.vat_rate || '5');
    const bankDetails = {
      bank: sm.bank_name || '',
      account_name: sm.bank_account_name || '',
      account_no: sm.bank_account_no || '',
      iban: sm.bank_iban || '',
    };

    // 5. Calculate totals
    const subtotal = amount;
    const taxAmount = subtotal * (taxRate / 100);
    const total = subtotal + taxAmount;

    // 6. Due date
    const paymentTermsDays = parseInt(sm.payment_terms_days || '30');
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + paymentTermsDays);

    const invoiceId = generateId('inv');
    const invoiceNumber = await generateNextInvoiceNumber(supabase);

    // 7. Period label
    const periodLabel = body.period_label || contract.billing_structure?.type || contract.retainer_cycle || '';
    const description = body.description || `${contract.title} — ${periodLabel}`;

    // 8. Items
    const items = body.items && Array.isArray(body.items) && body.items.length > 0
      ? body.items
      : [{ description, quantity: 1, rate: amount }];

    // 9. Insert invoice
    const { data: invoice, error: insertError } = await supabase
      .from('pyra_invoices')
      .insert({
        id: invoiceId,
        invoice_number: invoiceNumber,
        client_id: contract.client_id || null,
        project_name: contract.title || null,
        display_client_name: body.display_client_name || null,
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
        notes: body.notes || `فاتورة من العقد: ${contract.title}`,
        bank_details: bankDetails,
        company_name: sm.company_name || null,
        company_logo: sm.company_logo || null,
        contract_id: id,
        created_by: auth.pyraUser.username,
        ...clientData,
      })
      .select(INVOICE_FIELDS)
      .single();

    if (insertError) {
      console.error('Invoice insert error:', insertError);
      return apiServerError(insertError.message);
    }

    // 10. Insert items — verify at least one succeeds before updating amount_billed
    let itemsInserted = 0;
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const { error: itemErr } = await supabase.from('pyra_invoice_items').insert({
        id: generateId('ii'),
        invoice_id: invoiceId,
        sort_order: i + 1,
        description: item.description || description,
        quantity: item.quantity || 1,
        rate: item.rate || amount,
        amount: (item.quantity || 1) * (item.rate || amount),
      });
      if (!itemErr) itemsInserted++;
      else console.error('Invoice item insert error:', itemErr);
    }

    // 11. Update contract amount_billed — only if items were inserted
    if (itemsInserted > 0) {
      await supabase.from('pyra_contracts').update({
        amount_billed: (contract.amount_billed || 0) + subtotal,
        updated_at: new Date().toISOString(),
      }).eq('id', id);
    }

    // 12. Activity log
    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'contract_invoice_generated',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/dashboard/invoices/${invoiceId}`,
      details: {
        contract_id: id,
        contract_title: contract.title,
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
