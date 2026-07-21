import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';
import { sendWebPushToUser, sendWebPushToUsers } from '@/lib/notifications/web-push';

/**
 * Centralized notification creator.
 *
 * Why this exists:
 *   The codebase had ~30 places inserting into pyra_notifications, several of
 *   which used wrong column names (`username` instead of `recipient_username`,
 *   `link` instead of `target_path`) and silently failed. This helper enforces
 *   the correct shape in one place.
 *
 * Usage:
 *   import { notify } from '@/lib/notifications/notify';
 *
 *   await notify(supabase, {
 *     to: 'ahmed.s',
 *     type: 'task_assigned',
 *     title: 'تم تعيينك في مهمة جديدة',
 *     message: `قام ${actor.display_name} بتعيينك`,
 *     link: `/dashboard/boards/${boardId}?task=${taskId}`,
 *     entity: { type: 'task', id: taskId },
 *     from: { username: actor.username, displayName: actor.display_name },
 *   });
 *
 * Errors are swallowed and logged — notifications are never allowed to break
 * the parent request flow (fire-and-forget semantics).
 *
 * Every writer here gates recipients on pyra_users.status — see
 * selectUndeliverableRecipients() below.
 */

export type NotificationType =
  // Task lifecycle
  | 'task_assigned'
  | 'task_due_soon'
  | 'task_overdue'
  | 'task_status_changed'
  | 'task_comment'
  | 'task_mention'
  // Production pipeline (2026-07-03 remote-production-tracking)
  | 'task_submitted_for_review'
  | 'task_stage_advanced'
  | 'task_approved'
  | 'task_revision_requested'
  | 'task_delivered'
  // Attendance
  | 'attendance_checkin_reminder'
  // Sales
  | 'lead_assigned'
  | 'lead_transferred'
  | 'follow_up_due'
  | 'whatsapp_message'
  | 'whatsapp_assigned'
  // Sales CRM (added in CRM rebuild — CRM-PRD/01-OVERVIEW-AND-SCOPE.md § Notifications)
  | 'lead_stage_changed'
  | 'lead_closed_won_pending_approval'
  | 'lead_closed_won_approved'
  | 'lead_closed_won_rejected'
  | 'lead_idle_warning'
  // Phase 7: admin reopen of a closed_won lead. Fires only via the
  // leads.manage override path in /api/crm/leads/[id]/move-stage.
  | 'lead_reopened'
  // Phase 9: admin manually converts a closed_won lead into a portal
  // client (creates pyra_clients row + optional portal access). Fires
  // to the lead's assigned_to (the sales agent who originally won the
  // deal) so they get the closure-of-loop signal.
  | 'lead_converted_to_customer'
  // Call tracking (2026-07-10) — the quick-add-lead flow (mobile call app)
  // nudges the agent to log the call outcome right after auto-creating a
  // lead from an unmatched phone call.
  | 'call_feedback_required'
  // Call tracking v1.1-C — a device API key has gone silent (no
  // authenticated request, including the empty-sync heartbeat ping, in the
  // last 25h). Admin-facing only — fired by
  // /api/cron/device-silent-check.
  | 'device_sync_silent'
  // Approvals (manager-facing)
  | 'leave_request_pending'
  | 'expense_pending'
  | 'timesheet_pending'
  | 'quote_approval_requested'
  | 'file_approval_requested'
  // Approval results (employee-facing)
  | 'leave_approved'
  | 'leave_rejected'
  // Manager-facing — employee cancelled their own (pending or approved) leave
  | 'leave_cancelled'
  | 'expense_approved'
  | 'expense_rejected'
  // Payroll / employee payments (employee-facing)
  | 'payroll_paid'
  | 'employee_payment_approved'
  | 'employee_payment_paid'
  // Evaluations
  | 'evaluation_submitted'
  | 'evaluation_acknowledged'
  // Documents
  | 'document_uploaded'
  | 'document_expiring_soon'
  | 'document_expired'
  // Stripe money events (admin-facing — finance audit 2026-07-02 fix:
  // previously direct inserts addressed to a non-existent 'admin' user)
  | 'dispute_created'
  | 'dispute_closed'
  | 'payment_failed'
  // Finance daily cron (admin-facing, internal-only — Batch 3)
  | 'invoice_draft_generated'
  | 'contract_expiring'
  // Quote signing (portal → agent bell)
  | 'quote_signed'
  // Offboarding (2026-07 employee exit orchestrator)
  | 'offboarding_completed'
  // Generic
  | 'comment_reply'
  | 'mention'
  | 'system';

export interface NotifyInput {
  to: string;
  type: NotificationType | string;
  title: string;
  message?: string;
  link?: string | null;
  entity?: { type: string; id: string };
  from?: { username?: string | null; displayName?: string | null };
}

export interface RecipientStatusRow {
  username: string;
  status: string | null;
}

/**
 * Given the requested recipients and their pyra_users rows, return the subset
 * that must NOT be written.
 *
 * A user whose status is not 'active' cannot reach the bell: every auth gate
 * rejects them with this exact predicate — lib/api/auth.ts (API requests),
 * lib/auth/guards.ts (page renders), and the login routes — so the row is dead
 * weight. It also accrues forever: an open task assigned to a departed
 * employee re-notified them every cron day (confirmed live 2026-07-15).
 * Gating the WRITE also stops the web-push dispatch that follows each insert,
 * which has no status filter of its own — a departed employee's phone buzzing.
 *
 * Deliberately a DENYLIST: only a username whose row EXISTS and is non-active
 * is dropped. recipient_username has no foreign key and prod holds orphan
 * assignees, so an unknown username is left alone — silently eating it would
 * hide the missing-validation defect upstream of it.
 *
 * Matching the auth gates' `!== 'active'` exactly (so NULL and any other value
 * are undeliverable) is what keeps the two from ever disagreeing.
 */
export function selectUndeliverableRecipients(
  requested: string[],
  rows: RecipientStatusRow[]
): Set<string> {
  const wanted = new Set(requested);
  return new Set(
    rows
      .filter((r) => wanted.has(r.username) && r.status !== 'active')
      .map((r) => r.username)
  );
}

/**
 * Look up the recipients' status and resolve who cannot be written to.
 *
 * Fails OPEN — on a lookup error we send anyway. A transient DB blip must never
 * eat a real notification.
 */
async function resolveUndeliverable(
  supabase: SupabaseClient,
  usernames: string[]
): Promise<Set<string>> {
  if (usernames.length === 0) return new Set();

  try {
    const { data, error } = await supabase
      .from('pyra_users')
      .select('username, status')
      .in('username', usernames);

    if (error) {
      console.error('[notify] recipient status lookup failed — sending anyway:', error.message);
      return new Set();
    }

    const rows = (data || []) as RecipientStatusRow[];
    const known = new Set(rows.map((r) => r.username));
    for (const u of usernames) {
      if (!known.has(u)) {
        console.warn('[notify] recipient has no pyra_users row — sending anyway:', u);
      }
    }

    return selectUndeliverableRecipients(usernames, rows);
  } catch (err) {
    console.error('[notify] recipient status lookup threw — sending anyway:', err);
    return new Set();
  }
}

export async function notify(
  supabase: SupabaseClient,
  input: NotifyInput
): Promise<void> {
  if (!input.to?.trim() || !input.type?.trim() || !input.title?.trim()) {
    console.warn('[notify] skipped — missing required fields', input);
    return;
  }

  if (input.from?.username && input.from.username === input.to) {
    return;
  }

  const to = input.to.trim();
  if ((await resolveUndeliverable(supabase, [to])).has(to)) return;

  try {
    const { error } = await supabase.from('pyra_notifications').insert({
      id: generateId('ntf'),
      recipient_username: to,
      type: input.type.trim(),
      title: input.title.trim(),
      message: input.message?.trim() || null,
      target_path: input.link?.trim() || null,
      source_username: input.from?.username || null,
      source_display_name: input.from?.displayName || null,
      entity_type: input.entity?.type || null,
      entity_id: input.entity?.id || null,
      is_read: false,
    });

    if (error) {
      console.error('[notify] insert failed:', error.message, { to: input.to, type: input.type });
    } else {
      void sendWebPushToUser(to);
    }
  } catch (err) {
    console.error('[notify] threw:', err);
  }
}

/**
 * Insert MANY DISTINCT notifications in a single round trip.
 *
 * Use when you have N different notifications (different recipient / message /
 * link per row) to write at once — e.g. a bulk lead reassign that pings the new
 * owner once per lead. Unlike notifyMany (same message → many recipients), each
 * input here is its own notification. One batched insert (no N+1).
 *
 * Per-row guards mirror notify(): rows missing required fields are dropped, and
 * self-notifications (from.username === to) are skipped. Fire-and-forget.
 */
export async function notifyBatch(
  supabase: SupabaseClient,
  inputs: NotifyInput[]
): Promise<void> {
  const candidates = inputs
    .filter((i) => i.to?.trim() && i.type?.trim() && i.title?.trim())
    .filter((i) => !(i.from?.username && i.from.username === i.to));

  if (candidates.length === 0) return;

  const undeliverable = await resolveUndeliverable(
    supabase,
    candidates.map((i) => i.to.trim())
  );

  const rows = candidates
    .filter((i) => !undeliverable.has(i.to.trim()))
    .map((i) => ({
      id: generateId('ntf'),
      recipient_username: i.to.trim(),
      type: i.type.trim(),
      title: i.title.trim(),
      message: i.message?.trim() || null,
      target_path: i.link?.trim() || null,
      source_username: i.from?.username || null,
      source_display_name: i.from?.displayName || null,
      entity_type: i.entity?.type || null,
      entity_id: i.entity?.id || null,
      is_read: false,
    }));

  if (rows.length === 0) return;

  try {
    const { error } = await supabase.from('pyra_notifications').insert(rows);
    if (error) {
      console.error('[notifyBatch] insert failed:', error.message, { count: rows.length });
    } else {
      void sendWebPushToUsers(rows.map((row) => row.recipient_username));
    }
  } catch (err) {
    console.error('[notifyBatch] threw:', err);
  }
}

/**
 * Send the same notification to multiple recipients (deduplicates and skips actor).
 */
export async function notifyMany(
  supabase: SupabaseClient,
  recipients: string[],
  input: Omit<NotifyInput, 'to'>
): Promise<void> {
  const unique = Array.from(new Set(recipients.filter(Boolean)));
  const filtered = input.from?.username
    ? unique.filter((u) => u !== input.from?.username)
    : unique;

  if (filtered.length === 0) return;

  const undeliverable = await resolveUndeliverable(supabase, filtered);
  const deliverable = filtered.filter((u) => !undeliverable.has(u));

  if (deliverable.length === 0) return;

  const rows = deliverable.map((to) => ({
    id: generateId('ntf'),
    recipient_username: to,
    type: input.type.trim(),
    title: input.title.trim(),
    message: input.message?.trim() || null,
    target_path: input.link?.trim() || null,
    source_username: input.from?.username || null,
    source_display_name: input.from?.displayName || null,
    entity_type: input.entity?.type || null,
    entity_id: input.entity?.id || null,
    is_read: false,
  }));

  try {
    const { error } = await supabase.from('pyra_notifications').insert(rows);
    if (error) {
      console.error('[notifyMany] insert failed:', error.message, { count: rows.length });
    } else {
      void sendWebPushToUsers(rows.map((row) => row.recipient_username));
    }
  } catch (err) {
    console.error('[notifyMany] threw:', err);
  }
}
