import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Team-scope helpers — answer "who do I manage?" and "who's my manager?"
 * Used by the manager approvals dashboard, "my team" attendance view, etc.
 *
 * The relationship lives on `pyra_users.manager_username` (self-referencing).
 */

/**
 * Get the list of usernames that report directly to `managerUsername`.
 * Returns an empty array if no direct reports exist.
 */
export async function getDirectReports(
  supabase: SupabaseClient,
  managerUsername: string
): Promise<string[]> {
  if (!managerUsername) return [];

  const { data, error } = await supabase
    .from('pyra_users')
    .select('username')
    .eq('manager_username', managerUsername);

  if (error) {
    console.error('[getDirectReports] error:', error.message);
    return [];
  }

  return (data || []).map((r: { username: string }) => r.username);
}

/**
 * Get the manager username for a given user, or null if none.
 */
export async function getManagerOf(
  supabase: SupabaseClient,
  username: string
): Promise<string | null> {
  if (!username) return null;

  const { data, error } = await supabase
    .from('pyra_users')
    .select('manager_username')
    .eq('username', username)
    .single();

  if (error || !data) return null;
  return data.manager_username || null;
}

/**
 * Returns true if `managerUsername` is a manager (has at least one direct report).
 * Useful for showing/hiding the "My Approvals" sidebar entry.
 */
export async function isManager(
  supabase: SupabaseClient,
  managerUsername: string
): Promise<boolean> {
  if (!managerUsername) return false;

  const { count, error } = await supabase
    .from('pyra_users')
    .select('username', { count: 'exact', head: true })
    .eq('manager_username', managerUsername);

  if (error) return false;
  return (count ?? 0) > 0;
}

/**
 * Authoritative answer to: "Is `approverUsername` allowed to approve/reject
 * an HR action (leave, expense, timesheet) for `employeeUsername`?"
 *
 * Rules (CRM/ERP standard):
 *   1. Admins (role === 'admin') always pass — global override.
 *   2. Otherwise, only the employee's direct manager may approve.
 *      `pyra_users.manager_username` is the source of truth.
 *
 * Use at every approval mutation site. Permission strings (e.g.
 * `leave.approve`, `finance.manage`) by themselves are NOT sufficient — they
 * gate the action category but not the per-employee scope. Any granted
 * approval permission combined with this helper enforces "only your team."
 *
 * Returns false on any error (fail-closed).
 */
export async function canApproveFor(
  supabase: SupabaseClient,
  approverUsername: string,
  approverRole: string,
  employeeUsername: string
): Promise<boolean> {
  if (!approverUsername || !employeeUsername) return false;

  // Admin override — single source of truth for global authority.
  if (approverRole === 'admin') return true;

  // Self-approval is never allowed (defense in depth — most endpoints already
  // block this, but a misconfigured cycle in manager_username shouldn't help).
  if (approverUsername === employeeUsername) return false;

  const { data, error } = await supabase
    .from('pyra_users')
    .select('manager_username')
    .eq('username', employeeUsername)
    .single();

  if (error || !data) return false;
  return data.manager_username === approverUsername;
}
