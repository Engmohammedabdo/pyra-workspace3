import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/dashboard/sales/leads/[id]/quotes
 * Get all quotes linked to a specific lead.
 *
 * Permission: sales_leads.view (NOT quotes.view) — if you can see the lead,
 * you can see the quotes attached to it. Sales agents have sales_leads.view
 * via their role but not always quotes.view, which previously broke the
 * lead detail page (Promise.all rejected on this 403, killing the whole UI).
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('sales_leads.view');
    if (isApiError(auth)) return auth;

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: quotes, error } = await supabase
      .from('pyra_quotes')
      .select('id, quote_number, project_name, status, total, currency, estimate_date, created_at')
      .eq('lead_id', id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Lead quotes fetch error:', error);
      return apiServerError();
    }

    return apiSuccess(quotes || []);
  } catch (err) {
    console.error('GET /api/dashboard/sales/leads/[id]/quotes error:', err);
    return apiServerError();
  }
}
