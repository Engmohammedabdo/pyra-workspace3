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
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from '@/lib/supabase/server';
import { checkBoardScope } from '@/lib/auth/task-scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { generateId } from '@/lib/utils/id';
import { logError } from '@/lib/observability/log-error';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';
import {
  TASK_REJECTION_KINDS,
  TASK_REVIEW_ACTIONS,
  TASK_REVIEW_STATUSES,
  isTaskRejectionKind,
  type AtomicTaskReviewResult,
  type TaskReviewAction,
} from '@/lib/constants/task-review';

type RouteCtx = { params: Promise<{ id: string; taskId: string }> };

interface ReviewColumn {
  id: string;
  name: string;
  position: number | null;
  column_type: string | null;
  is_done_column: boolean | null;
  requires_approval: boolean | null;
  default_assignee: string | null;
}

function parseAtomicReviewResult(rows: unknown): AtomicTaskReviewResult | null {
  return (Array.isArray(rows) ? rows[0] : rows) as AtomicTaskReviewResult | null;
}

// POST /api/boards/[id]/tasks/[taskId]/approve
// Explicit admin approval/rejection. The service-only RPC is the sole writer.
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('boards.manage');
    if (isApiError(auth)) return auth;

    const { id: boardId, taskId } = await ctx.params;
    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return apiValidationError(t('boards.actionRequiredApproveReject'));
    }

    const action = body.action;
    if (action !== TASK_REVIEW_ACTIONS.APPROVE && action !== TASK_REVIEW_ACTIONS.REJECT) {
      return apiValidationError(t('boards.actionRequiredApproveReject'));
    }
    const typedAction: TaskReviewAction = action;
    if (body.note !== undefined && typeof body.note !== 'string') {
      return apiValidationError(t('boards.revisionNoteRequired'));
    }
    const note = typeof body.note === 'string' ? body.note.trim() : '';
    const rejectionKind = body.rejection_kind;

    if (typedAction === TASK_REVIEW_ACTIONS.REJECT) {
      if (!note) return apiValidationError(t('boards.revisionNoteRequired'));
      if (!isTaskRejectionKind(rejectionKind)) {
        return apiValidationError(t('boards.rejectionKindRequired'));
      }
    } else if (rejectionKind !== undefined && rejectionKind !== null) {
      return apiValidationError(t('boards.rejectionKindRequired'));
    }

    const supabase = await createServerSupabaseClient();
    const { data: board, error: boardError } = await supabase
      .from('pyra_boards')
      .select('id, is_pipeline, pyra_board_columns(id, name, position, column_type, is_done_column, requires_approval, default_assignee)')
      .eq('id', boardId)
      .single();
    if (boardError || !board) return apiNotFound(t('common.boardNotFound'));
    if (board.is_pipeline !== true) {
      return apiValidationError(t('boards.noPendingReviewAction'));
    }

    const { data: task, error: taskError } = await supabase
      .from('pyra_tasks')
      .select('id, title, board_id, column_id, stage_entered_at, completion_percentage, updated_at')
      .eq('id', taskId)
      .eq('board_id', boardId)
      .single();
    if (taskError || !task) return apiNotFound(t('common.taskNotFound'));

    const columns = ((board.pyra_board_columns as ReviewColumn[] | null) || [])
      .sort((left, right) => (
        (left.position ?? Number.MAX_SAFE_INTEGER)
        - (right.position ?? Number.MAX_SAFE_INTEGER)
        || left.id.localeCompare(right.id)
      ));
    const currentIndex = columns.findIndex((column) => column.id === task.column_id);
    if (currentIndex < 0) return apiValidationError(t('boards.currentColumnNotFound'));
    const currentColumn = columns[currentIndex];
    if (currentColumn.column_type !== 'review' || currentColumn.is_done_column === true) {
      return apiValidationError(t('boards.noPendingReviewAction'));
    }
    const targetColumn = typedAction === TASK_REVIEW_ACTIONS.APPROVE
      ? columns[currentIndex + 1]
      : columns[currentIndex - 1];
    if (!targetColumn) return apiValidationError(t('boards.noPendingReviewAction'));
    if (
      typedAction === TASK_REVIEW_ACTIONS.APPROVE
      && targetColumn.requires_approval !== true
    ) {
      return apiValidationError(t('boards.approveOnlyForGatedStage'));
    }

    // Permission, board scope, request shape, and current transition semantics
    // are all validated before the privileged client exists.
    const historyId = generateId('sh');
    const defaultAssigneeId = generateId('ta');
    const commentId = typedAction === TASK_REVIEW_ACTIONS.REJECT ? generateId('tc') : null;
    const activityId = generateId('act');
    const serviceSupabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await serviceSupabase.rpc(
      'pyra_review_task_atomic',
      {
        p_task_id: taskId,
        p_board_id: boardId,
        p_expected_column_id: task.column_id,
        p_expected_updated_at: task.updated_at,
        p_actor_username: auth.pyraUser.username,
        p_actor_display_name: auth.pyraUser.display_name,
        p_action: typedAction,
        p_note: note,
        p_rejection_kind: typedAction === TASK_REVIEW_ACTIONS.REJECT ? rejectionKind : null,
        p_history_id: historyId,
        p_default_assignee_id: defaultAssigneeId,
        p_comment_id: commentId,
        p_activity_id: activityId,
      },
    );

    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'task_review_rpc', task_id: taskId },
      });
      return apiServerError();
    }

    const result = parseAtomicReviewResult(rpcRows);
    if (!result) {
      logError({
        error: new Error('Atomic review RPC returned no result'),
        request: req,
        metadata: { action: 'task_review_rpc_empty', task_id: taskId },
      });
      return apiServerError();
    }

    switch (result.status) {
      case TASK_REVIEW_STATUSES.OK:
        break;
      case TASK_REVIEW_STATUSES.TASK_NOT_FOUND:
        return apiNotFound(t('common.taskNotFound'));
      case TASK_REVIEW_STATUSES.INVALID_BOARD:
        return apiNotFound(t('common.boardNotFound'));
      case TASK_REVIEW_STATUSES.CURRENT_COLUMN_NOT_FOUND:
        return apiValidationError(t('boards.currentColumnNotFound'));
      case TASK_REVIEW_STATUSES.NO_PENDING_REVIEW:
        return apiValidationError(t('boards.noPendingReviewAction'));
      case TASK_REVIEW_STATUSES.TRANSITION_CONFLICT:
        return apiError(t('tasks.taskTransitionConflict'), 409);
      case TASK_REVIEW_STATUSES.INVALID_REVIEW_INPUT:
        return apiValidationError(t('tasks.taskTransitionInvalid'));
      default:
        logError({
          error: new Error(`Unexpected atomic review status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'task_review_rpc_status', task_id: taskId },
        });
        return apiServerError();
    }

    if (!result.task || !result.decision) {
      logError({
        error: new Error('Atomic review RPC success omitted committed data'),
        request: req,
        metadata: { action: 'task_review_rpc_shape', task_id: taskId },
      });
      return apiServerError();
    }

    const committedTargetName = String(result.decision.to_column_name ?? targetColumn.name);
    const committedTargetId = String(result.decision.to_column_id ?? targetColumn.id);
    const isReject = typedAction === TASK_REVIEW_ACTIONS.REJECT;
    const isOutright = rejectionKind === TASK_REJECTION_KINDS.OUTRIGHT;

    // Notifications and the global audit log are post-commit. Their failure
    // is logged but cannot make the client retry an already committed decision.
    try {
      const { data: assignees } = await supabase
        .from('pyra_task_assignees')
        .select('username')
        .eq('task_id', taskId);
      const assigneeNames = (assignees || []).map((assignee) => assignee.username);
      const taskLink = `/dashboard/boards/${boardId}?task=${taskId}`;

      await notifyMany(supabase, assigneeNames, isReject ? {
        type: 'task_revision_requested',
        title: isOutright
          ? `⛔ مرفوض تمامًا: ${task.title}` // i18n-exempt: persisted employee notification
          : `✏️ مطلوب تعديلات: ${task.title}`, // i18n-exempt: persisted employee notification
        message: `${note}`, // i18n-exempt: user-entered documented review note
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      } : {
        type: 'task_approved',
        title: `✅ تمت الموافقة: ${task.title}`, // i18n-exempt: persisted employee notification
        message: `انتقلت المهمة إلى "${committedTargetName}"`, // i18n-exempt: persisted employee notification
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });

      const whatsappMessage = isReject
        ? `${isOutright ? '⛔ مرفوض تمامًا' : '✏️ مطلوب تعديلات'}: ${task.title}\n${note}\n${APP_URL}${taskLink}` // i18n-exempt: persisted WhatsApp notification
        : `✅ تمت الموافقة على: ${task.title}\n${APP_URL}${taskLink}`; // i18n-exempt: persisted WhatsApp notification
      void Promise.allSettled(
        assigneeNames
          .filter((username) => username !== auth.pyraUser.username)
          .map((username) => sendWhatsAppToUser(supabase, username, whatsappMessage)),
      ).catch((error) => logError({
        error,
        request: req,
        metadata: { action: 'task_review_whatsapp', task_id: taskId },
      }));

      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.UPDATE}`,
        `/dashboard/boards/${boardId}`,
        {
          source: isReject ? 'task_review_reject' : 'task_review_approve',
          task_id: taskId,
          title: task.title,
          to_stage: committedTargetName,
          history_id: historyId,
          rejection_kind: isReject ? rejectionKind : null,
        },
      );
    } catch (sideEffectError) {
      logError({
        error: sideEffectError,
        request: req,
        metadata: { action: 'task_review_post_commit', task_id: taskId },
      });
    }

    return apiSuccess(isReject ? {
      rejected: true,
      sent_back_to: committedTargetId,
      rejection_kind: rejectionKind,
      history_id: historyId,
    } : {
      approved: true,
      to_column: committedTargetId,
      history_id: historyId,
    });
  } catch (error) {
    logError({ error, request: req, metadata: { action: 'task_review' } });
    return apiServerError();
  }
}
