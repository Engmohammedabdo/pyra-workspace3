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
 * **Ownership is NOT checked here — deliberately.** The two callers have
 * different rules: the CRM route allows the assignee OR an admin (via
 * `canAccessLead`'s admin shortcut); the mobile route allows the assignee
 * only, because a device key carries no RBAC scope. This module owns the
 * state transition; authorization stays with the caller.
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
  | { ok: false; reason: 'not_found' | 'already_closed' | 'db_error' };

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
    return { ok: false, reason: 'already_closed' };
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
  const { data: nextPending } = await supabase
    .from('pyra_sales_follow_ups')
    .select('due_at')
    .eq('lead_id', followUp.lead_id)
    .in('status', ['pending', 'overdue'])
    .order('due_at', { ascending: true })
    .limit(1);
  void supabase
    .from('pyra_sales_leads')
    .update({
      next_follow_up: nextPending && nextPending.length > 0 ? nextPending[0].due_at : null,
    })
    .eq('id', followUp.lead_id)
    .then(({ error: e }) => {
      if (e) console.error('[lead next_follow_up update] failed:', e.message);
    });

  return { ok: true, row: updated as Record<string, unknown> };
}
