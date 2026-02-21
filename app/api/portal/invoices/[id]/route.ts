import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiUnauthorized, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portal/invoices/[id]
 * Get a single invoice with items and payments for the authenticated portal client.
 * Draft invoices are excluded.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: invoice, error } = await supabase
      .from('pyra_invoices')
      .select(INVOICE_FIELDS)
      .eq('id', id)
      .eq('client_id', client.id)
      .neq('status', 'draft')
      .maybeSingle();

    if (error) {
      console.error('Portal invoice detail error:', error);
      return apiServerError();
    }
    if (!invoice) return apiNotFound('الفاتورة غير موجودة');

    // Get items
    const { data: items } = await supabase
      .from('pyra_invoice_items')
      .select('id, invoice_id, sort_order, description, quantity, rate, amount, created_at')
      .eq('invoice_id', id)
      .order('sort_order', { ascending: true });

    // Get payments (limited fields for portal)
    const { data: payments } = await supabase
      .from('pyra_payments')
      .select('id, amount, payment_date, method, created_at')
      .eq('invoice_id', id)
      .order('payment_date', { ascending: false });

    return apiSuccess({ ...invoice, items: items || [], payments: payments || [] });
  } catch (err) {
    console.error('GET /api/portal/invoices/[id] error:', err);
    return apiServerError();
  }
}
