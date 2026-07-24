import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiValidationError,
  apiForbidden,
  apiNotFound,
  apiError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { checkBoardScope, checkTaskScope } from '@/lib/auth/task-scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import {
  ATOMIC_TASK_WRITE_STATUSES,
  type AtomicTaskWriteResult,
} from '@/lib/constants/task-transitions';

type TaskRelationSnapshot = {
  id: string;
  board_id: string;
  updated_at: string | null;
};

function parseAtomicTaskWriteResult(rows: unknown): AtomicTaskWriteResult | null {
  return (Array.isArray(rows) ? rows[0] : rows) as AtomicTaskWriteResult | null;
}

// =============================================================
// POST /api/tasks/[id]/checklist
// Add a checklist item  { title: string }
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.create');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    if (!(await checkTaskScope(id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const body = await req.json() as Record<string, unknown>;
    if (typeof body?.title !== 'string' || !body.title.trim()) {
      return apiValidationError(t('tasks.checklistTitleRequired'));
    }
    const title = body.title.trim();

    const supabase = await createServerSupabaseClient();
    const { data: taskData, error: taskError } = await supabase
      .from('pyra_tasks')
      .select('id, board_id, updated_at')
      .eq('id', id)
      .single();
    const task = taskData as TaskRelationSnapshot | null;
    if (taskError || !task) return apiNotFound(t('common.taskNotFound'));
    if (!(await checkBoardScope(task.board_id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const itemId = generateId('cl');
    const serviceSupabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await serviceSupabase.rpc(
      'pyra_mutate_task_checklist_atomic',
      {
        p_task_id: id,
        p_expected_board_id: task.board_id,
        p_expected_updated_at: task.updated_at,
        p_action: 'add',
        p_item_id: itemId,
        p_updates: { title, is_checked: false },
        p_actor_username: auth.pyraUser.username,
        p_actor_display_name: auth.pyraUser.display_name,
        p_activity_id: generateId('tl'),
      },
    );
    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'task_checklist_add_rpc', task_id: id },
      });
      return apiServerError();
    }

    const result = parseAtomicTaskWriteResult(rpcRows);
    if (!result) {
      logError({
        error: new Error('Atomic checklist add RPC returned no result'),
        request: req,
        metadata: { action: 'task_checklist_add_rpc_empty', task_id: id },
      });
      return apiServerError();
    }
    switch (result.status) {
      case ATOMIC_TASK_WRITE_STATUSES.OK:
        break;
      case ATOMIC_TASK_WRITE_STATUSES.TASK_NOT_FOUND:
        return apiNotFound(t('common.taskNotFound'));
      case ATOMIC_TASK_WRITE_STATUSES.TASK_WRITE_CONFLICT:
        return apiError(t('tasks.taskUpdateConflict'), 409);
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_RELATION_INPUT:
        return apiValidationError(t('tasks.checklistTitleRequired'));
      default:
        logError({
          error: new Error(`Unexpected atomic checklist add status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'task_checklist_add_rpc_status', task_id: id },
        });
        return apiServerError();
    }

    const item = result.mutation?.item;
    if (!item || typeof item !== 'object') {
      logError({
        error: new Error('Atomic checklist add RPC returned no item'),
        request: req,
        metadata: { action: 'task_checklist_add_rpc_item', task_id: id },
      });
      return apiServerError();
    }
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/boards/${task.board_id}`,
      { source: 'task_checklist_add', task_id: id, item_id: itemId },
    );
    return apiSuccess(item, undefined, 201);
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_checklist_add' } });
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/tasks/[id]/checklist?itemId=xxx
// Toggle a checklist item  { is_checked: boolean } or { title: string }
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    if (!(await checkTaskScope(id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const itemId = req.nextUrl.searchParams.get('itemId');
    if (!itemId) return apiValidationError(t('tasks.itemIdRequired'));

    const body = await req.json() as Record<string, unknown>;
    const updates: { is_checked?: boolean; title?: string } = {};
    if (Object.prototype.hasOwnProperty.call(body, 'is_checked')) {
      if (typeof body.is_checked !== 'boolean') {
        return apiValidationError(t('tasks.taskTransitionInvalid'));
      }
      updates.is_checked = body.is_checked;
    }
    if (Object.prototype.hasOwnProperty.call(body, 'title')) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        return apiValidationError(t('tasks.checklistTitleRequired'));
      }
      updates.title = body.title.trim();
    }
    if (Object.keys(updates).length === 0) {
      return apiValidationError(t('tasks.noDataToUpdate'));
    }

    const supabase = await createServerSupabaseClient();
    const { data: taskData, error: taskError } = await supabase
      .from('pyra_tasks')
      .select('id, board_id, updated_at')
      .eq('id', id)
      .single();
    const task = taskData as TaskRelationSnapshot | null;
    if (taskError || !task) return apiNotFound(t('common.taskNotFound'));
    if (!(await checkBoardScope(task.board_id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const serviceSupabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await serviceSupabase.rpc(
      'pyra_mutate_task_checklist_atomic',
      {
        p_task_id: id,
        p_expected_board_id: task.board_id,
        p_expected_updated_at: task.updated_at,
        p_action: 'update',
        p_item_id: itemId,
        p_updates: updates,
        p_actor_username: auth.pyraUser.username,
        p_actor_display_name: auth.pyraUser.display_name,
        p_activity_id: generateId('tl'),
      },
    );
    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'task_checklist_update_rpc', task_id: id, item_id: itemId },
      });
      return apiServerError();
    }

    const result = parseAtomicTaskWriteResult(rpcRows);
    if (!result) {
      logError({
        error: new Error('Atomic checklist update RPC returned no result'),
        request: req,
        metadata: { action: 'task_checklist_update_rpc_empty', task_id: id, item_id: itemId },
      });
      return apiServerError();
    }
    switch (result.status) {
      case ATOMIC_TASK_WRITE_STATUSES.OK:
        break;
      case ATOMIC_TASK_WRITE_STATUSES.TASK_NOT_FOUND:
        return apiNotFound(t('common.taskNotFound'));
      case ATOMIC_TASK_WRITE_STATUSES.TASK_WRITE_CONFLICT:
        return apiError(t('tasks.taskUpdateConflict'), 409);
      case ATOMIC_TASK_WRITE_STATUSES.RELATION_NOT_FOUND:
        return apiNotFound(t('tasks.checklistItemNotFound'));
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_RELATION_INPUT:
        return apiValidationError(t('tasks.taskTransitionInvalid'));
      default:
        logError({
          error: new Error(`Unexpected atomic checklist update status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'task_checklist_update_rpc_status', task_id: id, item_id: itemId },
        });
        return apiServerError();
    }

    const item = result.mutation?.item;
    if (!item || typeof item !== 'object') {
      logError({
        error: new Error('Atomic checklist update RPC returned no item'),
        request: req,
        metadata: { action: 'task_checklist_update_rpc_item', task_id: id, item_id: itemId },
      });
      return apiServerError();
    }
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/boards/${task.board_id}`,
      {
        source: 'task_checklist_update',
        task_id: id,
        item_id: itemId,
        fields: Object.keys(updates),
      },
    );
    return apiSuccess(item);
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_checklist_update' } });
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/tasks/[id]/checklist?itemId=xxx
// Delete a checklist item
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.create');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    if (!(await checkTaskScope(id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const itemId = req.nextUrl.searchParams.get('itemId');
    if (!itemId) return apiValidationError(t('tasks.itemIdRequired'));

    const supabase = await createServerSupabaseClient();
    const { data: taskData, error: taskError } = await supabase
      .from('pyra_tasks')
      .select('id, board_id, updated_at')
      .eq('id', id)
      .single();
    const task = taskData as TaskRelationSnapshot | null;
    if (taskError || !task) return apiNotFound(t('common.taskNotFound'));
    if (!(await checkBoardScope(task.board_id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const serviceSupabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await serviceSupabase.rpc(
      'pyra_mutate_task_checklist_atomic',
      {
        p_task_id: id,
        p_expected_board_id: task.board_id,
        p_expected_updated_at: task.updated_at,
        p_action: 'delete',
        p_item_id: itemId,
        p_updates: {},
        p_actor_username: auth.pyraUser.username,
        p_actor_display_name: auth.pyraUser.display_name,
        p_activity_id: generateId('tl'),
      },
    );
    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'task_checklist_delete_rpc', task_id: id, item_id: itemId },
      });
      return apiServerError();
    }

    const result = parseAtomicTaskWriteResult(rpcRows);
    if (!result) {
      logError({
        error: new Error('Atomic checklist delete RPC returned no result'),
        request: req,
        metadata: { action: 'task_checklist_delete_rpc_empty', task_id: id, item_id: itemId },
      });
      return apiServerError();
    }
    switch (result.status) {
      case ATOMIC_TASK_WRITE_STATUSES.OK:
        break;
      case ATOMIC_TASK_WRITE_STATUSES.TASK_NOT_FOUND:
        return apiNotFound(t('common.taskNotFound'));
      case ATOMIC_TASK_WRITE_STATUSES.TASK_WRITE_CONFLICT:
        return apiError(t('tasks.taskUpdateConflict'), 409);
      case ATOMIC_TASK_WRITE_STATUSES.RELATION_NOT_FOUND:
        return apiNotFound(t('tasks.checklistItemNotFound'));
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_RELATION_INPUT:
        return apiValidationError(t('tasks.taskTransitionInvalid'));
      default:
        logError({
          error: new Error(`Unexpected atomic checklist delete status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'task_checklist_delete_rpc_status', task_id: id, item_id: itemId },
        });
        return apiServerError();
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/boards/${task.board_id}`,
      { source: 'task_checklist_delete', task_id: id, item_id: itemId },
    );
    return apiSuccess({ deleted: true });
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_checklist_delete' } });
    return apiServerError();
  }
}
