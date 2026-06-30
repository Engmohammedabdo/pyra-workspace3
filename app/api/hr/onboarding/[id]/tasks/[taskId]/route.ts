import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiValidationError,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';

// ─────────────────────────────────────────────────────────────────────────────
// /api/hr/onboarding/[id]/tasks/[taskId]
//
// PATCH → { is_done: boolean }
//          Cross-resource guard: update is scoped to
//          .eq('id', taskId).eq('onboarding_id', id)
//          Sets is_done + done_at (now() when true, null when false)
//                     + done_by (auth username when true, null when false).
//          Returns 404 if no row matched (wrong id or taskId doesn't belong).
//
// Gated: hr.manage (admin-only, service-role AFTER the gate)
// ─────────────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; taskId: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    const auth = await requireApiPermission('hr.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id, taskId } = await params;

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return apiValidationError('طلب غير صالح — يجب أن يكون JSON');
    }

    const { is_done } = body;

    if (typeof is_done !== 'boolean') {
      return apiValidationError('is_done يجب أن يكون قيمة منطقية (true/false)');
    }

    const supabase = createServiceRoleClient();

    // ── Build update payload ──────────────────────────────────────────────────
    const now = new Date().toISOString();
    const updatePayload: Record<string, unknown> = {
      is_done,
      done_at: is_done ? now : null,
      done_by: is_done ? auth.pyraUser.username : null,
    };

    // ── Cross-resource guard: update ONLY if task belongs to this onboarding ─
    // .eq('id', taskId).eq('onboarding_id', id) ensures a task from another
    // onboarding record cannot be toggled via this endpoint.
    const { data: updated, error: updateError } = await supabase
      .from('pyra_onboarding_tasks')
      .update(updatePayload)
      .eq('id', taskId)
      .eq('onboarding_id', id)
      .select('id, onboarding_id, title_ar, sort_order, is_done, done_at, done_by')
      .maybeSingle();

    if (updateError) {
      logError({
        error: updateError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: {
          source: 'hr_onboarding_task_toggle',
          onboarding_id: id,
          task_id: taskId,
        },
      });
      console.error('[hr/onboarding/[id]/tasks/[taskId] PATCH] error:', updateError.message);
      return apiServerError();
    }

    // No row matched → task does not exist or doesn't belong to this onboarding
    if (!updated) return apiNotFound('المهمة غير موجودة');

    return apiSuccess(updated);
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'hr_onboarding_task_toggle' },
    });
    console.error('[hr/onboarding/[id]/tasks/[taskId] PATCH] threw:', err);
    return apiServerError();
  }
}
