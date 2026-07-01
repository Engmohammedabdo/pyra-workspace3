/**
 * lib/notifications/approvers.ts
 *
 * Centralises "notify the approver, falling back to admins when there is no
 * ACTIVE direct manager" — so leave / expense / timesheet submit routes never
 * strand a request silently when the employee has no manager assigned or when
 * their manager's account is inactive / suspended.
 *
 * Usage:
 *   import { notifyApprovers } from '@/lib/notifications/approvers';
 *
 *   await notifyApprovers(supabase, auth.pyraUser.username, {
 *     type: 'leave_request_pending',
 *     title: `طلب إجازة جديد من ${auth.pyraUser.display_name}`,
 *     message: `${days_count} يوم`,
 *     link: '/dashboard/approvals',
 *     entity: { type: 'leave_request', id: data.id },
 *     from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
 *   });
 *
 * Fire-and-forget semantics are inherited from notify() / notifyMany().
 * No error is ever thrown from this helper.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { notify, notifyMany, type NotifyInput } from './notify';
import { getManagerOf } from '@/lib/auth/team-scope';

/**
 * Notify the employee's ACTIVE direct manager that something needs their
 * approval. If the employee has no manager, or the manager's status is not
 * 'active', fall back to ALL active admins so the request is never stranded.
 *
 * @param supabase          Service-role client (must be able to read pyra_users)
 * @param employeeUsername  The username of the employee who triggered the action
 * @param input             Notification fields — 'to' is omitted; filled in here
 */
export async function notifyApprovers(
  supabase: SupabaseClient,
  employeeUsername: string,
  input: Omit<NotifyInput, 'to'>,
): Promise<void> {
  try {
    // 1. Find the direct manager (may be null if none assigned)
    const managerUsername = await getManagerOf(supabase, employeeUsername);

    let activeManager: string | null = null;
    if (managerUsername) {
      const { data: mgr } = await supabase
        .from('pyra_users')
        .select('status')
        .eq('username', managerUsername)
        .single();

      if (mgr?.status === 'active') {
        activeManager = managerUsername;
      }
    }

    // 2a. Happy path — active manager found
    if (activeManager) {
      await notify(supabase, { ...input, to: activeManager });
      return;
    }

    // 2b. Fallback — no active manager; notify all active admins instead
    const { data: admins } = await supabase
      .from('pyra_users')
      .select('username')
      .eq('role', 'admin')
      .eq('status', 'active');

    await notifyMany(
      supabase,
      (admins ?? []).map((a: { username: string }) => a.username),
      input,
    );
  } catch (err) {
    // notifyApprovers must never propagate — callers rely on fire-and-forget
    console.error('[notifyApprovers] threw:', err);
  }
}
