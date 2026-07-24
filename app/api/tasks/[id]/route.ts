import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError, apiNotFound, apiForbidden, apiValidationError, apiError } from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { checkBoardScope, checkTaskScope } from '@/lib/auth/task-scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { PRODUCTION_BOARD_ID } from '@/lib/constants/production';
import { resolveTaskDeadlineUpdate, type TaskDeadlineFields } from '@/lib/production/deadlines';
import { logError } from '@/lib/observability/log-error';
import {
  ATOMIC_TASK_WRITE_STATUSES,
  TASK_TRANSITION_MUTATION_FIELDS,
  type AtomicTaskWriteResult,
} from '@/lib/constants/task-transitions';
import { PRODUCTION_REVIEW_DELETE_BLOCKED_ERROR } from '@/lib/constants/task-review';

function nextUpdatedAt(previous: string | null): string {
  const previousMs = previous ? Date.parse(previous) : Number.NaN;
  const nextMs = Number.isFinite(previousMs)
    ? Math.max(Date.now(), previousMs + 1)
    : Date.now();
  return new Date(nextMs).toISOString();
}

function parseAtomicTaskWriteResult(rows: unknown): AtomicTaskWriteResult | null {
  return (Array.isArray(rows) ? rows[0] : rows) as AtomicTaskWriteResult | null;
}

// =============================================================
// GET /api/tasks/[id]
// Retrieve a single task with all related data
// =============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    // Scope check: user must have access to the task's board
    if (!(await checkTaskScope(id, auth))) return apiForbidden();

    const supabase = await createServerSupabaseClient();

    const { data, error } = await supabase
      .from('pyra_tasks')
      .select(`
        *,
        pyra_task_assignees(id, username, assigned_by),
        pyra_task_labels(label_id, pyra_board_labels(id, name, color)),
        pyra_task_checklist(id, title, is_checked, position),
        pyra_task_comments(id, author_username, author_name, content, created_at),
        pyra_task_attachments(id, file_name, file_url, file_size, uploaded_by, created_at),
        pyra_task_activity(id, username, display_name, action, details, created_at)
      `)
      .eq('id', id)
      .single();

    if (error || !data) return apiNotFound(t('common.taskNotFound'));

    return apiSuccess({
      ...data,
      deadline_locked: data.production_deadline_locked_at !== null,
    });

  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_get' } });
    return apiServerError();
  }
}

// =============================================================
// PATCH /api/tasks/[id]
// Update task properties
// =============================================================
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    // Scope check
    if (!(await checkTaskScope(id, auth))) return apiForbidden();

    const body = await req.json() as Record<string, unknown>;
    if (TASK_TRANSITION_MUTATION_FIELDS.some(
      (field) => Object.prototype.hasOwnProperty.call(body, field),
    )) {
      return apiValidationError(t('tasks.transitionFieldsRequireMove'));
    }
    const supabase = await createServerSupabaseClient();

    // checkTaskScope may have observed an older board. All PATCH branches use
    // this fresh board/version snapshot; normal field updates also CAS on it.
    const { data: taskContext, error: taskContextError } = await supabase
      .from('pyra_tasks')
      .select('id, board_id, updated_at, production_deadline_locked_at')
      .eq('id', id)
      .single();
    if (taskContextError || !taskContext) {
      return apiNotFound(t('common.taskNotFound'));
    }
    if (!(await checkBoardScope(taskContext.board_id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    // ── Label operations (handle before normal updates) ──
    const addLabelRequested = Object.prototype.hasOwnProperty.call(body, '_add_label');
    const removeLabelRequested = Object.prototype.hasOwnProperty.call(body, '_remove_label');
    if (addLabelRequested || removeLabelRequested) {
      const action = addLabelRequested ? 'add' : 'remove';
      const rawLabelId = addLabelRequested ? body._add_label : body._remove_label;
      if (typeof rawLabelId !== 'string' || !rawLabelId.trim() || rawLabelId !== rawLabelId.trim()) {
        return apiValidationError(t('boards.labelIdRequired'));
      }

      const serviceSupabase = createServiceRoleClient();
      const { data: rpcRows, error: rpcError } = await serviceSupabase.rpc(
        'pyra_mutate_task_label_atomic',
        {
          p_task_id: id,
          p_expected_board_id: taskContext.board_id,
          p_expected_updated_at: taskContext.updated_at,
          p_action: action,
          p_label_id: rawLabelId,
          p_actor_username: auth.pyraUser.username,
          p_actor_display_name: auth.pyraUser.display_name,
          p_activity_id: generateId('tl'),
        },
      );
      if (rpcError) {
        logError({
          error: rpcError,
          request: req,
          metadata: { action: 'task_label_mutation_rpc', task_id: id },
        });
        return apiServerError();
      }

      const result = parseAtomicTaskWriteResult(rpcRows);
      if (!result) {
        logError({
          error: new Error('Atomic task label RPC returned no result'),
          request: req,
          metadata: { action: 'task_label_mutation_rpc_empty', task_id: id },
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
        case ATOMIC_TASK_WRITE_STATUSES.INVALID_LABEL:
        case ATOMIC_TASK_WRITE_STATUSES.INVALID_RELATION_INPUT:
          return apiValidationError(t('tasks.taskTransitionInvalid'));
        default:
          logError({
            error: new Error(`Unexpected atomic task label status: ${String(result.status)}`),
            request: req,
            metadata: { action: 'task_label_mutation_rpc_status', task_id: id },
          });
          return apiServerError();
      }

      if (result.mutation?.changed === true) {
        logActivity(
          auth.pyraUser.username,
          auth.pyraUser.display_name,
          `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.UPDATE}`,
          `/dashboard/boards/${taskContext.board_id}`,
          {
            source: action === 'add' ? 'task_label_add' : 'task_label_remove',
            task_id: id,
            label_id: rawLabelId,
          },
        );
      }
      return apiSuccess(action === 'add'
        ? { label_added: rawLabelId }
        : { label_removed: rawLabelId });
    }

    // ── Normal field updates ──
    const allowed = [
      'title', 'description', 'priority',
      'start_date', 'estimated_hours', 'actual_hours',
      'cover_image', 'is_archived',
      'payment_amount', 'payment_currency', 'payment_status', 'task_hourly_rate',
    ];
    const updates: Record<string, unknown> = {};
    for (const key of allowed) {
      if (key in body) updates[key] = body[key];
    }

    const dueDateProvided = Object.prototype.hasOwnProperty.call(body, 'due_date');
    const dueTimeProvided = Object.prototype.hasOwnProperty.call(body, 'due_time');
    let resolvedDeadline: TaskDeadlineFields | null = null;

    if (dueDateProvided || dueTimeProvided) {
      // A lone due_time has no meaning for legacy date-only boards. Production
      // always requires the server-owned date + time pair.
      if (dueDateProvided || taskContext.board_id === PRODUCTION_BOARD_ID) {
        if (taskContext.production_deadline_locked_at !== null) {
          return apiValidationError(t('tasks.productionDeadlineLocked'));
        }

        const deadline = resolveTaskDeadlineUpdate({
          boardId: taskContext.board_id,
          dueDate: body.due_date,
          dueTime: body.due_time,
          hasReviewSubmission: false,
        });
        if (!deadline.ok) {
          const key = deadline.error === 'locked'
            ? 'tasks.productionDeadlineLocked'
            : deadline.error === 'required'
              ? 'tasks.productionDeadlineRequired'
              : 'tasks.productionDeadlineInvalid';
          return apiValidationError(t(key));
        }
        resolvedDeadline = deadline.value;
      }
    }

    if (resolvedDeadline) {
      updates.due_date = resolvedDeadline.due_date;
      updates.due_at = resolvedDeadline.due_at;
      if (taskContext.board_id === PRODUCTION_BOARD_ID) {
        // Migration 044 marks every legacy date-only value as unverified.
        // Supplying a genuine server-normalized date + time before first
        // review is the only path that clears that exclusion.
        updates.production_deadline_exempt = false;
      }
    }
    updates.updated_at = nextUpdatedAt(taskContext.updated_at);

    // Permission, task scope, and deadline validation have completed before
    // the protected table writer exists. Migration 044 later revokes direct
    // authenticated task DML without breaking this route.
    const serviceSupabase = createServiceRoleClient();
    let updateQuery = serviceSupabase
      .from('pyra_tasks')
      .update(updates)
      .eq('id', id)
      .eq('board_id', taskContext.board_id);
    updateQuery = taskContext.updated_at === null
      ? updateQuery.is('updated_at', null)
      : updateQuery.eq('updated_at', taskContext.updated_at);

    const { data, error } = await updateQuery
      .select()
      .maybeSingle();

    if (error) return apiServerError(error.message);
    if (!data) {
      if (resolvedDeadline) {
        const { data: latestTask, error: latestTaskError } = await supabase
          .from('pyra_tasks')
          .select('production_deadline_locked_at')
          .eq('id', id)
          .maybeSingle();
        if (latestTaskError) return apiServerError(latestTaskError.message);
        if (latestTask && latestTask.production_deadline_locked_at !== null) {
          return apiValidationError(t('tasks.productionDeadlineLocked'));
        }
      }
      return apiError(t('tasks.taskUpdateConflict'), 409);
    }

    // Log task activity
    const changedFields = Object.keys(updates).filter(k => k !== 'updated_at');
    if (changedFields.length > 0) {
      const { error: activityError } = await supabase.from('pyra_task_activity').insert({
        id: generateId('tl'),
        task_id: id,
        username: auth.pyraUser.username,
        display_name: auth.pyraUser.display_name,
        action: 'updated',
        details: JSON.stringify({ fields: changedFields }),
      });
      if (activityError) {
        // The task update is already committed. Report the missing secondary
        // activity evidence without returning a false rollback response.
        logError({
          error: activityError,
          request: req,
          metadata: { action: 'task_update_activity', task_id: id },
        });
      }
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/boards/${taskContext.board_id}`,
      { source: 'task_update', task_id: id, fields: changedFields },
    );

    return apiSuccess(data);

  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_update' } });
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/tasks/[id]
// Permanently delete a task
// =============================================================
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.manage');
    if (isApiError(auth)) return auth;

    const { id } = await params;

    if (!(await checkTaskScope(id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const supabase = await createServerSupabaseClient();
    const { data: taskContext, error: taskContextError } = await supabase
      .from('pyra_tasks')
      .select('id, board_id, updated_at')
      .eq('id', id)
      .single();
    if (taskContextError || !taskContext) {
      return apiNotFound(t('common.taskNotFound'));
    }
    if (!(await checkBoardScope(taskContext.board_id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const serviceSupabase = createServiceRoleClient();
    let deleteQuery = serviceSupabase
      .from('pyra_tasks')
      .delete()
      .eq('id', id)
      .eq('board_id', taskContext.board_id);
    deleteQuery = taskContext.updated_at === null
      ? deleteQuery.is('updated_at', null)
      : deleteQuery.eq('updated_at', taskContext.updated_at);
    const { data, error } = await deleteQuery
      .select('id')
      .maybeSingle();
    if (error) {
      logError({
        error,
        request: req,
        metadata: { action: 'task_delete_writer', task_id: id },
      });
      if (
        error.code === 'P0001'
        && error.message.includes(PRODUCTION_REVIEW_DELETE_BLOCKED_ERROR)
      ) {
        return apiValidationError(t('tasks.productionReviewedTaskArchiveOnly'));
      }
      return apiServerError();
    }
    if (!data) return apiError(t('tasks.taskUpdateConflict'), 409);

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.DELETE}`,
      `/dashboard/boards/${taskContext.board_id}`,
      { source: 'task_delete', task_id: id, board_id: taskContext.board_id },
    );

    return apiSuccess({ deleted: true });

  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_delete' } });
    return apiServerError();
  }
}
