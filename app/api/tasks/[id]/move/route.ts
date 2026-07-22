import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiValidationError,
  apiForbidden,
  apiError,
  apiNotFound,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { checkBoardScope, checkTaskScope } from '@/lib/auth/task-scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';
import { logError } from '@/lib/observability/log-error';
import { PRODUCTION_BOARD_ID } from '@/lib/constants/production';
import {
  isUnverifiedProductionDeadline,
  resolveTaskTransferDeadline,
  type TaskDeadlineFields,
} from '@/lib/production/deadlines';
import {
  TASK_TRANSITION_STATUSES,
  type AtomicTaskTransitionResult,
} from '@/lib/constants/task-transitions';

// =============================================================
// POST /api/tasks/[id]/move
// Move a task to a different column (and/or reorder). The PostgreSQL RPC is
// the only writer for task position/state, stage history, and cross-board
// label cleanup, so the whole transition commits or rolls back together.
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

    const body = await req.json();
    const { column_id, position, target_board_id, due_date, due_time } = body;
    if (typeof column_id !== 'string' || !column_id.trim()) {
      return apiValidationError(t('boards.columnRequired'));
    }

    const newPosition = position ?? 0;
    if (!Number.isInteger(newPosition) || newPosition < 0) {
      return apiValidationError(t('tasks.invalidTaskPosition'));
    }

    // Authenticated reads provide user-facing validation. The service client
    // is intentionally not created until permission, task scope, target-board
    // scope, deadline, and pipeline gates have all passed.
    const supabase = await createServerSupabaseClient();
    const { data: currentTask, error: taskError } = await supabase
      .from('pyra_tasks')
      .select('id, title, column_id, position, board_id, due_date, due_at, stage_entered_at, completion_percentage, updated_at, production_deadline_locked_at, production_deadline_exempt')
      .eq('id', id)
      .single();

    if (taskError || !currentTask) {
      return apiNotFound(t('common.taskNotFound'));
    }

    // checkTaskScope may have observed the task on an older board. Authorize
    // the fresh board snapshot that is also passed to PostgreSQL for CAS.
    if (!(await checkBoardScope(currentTask.board_id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const effectiveBoardId = target_board_id || currentTask.board_id;
    const isCrossBoard = effectiveBoardId !== currentTask.board_id;
    const isCrossColumn = currentTask.column_id !== column_id;

    if (
      isCrossBoard
      && currentTask.board_id === PRODUCTION_BOARD_ID
      && (
        !currentTask.due_date
        || !currentTask.due_at
        || isUnverifiedProductionDeadline({
          dueDate: currentTask.due_date,
          dueAt: currentTask.due_at,
          deadlineExempt: currentTask.production_deadline_exempt,
        })
      )
    ) {
      return apiValidationError(t('tasks.productionDeadlineRequired'));
    }

    if (isCrossBoard && !(await checkBoardScope(effectiveBoardId, auth))) {
      return apiForbidden(t('common.noAccessBoard'));
    }

    const { data: destinationColumn, error: destinationColumnError } = await supabase
      .from('pyra_board_columns')
      .select('id, name, column_type, requires_approval')
      .eq('id', column_id)
      .eq('board_id', effectiveBoardId)
      .single();
    if (destinationColumnError || !destinationColumn) {
      return apiValidationError(t('boards.columnNotInBoard'));
    }

    let transferDeadline: TaskDeadlineFields | null = null;
    if (isCrossBoard && effectiveBoardId === PRODUCTION_BOARD_ID) {
      const deadline = resolveTaskTransferDeadline({
        targetBoardId: effectiveBoardId,
        sourceDueDate: currentTask.due_date,
        sourceDueAt: currentTask.due_at,
        sourceDeadlineExempt: currentTask.production_deadline_exempt,
        dueDate: due_date,
        dueTime: due_time,
      });
      if (!deadline.ok) {
        return apiValidationError(t(
          deadline.error === 'required'
            ? 'tasks.productionDeadlineRequired'
            : 'tasks.productionDeadlineInvalid',
        ));
      }
      if (
        currentTask.production_deadline_locked_at
        && (
          deadline.value.due_date !== currentTask.due_date
          || deadline.value.due_at !== currentTask.due_at
        )
      ) {
        return apiValidationError(t('tasks.productionDeadlineLocked'));
      }
      transferDeadline = deadline.value;
    }

    let isPipelineBoard = false;
    if (isCrossColumn) {
      const { data: board } = await supabase
        .from('pyra_boards')
        .select('is_pipeline')
        .eq('id', effectiveBoardId)
        .single();
      isPipelineBoard = board?.is_pipeline === true;
    }

    if (
      isCrossColumn
      && isPipelineBoard
      && (
        destinationColumn.column_type === 'review'
        || destinationColumn.column_type === 'delivery'
        || destinationColumn.requires_approval
      )
    ) {
      return apiValidationError(t('tasks.gatedColumnMoveBlocked'));
    }

    if (isCrossColumn) {
      const { data: sourceColumn } = await supabase
        .from('pyra_board_columns')
        .select('id, column_type, requires_approval')
        .eq('id', currentTask.column_id)
        .single();
      if (
        sourceColumn
        && (
          sourceColumn.column_type === 'review'
          || sourceColumn.column_type === 'approved'
          || sourceColumn.requires_approval
        )
      ) {
        return apiValidationError(t('tasks.exitReviewApprovalBlocked'));
      }
    }

    const historyId = generateId('sh');
    const activityId = generateId('act');
    const serviceSupabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await serviceSupabase.rpc(
      'pyra_move_task_atomic',
      {
        p_task_id: id,
        p_expected_board_id: currentTask.board_id,
        p_expected_column_id: currentTask.column_id,
        p_expected_updated_at: currentTask.updated_at,
        p_target_board_id: effectiveBoardId,
        p_target_column_id: column_id,
        p_target_position: newPosition,
        p_moved_by: auth.pyraUser.username,
        p_history_id: historyId,
        p_due_date: transferDeadline?.due_date ?? null,
        p_due_at: transferDeadline?.due_at ?? null,
        p_actor_display_name: auth.pyraUser.display_name,
        p_activity_id: activityId,
      },
    );

    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'task_move_rpc', task_id: id },
      });
      return apiServerError();
    }

    const result = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as
      | AtomicTaskTransitionResult
      | null;
    if (!result) {
      logError({
        error: new Error('Atomic move RPC returned no result'),
        request: req,
        metadata: { action: 'task_move_rpc_empty', task_id: id },
      });
      return apiServerError();
    }

    switch (result.status) {
      case TASK_TRANSITION_STATUSES.OK:
        break;
      case TASK_TRANSITION_STATUSES.TASK_NOT_FOUND:
        return apiNotFound(t('common.taskNotFound'));
      case TASK_TRANSITION_STATUSES.TRANSITION_CONFLICT:
        return apiError(t('tasks.taskTransitionConflict'), 409);
      case TASK_TRANSITION_STATUSES.INVALID_DESTINATION:
      case TASK_TRANSITION_STATUSES.INVALID_BOARD:
        return apiValidationError(t('boards.columnNotInBoard'));
      case TASK_TRANSITION_STATUSES.CURRENT_COLUMN_NOT_FOUND:
        return apiValidationError(t('boards.currentColumnNotFound'));
      case TASK_TRANSITION_STATUSES.GATED_DESTINATION:
        return apiValidationError(t('tasks.gatedColumnMoveBlocked'));
      case TASK_TRANSITION_STATUSES.GATED_SOURCE:
        return apiValidationError(t('tasks.exitReviewApprovalBlocked'));
      case TASK_TRANSITION_STATUSES.PRODUCTION_DEADLINE_REQUIRED:
        return apiValidationError(t('tasks.productionDeadlineRequired'));
      case TASK_TRANSITION_STATUSES.PRODUCTION_DEADLINE_INVALID:
        return apiValidationError(t('tasks.productionDeadlineInvalid'));
      case TASK_TRANSITION_STATUSES.PRODUCTION_DEADLINE_LOCKED:
        return apiValidationError(t('tasks.productionDeadlineLocked'));
      case TASK_TRANSITION_STATUSES.INVALID_POSITION:
        return apiValidationError(t('tasks.invalidTaskPosition'));
      case TASK_TRANSITION_STATUSES.INVALID_TRANSITION_INPUT:
        return apiValidationError(t('tasks.taskTransitionInvalid'));
      default:
        logError({
          error: new Error(`Unexpected atomic move status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'task_move_rpc_status', task_id: id },
        });
        return apiServerError();
    }

    if (!result.task || !result.transition) {
      logError({
        error: new Error('Atomic move RPC success omitted committed data'),
        request: req,
        metadata: { action: 'task_move_rpc_shape', task_id: id },
      });
      return apiServerError();
    }

    const committedTask = result.task;
    const committedTransition = result.transition;
    const committedTarget = {
      name: String(committedTransition.to_column_name),
      column_type: committedTransition.to_column_type
        ? String(committedTransition.to_column_type)
        : null,
    };
    const committedBoardId = String(committedTask.board_id);
    const committedColumnId = String(committedTask.column_id);
    const committedPosition = Number(committedTask.position ?? newPosition);
    const committedCrossColumn = committedTransition.is_cross_column === true;
    const committedCrossBoard = committedTransition.is_cross_board === true;
    const committedPipeline = committedTransition.is_pipeline_board === true;

    // Notifications and the global audit log are post-commit side effects.
    // The domain `moved` activity was committed atomically by the RPC.
    try {
      if (committedCrossColumn && committedPipeline) {
        const { data: adminRows } = await supabase
          .from('pyra_users')
          .select('username')
          .eq('role', 'admin')
          .eq('status', 'active');
        const adminNames = (adminRows || []).map((admin) => admin.username);
        const taskLink = `/dashboard/boards/${committedBoardId}?task=${id}`;
        const taskTitle = String(committedTask.title ?? currentTask.title);

        await notifyMany(supabase, adminNames, {
          type: 'task_stage_advanced',
          title: `📌 «${taskTitle}» انتقلت إلى ${committedTarget.name}`, // i18n-exempt: notification content (Phase 8)
          message: `${auth.pyraUser.display_name} نقل المهمة إلى "${committedTarget.name}"`, // i18n-exempt: notification content (Phase 8)
          link: taskLink,
          entity: { type: 'task', id },
          from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
        });

        const waMessage = `📌 ${auth.pyraUser.display_name} نقل «${taskTitle}» إلى ${committedTarget.name}\n${APP_URL}${taskLink}`; // i18n-exempt: notification content (Phase 8)
        void Promise.allSettled(
          adminNames
            .filter((admin) => admin !== auth.pyraUser.username)
            .map((admin) => sendWhatsAppToUser(supabase, admin, waMessage)),
        ).catch((error) => logError({
          error,
          request: req,
          metadata: { action: 'task_move_admin_whatsapp', task_id: id },
        }));

        const { data: assigneeRows } = await supabase
          .from('pyra_task_assignees')
          .select('username')
          .eq('task_id', id);
        await notifyMany(supabase, (assigneeRows || []).map((row) => row.username), {
          type: 'task_stage_advanced',
          title: `📌 «${taskTitle}» انتقلت إلى ${committedTarget.name}`, // i18n-exempt: notification content (Phase 8)
          message: `انتقلت المهمة إلى "${committedTarget.name}"`, // i18n-exempt: notification content (Phase 8)
          link: taskLink,
          entity: { type: 'task', id },
          from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
        });
      }

      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.UPDATE}`,
        `/dashboard/boards/${committedBoardId}`,
        {
          source: 'task_move',
          task_id: id,
          column_id: committedColumnId,
          position: committedPosition,
          cross_board: committedCrossBoard,
        },
      );
    } catch (sideEffectError) {
      logError({
        error: sideEffectError,
        request: req,
        metadata: { action: 'task_move_post_commit', task_id: id },
      });
    }

    return apiSuccess(committedTask);
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_move' } });
    return apiServerError();
  }
}
