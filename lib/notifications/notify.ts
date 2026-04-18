import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';

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
 */

export type NotificationType =
  // Task lifecycle
  | 'task_assigned'
  | 'task_due_soon'
  | 'task_status_changed'
  | 'task_comment'
  | 'task_mention'
  // Sales
  | 'lead_assigned'
  | 'lead_transferred'
  | 'follow_up_due'
  | 'whatsapp_message'
  | 'whatsapp_assigned'
  // Approvals (manager-facing)
  | 'leave_request_pending'
  | 'expense_pending'
  | 'timesheet_pending'
  | 'quote_approval_requested'
  | 'file_approval_requested'
  // Approval results (employee-facing)
  | 'leave_approved'
  | 'leave_rejected'
  | 'expense_approved'
  | 'expense_rejected'
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

  try {
    const { error } = await supabase.from('pyra_notifications').insert({
      id: generateId('ntf'),
      recipient_username: input.to.trim(),
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
    }
  } catch (err) {
    console.error('[notify] threw:', err);
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

  const rows = filtered.map((to) => ({
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
    }
  } catch (err) {
    console.error('[notifyMany] threw:', err);
  }
}
