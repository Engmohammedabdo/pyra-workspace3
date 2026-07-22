import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiNotFound,
  apiForbidden,
  apiValidationError,
  apiError,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { checkTaskScope, checkBoardScope } from '@/lib/auth/task-scope';
import { invalidateScopeCache } from '@/lib/auth/scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { resolveTaskTransferDeadline } from '@/lib/production/deadlines';
import { PRODUCTION_BOARD_ID } from '@/lib/constants/production';
import { logError } from '@/lib/observability/log-error';
import {
  ATOMIC_TASK_WRITE_STATUSES,
  type AtomicTaskWriteResult,
} from '@/lib/constants/task-transitions';

type DuplicateSource = {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  due_date: string | null;
  due_at: string | null;
  production_deadline_exempt: boolean | null;
  updated_at: string | null;
  pyra_task_assignees: Array<{ username: string }> | null;
  pyra_task_checklist: Array<{ title: string; position: number }> | null;
};

// =============================================================
// POST /api/tasks/[id]/duplicate
// Duplicate a task and all eligible relations in one PostgreSQL transaction.
// Body: { target_board_id?, target_column_id?, due_date?, due_time? }
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

    const body = await req.json().catch(() => ({}));
    const supabase = await createServerSupabaseClient();
    const { data: sourceData, error: sourceError } = await supabase
      .from('pyra_tasks')
      .select('*, pyra_task_assignees(username), pyra_task_labels(label_id), pyra_task_checklist(title, position)')
      .eq('id', id)
      .single();
    const original = sourceData as DuplicateSource | null;
    if (sourceError || !original) return apiNotFound(t('common.taskNotFound'));

    // checkTaskScope may have read an older board. Re-check the board from the
    // exact CAS snapshot that will be handed to PostgreSQL.
    if (!(await checkBoardScope(original.board_id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const targetBoardId = typeof body.target_board_id === 'string' && body.target_board_id
      ? body.target_board_id
      : original.board_id;
    const targetColumnId = typeof body.target_column_id === 'string' && body.target_column_id
      ? body.target_column_id
      : original.column_id;
    if (targetBoardId !== original.board_id && !(await checkBoardScope(targetBoardId, auth))) {
      return apiForbidden(t('common.noAccessBoard'));
    }

    const deadline = resolveTaskTransferDeadline({
      targetBoardId,
      sourceDueDate: original.due_date,
      sourceDueAt: original.due_at,
      sourceDeadlineExempt: original.production_deadline_exempt,
      dueDate: body.due_date,
      dueTime: body.due_time,
      requireFreshDeadline: targetBoardId === PRODUCTION_BOARD_ID,
    });
    if (!deadline.ok) {
      return apiValidationError(t(
        deadline.error === 'required'
          ? 'tasks.productionDeadlineRequired'
          : 'tasks.productionDeadlineInvalid',
      ));
    }

    const newId = generateId('tk');
    const assigneeIds = (original.pyra_task_assignees || []).map(() => generateId('ta'));
    const checklistIds = (original.pyra_task_checklist || []).map(() => generateId('cl'));
    const activityId = generateId('tl');
    const serviceSupabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await serviceSupabase.rpc(
      'pyra_duplicate_task_atomic',
      {
        p_source_task_id: id,
        p_expected_source_board_id: original.board_id,
        p_expected_source_updated_at: original.updated_at,
        p_new_task_id: newId,
        p_new_title: `نسخة — ${original.title}`, // i18n-exempt: persisted task title
        p_target_board_id: targetBoardId,
        p_target_column_id: targetColumnId,
        p_due_date: deadline.value.due_date,
        p_due_at: deadline.value.due_at,
        p_created_by: auth.pyraUser.username,
        p_actor_display_name: auth.pyraUser.display_name,
        p_assignee_ids: assigneeIds,
        p_checklist_ids: checklistIds,
        p_activity_id: activityId,
      },
    );
    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'task_duplicate_rpc', task_id: id },
      });
      return apiServerError();
    }

    const result = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as
      | AtomicTaskWriteResult
      | null;
    if (!result) {
      logError({
        error: new Error('Atomic duplicate RPC returned no result'),
        request: req,
        metadata: { action: 'task_duplicate_rpc_empty', task_id: id },
      });
      return apiServerError();
    }

    switch (result.status) {
      case ATOMIC_TASK_WRITE_STATUSES.OK:
        break;
      case ATOMIC_TASK_WRITE_STATUSES.TASK_NOT_FOUND:
        return apiNotFound(t('common.taskNotFound'));
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_BOARD:
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_DESTINATION:
        return apiValidationError(t('boards.columnNotInBoard'));
      case ATOMIC_TASK_WRITE_STATUSES.GATED_DESTINATION:
        return apiValidationError(t('boards.gatedColumnCreateBlocked'));
      case ATOMIC_TASK_WRITE_STATUSES.PRODUCTION_DEADLINE_REQUIRED:
        return apiValidationError(t('tasks.productionDeadlineRequired'));
      case ATOMIC_TASK_WRITE_STATUSES.PRODUCTION_DEADLINE_INVALID:
        return apiValidationError(t('tasks.productionDeadlineInvalid'));
      case ATOMIC_TASK_WRITE_STATUSES.TASK_WRITE_CONFLICT:
      case ATOMIC_TASK_WRITE_STATUSES.SOURCE_RELATION_CONFLICT:
        return apiError(t('tasks.taskTransitionConflict'), 409);
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_TASK_INPUT:
        return apiValidationError(t('tasks.taskTransitionInvalid'));
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_RELATION_IDS:
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_ASSIGNEES:
      default:
        logError({
          error: new Error(`Unexpected atomic duplicate status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'task_duplicate_rpc_status', task_id: id },
        });
        return apiServerError();
    }
    if (!result.task) {
      logError({
        error: new Error('Atomic duplicate RPC success omitted committed task'),
        request: req,
        metadata: { action: 'task_duplicate_rpc_shape', task_id: id },
      });
      return apiServerError();
    }

    for (const assignment of original.pyra_task_assignees || []) {
      invalidateScopeCache(assignment.username);
    }
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.CREATE}`,
      `/dashboard/boards/${targetBoardId}`,
      {
        source: 'task_duplicate',
        original_id: id,
        new_id: newId,
        title: original.title,
      },
    );
    return apiSuccess(result.task, undefined, 201);
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_duplicate' } });
    return apiServerError();
  }
}
