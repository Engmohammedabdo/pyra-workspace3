import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import {
  apiSuccess,
  apiForbidden,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateNextInvoiceNumber } from '@/lib/utils/invoice-number';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ quoteId: string }> };

/**
 * POST /api/invoices/from-quote/[quoteId]
 * Create an invoice from a signed quote, copying all data and items.
 * Admin only.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const { quoteId } = await context.params;
    const supabase = createServiceRoleClient();

    // Fetch quote
    const { data: quote } = await supabase
      .from('pyra_quotes')
      .select('*')
      .eq('id', quoteId)
      .maybeSingle();

    if (!quote) return apiNotFound('عرض السعر غير موجود');
    if (quote.status !== 'signed') {
      return apiValidationError('يمكن إنشاء فاتورة فقط من عرض سعر موقع');
    }

    // Fetch quote items
    const { data: quoteItems } = await supabase
      .from('pyra_quote_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('sort_order', { ascending: true });

    // Fetch payment_terms_days from settings
    const { data: termsSetting } = await supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'payment_terms_days')
      .maybeSingle();
    const paymentDays = parseInt(termsSetting?.value || '30');

    const invoiceId = generateId('inv');
    const invoiceNumber = await generateNextInvoiceNumber(supabase);
    const issueDate = new Date();
    const dueDate = new Date(issueDate);
    dueDate.setDate(dueDate.getDate() + paymentDays);

    // Create invoice from quote data
    const { data: invoice, error: insertError } = await supabase
      .from('pyra_invoices')
      .insert({
        id: invoiceId,
        invoice_number: invoiceNumber,
        quote_id: quoteId,
        client_id: quote.client_id,
        project_name: quote.project_name,
        status: 'draft',
        issue_date: issueDate.toISOString().split('T')[0],
        due_date: dueDate.toISOString().split('T')[0],
        currency: quote.currency || 'AED',
        subtotal: quote.subtotal,
        tax_rate: quote.tax_rate,
        tax_amount: quote.tax_amount,
        total: quote.total,
        amount_paid: 0,
        amount_due: quote.total,
        notes: quote.notes,
        terms_conditions: quote.terms_conditions || [],
        bank_details: quote.bank_details || {},
        company_name: quote.company_name,
        company_logo: quote.company_logo,
        client_name: quote.client_name,
        client_email: quote.client_email,
        client_company: quote.client_company,
        client_phone: quote.client_phone,
        client_address: quote.client_address,
        created_by: admin.pyraUser.username,
      })
      .select(INVOICE_FIELDS)
      .single();

    if (insertError) {
      console.error('Invoice from quote insert error:', insertError);
      return apiServerError();
    }

    // Copy quote items to invoice items
    if (quoteItems && quoteItems.length > 0) {
      const invoiceItems = quoteItems.map(
        (qi: { sort_order: number; description: string; quantity: number; rate: number; amount: number }) => ({
          id: generateId('ii'),
          invoice_id: invoiceId,
          sort_order: qi.sort_order,
          description: qi.description,
          quantity: qi.quantity,
          rate: qi.rate,
          amount: qi.amount,
        })
      );

      const { error: itemsErr } = await supabase
        .from('pyra_invoice_items')
        .insert(invoiceItems);
      if (itemsErr) console.error('Invoice items from quote error:', itemsErr);
    }

    // Log activity
    await supabase.from('pyra_activity_log').insert({
      id: generateId('log'),
      action_type: 'invoice_from_quote',
      username: admin.pyraUser.username,
      display_name: admin.pyraUser.display_name,
      target_path: `/dashboard/invoices/${invoiceId}`,
      details: {
        invoice_number: invoiceNumber,
        quote_number: quote.quote_number,
        total: quote.total,
      },
      ip_address: request.headers.get('x-forwarded-for') || 'unknown',
    });

    return apiSuccess(invoice, undefined, 201);
  } catch (err) {
    console.error('POST /api/invoices/from-quote/[quoteId] error:', err);
    return apiServerError();
  }
}
