import { getApiAuth } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/my-tasks
// Aggregates all tasks assigned to the current user across boards
// =============================================================
export async function GET() {
  const auth = await getApiAuth();
  if (!auth) return apiUnauthorized();

  const supabase = await createServerSupabaseClient();

  // Get all task IDs assigned to this user
  const { data: assignments, error: assignError } = await supabase
    .from('pyra_task_assignees')
    .select('task_id')
    .eq('username', auth.pyraUser.username);

  if (assignError) return apiServerError(assignError.message);
  if (!assignments || assignments.length === 0) return apiSuccess([]);

  const taskIds = assignments.map(a => a.task_id);

  const { data: tasks, error } = await supabase
    .from('pyra_tasks')
    .select(`
      *,
      pyra_boards!inner(id, name, project_id, pyra_projects!left(id, name)),
      pyra_board_columns!inner(id, name, color, is_done_column),
      pyra_task_labels(label_id, pyra_board_labels(id, name, color)),
      pyra_task_checklist(id, title, is_checked)
    `)
    .in('id', taskIds)
    .eq('is_archived', false)
    .order('due_date', { nullsFirst: false });

  if (error) return apiServerError(error.message);
  return apiSuccess(tasks);
}
