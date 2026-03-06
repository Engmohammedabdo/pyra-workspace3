import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/dashboard/tasks/[id]/members
// Returns mentionable users for a task:
//   admins + project team members + task assignees
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

    // Fetch task to get board_id and assigned_to
    const { data: task, error: taskError } = await supabase
      .from('pyra_tasks')
      .select('id, board_id, assigned_to')
      .eq('id', id)
      .single();

    if (taskError || !task) {
      return apiNotFound('المهمة غير موجودة');
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

    // 2. Get board -> project -> team_id chain
    if (task.board_id) {
      const { data: board } = await supabase
        .from('pyra_boards')
        .select('id, project_id')
        .eq('id', task.board_id)
        .single();

      if (board?.project_id) {
        const { data: project } = await supabase
          .from('pyra_projects')
          .select('id, team_id')
          .eq('id', board.project_id)
          .single();

        if (project?.team_id) {
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
      }
    }

    // 3. Include task assignee if set
    if (task.assigned_to && !usersMap.has(task.assigned_to)) {
      const { data: assignee } = await supabase
        .from('pyra_users')
        .select('username, display_name')
        .eq('username', task.assigned_to)
        .single();

      if (assignee) {
        usersMap.set(assignee.username, { display_name: assignee.display_name, username: assignee.username });
      }
    }

    return apiSuccess(Array.from(usersMap.values()));
  } catch (err) {
    console.error('Task members GET error:', err);
    return apiServerError();
  }
}
