import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiNotFound, apiForbidden, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/projects/[id]/progress
 * Returns pipeline progress for a project (client-facing)
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

    // Verify project belongs to this client
    const { data: project } = await supabase
      .from('pyra_projects')
      .select('id, name, client_id')
      .eq('id', projectId)
      .single();

    if (!project) return apiNotFound('المشروع غير موجود');
    if (project.client_id !== client.id) return apiForbidden();

    // Get pipeline boards for this project
    const { data: boards } = await supabase
      .from('pyra_boards')
      .select(`
        id, name, is_pipeline, view_mode,
        pyra_board_columns(id, name, color, position, is_done_column, column_type)
      `)
      .eq('project_id', projectId)
      .eq('is_pipeline', true);

    if (!boards || boards.length === 0) {
      return apiSuccess({ boards: [], has_pipeline: false });
    }

    // For each pipeline board, get tasks summary
    const result = [];
    for (const board of boards) {
      const cols = ((board.pyra_board_columns as Array<{
        id: string; name: string; color: string; position: number;
        is_done_column: boolean; column_type: string | null;
      }>) || []).sort((a, b) => a.position - b.position);

      // Get task counts per column
      const { data: tasks } = await supabase
        .from('pyra_tasks')
        .select('id, column_id, completion_percentage')
        .eq('board_id', board.id)
        .eq('is_archived', false);

      const totalTasks = tasks?.length || 0;
      const doneTasks = tasks?.filter(t => {
        const col = cols.find(c => c.id === t.column_id);
        return col?.is_done_column;
      }).length || 0;

      const stages = cols.map(col => {
        const count = tasks?.filter(t => t.column_id === col.id).length || 0;
        return {
          name: col.name,
          color: col.color,
          task_count: count,
          is_done: col.is_done_column,
          is_current: count > 0 && !col.is_done_column,
        };
      });

      result.push({
        board_id: board.id,
        board_name: board.name,
        total_tasks: totalTasks,
        completed_tasks: doneTasks,
        progress_percent: totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0,
        stages,
      });
    }

    return apiSuccess({ boards: result, has_pipeline: true });

  } catch (err) {
    console.error('[GET /api/portal/projects/[id]/progress] error:', err);
    return apiServerError();
  }
}
