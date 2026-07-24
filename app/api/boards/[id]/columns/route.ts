import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiError,
  apiForbidden,
  apiNotFound,
  apiServerError,
  apiSuccess,
  apiValidationError,
} from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { checkBoardScope } from '@/lib/auth/task-scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import {
  BOARD_WRITE_STATUSES,
  type AtomicBoardColumnWriteResult,
} from '@/lib/constants/board-writes';

function firstRpcResult(rpcRows: unknown): AtomicBoardColumnWriteResult | null {
  return (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as
    | AtomicBoardColumnWriteResult
    | null;
}

function isColumnPatch(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const column = value as Record<string, unknown>;
  if (typeof column.id !== 'string' || !column.id.trim()) return false;
  if ('position' in column && !Number.isInteger(column.position)) return false;
  if ('name' in column && typeof column.name !== 'string') return false;
  if ('color' in column && typeof column.color !== 'string') return false;
  return true;
}

// =============================================================
// POST /api/boards/[id]/columns
// Create a new column in a board
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;
    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden(t('common.noAccessBoard'));
    }

    const { name, color, position } = await req.json();
    if (typeof name !== 'string' || !name.trim()) {
      return apiValidationError(t('boards.columnNameRequired'));
    }
    if (
      (color !== undefined && typeof color !== 'string')
      || (position !== undefined && !Number.isInteger(position))
    ) {
      return apiValidationError(t('boards.invalidColumnInput'));
    }

    const columnId = generateId('bc');
    const supabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await supabase.rpc(
      'pyra_create_board_column_atomic',
      {
        p_column_id: columnId,
        p_board_id: boardId,
        p_name: name,
        p_color: color || 'gray',
        p_position: position ?? 0,
      },
    );

    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'board_column_create_rpc', board_id: boardId },
      });
      return apiServerError();
    }

    const result = firstRpcResult(rpcRows);
    if (!result) {
      logError({
        error: new Error('Atomic board column create RPC returned no result'),
        request: req,
        metadata: { action: 'board_column_create_rpc_empty', board_id: boardId },
      });
      return apiServerError();
    }

    switch (result.status) {
      case BOARD_WRITE_STATUSES.OK:
        break;
      case BOARD_WRITE_STATUSES.INVALID_COLUMN_INPUT:
        return apiValidationError(t('boards.invalidColumnInput'));
      case BOARD_WRITE_STATUSES.INVALID_BOARD_INPUT:
      case BOARD_WRITE_STATUSES.INVALID_COLUMNS_PAYLOAD:
      case BOARD_WRITE_STATUSES.INVALID_LABELS_PAYLOAD:
        return apiValidationError(t('boards.invalidColumnsPayload'));
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
          error: new Error(`Unexpected atomic board column create status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'board_column_create_rpc_status', board_id: boardId },
        });
        return apiServerError();
    }

    if (!result.board_column || !result.mutation) {
      logError({
        error: new Error('Atomic board column create success omitted committed result'),
        request: req,
        metadata: { action: 'board_column_create_rpc_shape', board_id: boardId },
      });
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.BOARD}_${ACTIVITY_ACTIONS.CREATE}`,
      `/dashboard/boards/${boardId}`,
      {
        source: 'board_column_atomic_create',
        column_name: name,
        board_id: boardId,
      },
    );

    return apiSuccess(result.board_column, undefined, 201);
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'board_column_create' } });
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/boards/[id]/columns
// Batch update column positions and properties
// Body: { columns: [{ id, position, name?, color? }] }
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;
    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden(t('common.noAccessBoard'));
    }

    const { columns } = await req.json();
    if (!Array.isArray(columns)) {
      return apiValidationError(t('boards.columnsArrayRequired'));
    }
    if (!columns.every(isColumnPatch)) {
      return apiValidationError(t('boards.invalidColumnsPayload'));
    }

    const supabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await supabase.rpc(
      'pyra_update_board_columns_atomic',
      { p_board_id: boardId, p_columns: columns },
    );

    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'board_columns_update_rpc', board_id: boardId },
      });
      return apiServerError();
    }

    const result = firstRpcResult(rpcRows);
    if (!result) {
      logError({
        error: new Error('Atomic board columns update RPC returned no result'),
        request: req,
        metadata: { action: 'board_columns_update_rpc_empty', board_id: boardId },
      });
      return apiServerError();
    }

    switch (result.status) {
      case BOARD_WRITE_STATUSES.OK:
        break;
      case BOARD_WRITE_STATUSES.INVALID_COLUMN_INPUT:
      case BOARD_WRITE_STATUSES.INVALID_COLUMNS_PAYLOAD:
      case BOARD_WRITE_STATUSES.INVALID_BOARD_INPUT:
      case BOARD_WRITE_STATUSES.INVALID_LABELS_PAYLOAD:
        return apiValidationError(t('boards.invalidColumnsPayload'));
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
          error: new Error(`Unexpected atomic board columns update status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'board_columns_update_rpc_status', board_id: boardId },
        });
        return apiServerError();
    }

    if (!result.mutation) {
      logError({
        error: new Error('Atomic board columns update success omitted committed result'),
        request: req,
        metadata: { action: 'board_columns_update_rpc_shape', board_id: boardId },
      });
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.BOARD}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/boards/${boardId}`,
      { source: 'board_columns_atomic_update', count: columns.length },
    );

    return apiSuccess({ updated: true });
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'board_columns_update' } });
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/boards/[id]/columns?columnId=xxx
// Delete a column only when no task or stage-history evidence references it
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;
    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden(t('common.noAccessBoard'));
    }

    const columnId = req.nextUrl.searchParams.get('columnId');
    if (!columnId) return apiValidationError(t('boards.columnIdRequired'));

    const supabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await supabase.rpc(
      'pyra_delete_board_column_atomic',
      { p_board_id: boardId, p_column_id: columnId },
    );

    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'board_column_delete_rpc', board_id: boardId, column_id: columnId },
      });
      return apiServerError();
    }

    const result = firstRpcResult(rpcRows);
    if (!result) {
      logError({
        error: new Error('Atomic board column delete RPC returned no result'),
        request: req,
        metadata: {
          action: 'board_column_delete_rpc_empty',
          board_id: boardId,
          column_id: columnId,
        },
      });
      return apiServerError();
    }

    switch (result.status) {
      case BOARD_WRITE_STATUSES.OK:
        break;
      case BOARD_WRITE_STATUSES.INVALID_COLUMN_INPUT:
      case BOARD_WRITE_STATUSES.INVALID_BOARD_INPUT:
        return apiValidationError(t('boards.invalidColumnInput'));
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
          error: new Error(`Unexpected atomic board column delete status: ${String(result.status)}`),
          request: req,
          metadata: {
            action: 'board_column_delete_rpc_status',
            board_id: boardId,
            column_id: columnId,
          },
        });
        return apiServerError();
    }

    if (!result.mutation) {
      logError({
        error: new Error('Atomic board column delete success omitted committed result'),
        request: req,
        metadata: {
          action: 'board_column_delete_rpc_shape',
          board_id: boardId,
          column_id: columnId,
        },
      });
      return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.BOARD}_${ACTIVITY_ACTIONS.DELETE}`,
      `/dashboard/boards/${boardId}`,
      { source: 'board_column_atomic_delete', column_id: columnId },
    );

    return apiSuccess({ deleted: true });
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'board_column_delete' } });
    return apiServerError();
  }
}
