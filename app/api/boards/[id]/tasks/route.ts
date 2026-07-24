import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import {
  apiSuccess,
  apiServerError,
  apiValidationError,
  apiError,
  apiForbidden,
} from '@/lib/api/response';
import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { resolveUserScope, invalidateScopeCache } from '@/lib/auth/scope';
import { checkBoardScope } from '@/lib/auth/task-scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';
import { isoToDubaiDateTime, resolveTaskDeadlineInput } from '@/lib/production/deadlines';
import { logError } from '@/lib/observability/log-error';
import {
  ATOMIC_TASK_WRITE_STATUSES,
  type AtomicTaskWriteResult,
} from '@/lib/constants/task-transitions';

function notificationDeadlineLabel(dueDate: string | null, dueAt: string | null): string | null {
  const exact = dueAt ? isoToDubaiDateTime(dueAt) : null;
  if (exact) return `${exact.date} الساعة ${exact.time} بتوقيت الإمارات`; // i18n-exempt: persisted notification content
  return dueDate;
}

function parseUniqueAssigneeUsernames(input: unknown): string[] | null {
  if (input == null) return [];
  if (!Array.isArray(input)) return null;
  const usernames: string[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value !== 'string' || !value.trim() || value !== value.trim() || seen.has(value)) {
      return null;
    }
    seen.add(value);
    usernames.push(value);
  }
  return usernames;
}

// =============================================================
// GET /api/boards/[id]/tasks
// List all non-archived tasks for a board
// =============================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.view');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;
    const scope = await resolveUserScope(auth);
    if (!scope.isAdmin && !scope.boardIds.includes(boardId)) {
      return apiError(t('common.noAccessBoard403'), 403);
    }

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pyra_tasks')
      .select(`
        *,
        pyra_task_assignees(id, username, assigned_by),
        pyra_task_labels(label_id, pyra_board_labels(id, name, color)),
        pyra_task_checklist(id, title, is_checked, position)
      `)
      .eq('board_id', boardId)
      .eq('is_archived', false)
      .order('position');

    if (error) return apiServerError(error.message);
    const tasks = data || [];
    const taskIds = tasks.map((task) => task.id).filter(Boolean);
    if (taskIds.length === 0) return apiSuccess(tasks);

    const { data: stageActions, error: activityError } = await supabase
      .from('pyra_task_activity')
      .select('task_id, action, created_at')
      .in('task_id', taskIds)
      .in('action', ['stage_rejected', 'stage_advanced', 'stage_approved'])
      .order('created_at', { ascending: false });
    if (activityError) return apiServerError(activityError.message);

    const latestStageActionByTask = new Map<string, string>();
    for (const action of stageActions || []) {
      if (!latestStageActionByTask.has(action.task_id)) {
        latestStageActionByTask.set(action.task_id, action.action);
      }
    }
    return apiSuccess(tasks.map((task) => ({
      ...task,
      needs_revision: latestStageActionByTask.get(task.id) === 'stage_rejected',
    })));
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'board_tasks_list' } });
    return apiServerError();
  }
}

// =============================================================
// POST /api/boards/[id]/tasks
// Create a task and its assignments in one PostgreSQL transaction.
// =============================================================
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('tasks.create');
    if (isApiError(auth)) return auth;

    const { id: boardId } = await params;
    if (!(await checkBoardScope(boardId, auth))) {
      return apiForbidden(t('common.noAccessBoard'));
    }

    const body = await req.json();
    const {
      title,
      column_id,
      description,
      priority,
      due_date,
      due_time,
      start_date,
      estimated_hours,
      assignees,
    } = body;
    if (typeof title !== 'string' || !title.trim()) {
      return apiValidationError(t('common.titleRequired'));
    }
    if (typeof column_id !== 'string' || !column_id.trim()) {
      return apiValidationError(t('boards.columnRequired'));
    }
    const assigneeNames = parseUniqueAssigneeUsernames(assignees);
    if (!assigneeNames) return apiValidationError(t('tasks.usernamesArrayRequired'));

    const deadline = resolveTaskDeadlineInput({
      boardId,
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

    const taskId = generateId('tk');
    const assigneeRows = assigneeNames.map((username) => ({
      id: generateId('ta'),
      username,
    }));
    const serviceSupabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await serviceSupabase.rpc(
      'pyra_create_task_atomic',
      {
        p_task_id: taskId,
        p_board_id: boardId,
        p_column_id: column_id,
        p_title: title,
        p_description: typeof description === 'string' ? description : null,
        p_priority: typeof priority === 'string' && priority ? priority : 'medium',
        p_due_date: deadline.value.due_date,
        p_due_at: deadline.value.due_at,
        p_start_date: typeof start_date === 'string' && start_date ? start_date : null,
        p_estimated_hours: typeof estimated_hours === 'number' && Number.isFinite(estimated_hours)
          ? estimated_hours
          : null,
        p_created_by: auth.pyraUser.username,
        p_assignees: assigneeRows,
      },
    );
    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'board_task_create_rpc', board_id: boardId },
      });
      return apiServerError();
    }

    const result = (Array.isArray(rpcRows) ? rpcRows[0] : rpcRows) as
      | AtomicTaskWriteResult
      | null;
    if (!result) {
      logError({
        error: new Error('Atomic task create RPC returned no result'),
        request: req,
        metadata: { action: 'board_task_create_rpc_empty', board_id: boardId },
      });
      return apiServerError();
    }

    switch (result.status) {
      case ATOMIC_TASK_WRITE_STATUSES.OK:
        break;
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
        return apiError(t('tasks.taskTransitionConflict'), 409);
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_TASK_INPUT:
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_ASSIGNEES:
        return apiValidationError(t('tasks.taskTransitionInvalid'));
      default:
        logError({
          error: new Error(`Unexpected atomic task create status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'board_task_create_rpc_status', board_id: boardId },
        });
        return apiServerError();
    }
    if (!result.task) {
      logError({
        error: new Error('Atomic task create RPC success omitted committed task'),
        request: req,
        metadata: { action: 'board_task_create_rpc_shape', board_id: boardId },
      });
      return apiServerError();
    }

    // External effects happen only after the transaction has committed. A
    // notification outage must not make the caller retry a committed create.
    const supabase = await createServerSupabaseClient();
    if (assigneeNames.length > 0) {
      assigneeNames.forEach((username) => invalidateScopeCache(username));
      const taskLink = `/dashboard/boards/${boardId}?task=${taskId}`;
      const deadlineLabel = notificationDeadlineLabel(deadline.value.due_date, deadline.value.due_at);
      try {
        await notifyMany(supabase, assigneeNames, {
          type: 'task_assigned',
          title: `📌 مهمة جديدة: ${title}`, // i18n-exempt: persisted notification content
          message: `عيّنك ${auth.pyraUser.display_name} على مهمة جديدة${deadlineLabel ? ` — الموعد النهائي ${deadlineLabel}` : ''}`, // i18n-exempt: persisted notification content
          link: taskLink,
          entity: { type: 'task', id: taskId },
          from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
        });
      } catch (notificationError) {
        logError({
          error: notificationError,
          request: req,
          metadata: { action: 'board_task_create_notify', task_id: taskId },
        });
      }
      void Promise.allSettled(
        assigneeNames
          .filter((username) => username !== auth.pyraUser.username)
          .map((username) => sendWhatsAppToUser(
            supabase,
            username,
            `📌 مهمة جديدة اتعينت عليك: ${title}\nالموعد النهائي: ${deadlineLabel || 'غير محدد'}\n${APP_URL}${taskLink}`, // i18n-exempt: persisted notification content
          )),
      );
    }

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.CREATE}`,
      `/dashboard/boards/${boardId}`,
      {
        source: 'board_task_create',
        task_id: taskId,
        title,
        column_id,
        priority: priority || 'medium',
      },
    );
    return apiSuccess(result.task, undefined, 201);
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'board_task_create' } });
    return apiServerError();
  }
}
