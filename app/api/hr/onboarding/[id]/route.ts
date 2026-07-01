import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiError,
  apiValidationError,
  apiNotFound,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { ONBOARDING_STATUS } from '@/lib/constants/onboarding';

// ─────────────────────────────────────────────────────────────────────────────
// /api/hr/onboarding/[id]
//
// GET   → onboarding record + tasks (sorted by sort_order) + linked documents
//          Documents: pyra_employee_documents for dt_offer_letter / dt_nda /
//          dt_asset_handover — each returned with a 1h signed_url.
//          storage_path is NEVER returned.
// PATCH → { action: 'complete' | 'cancel', notes? }
//          Sets status + completed_at; logs activity.
//
// Both gated: hr.manage (admin-only, service-role AFTER the gate)
// ─────────────────────────────────────────────────────────────────────────────

const DOC_BUCKET = 'pyra-private';
const SIGNED_URL_TTL = 3600; // 1 hour

const ONBOARDING_DOC_TYPE_IDS = ['dt_offer_letter', 'dt_nda', 'dt_asset_handover'];

// ──────────────────────────────────────────────────────────────────────────────
// GET — onboarding detail
// ──────────────────────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    const auth = await requireApiPermission('hr.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // ── 1. Fetch onboarding record ────────────────────────────────────────────
    const { data: onboarding, error: onbError } = await supabase
      .from('pyra_onboarding')
      .select(
        'id, employee_username, status, offer_data, assets, started_by, started_at, completed_at, notes',
      )
      .eq('id', id)
      .maybeSingle();

    if (onbError) {
      logError({
        error: onbError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_onboarding_detail_get', onboarding_id: id, stage: 'fetch_record' },
      });
      console.error('[hr/onboarding/[id] GET] fetch error:', onbError.message);
      return apiServerError();
    }

    if (!onboarding) return apiNotFound('سجل التعيين غير موجود');

    // ── 2. Fetch tasks ordered by sort_order ──────────────────────────────────
    const { data: tasks, error: tasksError } = await supabase
      .from('pyra_onboarding_tasks')
      .select('id, onboarding_id, title_ar, sort_order, is_done, done_at, done_by')
      .eq('onboarding_id', id)
      .order('sort_order', { ascending: true });

    if (tasksError) {
      logError({
        error: tasksError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_onboarding_detail_get', onboarding_id: id, stage: 'fetch_tasks' },
      });
      console.error('[hr/onboarding/[id] GET] tasks error:', tasksError.message);
      return apiServerError();
    }

    // ── 3. Fetch linked documents (offer letter, NDA, asset handover) ─────────
    const { data: docRows, error: docsError } = await supabase
      .from('pyra_employee_documents')
      .select(
        'id, employee_username, type_id, label, storage_path, mime_type, size_bytes, uploaded_by, uploaded_at, notes',
      )
      .eq('employee_username', onboarding.employee_username)
      .in('type_id', ONBOARDING_DOC_TYPE_IDS)
      .order('uploaded_at', { ascending: false });

    if (docsError) {
      logError({
        error: docsError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_onboarding_detail_get', onboarding_id: id, stage: 'fetch_docs' },
      });
      console.error('[hr/onboarding/[id] GET] docs error:', docsError.message);
      return apiServerError();
    }

    // ── 4. Sign each document URL — never return storage_path ────────────────
    // Gap #3 Phase 3a pattern: destructure storage_path out, return signed_url.
    const documents = await Promise.all(
      (docRows ?? []).map(async (row) => {
        const { storage_path, ...rest } = row;
        const { data: urlData } = await supabase.storage
          .from(DOC_BUCKET)
          .createSignedUrl(storage_path, SIGNED_URL_TTL);
        return {
          ...rest,
          signed_url: urlData?.signedUrl ?? '',
        };
      }),
    );

    return apiSuccess({ ...onboarding, tasks: tasks ?? [], documents });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'hr_onboarding_detail_get' },
    });
    console.error('[hr/onboarding/[id] GET] threw:', err);
    return apiServerError();
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// PATCH — complete or cancel onboarding
// ──────────────────────────────────────────────────────────────────────────────

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    const auth = await requireApiPermission('hr.manage');
    if (isApiError(auth)) return auth;
    authForLogging = auth;

    const { id } = await params;

    // ── Parse body ────────────────────────────────────────────────────────────
    let body: Record<string, unknown>;
    try {
      body = await request.json();
    } catch {
      return apiValidationError('طلب غير صالح — يجب أن يكون JSON');
    }

    const { action, notes } = body;

    // ── Validate action ───────────────────────────────────────────────────────
    if (action !== 'complete' && action !== 'cancel') {
      return apiValidationError('action يجب أن يكون "complete" أو "cancel"');
    }

    const supabase = createServiceRoleClient();

    // ── Fetch existing record (404 guard) ─────────────────────────────────────
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_onboarding')
      .select('id, employee_username, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      logError({
        error: fetchError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_onboarding_detail_patch', onboarding_id: id, stage: 'fetch' },
      });
      console.error('[hr/onboarding/[id] PATCH] fetch error:', fetchError.message);
      return apiServerError();
    }

    if (!existing) return apiNotFound('سجل التعيين غير موجود');

    // ── Build update payload ──────────────────────────────────────────────────
    const newStatus =
      action === 'complete'
        ? ONBOARDING_STATUS.COMPLETED
        : ONBOARDING_STATUS.CANCELLED;

    const updatePayload: Record<string, unknown> = {
      status: newStatus,
    };
    if (action === 'complete') {
      updatePayload.completed_at = new Date().toISOString();
    }
    if (notes !== undefined && typeof notes === 'string' && notes.trim()) {
      updatePayload.notes = notes.trim();
    }

    // ── Apply update ──────────────────────────────────────────────────────────
    const { data: updated, error: updateError } = await supabase
      .from('pyra_onboarding')
      .update(updatePayload)
      .eq('id', id)
      .select('id, employee_username, status, completed_at, notes')
      .single();

    if (updateError || !updated) {
      logError({
        error: updateError ?? new Error('update returned no row'),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'hr_onboarding_detail_patch', onboarding_id: id, action },
      });
      console.error('[hr/onboarding/[id] PATCH] update error:', updateError?.message);
      return apiServerError();
    }

    // ── If cancelled, deactivate the linked employee account ─────────────────
    // Prevents ghost logins from a cancelled onboarding. Defensive: log on
    // failure but don't fail the response — the status update already succeeded.
    if (action === 'cancel') {
      const { error: deactivateError } = await supabase
        .from('pyra_users')
        .update({ status: 'inactive' })
        .eq('username', existing.employee_username);

      if (deactivateError) {
        logError({
          error: deactivateError,
          request,
          user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
          metadata: {
            source:            'onboarding_cancel_deactivate_user',
            onboarding_id:     id,
            employee_username: existing.employee_username,
          },
        });
        console.error(
          '[hr/onboarding/[id] PATCH] user deactivation error:',
          deactivateError.message,
        );
        // Non-fatal: continue — the onboarding was cancelled successfully
      }
    }

    // ── Activity log (Phase 11.5 lock: action_type from constants + metadata.source) ──
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.USER}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/hr/onboarding/${id}`,
      {
        source: 'onboarding_status_changed',
        onboarding_id: id,
        employee_username: existing.employee_username,
        from_status: existing.status,
        to_status: newStatus,
        action,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess(updated);
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'hr_onboarding_detail_patch' },
    });
    console.error('[hr/onboarding/[id] PATCH] threw:', err);
    return apiServerError();
  }
}
