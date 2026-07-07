import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { isCrmPipelineStageId } from '@/lib/crm/pipeline-stages';

/**
 * GET /api/crm/pipeline-stages
 * Returns active CRM stages, sorted by sort_order.
 * Includes canonical stg_* rows and custom ps_* rows created from settings.
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
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('GET /api/crm/pipeline-stages error:', error.message);
      return apiServerError();
    }

    return apiSuccess((data ?? []).filter((stage) => isCrmPipelineStageId(stage.id)));
  } catch (err) {
    console.error('GET /api/crm/pipeline-stages threw:', err);
    return apiServerError();
  }
}
