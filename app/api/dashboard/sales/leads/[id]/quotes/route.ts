import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/dashboard/sales/leads/[id]/quotes
 * Get all quotes linked to a specific lead.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await requireApiPermission('quotes.view');
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
