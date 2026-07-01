import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiNotFound } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity, ACTIVITY_ACTIONS, ENTITY_TYPES } from '@/lib/api/activity';

type RouteParams = { params: Promise<{ id: string }> };

// =============================================================
// PATCH /api/dashboard/kpi/[id]
// Update a KPI target's progress (actual_value) and/or metadata.
// Body: { actual_value (required), title?, target_value?, unit?, status? }
// =============================================================
export async function PATCH(req: NextRequest, { params }: RouteParams) {
  try {
    const auth = await requireApiPermission('evaluations.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    if (body.actual_value === undefined || body.actual_value === null || body.actual_value === '') {
      return apiValidationError('القيمة الفعلية مطلوبة');
    }

    const actualValue = Number(body.actual_value);
    if (Number.isNaN(actualValue) || actualValue < 0) {
      return apiValidationError('القيمة الفعلية يجب أن تكون رقماً صحيحاً وغير سالب');
    }

    const supabase = createServiceRoleClient();

    // Ensure the KPI exists before updating
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_kpi_targets')
      .select('id, username, title')
      .eq('id', id)
      .single();

    if (fetchError || !existing) return apiNotFound('مؤشر الأداء غير موجود');

    const updates: Record<string, unknown> = { actual_value: actualValue };
    if (body.title !== undefined) updates.title = body.title;
    if (body.target_value !== undefined) {
      updates.target_value = body.target_value === null || body.target_value === ''
        ? null
        : Number(body.target_value);
    }
    if (body.unit !== undefined) updates.unit = body.unit;
    if (body.status !== undefined) updates.status = body.status;

    const { data, error } = await supabase
      .from('pyra_kpi_targets')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) return apiServerError(error.message);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.EVALUATION}_${ACTIVITY_ACTIONS.UPDATE}`,
      '/dashboard/evaluations',
      {
        source: 'kpi_progress_updated',
        kpi_id: id,
        employee_username: existing.username,
        title: existing.title,
        actual_value: actualValue,
      },
      req.headers.get('x-forwarded-for') || 'unknown',
    );

    return apiSuccess(data);
  } catch (err) {
    console.error('PATCH /api/dashboard/kpi/[id] error:', err);
    return apiServerError('خطأ في الخادم', err, req);
  }
}
