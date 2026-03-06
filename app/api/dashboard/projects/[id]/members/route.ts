import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/dashboard/projects/[id]/members
// Returns mentionable users for a project: admins + project team members
// Auth: requireApiPermission('projects.view')
// =============================================================
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('projects.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = await createServerSupabaseClient();

    // Fetch project to get team_id
    const { data: project, error: projectError } = await supabase
      .from('pyra_projects')
      .select('id, team_id')
      .eq('id', id)
      .single();

    if (projectError || !project) {
      return apiNotFound('المشروع غير موجود');
    }

    // Deduplicate by username
    const usersMap = new Map<string, { display_name: string; username: string }>();

    // 1. Always include all admins
    const { data: admins } = await supabase
      .from('pyra_users')
      .select('username, display_name')
      .eq('role', 'admin');

    (admins || []).forEach((u) => {
      usersMap.set(u.username, { display_name: u.display_name, username: u.username });
    });

    // 2. Include team members if project has a team
    if (project.team_id) {
      const { data: teamMembers } = await supabase
        .from('pyra_team_members')
        .select('username')
        .eq('team_id', project.team_id);

      const memberUsernames = (teamMembers || []).map((m) => m.username);
      if (memberUsernames.length > 0) {
        const { data: users } = await supabase
          .from('pyra_users')
          .select('username, display_name')
          .in('username', memberUsernames);

        (users || []).forEach((u) => {
          usersMap.set(u.username, { display_name: u.display_name, username: u.username });
        });
      }
    }

    return apiSuccess(Array.from(usersMap.values()));
  } catch (err) {
    console.error('Project members GET error:', err);
    return apiServerError();
  }
}
