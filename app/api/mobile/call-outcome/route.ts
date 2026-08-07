import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { apiSuccess, apiValidationError, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { logActivity, ENTITY_TYPES, ACTIVITY_ACTIONS } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { validateOutcomeRequest, OUTCOME_LABELS } from '@/lib/mobile/outcome-validation';
import { markNotInterested } from '@/lib/crm/mark-not-interested';
import { loadFollowUpForClose, closeFollowUp, type OpenFollowUp } from '@/lib/crm/close-follow-up';

/**
 * POST /api/mobile/call-outcome
 *
 * Lets a sales agent log the result of a call from the Android app: tap
 * interested / not_interested / call_again, optionally add a note and a
 * next follow-up date. Auth: device x-api-key (`calls:device`) via
 * `requireDeviceAuth`.
 *
 * **`requireDeviceAuth` carries NO RBAC scope** — it returns an agent
 * username, not a lead-access scope. This route WRITES to lead data, so the
 * ownership re-check below (`lead.assigned_to === agentUsername`) is
 * mandatory — without it any device could write to any lead in the system.
 *
 * Side effects:
 *   - INSERT pyra_lead_activities (activity_type='note') — the call outcome
 *     entry on the lead timeline.
 *   - UPDATE pyra_sales_leads.last_contact_at = now() — a genuine human
 *     touch (unlike the 0-second-dial sync bug, this is always a real call
 *     the agent is actively wrapping up).
 *   - If `next_follow_up_at` is present: INSERT pyra_sales_follow_ups +
 *     a `follow_up_created` timeline activity + sync leads.next_follow_up,
 *     mirroring `POST /api/crm/follow-ups` field-for-field.
 *   - If `not_interested_reason` is present: markNotInterested() moves the
 *     lead to «غير مهتم» and writes a web-identical `stage_change` activity.
 *   - If `complete_follow_up_id` is present: closeFollowUp() completes it and
 *     recomputes leads.next_follow_up.
 *   - logActivity() audit row (`lead_update`, metadata.source =
 *     'mobile_call_outcome').
 *
 * No `notify()` call — the agent is acting on their own lead, so there is
 * no one else to notify (assigned_to is always the caller here).
 *
 * Rollback: if the last_contact_at bump fails after the note activity was
 * inserted, the activity row is deleted so a half-write never reports
 * success.
 *
 * **Flip-and-warn on follow-up failure** (Quote System pattern, CLAUDE.md
 * "Quote System" §3): a failure in the OPTIONAL follow-up insert (after the
 * note + bump already succeeded) is NOT rolled back and does NOT fail the
 * request — the call outcome itself is a real, already-true fact regardless
 * of whether scheduling a reminder for it later also succeeded. The response
 * is still `200` with `follow_up_error: true` so the caller can warn the
 * agent without treating the whole request as failed (and without retrying
 * it, which would duplicate the note).
 *
 * **60-second retry dedup**: before inserting the note activity, the route
 * looks for an identical one (same lead/outcome/agent) created in the last
 * 60 seconds. A match means this is a bare retry (lost response, double-tap,
 * client retry-on-5xx) — the note + last_contact_at bump are skipped
 * (already current) and the existing activity_id is returned with
 * `deduplicated: true`. A duplicate follow-up row is more visible/annoying
 * than a duplicate note, so a request that carries `next_follow_up_at` AND
 * hits the dedup path also skips the follow-up insert and reports whatever
 * follow-up already exists for that exact `(lead, agent, due_at)` in the
 * same window — `follow_up_error: true` if none is found (the original
 * attempt's follow-up insert never landed). The dedup lookup itself fails
 * OPEN: a lookup error is logged and treated as "no duplicate" so a
 * transient DB blip never swallows a real outcome the agent just recorded.
 *
 * **Dedup change (wave C).** A duplicate within 60s still skips the note and
 * the last_contact_at bump, but NO LONGER skips the stage move and the
 * follow-up close. Both are idempotent, so replaying them is free — and it
 * means a first attempt that wrote the note but failed the move repairs
 * itself on retry instead of stranding the agent.
 *
 * **Retry-of-a-full-success on `complete_follow_up_id` (fix round 1).** The
 * 60s note dedup window and the >60s-later retry case are different beasts:
 * a retry arriving AFTER the note dedup window still needs to see its
 * `complete_follow_up_id` as already handled. The Step-3 pre-check tells
 * these apart from an access violation by ownership, not by dedup timing: if
 * the follow-up is already `completed` AND still belongs to this agent on
 * this lead, that is a successful retry, not an error — the request
 * continues normally, the close step is skipped, and the response reports
 * `complete_error: false` exactly as a fresh success would. Only a missing
 * follow-up or one that is someone else's / a different lead's (open or
 * closed) 403s.
 *
 * See docs/CALL-TRACKING.md for the full contract and response shapes.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;
    const { agentUsername } = auth;

    const parsed = validateOutcomeRequest(await request.json().catch(() => null));
    if (!parsed.ok) return apiValidationError(parsed.message);
    const {
      leadId, outcome, note: noteRaw, nextFollowUpAtIso,
      notInterestedReason, completeFollowUpId,
    } = parsed.value;

    const supabase = createServiceRoleClient();

    // ── Ownership re-check (mandatory) ──────────────────────────────────
    // requireDeviceAuth gives us an agent, not a scope. Load the lead and
    // reject unless it is actually assigned to the calling agent — a
    // missing lead and a not-owned lead both resolve to the same generic
    // 403 (never leak whether a given lead_id exists to a caller who
    // doesn't own it).
    const { data: lead, error: leadErr } = await supabase
      .from('pyra_sales_leads')
      .select('assigned_to')
      .eq('id', leadId)
      .maybeSingle();
    if (leadErr) {
      logError({ error: leadErr, request, metadata: { action: 'mobile_call_outcome_lead_lookup', agentUsername, leadId } });
      return apiServerError();
    }
    if (!lead || lead.assigned_to !== agentUsername) {
      return apiForbidden('لا تملك صلاحية الوصول لهذا الليد');
    }

    // ── Follow-up pre-check — BEFORE any write ───────────────────────────
    // Must belong to the SAME lead and be assigned to the calling agent. A
    // missing follow-up and someone else's follow-up (open OR already
    // closed) all resolve to the same 403 — never leak which.
    //
    // Already-closed-and-OWNED is the one case that is NOT an error: it is
    // what a lost-response retry of a fully successful request looks like on
    // its second attempt (note deduped by the 60s window, follow-up already
    // completed by the first attempt). `loadFollowUpForClose` carries the row
    // back on its `already_closed` branch specifically so ownership can be
    // checked here before deciding which of these two very different
    // responses applies.
    //
    // This runs before the note insert on purpose: rejecting after we had
    // already written the outcome would leave the lead with a note and an
    // untouched follow-up, and the agent with no way to tell.
    let followUpToClose: OpenFollowUp | null = null;
    // Already closed AND owned by the caller on this lead — genuinely done,
    // just not by this request. Skip the close step below; the response
    // still reports success.
    let followUpAlreadyDone: OpenFollowUp | null = null;
    if (completeFollowUpId) {
      const loaded = await loadFollowUpForClose(supabase, completeFollowUpId);
      if (!loaded.ok && loaded.reason === 'db_error') return apiServerError();
      if (!loaded.ok && loaded.reason === 'not_found') {
        return apiForbidden('لا تملك صلاحية إغلاق هذه المتابعة');
      }
      // Both remaining shapes — open-and-found (`ok: true`) and
      // already_closed — carry a `followUp` row (TS can't eliminate the
      // `reason: 'not_found' | 'db_error'` member by literal comparison
      // alone since it isn't a singleton discriminant, so narrow by
      // property presence instead). Same ownership predicate applies to
      // either before the response is decided.
      if (!('followUp' in loaded)) return apiServerError();
      const fu = loaded.followUp;
      const alreadyClosed = !loaded.ok;
      if (fu.lead_id !== leadId || fu.assigned_to !== agentUsername) {
        return apiForbidden('لا تملك صلاحية إغلاق هذه المتابعة');
      }
      if (alreadyClosed) {
        followUpAlreadyDone = fu;
      } else {
        followUpToClose = fu;
      }
    }

    const nowIso = new Date().toISOString();
    const description = noteRaw || `نتيجة المكالمة: ${OUTCOME_LABELS[outcome]}`; // i18n-exempt: persisted lead-activity content (Phase 8)

    // ── 0. 60-second retry dedup ─────────────────────────────────────────
    // A bare retry (lost response, double-tap, client retry-on-5xx) must
    // not duplicate the note. Look for an identical outcome logged by the
    // same agent on the same lead in the last 60s. Fail OPEN on a lookup
    // error — a dedup-lookup blip must never swallow a real outcome the
    // agent just recorded, so we fall through to the normal insert path.
    const dedupWindowIso = new Date(Date.now() - 60_000).toISOString();
    const { data: dupRows, error: dupErr } = await supabase
      .from('pyra_lead_activities')
      .select('id')
      .eq('lead_id', leadId)
      .eq('activity_type', 'note')
      .eq('metadata->>source', 'mobile_call_outcome')
      .eq('metadata->>outcome', outcome)
      .eq('created_by', agentUsername)
      .gte('created_at', dedupWindowIso)
      .order('created_at', { ascending: false })
      .limit(1);
    if (dupErr) {
      console.error('[mobile/call-outcome] dedup lookup failed, proceeding with insert (fail open):', dupErr.message);
    }

    let activityId: string;
    let followUpId: string | null = null;
    let followUpError = false;
    const deduplicated = !dupErr && !!dupRows && dupRows.length > 0;

    if (deduplicated) {
      // ── Duplicate of a request already handled within the last 60s ────
      // Reuse the existing note activity; do NOT re-bump last_contact_at
      // (it is already current from the original request).
      activityId = dupRows[0].id;

      if (nextFollowUpAtIso) {
        // Asymmetric handling vs. the note: a duplicate follow-up row is far
        // more visible/annoying to the agent than a duplicate note, so we
        // never insert a second one on the dedup path. Instead, report
        // whatever follow-up already exists for this exact
        // (lead, agent, due_at) within the same window.
        const { data: dupFollowUps, error: dupFuErr } = await supabase
          .from('pyra_sales_follow_ups')
          .select('id')
          .eq('lead_id', leadId)
          .eq('assigned_to', agentUsername)
          .eq('due_at', nextFollowUpAtIso)
          .gte('created_at', dedupWindowIso)
          .order('created_at', { ascending: false })
          .limit(1);
        if (dupFuErr) {
          console.error('[mobile/call-outcome] dedup follow-up lookup failed:', dupFuErr.message);
          followUpError = true;
        } else if (dupFollowUps && dupFollowUps.length > 0) {
          followUpId = dupFollowUps[0].id;
        } else {
          // The original request's follow-up insert never landed — honest
          // reporting, not a silent success.
          followUpError = true;
        }
      }
    } else {
      // ── 1. Note activity on the lead timeline ─────────────────────────
      activityId = generateId('la');
      const { error: actErr } = await supabase.from('pyra_lead_activities').insert({
        id: activityId,
        lead_id: leadId,
        activity_type: 'note',
        description,
        metadata: { source: 'mobile_call_outcome', outcome, auto: false },
        created_by: agentUsername,
      });
      if (actErr) {
        logError({ error: actErr, request, metadata: { action: 'mobile_call_outcome_activity_insert', agentUsername, leadId } });
        return apiServerError();
      }

      // ── 2. Bump last_contact_at — roll back the activity if this fails ─
      const { error: bumpErr } = await supabase
        .from('pyra_sales_leads')
        .update({ last_contact_at: nowIso })
        .eq('id', leadId);
      if (bumpErr) {
        const { error: rollbackErr } = await supabase.from('pyra_lead_activities').delete().eq('id', activityId);
        if (rollbackErr) {
          console.error('[mobile/call-outcome] rollback delete failed:', rollbackErr.message);
        }
        logError({ error: bumpErr, request, metadata: { action: 'mobile_call_outcome_last_contact_bump', agentUsername, leadId, activityId } });
        return apiServerError('فشل تسجيل نتيجة المكالمة');
      }

      // ── 3. Optional follow-up — mirrors POST /api/crm/follow-ups ──────
      if (nextFollowUpAtIso) {
        followUpId = generateId('fu');
        const reminderAt = new Date(new Date(nextFollowUpAtIso).getTime() - 30 * 60 * 1000).toISOString();
        const followUpTitle = `متابعة مكالمة (${OUTCOME_LABELS[outcome]})`; // i18n-exempt: persisted follow-up content (Phase 8)

        const { error: fuErr } = await supabase.from('pyra_sales_follow_ups').insert({
          id: followUpId,
          lead_id: leadId,
          assigned_to: agentUsername,
          due_at: nextFollowUpAtIso,
          reminder_at: reminderAt,
          send_whatsapp_reminder: true,
          title: followUpTitle,
          notes: noteRaw || null,
          status: 'pending',
          created_by: agentUsername,
        });
        if (fuErr) {
          // Flip-and-warn (Quote System pattern): the note activity +
          // last_contact_at bump above already committed a real, true fact
          // (the call happened, the agent logged an outcome). Failing to
          // schedule the optional follow-up on top of that does not
          // un-happen the call, so this is surfaced as a FIELD in an
          // otherwise-200 response, never as a 5xx — a 5xx here would make
          // a mobile client (reasonably) assume nothing happened and resend
          // the identical request, duplicating the note.
          logError({ error: fuErr, request, metadata: { action: 'mobile_call_outcome_follow_up_insert', agentUsername, leadId, activityId } });
          console.error('[mobile/call-outcome] follow-up insert failed:', fuErr.message);
          followUpId = null;
          followUpError = true;
        } else {
          // Timeline entry — fire-and-forget, mirrors the CRM follow-ups route.
          void supabase
            .from('pyra_lead_activities')
            .insert({
              id: generateId('la'),
              lead_id: leadId,
              activity_type: 'follow_up_created',
              description: followUpTitle,
              metadata: { follow_up_id: followUpId, due_at: nextFollowUpAtIso, assigned_to: agentUsername },
              created_by: agentUsername,
            })
            .then(({ error: e }) => {
              if (e) console.error('[follow_up_created activity] insert failed:', e.message);
            });

          // Sync leads.next_follow_up to the earliest pending/overdue due_at —
          // fire-and-forget, mirrors the CRM follow-ups route.
          const { data: pending, error: pendingErr } = await supabase
            .from('pyra_sales_follow_ups')
            .select('due_at')
            .eq('lead_id', leadId)
            .in('status', ['pending', 'overdue'])
            .order('due_at', { ascending: true })
            .limit(1);
          if (pendingErr) {
            // Fire-and-forget sync — log, don't escalate to a 500.
            console.error('[mobile/call-outcome] pending follow-ups lookup failed:', pendingErr.message);
          } else if (pending && pending.length > 0) {
            void supabase
              .from('pyra_sales_leads')
              .update({ next_follow_up: pending[0].due_at })
              .eq('id', leadId)
              .then(({ error: e }) => {
                if (e) console.error('[lead next_follow_up update] failed:', e.message);
              });
          }
        }
      }
    }

    // ── 4. Stage move (not_interested only) ───────────────────────────────
    // Runs on the dedup path too, and that is the point: the move is
    // idempotent, so a retry after a half-succeeded first attempt REPAIRS
    // itself instead of leaving the agent stuck. Before this, a duplicate
    // request skipped every side effect.
    let stageError = false;
    if (notInterestedReason) {
      const moved = await markNotInterested(supabase, {
        leadId,
        actor: agentUsername,
        reason: notInterestedReason,
      });
      if (!moved.ok) {
        stageError = true;
        logError({
          error: `markNotInterested failed: ${moved.reason}`,
          request,
          metadata: {
            action: 'mobile_call_outcome_stage_move',
            agentUsername, leadId, failure: moved.reason,
          },
        });
      }
    }

    // ── 5. Close the follow-up the call was against ───────────────────────
    // Also idempotent — the compare-and-swap inside closeFollowUp matches 0
    // rows on a second attempt and reports `already_closed`, which on a retry
    // is a success from the agent's point of view, not a failure.
    //
    // `completedFollowUpId` (Defect 2 fix) is set ONLY when the follow-up is
    // actually closed by the time this request returns — never merely
    // "we attempted a close". That covers three cases: the already-closed-
    // and-owned retry (Defect 1 — genuinely closed, just not by this call),
    // a fresh close that succeeds here, and the rare race where a concurrent
    // request closes it between the Step-3 pre-check and this write (also
    // genuinely closed). It stays null when a close was attempted and failed
    // with a real `db_error`, so the audit row never claims a close that did
    // not happen.
    let completeError = false;
    let completedFollowUpId: string | null = null;
    if (followUpAlreadyDone) {
      completedFollowUpId = followUpAlreadyDone.id;
    } else if (followUpToClose) {
      const closed = await closeFollowUp(supabase, {
        followUp: followUpToClose,
        actor: agentUsername,
        // i18n-exempt: persisted lead-activity content (Phase 8)
        note: `أُقفلت مع تسجيل نتيجة المكالمة: ${OUTCOME_LABELS[outcome]}`,
        source: 'mobile_call_outcome',
      });
      if (closed.ok || closed.reason === 'already_closed') {
        completedFollowUpId = followUpToClose.id;
      } else {
        completeError = true;
        logError({
          error: `closeFollowUp failed: ${closed.reason}`,
          request,
          metadata: {
            action: 'mobile_call_outcome_complete_follow_up',
            agentUsername, leadId, followUpId: followUpToClose.id,
          },
        });
      }
    }

    logActivity(
      agentUsername,
      auth.displayName,
      `${ENTITY_TYPES.LEAD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/crm/leads/${leadId}`,
      {
        lead_id: leadId, outcome, follow_up_id: followUpId,
        follow_up_error: followUpError, deduplicated,
        stage_moved: !!notInterestedReason && !stageError,
        stage_error: stageError,
        completed_follow_up_id: completedFollowUpId,
        complete_error: completeError,
        source: 'mobile_call_outcome',
      },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({
      activity_id: activityId,
      follow_up_id: followUpId,
      follow_up_error: followUpError,
      deduplicated,
      stage_error: stageError,
      complete_error: completeError,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_call_outcome' } });
    return apiServerError();
  }
}
