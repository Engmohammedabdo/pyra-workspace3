import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../../_lib/device-auth';
import { apiSuccess, apiValidationError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { loadFollowUpForClose, closeFollowUp } from '@/lib/crm/close-follow-up';

/**
 * Reasons a follow-up can be closed WITHOUT a call.
 *
 * Deliberately only two, and deliberately not extensible from the client.
 * Owner decision (2026-08-07):
 *   - «اتواصلنا خارج النظام» does not exist as a concept — every conversation
 *     goes through a company line, so there is no off-system contact to record.
 *   - «العميل مش مهتم» is a STAGE MOVE, not a close reason. It goes through
 *     call-outcome with `not_interested_reason` so the lead actually leaves
 *     the pipeline instead of quietly losing its reminder.
 */
const CLOSE_REASONS = ['duplicate', 'wrong_number'] as const;
type CloseReason = (typeof CLOSE_REASONS)[number];

const CLOSE_REASON_LABELS: Record<CloseReason, string> = {
  duplicate: 'مكرر', // i18n-exempt: persisted lead-activity content (Phase 8)
  wrong_number: 'رقم غلط', // i18n-exempt: persisted lead-activity content (Phase 8)
};

function isCloseReason(v: unknown): v is CloseReason {
  return typeof v === 'string' && (CLOSE_REASONS as readonly string[]).includes(v);
}

// Used for BOTH "not found" and "not yours" (open or closed) — a caller must
// not be able to tell the three apart, so the literal string is defined once
// and reused rather than risking two hand-typed copies drifting.
const FORBIDDEN_MESSAGE = 'لا تملك صلاحية إغلاق هذه المتابعة';

/**
 * POST /api/mobile/follow-ups/complete
 *
 * Close an administrative follow-up straight from the app, with no call
 * attached. Auth: device x-api-key (`calls:device`) via `requireDeviceAuth`.
 *
 * **Ownership: the assignee ONLY.** Unlike the CRM route there is no admin
 * override here — a device key carries no RBAC scope, so there is nothing to
 * grant one from. A follow-up that does not exist and one that belongs to
 * someone else (open OR already closed) all return the SAME 403, byte-
 * identical message — the endpoint cannot be used to probe which follow-up
 * ids exist or what state they are in.
 *
 * **Retry-of-a-success.** `loadFollowUpForClose` reports `already_closed`
 * (not `not_found`) once a follow-up has been completed, and it carries the
 * row on that branch specifically so ownership can still be checked before
 * deciding the response. A caller who owns an already-closed follow-up gets
 * the SAME 200 `{ follow_up_id, closed: true }` a fresh close would produce —
 * this is what a lost-response retry of a successful close looks like on its
 * second attempt, and it must look exactly like success, not like an error.
 * The ownership predicate is applied ONCE, to the loaded row, before
 * splitting on open-vs-closed, so the no-leak property holds by construction
 * rather than by keeping two branches in sync by hand.
 *
 * Body: { follow_up_id: string, reason: 'duplicate' | 'wrong_number' }
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { agentUsername } = auth;

    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const followUpId = typeof body?.follow_up_id === 'string' ? body.follow_up_id.trim() : '';
    const reason = body?.reason;

    if (!followUpId) return apiValidationError('follow_up_id مطلوب');
    if (!isCloseReason(reason)) {
      return apiValidationError('reason غير صالح — القيم المسموحة: duplicate, wrong_number');
    }

    const supabase = createServiceRoleClient();

    const loaded = await loadFollowUpForClose(supabase, followUpId);
    if (!loaded.ok && loaded.reason === 'db_error') return apiServerError();
    if (!loaded.ok && loaded.reason === 'not_found') {
      return apiForbidden(FORBIDDEN_MESSAGE);
    }
    // Both remaining shapes — open-and-found (`ok: true`) and
    // already_closed — carry a `followUp` row (TS can't eliminate the
    // `reason: 'not_found' | 'db_error'` member by literal comparison alone
    // since it isn't a singleton discriminant, so narrow by property
    // presence instead, matching /api/mobile/call-outcome).
    if (!('followUp' in loaded)) return apiServerError();
    const followUp = loaded.followUp;
    const alreadyClosed = !loaded.ok;

    // Ownership check ONCE, before splitting on open-vs-closed — a follow-up
    // that isn't the caller's gets the identical 403 regardless of whether
    // it's still open or already done.
    if (followUp.assigned_to !== agentUsername) {
      return apiForbidden(FORBIDDEN_MESSAGE);
    }

    if (alreadyClosed) {
      // Genuinely done already, just not by this request — the retry case.
      return apiSuccess({ follow_up_id: followUpId, closed: true });
    }

    const closed = await closeFollowUp(supabase, {
      followUp,
      actor: agentUsername,
      // i18n-exempt: persisted lead-activity content (Phase 8)
      note: `إغلاق بدون مكالمة: ${CLOSE_REASON_LABELS[reason]}`,
      source: 'mobile_follow_up_complete',
    });
    if (!closed.ok) {
      if (closed.reason === 'already_closed') {
        // A concurrent close won the race between our load and this write.
        // From the phone's point of view the follow-up IS closed, which is
        // what it asked for — a 4xx here would make the app show an error
        // for an outcome it wanted.
        return apiSuccess({ follow_up_id: followUpId, closed: true });
      }
      logError({
        error: `closeFollowUp failed: ${closed.reason}`,
        request,
        metadata: { action: 'mobile_follow_up_complete', agentUsername, followUpId },
      });
      return apiServerError();
    }

    logActivity(
      agentUsername,
      auth.displayName,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${followUp.lead_id}`,
      {
        lead_id: followUp.lead_id,
        follow_up_id: followUpId,
        action: 'completed',
        close_reason: reason,
        source: 'mobile_follow_up_complete',
      },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ follow_up_id: followUpId, closed: true });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_follow_up_complete' } });
    return apiServerError();
  }
}
