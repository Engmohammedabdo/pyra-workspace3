import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';

/**
 * The ONE place a `pyra_sales_follow_ups` row becomes `completed`.
 *
 * Extracted verbatim from `app/api/crm/follow-ups/[id]/complete/route.ts` so
 * the Android app closes follow-ups through the SAME code the web does, not a
 * lookalike. If these ever diverge, the next fix to `next_follow_up`
 * recomputation lands in one path and silently leaves the other wrong.
 *
 * **The ownership PREDICATE is not defined here — deliberately.** The callers
 * have different rules: the CRM route allows the assignee OR an admin (via
 * `canAccessLead`'s admin shortcut); the mobile routes allow the assignee only,
 * because a device key carries no RBAC scope, and `call-outcome` additionally
 * requires the follow-up to belong to the lead in the request.
 *
 * **The ORDER in which that predicate is applied IS defined here**, in
 * [classifyCloseAccess] at the bottom of this file. Ownership must be tested
 * before the open/already-closed split, or an "already closed" success turns
 * into an oracle revealing which follow-up ids exist. That ordering was gotten
 * wrong once already, so it lives in one tested place rather than in each
 * route. So: the caller supplies WHO counts as the owner; this module owns both
 * the state transition and WHEN that question is asked.
 */

export interface OpenFollowUp {
  id: string;
  lead_id: string;
  assigned_to: string | null;
  status: string;
  title: string | null;
  due_at: string;
}

export type LoadFollowUpResult =
  | { ok: true; followUp: OpenFollowUp }
  // `already_closed` carries the row too: a caller that needs to distinguish
  // "not yours" from "yours, and already done" must be able to check ownership
  // before choosing a response. Without the row, an idempotent retry of a
  // SUCCESSFUL close is indistinguishable from an access violation.
  | { ok: false; reason: 'already_closed'; followUp: OpenFollowUp }
  | { ok: false; reason: 'not_found' | 'db_error' };

export type CloseFollowUpResult =
  | { ok: true; row: Record<string, unknown> }
  | { ok: false; reason: 'already_closed' | 'db_error' };

/**
 * Fetch a follow-up and assert it is still open.
 *
 * `'overdue'` is a LIVE not-done state (the check-due cron flips due-past
 * `pending` → `overdue`). It MUST stay closeable — otherwise the row can never
 * be closed from any UI and overdue counts + `leads.next_follow_up` inflate
 * forever.
 */
export async function loadFollowUpForClose(
  supabase: SupabaseClient,
  followUpId: string,
): Promise<LoadFollowUpResult> {
  const { data, error } = await supabase
    .from('pyra_sales_follow_ups')
    .select('id, lead_id, assigned_to, status, title, due_at')
    .eq('id', followUpId)
    .maybeSingle();

  if (error) {
    console.error('[closeFollowUp] fetch error:', error.message);
    return { ok: false, reason: 'db_error' };
  }
  if (!data) return { ok: false, reason: 'not_found' };
  if (data.status !== 'pending' && data.status !== 'overdue') {
    return { ok: false, reason: 'already_closed', followUp: data as OpenFollowUp };
  }
  return { ok: true, followUp: data as OpenFollowUp };
}

/**
 * Close an already-loaded open follow-up.
 *
 * Three writes, in this order:
 *   1. Compare-and-swap the row to `completed` (`.in('status', [...])`) — a
 *      concurrent close matches 0 rows and returns `already_closed` instead of
 *      re-processing.
 *   2. Fire-and-forget `follow_up_completed` timeline activity.
 *   3. Fire-and-forget recompute of `leads.next_follow_up` to the earliest
 *      remaining open follow-up (or null).
 *
 * `source` is OMITTED from the activity metadata when not supplied, so the
 * web's write stays byte-identical to what it was before this extraction.
 *
 * **Fix 5 (wave C audit) — the single writer of `leads.next_follow_up` when
 * a close is happening.** `POST /api/mobile/call-outcome` has its OWN,
 * separate `next_follow_up` recompute for its optional "schedule a new
 * follow-up" step, and that step now deliberately SKIPS its write whenever
 * this function is also about to run (`followUpToClose` set) — because write
 * 3 below runs LAST and reads BOTH rows (the one just closed here, and any
 * newly-created one) in their FINAL state. The other site's read happens
 * BEFORE step 1 closes the old row, so racing the two un-awaited writes
 * against each other let whichever landed second decide the column — on the
 * common "close an overdue follow-up while scheduling the next one" flow,
 * that meant the stale/past due_at from the OLD follow-up could overwrite
 * the correct new one about half the time. Do not remove this function's
 * ownership of that recompute without removing the skip on the other side
 * too — see that route's comment for the full failure sequence.
 */
export async function closeFollowUp(
  supabase: SupabaseClient,
  opts: {
    followUp: OpenFollowUp;
    actor: string;
    note?: string | null;
    source?: string;
  },
): Promise<CloseFollowUpResult> {
  const { followUp, actor, note, source } = opts;
  const completedAt = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from('pyra_sales_follow_ups')
    .update({ status: 'completed', completed_at: completedAt })
    .eq('id', followUp.id)
    .in('status', ['pending', 'overdue'])
    .select('*')
    .maybeSingle();
  if (updErr) {
    console.error('[closeFollowUp] update error:', updErr.message);
    return { ok: false, reason: 'db_error' };
  }
  if (!updated) return { ok: false, reason: 'already_closed' };

  // .then() required — the Supabase query builder is lazy; bare
  // `void <builder>` never triggers execution.
  void supabase
    .from('pyra_lead_activities')
    .insert({
      id: generateId('la'),
      lead_id: followUp.lead_id,
      activity_type: 'follow_up_completed',
      description: note || null,
      metadata: {
        follow_up_id: followUp.id,
        title: followUp.title,
        completed_at: completedAt,
        ...(source ? { source } : {}),
      },
      created_by: actor,
    })
    .then(({ error: e }) => {
      if (e) console.error('[follow_up_completed activity] insert failed:', e.message);
    });

  // Recalculate the parent lead's next_follow_up to the earliest remaining
  // open one — null when none is left.
  //
  // Fix 4 (wave C audit): the `error` here used to be discarded, so a
  // TRANSIENT lookup failure fell through to the update below with
  // `nextPending` still `null` — writing `next_follow_up: null` even when a
  // later follow-up (e.g. a `fu_2` due in 10 days) is still open. Nothing
  // ever repairs that: `fu_2` stays open, so no future close recomputes this
  // column again. A stale non-null value is strictly better than a wrong
  // null, so a lookup failure now skips the write entirely — this code was
  // extracted verbatim from the web route (see the file-level doc comment),
  // so the bug was pre-existing there too, but it now runs on three call
  // sites instead of one and the mobile ones fire far more often.
  const { data: nextPending, error: nextPendingErr } = await supabase
    .from('pyra_sales_follow_ups')
    .select('due_at')
    .eq('lead_id', followUp.lead_id)
    .in('status', ['pending', 'overdue'])
    .order('due_at', { ascending: true })
    .limit(1);
  if (nextPendingErr) {
    console.error('[closeFollowUp] next_follow_up lookup failed, skipping recompute:', nextPendingErr.message);
  } else {
    void supabase
      .from('pyra_sales_leads')
      .update({
        next_follow_up: nextPending && nextPending.length > 0 ? nextPending[0].due_at : null,
      })
      .eq('id', followUp.lead_id)
      .then(({ error: e }) => {
        if (e) console.error('[lead next_follow_up update] failed:', e.message);
      });
  }

  return { ok: true, row: updated as Record<string, unknown> };
}

export type CloseAccess =
  | { kind: 'server_error' }
  | { kind: 'forbidden' }
  | { kind: 'already_done'; followUp: OpenFollowUp }
  | { kind: 'proceed'; followUp: OpenFollowUp };

/**
 * Decide what a caller may do with a follow-up they asked to close.
 *
 * Pure — the whole point. This is a security boundary whose STEP ORDER is
 * load-bearing: ownership is checked BEFORE the open/already-closed split, so
 * a caller who does not own the row gets the same `forbidden` either way. Flip
 * those two and an "already closed" success becomes an oracle telling anyone
 * which follow-up ids exist. That mistake was made once in this wave already.
 *
 * `already_done` is a SUCCESS for the caller, not a failure: it means the
 * follow-up they own is already closed, which is what they asked for. It is
 * what makes a retry of a lost-response request idempotent instead of
 * returning a false "you don't have permission".
 *
 * `isOwner` is a callback because the two callers own different rules — the
 * follow-ups/complete route checks `assigned_to` alone, while call-outcome
 * additionally requires the follow-up to belong to the lead in the request.
 * Both are stricter forms of the same question, so both belong here.
 */
export function classifyCloseAccess(
  loaded: LoadFollowUpResult,
  isOwner: (followUp: OpenFollowUp) => boolean,
): CloseAccess {
  if (!loaded.ok && loaded.reason === 'db_error') return { kind: 'server_error' };
  if (!loaded.ok && loaded.reason === 'not_found') return { kind: 'forbidden' };
  // Both remaining shapes — open-and-found (`ok: true`) and `already_closed`
  // — carry a `followUp` row. `reason` isn't a singleton discriminant across
  // the whole union (both `not_found` and `already_closed` sit under
  // `ok: false`), so narrow by property presence instead of chasing `reason`
  // further. This branch is unreachable given the two checks above, but it
  // keeps the function total without an `as` cast, and — like the two
  // checks above it — it returns WITHOUT ever calling `isOwner`.
  if (!('followUp' in loaded)) return { kind: 'server_error' };
  const followUp = loaded.followUp;
  const alreadyClosed = !loaded.ok;

  if (!isOwner(followUp)) return { kind: 'forbidden' };
  if (alreadyClosed) return { kind: 'already_done', followUp };
  return { kind: 'proceed', followUp };
}
