import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/portal/quotes
 * List quotes for the authenticated client (non-draft only).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getPortalSession();
    if (!session) return apiUnauthorized();

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;
    const status = sp.get('status')?.trim() || '';

    let query = supabase
      .from('pyra_quotes')
      .select(
        `id, quote_number, project_name, status, estimate_date, expiry_date,
         currency, subtotal, tax_rate, tax_amount, total, notes,
         client_name, client_company, signed_by, signed_at,
         sent_at, viewed_at, created_at`,
        { count: 'exact' }
      )
      .eq('client_id', session.id)
      .neq('status', 'draft');

    if (status && status !== 'all') {
      query = query.eq('status', status);
    }

    query = query.order('created_at', { ascending: false }).limit(200);

    const { data: quotes, count, error } = await query;

    if (error) {
      console.error('Portal quotes list error:', error);
      return apiServerError();
    }

    return apiSuccess(quotes || [], { total: count ?? 0 });
  } catch (err) {
    console.error('GET /api/portal/quotes error:', err);
    return apiServerError();
  }
}
