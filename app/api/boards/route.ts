import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { getBoardTemplate } from '@/lib/config/board-templates';
import { resolveUserScope, invalidateScopeCache } from '@/lib/auth/scope';
import { logActivity } from '@/lib/api/activity';

// =============================================================
// GET /api/boards
// List all boards (optionally filtered by project_id)
// =============================================================
export async function GET(req: NextRequest) {
  try {
    const auth = await requireApiPermission('boards.view');
    if (isApiError(auth)) return auth;

    const { searchParams } = new URL(req.url);
    const projectId = searchParams.get('project_id');

    // Resolve employee scope for non-admin filtering
    const scope = await resolveUserScope(auth);

    const supabase = await createServerSupabaseClient();
    let query = supabase
      .from('pyra_boards')
      .select('*, pyra_board_columns(id, name, color, position, wip_limit, is_done_column, requires_approval, approval_role, default_assignee, column_type), pyra_projects!left(id, name)')
      .order('position');

    if (projectId) {
      query = query.eq('project_id', projectId);
    }

    // Non-admin employees: only show boards they have access to
    if (!scope.isAdmin) {
      if (scope.boardIds.length === 0) {
        return apiSuccess([]);
      }
      query = query.in('id', scope.boardIds);
    }

    const { data, error } = await query;
    if (error) return apiServerError(error.message);
    return apiSuccess(data);

  } catch (err) {
    console.error('[GET /api/boards] error:', err);
    return apiServerError();
  }
}

// =============================================================
// POST /api/boards
// Create a new board (optionally from a template)
// =============================================================
export async function POST(req: NextRequest) {
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    const { name, description, project_id, template, view_mode, is_pipeline, auto_advance } = body;
    if (!name) return apiValidationError('اسم اللوحة مطلوب');

    const supabase = await createServerSupabaseClient();
    const boardId = generateId('bd');

    // Create board
    const { error: boardError } = await supabase
      .from('pyra_boards')
      .insert({
        id: boardId,
        name,
        description: description || null,
        project_id: project_id || null,
        template: template || null,
        view_mode: view_mode || 'kanban',
        is_pipeline: is_pipeline || false,
        auto_advance: auto_advance || false,
        created_by: auth.pyraUser.username,
      });

    if (boardError) return apiServerError(boardError.message);

    // Create columns from template or defaults
    const tmpl = template ? getBoardTemplate(template) : null;
    const cols = tmpl?.columns || [
      { name: 'قائمة المهام', color: 'gray' },
      { name: 'قيد التنفيذ', color: 'blue' },
      { name: 'مكتمل', color: 'green', isDoneColumn: true },
    ];

    const columnInserts = cols.map((col, i) => ({
      id: generateId('bc'),
      board_id: boardId,
      name: col.name,
      color: col.color,
      position: i,
      is_done_column: col.isDoneColumn || false,
    }));

    await supabase.from('pyra_board_columns').insert(columnInserts);

    // Create labels from template
    if (tmpl?.labels) {
      const labelInserts = tmpl.labels.map(l => ({
        id: generateId('bl'),
        board_id: boardId,
        name: l.name,
        color: l.color,
      }));
      await supabase.from('pyra_board_labels').insert(labelInserts);
    }

    // Invalidate scope cache for team members when board is created under a project
    if (project_id) {
      const { data: project } = await supabase
        .from('pyra_projects')
        .select('team_id')
        .eq('id', project_id)
        .single();
      if (project?.team_id) {
        const { data: teamMembers } = await supabase
          .from('pyra_team_members')
          .select('username')
          .eq('team_id', project.team_id);
        teamMembers?.forEach(m => invalidateScopeCache(m.username));
      }
    }

    // Fetch created board with columns
    const { data } = await supabase
      .from('pyra_boards')
      .select('*, pyra_board_columns(id, name, color, position, wip_limit, is_done_column, requires_approval, approval_role, default_assignee, column_type)')
      .eq('id', boardId)
      .single();

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'board_created',
      `/dashboard/boards/${boardId}`,
      { name, template: template || null, project_id: project_id || null },
    );

    return apiSuccess(data, undefined, 201);

  } catch (err) {
    console.error('[POST /api/boards] error:', err);
    return apiServerError();
  }
}
