import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Lead scoping — final gate AFTER permission gate (`requireApiPermission`).
 *
 * Rule (CRM-PRD/02-DATABASE-AND-MIGRATION.md § Phase 8):
 *   - Admins see / mutate ALL leads.
 *   - Sales agents see / mutate ONLY their own leads (`assigned_to = username`).
 *   - Manager-of-direct-reports support is intentionally deferred until v1.x
 *     when Pyramedia hires a second sales rep. Treat manager === admin in v1.
 *
 * Use these helpers in API routes that read or mutate `pyra_sales_leads`,
 * `pyra_lead_activities`, `pyra_sales_follow_ups`, and any future per-lead
 * sub-resources.
 */

/**
 * True if the caller is allowed to access (read or mutate) the given lead.
 * Combine with a permission gate first — this only handles SCOPE.
 */
export async function canAccessLead(
  supabase: SupabaseClient,
  username: string,
  role: string,
  leadId: string,
): Promise<boolean> {
  if (role === 'admin') return true;

  const { data, error } = await supabase
    .from('pyra_sales_leads')
    .select('assigned_to')
    .eq('id', leadId)
    .maybeSingle();

  if (error || !data) return false;
  return data.assigned_to === username;
}

/**
 * Returns the column/value to filter by when listing leads, or `null` for
 * unrestricted (admin) access. Used to scope `select` queries efficiently
 * without doing a per-row check.
 *
 * Usage:
 *   const filter = getLeadScopeFilter(auth.pyraUser.role, auth.pyraUser.username);
 *   let q = supabase.from('pyra_sales_leads').select('*');
 *   if (filter) q = q.eq(filter.column, filter.value);
 */
export function getLeadScopeFilter(
  role: string,
  username: string,
): { column: 'assigned_to'; value: string } | null {
  if (role === 'admin') return null;
  return { column: 'assigned_to', value: username };
}

/**
 * True if `username` names an existing, ACTIVE pyra_user — i.e. a lead or
 * follow-up can safely be assigned to them without orphaning it under a ghost
 * or departed account (a non-existent / inactive assignee would hide the record
 * from every non-admin scope forever).
 *
 * Combine with a `leads.assign` permission gate on the caller BEFORE honoring a
 * caller-supplied `assigned_to` that differs from the caller's own username.
 */
export async function isAssignableUser(
  supabase: SupabaseClient,
  username: string,
): Promise<boolean> {
  if (!username) return false;
  const { data, error } = await supabase
    .from('pyra_users')
    .select('status')
    .eq('username', username)
    .maybeSingle();
  if (error || !data) return false;
  return data.status === 'active';
}
