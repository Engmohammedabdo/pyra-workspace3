import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextInvoiceNumber } from '@/lib/utils/invoice-number';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';

/**
 * Calculate the next generation date based on billing cycle.
 */
function calculateNextDate(currentDate: string, billingCycle: string): string {
  const date = new Date(currentDate);
  const day = date.getDate();

  switch (billingCycle) {
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'yearly':
      date.setFullYear(date.getFullYear() + 1);
      break;
    default:
      date.setMonth(date.getMonth() + 1);
  }

  // Fix month overflow: if original day was 31 but new month only has 28-30 days,
  // setMonth overflows to next month. Clamp back to last day of target month.
  if (date.getDate() !== day) {
    date.setDate(0); // goes to last day of previous month (the intended month)
  }

  return date.toISOString().split('T')[0];
}

/**
 * POST /api/finance/recurring-invoices/generate
 * Batch generate invoices for all due recurring templates.
 * Admin only.
 */
export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();

  try {
    const today = new Date().toISOString().split('T')[0];

    // Find all active templates where next_generation_date <= today
    const { data: dueTemplates, error: fetchError } = await supabase
      .from('pyra_recurring_invoices')
      .select('*')
      .eq('status', 'active')
      .lte('next_generation_date', today);

    if (fetchError) throw fetchError;
    if (!dueTemplates || dueTemplates.length === 0) {
      return apiSuccess({ generated: 0, invoices: [] }, { message: 'لا توجد فواتير مستحقة للتوليد' });
    }

    // Fetch settings once
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

    const taxRate = parseFloat(settingsMap.vat_rate || '5');
    const paymentTermsDays = parseInt(settingsMap.payment_terms_days || '30');

    const bankDetails = {
      bank: settingsMap.bank_name || '',
      account_name: settingsMap.bank_account_name || '',
      account_no: settingsMap.bank_account_no || '',
      iban: settingsMap.bank_iban || '',
    };

    const generatedInvoices: string[] = [];

    for (const template of dueTemplates) {
      try {
        // 1. Fetch client data
        let clientData: Record<string, string | null> = {
          client_name: null,
          client_email: null,
          client_company: null,
          client_phone: null,
        };

        if (template.client_id) {
          const { data: client } = await supabase
            .from('pyra_clients')
            .select('name, email, phone, company')
            .eq('id', template.client_id)
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

        // 2. Generate invoice number
        const invoiceNumber = await generateNextInvoiceNumber(supabase);

        // 3. Calculate totals from items
        const items = template.items || [];
        const processedItems = items.map(
          (item: { description: string; quantity: number; rate: number }, idx: number) => ({
            id: generateId('ii'),
            sort_order: idx + 1,
            description: item.description?.trim() || '',
            quantity: item.quantity || 1,
            rate: item.rate || 0,
            amount: (item.quantity || 1) * (item.rate || 0),
          })
        );

        const subtotal = processedItems.reduce(
          (sum: number, i: { amount: number }) => sum + i.amount,
          0
        );
        const taxAmount = subtotal * (taxRate / 100);
        const total = subtotal + taxAmount;

        // 4. Calculate due date
        const issueDate = today;
        const dueDate = new Date();
        dueDate.setDate(dueDate.getDate() + paymentTermsDays);
        const dueDateStr = dueDate.toISOString().split('T')[0];

        // 5. Create invoice
        const invoiceId = generateId('inv');
        const invoiceStatus = template.auto_send ? 'sent' : 'draft';

        const { error: insertError } = await supabase
          .from('pyra_invoices')
          .insert({
            id: invoiceId,
            invoice_number: invoiceNumber,
            client_id: template.client_id || null,
            project_name: template.title,
            status: invoiceStatus,
            issue_date: issueDate,
            due_date: dueDateStr,
            currency: template.currency || 'AED',
            subtotal,
            tax_rate: taxRate,
            tax_amount: taxAmount,
            total,
            amount_paid: 0,
            amount_due: total,
            notes: `فاتورة متكررة — ${template.title}`,
            bank_details: bankDetails,
            company_name: settingsMap.company_name || null,
            company_logo: settingsMap.company_logo || null,
            contract_id: template.contract_id || null,
            created_by: auth.pyraUser.username,
            ...clientData,
          })
          .select(INVOICE_FIELDS)
          .single();

        if (insertError) {
          console.error(`Failed to create invoice for template ${template.id}:`, insertError);
          continue;
        }

        // 6. Create invoice items
        const itemRows = processedItems.map(
          (item: { id: string; sort_order: number; description: string; quantity: number; rate: number; amount: number }) => ({
            ...item,
            invoice_id: invoiceId,
          })
        );

        await supabase.from('pyra_invoice_items').insert(itemRows);

        // 7. If auto_send and client exists, create client notification
        if (template.auto_send && template.client_id) {
          supabase.from('pyra_client_notifications').insert({
            id: generateId('cn'),
            client_id: template.client_id,
            type: 'invoice_sent',
            title: 'فاتورة جديدة',
            message: `تم إصدار فاتورة جديدة رقم ${invoiceNumber} بقيمة ${total.toFixed(2)} ${template.currency || 'AED'}`,
            target_project_id: null,
            target_file_id: null,
          }).then(null, (e: unknown) => console.error('Activity log error:', e));
        }

        // 8. Update template: last_generated_at + next_generation_date
        const nextDate = calculateNextDate(template.next_generation_date, template.billing_cycle);

        await supabase
          .from('pyra_recurring_invoices')
          .update({
            last_generated_at: new Date().toISOString(),
            next_generation_date: nextDate,
            updated_at: new Date().toISOString(),
          })
          .eq('id', template.id);

        // 9. Log activity
        supabase.from('pyra_activity_log').insert({
          id: generateId('al'),
          action_type: 'generate_recurring_invoice',
          username: auth.pyraUser.username,
          display_name: auth.pyraUser.display_name,
          target_path: `/dashboard/invoices/${invoiceId}`,
          details: {
            template_id: template.id,
            template_title: template.title,
            invoice_number: invoiceNumber,
            total,
            auto_send: template.auto_send,
          },
          ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        }).then(null, (e: unknown) => console.error('Activity log error:', e));

        generatedInvoices.push(invoiceId);
      } catch (err) {
        console.error(`Error generating invoice for template ${template.id}:`, err);
        continue;
      }
    }

    return apiSuccess(
      { generated: generatedInvoices.length, invoice_ids: generatedInvoices },
      { message: `تم توليد ${generatedInvoices.length} فاتورة بنجاح` }
    );
  } catch (err) {
    console.error('POST /api/finance/recurring-invoices/generate error:', err);
    return apiServerError();
  }
}
