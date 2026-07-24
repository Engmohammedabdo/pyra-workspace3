import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiError,
  apiNotFound,
  apiSuccess,
  apiServerError,
  apiValidationError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { getBoardTemplate } from '@/lib/config/board-templates';
import { resolveUserScope, invalidateScopeCache } from '@/lib/auth/scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import {
  BOARD_WRITE_STATUSES,
  type AtomicBoardWriteResult,
} from '@/lib/constants/board-writes';

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
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const body = await req.json();
    const { name, description, project_id, template, view_mode, is_pipeline, auto_advance } = body;
    if (typeof name !== 'string' || !name.trim()) {
      return apiValidationError(t('boards.nameRequired'));
    }

    const boardId = generateId('bd');
    const templateKey = typeof template === 'string' && template ? template : null;
    const tmpl = templateKey ? getBoardTemplate(templateKey) : undefined;
    const cols = tmpl?.columns || [
      { name: 'قائمة المهام', color: 'gray' }, // i18n-exempt: DB data — seeded default board-column name
      { name: 'قيد التنفيذ', color: 'blue' }, // i18n-exempt: DB data — seeded default board-column name
      { name: 'مكتمل', color: 'green', isDoneColumn: true }, // i18n-exempt: DB data — seeded default board-column name
    ];

    const columns = cols.map((col, i) => ({
      id: generateId('bc'),
      name: col.name,
      color: col.color,
      position: i,
      is_done_column: col.isDoneColumn ?? false,
    }));

    const labels = (tmpl?.labels ?? []).map((label) => ({
        id: generateId('bl'),
        name: label.name,
        color: label.color,
    }));

    const supabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await supabase.rpc(
      'pyra_create_board_atomic',
      {
        p_board_id: boardId,
        p_name: name,
        p_description: typeof description === 'string' && description ? description : null,
        p_project_id: typeof project_id === 'string' && project_id ? project_id : null,
        p_template: templateKey,
        p_view_mode: typeof view_mode === 'string' && view_mode ? view_mode : 'kanban',
        p_is_pipeline: typeof is_pipeline === 'boolean' ? is_pipeline : false,
        p_auto_advance: typeof auto_advance === 'boolean' ? auto_advance : false,
        p_created_by: auth.pyraUser.username,
        p_columns: columns,
        p_labels: labels,
      },
    );

    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'board_create_rpc', board_id: boardId },
      });
      return apiServerError();
    }

    const result = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as
      | AtomicBoardWriteResult
      | null;
    if (!result) {
      logError({
        error: new Error('Atomic board create RPC returned no result'),
        request: req,
        metadata: { action: 'board_create_rpc_empty', board_id: boardId },
      });
      return apiServerError();
    }

    switch (result.status) {
      case BOARD_WRITE_STATUSES.OK:
        break;
      case BOARD_WRITE_STATUSES.INVALID_BOARD_INPUT:
        return apiValidationError(t('boards.invalidBoardInput'));
      case BOARD_WRITE_STATUSES.INVALID_COLUMN_INPUT:
      case BOARD_WRITE_STATUSES.INVALID_COLUMNS_PAYLOAD:
        return apiValidationError(t('boards.invalidColumnsPayload'));
      case BOARD_WRITE_STATUSES.INVALID_LABELS_PAYLOAD:
        return apiValidationError(t('boards.invalidLabelsPayload'));
      case BOARD_WRITE_STATUSES.PROJECT_NOT_FOUND:
        return apiValidationError(t('projects.notFound'));
      case BOARD_WRITE_STATUSES.BOARD_NOT_FOUND:
        return apiNotFound(t('common.boardNotFound'));
      case BOARD_WRITE_STATUSES.COLUMN_NOT_IN_BOARD:
        return apiValidationError(t('boards.columnNotInBoard'));
      case BOARD_WRITE_STATUSES.COLUMN_HAS_TASKS:
        return apiValidationError(t('boards.columnHasTasks', {
          count: Number(result.mutation?.task_count ?? 0),
        }));
      case BOARD_WRITE_STATUSES.COLUMN_HAS_HISTORY:
        return apiValidationError(t('boards.columnHasHistory', {
          count: Number(result.mutation?.history_count ?? 0),
        }));
      case BOARD_WRITE_STATUSES.WRITE_CONFLICT:
        return apiError(t('boards.writeConflict'), 409);
      default:
        logError({
          error: new Error(`Unexpected atomic board create status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'board_create_rpc_status', board_id: boardId },
        });
        return apiServerError();
    }

    if (!result.board || !result.mutation) {
      logError({
        error: new Error('Atomic board create RPC success omitted committed result'),
        request: req,
        metadata: { action: 'board_create_rpc_shape', board_id: boardId },
      });
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.BOARD}_${ACTIVITY_ACTIONS.CREATE}`,
      `/dashboard/boards/${boardId}`,
      {
        source: 'board_atomic_create',
        name,
        template: templateKey,
        project_id: typeof project_id === 'string' && project_id ? project_id : null,
      },
    );

    // This is post-commit cache hygiene. A lookup failure cannot make the
    // caller retry an already committed board creation.
    if (typeof project_id === 'string' && project_id) {
      try {
        const { data: project, error: projectError } = await supabase
          .from('pyra_projects')
          .select('team_id')
          .eq('id', project_id)
          .single();
        if (projectError) throw projectError;

        if (project?.team_id) {
          const { data: teamMembers, error: teamMembersError } = await supabase
            .from('pyra_team_members')
            .select('username')
            .eq('team_id', project.team_id);
          if (teamMembersError) throw teamMembersError;
          teamMembers?.forEach((member: { username: string }) => {
            invalidateScopeCache(member.username);
          });
        }
      } catch (scopeError) {
        logError({
          severity: 'warning',
          error: scopeError,
          request: req,
          metadata: {
            action: 'board_create_scope_invalidation',
            board_id: boardId,
            project_id,
          },
        });
      }
    }

    return apiSuccess(result.board, undefined, 201);

  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'board_create' } });
    return apiServerError();
  }
}
