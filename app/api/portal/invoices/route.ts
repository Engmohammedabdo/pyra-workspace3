import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';

/**
 * GET /api/portal/invoices
 * List invoices for the authenticated portal client.
 * Draft invoices are excluded.
 */
export async function GET(request: NextRequest) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const sp = request.nextUrl.searchParams;
    const status = sp.get('status')?.trim() || '';

    const supabase = createServiceRoleClient();
    let query = supabase
      .from('pyra_invoices')
      .select(INVOICE_FIELDS)
      .eq('client_id', client.id)
      .neq('status', 'draft')
      .order('created_at', { ascending: false });

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Portal invoices list error:', error);
      return apiServerError();
    }

    return apiSuccess(data || []);
  } catch (err) {
    console.error('GET /api/portal/invoices error:', err);
    return apiServerError();
  }
}
