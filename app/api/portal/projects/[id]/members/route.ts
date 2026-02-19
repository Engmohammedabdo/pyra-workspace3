import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import {
  apiSuccess,
  apiUnauthorized,
  apiNotFound,
  apiForbidden,
  apiServerError,
} from '@/lib/api/response';

/**
 * GET /api/portal/projects/[id]/members
 *
 * Returns project team members that the client can @mention.
 * Only returns display_name (not username) for privacy.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id: projectId } = await params;
    const supabase = createServiceRoleClient();

    // ── Verify project exists and belongs to client ───
    const { data: project } = await supabase
      .from('pyra_projects')
      .select('id, client_id, client_company, team_id')
      .eq('id', projectId)
      .single();

    if (!project) {
      return apiNotFound('المشروع غير موجود');
    }

    const ownsProject = project.client_id
      ? project.client_id === client.id
      : project.client_company === client.company;

    if (!ownsProject) {
      return apiForbidden('لا تملك صلاحية الوصول لهذا المشروع');
    }

    // ── Get mentionable members ─────────────────────
    // Admins are ALWAYS included (they have access to everything).
    // If the project has a team, team members are added too.
    // Result is deduplicated by display_name.

    // 1. Always get admins
    const { data: admins } = await supabase
      .from('pyra_users')
      .select('display_name')
      .eq('role', 'admin');

    const nameSet = new Set<string>();
    for (const a of admins || []) nameSet.add(a.display_name);

    // 2. If project has a team, add its members
    if (project.team_id) {
      const { data: teamMembers } = await supabase
        .from('pyra_team_members')
        .select('username')
        .eq('team_id', project.team_id);

      const usernames = (teamMembers || []).map((m: { username: string }) => m.username);

      if (usernames.length > 0) {
        const { data: teamUsers } = await supabase
          .from('pyra_users')
          .select('display_name')
          .in('username', usernames);

        for (const u of teamUsers || []) nameSet.add(u.display_name);
      }
    }

    const members = Array.from(nameSet).map((name) => ({ display_name: name }));

    return apiSuccess(members);
  } catch (err) {
    console.error('GET /api/portal/projects/[id]/members error:', err);
    return apiServerError();
  }
}
