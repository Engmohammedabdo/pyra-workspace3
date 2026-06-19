import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// PATCH /api/admin/error-logs/[id]
//
// Permission:  error_logs.manage  (admin observability viewer — Phase 14.1 Q2(a))
//
// Marks a single error log row as resolved. v1 is single-row only (Q4(a)
// — bulk-resolve intentionally not supported, keeps audit trail clean).
//
// Body:
//   { resolved: true, resolved_notes?: string }
//
// Server-side invariants (NEVER from body):
//   resolved_by = auth.pyraUser.username
//   resolved_at = NOW()
//   resolved    = true
//
// Setting `resolved: false` to un-resolve is NOT supported in v1 — the
// table is append-mostly for audit reasons (Commit 1 design). If a row
// was incorrectly resolved, admin uses pg/query to revert.
//
// Audit trail: pyra_activity_log entry written on success.
//   action_type = 'error_log_update'    (constants + metadata.source pattern,
//                                        Phase 11.5 locked architectural rule)
//   metadata.source = 'admin_resolve_via_ui'
// ────────────────────────────────────────────────────────────────────────────

interface PatchBody {
  resolved?: unknown;
  resolved_notes?: unknown;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('error_logs.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    if (!id || typeof id !== 'string') {
      return apiValidationError('معرّف السجل غير صالح');
    }

    const body = (await request.json().catch(() => null)) as PatchBody | null;
    if (!body) return apiValidationError('JSON body مطلوب');

    // Strict body validation — only accept the exact shape v1 supports.
    // The only allowed transition is unresolved → resolved.
    if (body.resolved !== true) {
      return apiValidationError('يجب أن يكون resolved = true');
    }

    let resolvedNotes: string | null = null;
    if (body.resolved_notes !== undefined && body.resolved_notes !== null) {
      if (typeof body.resolved_notes !== 'string') {
        return apiValidationError('resolved_notes يجب أن تكون نص');
      }
      const trimmed = body.resolved_notes.trim();
      if (trimmed.length > 0) {
        resolvedNotes = trimmed;
      }
    }

    const supabase = createServiceRoleClient(); // pyra_error_logs service-role-only (Gap #3 Tier-2)

    // Pre-check: row exists + currently unresolved (idempotency safety —
    // a double-click should not mutate resolved_at twice).
    const { data: existing, error: fetchError } = await supabase
      .from('pyra_error_logs')
      .select('id, resolved')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      logError({
        error: fetchError,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'admin', view: 'error-logs', stage: 'fetch', log_id: id },
      });
      console.error('PATCH error-logs fetch failed:', fetchError.message);
      return apiServerError();
    }

    if (!existing) return apiNotFound('السجل غير موجود');

    if (existing.resolved) {
      return apiValidationError('السجل محلول بالفعل');
    }

    // ── Update — resolved_by + resolved_at server-controlled, never from body ──
    // (Reviewer focus area (d): no privilege escalation via body injection.)
    const nowIso = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase
      .from('pyra_error_logs')
      .update({
        resolved: true,
        resolved_at: nowIso,
        resolved_by: auth.pyraUser.username,
        resolved_notes: resolvedNotes,
      })
      .eq('id', id)
      .select(
        'id, severity, message, error_type, stack_trace, request_path, request_method, user_id, user_role, metadata, environment, created_at, resolved, resolved_at, resolved_by, resolved_notes',
      )
      .single();

    if (updateError || !updated) {
      logError({
        error: updateError ?? new Error('error-logs update returned no row'),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'admin', view: 'error-logs', stage: 'update', log_id: id },
      });
      console.error('PATCH error-logs update failed:', updateError?.message);
      return apiServerError();
    }

    // ── Audit trail ──
    // action_type follows the locked Phase 11.5 pattern: a stable category
    // (`error_log_update`) for analytics; the specific flavour lives in
    // metadata.source (`admin_resolve_via_ui`). Existing ENTITY_TYPES /
    // ACTIVITY_ACTIONS constants don't include `error_log` because this is
    // a Phase 14.1 surface, not a pre-existing entity — using a plain
    // string here is acceptable (the constants are not exhaustive of all
    // future entity types).
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'error_log_update',
      `/dashboard/admin/error-logs`,
      {
        log_id: id,
        source: 'admin_resolve_via_ui',
        had_notes: resolvedNotes !== null,
      },
      request.headers.get('x-forwarded-for') ?? undefined,
    );

    return apiSuccess({ log: updated });
  } catch (err) {
    logError({
      error: err,
      request,
      metadata: { source: 'admin', view: 'error-logs', action: 'resolve' },
    });
    console.error('PATCH /api/admin/error-logs/[id] threw:', err);
    return apiServerError();
  }
}
