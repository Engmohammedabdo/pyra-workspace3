import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/crm/pipeline-stages
 * Returns the 7 active CRM stages (stg_*), sorted by sort_order.
 * Legacy stage_* rows are intentionally excluded.
 */
export async function GET() {
  try {
    const auth = await requireApiPermission('leads.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const { data, error } = await supabase
      .from('pyra_sales_pipeline_stages')
      .select('id, name, name_ar, color, sort_order, is_default')
      .like('id', 'stg_%')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('GET /api/crm/pipeline-stages error:', error.message);
      return apiServerError();
    }

    return apiSuccess(data ?? []);
  } catch (err) {
    console.error('GET /api/crm/pipeline-stages threw:', err);
    return apiServerError();
  }
}
