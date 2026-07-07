import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { PIPELINE_STAGE_FIELDS } from '@/lib/supabase/fields';
import { generateId } from '@/lib/utils/id';
import { logActivity } from '@/lib/api/activity';
import { isCrmPipelineStageId } from '@/lib/crm/pipeline-stages';

export async function GET() {
  try {
    const auth = await requireApiPermission('sales.view');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_sales_pipeline_stages')
      .select(PIPELINE_STAGE_FIELDS)
      .order('sort_order');

    if (error) return apiServerError(error.message);
    return apiSuccess((data ?? []).filter((stage) => isCrmPipelineStageId(stage.id)));

  } catch (err) {
    console.error('[GET /api/dashboard/sales/pipeline-stages] error:', err);
    return apiServerError();
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_pipeline.manage');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();
    const body = await request.json();

    const { name, name_ar, color, sort_order } = body;
    if (!name || !name_ar) return apiError('اسم المرحلة مطلوب (عربي وإنجليزي)');

    const { data, error } = await supabase
      .from('pyra_sales_pipeline_stages')
      .insert({
        id: generateId('ps'),
        name,
        name_ar,
        color: color || 'blue',
        sort_order: sort_order ?? 99,
        is_default: false,
      })
      .select(PIPELINE_STAGE_FIELDS)
      .single();

    if (error) return apiServerError(error.message);
  
    logActivity(auth.pyraUser.username, auth.pyraUser.display_name, 'pipeline_stage_created', '/dashboard/crm', { name: body.name });

  return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/dashboard/sales/pipeline-stages] error:', err);
    return apiServerError();
  }
}

/**
 * PUT — Bulk reorder all stages
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireApiPermission('sales_pipeline.manage');
    if (isApiError(auth)) return auth;

    const supabase = await createServerSupabaseClient();
    const body = await request.json();
    const { stages } = body;

    if (!Array.isArray(stages)) return apiError('مطلوب مصفوفة stages');

    // Update each stage's sort_order (and optionally name, color)
    const errors: string[] = [];
    for (const stage of stages) {
      const updates: Record<string, unknown> = {};
      if (stage.sort_order !== undefined) updates.sort_order = stage.sort_order;
      if (stage.name) updates.name = stage.name;
      if (stage.name_ar) updates.name_ar = stage.name_ar;
      if (stage.color) updates.color = stage.color;

      const { error } = await supabase
        .from('pyra_sales_pipeline_stages')
        .update(updates)
        .eq('id', stage.id);

      if (error) errors.push(`${stage.id}: ${error.message}`);
    }

    if (errors.length > 0) return apiServerError(errors.join(', '));

    // Return updated list
    const { data } = await supabase
      .from('pyra_sales_pipeline_stages')
      .select(PIPELINE_STAGE_FIELDS)
      .order('sort_order');

    return apiSuccess((data ?? []).filter((stage) => isCrmPipelineStageId(stage.id)));

  } catch (err) {
    console.error('[PUT /api/dashboard/sales/pipeline-stages] error:', err);
    return apiServerError();
  }
}
