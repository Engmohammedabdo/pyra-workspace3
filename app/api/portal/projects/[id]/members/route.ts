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

    // ── Get team members ─────────────────────────────
    // If the project has a team assigned, return that team's members.
    // Otherwise, return ALL users (admins + employees) since they all
    // have access and the client should be able to @mention them.
    let usernames: string[] = [];

    if (project.team_id) {
      const { data: teamMembers } = await supabase
        .from('pyra_team_members')
        .select('username')
        .eq('team_id', project.team_id);

      usernames = (teamMembers || []).map((m: { username: string }) => m.username);
    }

    // Fallback: if no team or team has no members, return all active users
    let users: { display_name: string }[] | null;

    if (usernames.length > 0) {
      const { data } = await supabase
        .from('pyra_users')
        .select('display_name')
        .in('username', usernames);
      users = data;
    } else {
      const { data } = await supabase
        .from('pyra_users')
        .select('display_name');
      users = data;
    }

    const members = (users || []).map((u: { display_name: string }) => ({
      display_name: u.display_name,
    }));

    return apiSuccess(members);
  } catch (err) {
    console.error('GET /api/portal/projects/[id]/members error:', err);
    return apiServerError();
  }
}
