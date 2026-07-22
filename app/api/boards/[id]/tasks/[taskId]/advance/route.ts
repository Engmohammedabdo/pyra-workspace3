import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiValidationError, apiNotFound, apiForbidden, apiError } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { checkBoardScope } from '@/lib/auth/task-scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';
import { PRODUCTION_BOARD_ID } from '@/lib/constants/production';
import { isUnverifiedProductionDeadline } from '@/lib/production/deadlines';
import {
  TASK_TRANSITION_STATUSES,
  type AtomicTaskTransitionResult,
} from '@/lib/constants/task-transitions';

type RouteCtx = { params: Promise<{ id: string; taskId: string }> };

// =============================================================
// POST /api/boards/[id]/tasks/[taskId]/advance
// Move task to the next stage in a pipeline board
// =============================================================
export async function POST(req: NextRequest, ctx: RouteCtx) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.create');
    if (isApiError(auth)) return auth;

    const { id: boardId, taskId } = await ctx.params;

    // Board-scope gate: BASE_EMPLOYEE grants tasks.create to all internal
    // users, so permission alone doesn't prove board access.
    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const isHttpsUrl = (v: unknown): v is string =>
      typeof v === 'string' && /^https:\/\/.+/i.test(v.trim());
    const supabase = await createServerSupabaseClient();

    // Fetch board + columns
    const { data: board } = await supabase
      .from('pyra_boards')
      .select('id, is_pipeline, auto_advance, pyra_board_columns(id, name, position, is_done_column, requires_approval, default_assignee, column_type)')
      .eq('id', boardId)
      .single();

    if (!board) return apiNotFound(t('common.boardNotFound'));

    // Fetch task
    const { data: task } = await supabase
      .from('pyra_tasks')
      .select('id, title, column_id, board_id, stage_entered_at, completion_percentage, due_date, due_at, production_deadline_exempt, updated_at')
      .eq('id', taskId)
      .eq('board_id', boardId)
      .single();

    if (!task) return apiNotFound(t('common.taskNotFound'));

    // Sort columns by position
    const columns = ((board.pyra_board_columns as Array<{
      id: string; name: string; position: number;
      is_done_column: boolean; requires_approval: boolean; default_assignee: string | null;
      column_type: string | null;
    }>) || []).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id));

    const currentIdx = columns.findIndex(c => c.id === task.column_id);
    if (currentIdx === -1) return apiValidationError(t('boards.currentColumnNotFound'));
    if (currentIdx >= columns.length - 1) return apiValidationError(t('boards.taskAlreadyLastStage'));

    const nextCol = columns[currentIdx + 1];

    if (
      boardId === PRODUCTION_BOARD_ID
      && nextCol.column_type === 'review'
      && (
        !task.due_date
        || !task.due_at
        || isUnverifiedProductionDeadline({
          dueDate: task.due_date,
          dueAt: task.due_at,
          deadlineExempt: task.production_deadline_exempt,
        })
      )
    ) {
      return apiValidationError(t('tasks.productionDeadlineRequired'));
    }

    // Check if next stage requires approval
    if (nextCol.requires_approval) {
      return apiValidationError(t('boards.nextStageRequiresApproval'));
    }

    // ── Gated columns: link requirements (remote-production-tracking) ──
    let attachmentToCreate: { name: string; url: string } | null = null;

    if (nextCol.column_type === 'review') {
      if (!isHttpsUrl(body.review_link)) {
        return apiValidationError(t('boards.reviewLinkRequired'));
      }
      // round number = prior entries into the review column + 1 (derived, never stored)
      const { count } = await supabase
        .from('pyra_task_stage_history')
        .select('id', { count: 'exact', head: true })
        .eq('task_id', taskId)
        .eq('to_column_id', nextCol.id);
      attachmentToCreate = {
        name: `نسخة للمراجعة — جولة ${(count || 0) + 1}`, // i18n-exempt: DB data
        url: (body.review_link as string).trim(),
      };
    }

    if (nextCol.column_type === 'delivery') {
      if (!isHttpsUrl(body.delivery_link)) {
        return apiValidationError(t('boards.deliveryLinkRequired'));
      }
      attachmentToCreate = {
        name: 'التسليم النهائي', // i18n-exempt: DB data
        url: (body.delivery_link as string).trim(),
      };
    }

    // Permission and board-scope gates plus all user-facing validation have
    // completed before the service client exists. The RPC is the sole writer
    // for task, attachment, stage-history, and task-activity transition state.
    const attachmentId = attachmentToCreate ? generateId('att') : null;
    const historyId = generateId('sh');
    const defaultAssigneeId = generateId('ta');
    const activityId = generateId('act');
    const serviceSupabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await serviceSupabase.rpc(
      'pyra_advance_task_atomic',
      {
        p_task_id: taskId,
        p_board_id: boardId,
        p_expected_column_id: task.column_id,
        p_expected_target_column_id: nextCol.id,
        p_expected_target_column_type: nextCol.column_type,
        p_expected_updated_at: task.updated_at,
        p_moved_by: auth.pyraUser.username,
        p_history_id: historyId,
        p_default_assignee_id: defaultAssigneeId,
        p_attachment_id: attachmentId,
        p_attachment_file_name: attachmentToCreate?.name ?? null,
        p_attachment_file_url: attachmentToCreate?.url ?? null,
        p_actor_display_name: auth.pyraUser.display_name,
        p_activity_id: activityId,
      },
    );

    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'task_advance_rpc', task_id: taskId },
      });
      return apiServerError();
    }

    const result = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as
      | AtomicTaskTransitionResult
      | null;
    if (!result) {
      logError({
        error: new Error('Atomic advance RPC returned no result'),
        request: req,
        metadata: { action: 'task_advance_rpc_empty', task_id: taskId },
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
      case TASK_TRANSITION_STATUSES.INVALID_BOARD:
        return apiNotFound(t('common.boardNotFound'));
      case TASK_TRANSITION_STATUSES.CURRENT_COLUMN_NOT_FOUND:
        return apiValidationError(t('boards.currentColumnNotFound'));
      case TASK_TRANSITION_STATUSES.ALREADY_LAST_STAGE:
        return apiValidationError(t('boards.taskAlreadyLastStage'));
      case TASK_TRANSITION_STATUSES.NEXT_STAGE_REQUIRES_APPROVAL:
        return apiValidationError(t('boards.nextStageRequiresApproval'));
      case TASK_TRANSITION_STATUSES.PRODUCTION_DEADLINE_REQUIRED:
        return apiValidationError(t('tasks.productionDeadlineRequired'));
      case TASK_TRANSITION_STATUSES.ATTACHMENT_REQUIRED:
        return apiValidationError(t(
          nextCol.column_type === 'delivery'
            ? 'boards.deliveryLinkRequired'
            : 'boards.reviewLinkRequired',
        ));
      case TASK_TRANSITION_STATUSES.ATTACHMENT_INVALID:
        return apiValidationError(t('tasks.transitionAttachmentInvalid'));
      case TASK_TRANSITION_STATUSES.ATTACHMENT_UNEXPECTED:
      case TASK_TRANSITION_STATUSES.INVALID_TRANSITION_INPUT:
        return apiValidationError(t('tasks.taskTransitionInvalid'));
      default:
        logError({
          error: new Error(`Unexpected atomic advance status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'task_advance_rpc_status', task_id: taskId },
        });
        return apiServerError();
    }

    if (!result.task || !result.transition) {
      logError({
        error: new Error('Atomic advance RPC success omitted committed data'),
        request: req,
        metadata: { action: 'task_advance_rpc_shape', task_id: taskId },
      });
      return apiServerError();
    }

    const committedTask = result.task;
    const committedNextCol = {
      id: String(result.transition.to_column_id),
      name: String(result.transition.to_column_name),
      column_type: result.transition.to_column_type
        ? String(result.transition.to_column_type)
        : null,
      default_assignee: result.transition.to_default_assignee
        ? String(result.transition.to_default_assignee)
        : null,
    };
    const completionPct = Number(
      result.transition.completion_percentage
      ?? committedTask.completion_percentage
      ?? 0,
    );

    // Everything below is post-commit communication/audit work. A notification
    // failure must not turn a committed transition into an HTTP error that a
    // client could retry.
    try {
    // Notify assignees (fixed 2026-07-03: was a direct insert with wrong
    // column names `username`/`link` — silently failed; see notify() docblock)
    const { data: assignees } = await supabase
      .from('pyra_task_assignees')
      .select('username')
      .eq('task_id', taskId);

    const assigneeNames = (assignees || []).map(a => a.username);
    const taskLink = `/dashboard/boards/${boardId}?task=${taskId}`;

    await notifyMany(supabase, assigneeNames, {
      type: 'task_stage_advanced',
      title: `مهمة انتقلت لمرحلة: ${committedNextCol.name}`, // i18n-exempt: notification content (Phase 8)
      message: `المهمة انتقلت إلى "${committedNextCol.name}"`, // i18n-exempt: notification content (Phase 8)
      link: taskLink,
      entity: { type: 'task', id: taskId },
      from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
    });

    // Admins are blind to plain advances otherwise (only assignees are
    // notified above) — alert active admins too, EXCEPT when the target
    // column is 'review' or 'delivery' (those already get their own
    // dedicated admin alert blocks below — adding admins here too would
    // double-notify on those two column types).
    if (committedNextCol.column_type !== 'review' && committedNextCol.column_type !== 'delivery') {
      const { data: adminRowsForAdvance } = await supabase
        .from('pyra_users')
        .select('username')
        .eq('role', 'admin')
        .eq('status', 'active');

      await notifyMany(supabase, (adminRowsForAdvance || []).map(a => a.username), {
        type: 'task_stage_advanced',
        title: `📌 «${String(committedTask.title ?? task.title)}» انتقلت إلى ${committedNextCol.name}`, // i18n-exempt: notification content (Phase 8)
        message: `${auth.pyraUser.display_name} نقل المهمة إلى "${committedNextCol.name}"`, // i18n-exempt: notification content (Phase 8)
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
    }

    // Entering review → alert active admins (the reviewers) loudly
    if (committedNextCol.column_type === 'review') {
      const { data: adminRows } = await supabase
        .from('pyra_users')
        .select('username')
        .eq('role', 'admin')
        .eq('status', 'active');
      const adminNames = (adminRows || []).map(a => a.username);

      await notifyMany(supabase, adminNames, {
        type: 'task_submitted_for_review',
        title: `👀 نسخة جاهزة للمراجعة`, // i18n-exempt: notification content (Phase 8)
        message: `${auth.pyraUser.display_name} رفع نسخة للمراجعة${body.note ? ` — ${String(body.note).slice(0, 200)}` : ''}`, // i18n-exempt: notification content (Phase 8)
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
      // Fire-and-forget: WhatsApp is best-effort (the in-app notifyMany above
      // is the guaranteed channel) — don't serialize N×8s Evolution timeouts
      // in the response path. sendWhatsAppToUser never throws (returns false).
      void Promise.allSettled(
        adminNames
          .filter(admin => admin !== auth.pyraUser.username)
          .map(admin => sendWhatsAppToUser(supabase, admin,
            `👀 نسخة جاهزة للمراجعة من ${auth.pyraUser.display_name}\nالرابط: ${attachmentToCreate?.url}\n${APP_URL}${taskLink}`)) // i18n-exempt: notification content (Phase 8)
      ).catch(err => logError({ error: err, request: req, metadata: { action: 'task_advance_whatsapp' } }));
    }

    // Entering delivery → alert admins the task closed
    if (committedNextCol.column_type === 'delivery') {
      const { data: adminRows } = await supabase
        .from('pyra_users')
        .select('username')
        .eq('role', 'admin')
        .eq('status', 'active');
      await notifyMany(supabase, (adminRows || []).map(a => a.username), {
        type: 'task_delivered',
        title: `📦 تم التسليم النهائي`, // i18n-exempt: notification content (Phase 8)
        message: `${auth.pyraUser.display_name} سلّم المهمة نهائياً — الفاينل على Drive`, // i18n-exempt: notification content (Phase 8)
        link: taskLink,
        entity: { type: 'task', id: taskId },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/boards/${boardId}`,
      {
        source: 'task_advance',
        task_id: taskId,
        to_stage: committedNextCol.name,
        completion_pct: completionPct,
      },
    );
    } catch (sideEffectError) {
      logError({
        error: sideEffectError,
        request: req,
        metadata: { action: 'task_advance_post_commit', task_id: taskId },
      });
    }

    return apiSuccess({
      advanced: true,
      to_column: committedNextCol.id,
      completion_percentage: completionPct,
    });

  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_advance' } });
    console.error('[POST /api/boards/[id]/tasks/[taskId]/advance] error:', err);
    return apiServerError();
  }
}
