import { NextRequest } from 'next/server';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { PIPELINE_STAGE_FIELDS } from '@/lib/supabase/fields';
import { generateId } from '@/lib/utils/id';

export async function GET() {
  const auth = await requireApiPermission('sales.view');
  if (isApiError(auth)) return auth;

  const supabase = await createServerSupabaseClient();

  const { data, error } = await supabase
    .from('pyra_sales_pipeline_stages')
    .select(PIPELINE_STAGE_FIELDS)
    .order('sort_order');

  if (error) return apiServerError(error.message);
  return apiSuccess(data);
}

export async function POST(request: NextRequest) {
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
  return apiSuccess(data, undefined, 201);
}

/**
 * PUT — Bulk reorder all stages
 */
export async function PUT(request: NextRequest) {
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

  return apiSuccess(data);
}
