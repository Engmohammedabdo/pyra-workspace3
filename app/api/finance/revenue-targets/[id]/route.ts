import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { REVENUE_TARGET_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(
  req: NextRequest,
  context: RouteContext
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    const body = await req.json();

    // Validate period dates if both provided
    if (body.period_start && body.period_end && body.period_start >= body.period_end) {
      return apiNotFound('تاريخ البداية يجب أن يكون قبل تاريخ النهاية');
    }

    body.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('pyra_revenue_targets')
      .update(body)
      .eq('id', id)
      .select(REVENUE_TARGET_FIELDS)
      .single();

    if (error || !data) return apiNotFound();
    return apiSuccess(data);
  } catch {
    return apiServerError();
  }
}

export async function DELETE(
  _req: NextRequest,
  context: RouteContext
) {
  const auth = await requireApiPermission('finance.manage');
  if (isApiError(auth)) return auth;

  const { id } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    const { error } = await supabase
      .from('pyra_revenue_targets')
      .delete()
      .eq('id', id);

    if (error) throw error;

    // Activity log (fire-and-forget)
    supabase.from('pyra_activity_log').insert({
      id: generateId('al'),
      action_type: 'delete_revenue_target',
      username: auth.pyraUser.username,
      display_name: auth.pyraUser.display_name,
      target_path: `/finance/revenue-targets/${id}`,
      details: { target_id: id },
    }).then(null, (e: unknown) => console.error('Activity log error:', e));

    return apiSuccess({ deleted: true });
  } catch {
    return apiServerError();
  }
}
