import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError } from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { getBoardTemplate } from '@/lib/config/board-templates';
import { resolveUserScope } from '@/lib/auth/scope';

// =============================================================
// GET /api/boards
// List all boards (optionally filtered by project_id)
// =============================================================
export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('boards.view');
  if (isApiError(auth)) return auth;

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('project_id');

  // Resolve employee scope for non-admin filtering
  const scope = await resolveUserScope(auth);

  const supabase = await createServerSupabaseClient();
  let query = supabase
    .from('pyra_boards')
    .select('*, pyra_board_columns(id, name, color, position, wip_limit, is_done_column), pyra_projects!left(id, name)')
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
}

// =============================================================
// POST /api/boards
// Create a new board (optionally from a template)
// =============================================================
export async function POST(req: NextRequest) {
  const auth = await requireApiPermission('boards.manage');
  if (isApiError(auth)) return auth;

  const body = await req.json();
  const { name, description, project_id, template } = body;
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

  // Fetch created board with columns
  const { data } = await supabase
    .from('pyra_boards')
    .select('*, pyra_board_columns(id, name, color, position, wip_limit, is_done_column)')
    .eq('id', boardId)
    .single();

  return apiSuccess(data, undefined, 201);
}
