import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/dashboard/leads/[id]/members
//
// Returns mentionable users for a CRM lead context — used by the
// `<MentionTextarea leadId={...}>` component on the lead activity composer
// (Phase 15.1 Commit 1).
//
// Membership scope (Q1 lock — Phase 15.1 Investigator report):
//   all users with role IN ('admin', 'sales_agent')
//
// Why this scope (vs. tighter "assigned_to + admins" alternative):
//   - Pyramedia's CRM team is small (~2-4 internal users)
//   - Lead `assigned_to` can change during handoffs; restricting to the
//     current assignee would prevent mentioning the previous owner during
//     handoff conversations (a common need)
//   - Matches the established pattern at /api/dashboard/projects/[id]/members
//     which always includes all admins
//
// Auth gate (two-step, mirrors the lead activities GET endpoint):
//   1. requireApiPermission('lead_activities.view') — read-level perm
//   2. canAccessLead(supabase, username, role, leadId) — scope check
//
// Response shape: { display_name, username }[] — matches the contract the
// shared MentionTextarea expects (see lib/utils/api-helpers.ts fetchAPI<MemberItem[]>).
// ────────────────────────────────────────────────────────────────────────────

interface MentionableMember {
  display_name: string;
  username: string;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('lead_activities.view');
    if (isApiError(auth)) return auth;

    const { id: leadId } = await params;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(
      supabase,
      auth.pyraUser.username,
      auth.pyraUser.role,
      leadId,
    );
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    // Single query — admins + sales_agents in one .in() filter, sorted
    // alphabetically by display_name for predictable autocomplete order.
    const { data, error } = await supabase
      .from('pyra_users')
      .select('username, display_name')
      .in('role', ['admin', 'sales_agent'])
      .order('display_name', { ascending: true });

    if (error) {
      logError({
        error,
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { lead_id: leadId, action: 'lead-members-list' },
      });
      console.error('GET /api/dashboard/leads/[id]/members SELECT failed:', error.message);
      return apiServerError();
    }

    const members: MentionableMember[] = (data ?? []).map((u) => ({
      display_name: u.display_name,
      username: u.username,
    }));

    return apiSuccess(members);
  } catch (err) {
    logError({
      error: err,
      request,
      metadata: { action: 'lead-members-list' },
    });
    console.error('GET /api/dashboard/leads/[id]/members threw:', err);
    return apiServerError();
  }
}
