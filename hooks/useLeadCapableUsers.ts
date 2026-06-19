'use client';

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';

export interface LiteUser {
  username: string;
  display_name: string;
  status?: string;
  role?: string;
}

/**
 * Roles that can OWN a lead (have leads.view → can actually see/work it once
 * assigned). Assigning a lead to anyone else (e.g. a plain `employee`) would
 * re-orphan it under someone who can't open it. v1 uses a role proxy; v1.1
 * could filter by computed leads.view capability for custom roles.
 *
 * SINGLE SOURCE for the reassignment "who can be an owner" security filter —
 * shared by the per-lead reassign modal (Option A) AND the pipeline bulk-assign
 * bar (Option B). Keep both consumers on this hook so the filter never drifts.
 */
export const LEAD_CAPABLE_ROLES = new Set(['sales_agent', 'admin']);

/**
 * Lite user list (shared ['users','lite'] cache), split into:
 *   - all:         every user incl. inactive — lets a caller resolve a current
 *                  owner's display_name even when that owner is a departed
 *                  (inactive) agent.
 *   - leadCapable: active AND lead-capable, sorted by display_name — the ONLY
 *                  valid reassignment targets. The active filter is the
 *                  security invariant (never an inactive/banned target); the
 *                  role filter prevents re-orphaning.
 */
export function useLeadCapableUsers() {
  const q = useQuery<LiteUser[]>({
    queryKey: ['users', 'lite'],
    queryFn: () => fetchAPI('/api/users/lite'),
    staleTime: 5 * 60_000,
  });
  const all = q.data ?? [];
  const leadCapable = all
    .filter((u) => u.status === 'active' && LEAD_CAPABLE_ROLES.has(u.role ?? ''))
    .sort((a, b) => a.display_name.localeCompare(b.display_name, 'ar'));
  return { all, leadCapable, isLoading: q.isLoading };
}
