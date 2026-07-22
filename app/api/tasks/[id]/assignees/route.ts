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
import { invalidateScopeCache } from '@/lib/auth/scope';
import { checkBoardScope, checkTaskScope } from '@/lib/auth/task-scope';
import { ACTIVITY_ACTIONS, ENTITY_TYPES, logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';
import {
  isUnverifiedProductionDeadline,
  isoToDubaiDateTime,
} from '@/lib/production/deadlines';
import {
  ATOMIC_TASK_WRITE_STATUSES,
  type AtomicTaskWriteResult,
} from '@/lib/constants/task-transitions';

type TaskAssigneeSnapshot = {
  id: string;
  title: string;
  board_id: string;
  due_date: string | null;
  due_at: string | null;
  production_deadline_exempt: boolean;
  updated_at: string | null;
};

function notificationDeadlineLabel(
  dueDate: string | null,
  dueAt: string | null,
  productionDeadlineExempt: boolean,
): string | null {
  if (isUnverifiedProductionDeadline({
    dueDate,
    dueAt,
    deadlineExempt: productionDeadlineExempt,
  })) return dueDate;
  const exact = dueAt ? isoToDubaiDateTime(dueAt) : null;
  if (exact) return `${exact.date} الساعة ${exact.time} بتوقيت الإمارات`; // i18n-exempt: persisted notification content
  return dueDate;
}

function parseUniqueUsernames(input: unknown): string[] | null {
  if (!Array.isArray(input) || input.length === 0) return null;
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

function parseAtomicResult(rows: unknown): AtomicTaskWriteResult | null {
  return (Array.isArray(rows) ? rows[0] : rows) as AtomicTaskWriteResult | null;
}

// =============================================================
// GET /api/tasks/[id]/assignees
// =============================================================
export async function GET(
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

    const supabase = await createServerSupabaseClient();
    const { data, error } = await supabase
      .from('pyra_task_assignees')
      .select('id, username, assigned_by, assigned_at')
      .eq('task_id', id)
      .order('assigned_at');
    if (error) return apiServerError(error.message);
    return apiSuccess(data);
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_assignees_list' } });
    return apiServerError();
  }
}

// =============================================================
// POST /api/tasks/[id]/assignees
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
    const usernames = parseUniqueUsernames(body.usernames);
    if (!usernames) return apiValidationError(t('tasks.usernamesArrayRequired'));

    const supabase = await createServerSupabaseClient();
    const { data: taskData, error: taskError } = await supabase
      .from('pyra_tasks')
      .select('id, title, board_id, due_date, due_at, production_deadline_exempt, updated_at')
      .eq('id', id)
      .single();
    const task = taskData as TaskAssigneeSnapshot | null;
    if (taskError || !task) return apiNotFound(t('common.taskNotFound'));
    if (!(await checkBoardScope(task.board_id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const activityId = generateId('tl');
    const assigneeRows = usernames.map((username) => ({ id: generateId('ta'), username }));
    const serviceSupabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await serviceSupabase.rpc(
      'pyra_add_task_assignees_atomic',
      {
        p_task_id: id,
        p_expected_board_id: task.board_id,
        p_expected_updated_at: task.updated_at,
        p_assigned_by: auth.pyraUser.username,
        p_actor_display_name: auth.pyraUser.display_name,
        p_activity_id: activityId,
        p_assignees: assigneeRows,
      },
    );
    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'task_assignees_add_rpc', task_id: id },
      });
      return apiServerError();
    }

    const result = parseAtomicResult(rpcRows);
    if (!result) {
      logError({
        error: new Error('Atomic assignee add RPC returned no result'),
        request: req,
        metadata: { action: 'task_assignees_add_rpc_empty', task_id: id },
      });
      return apiServerError();
    }
    switch (result.status) {
      case ATOMIC_TASK_WRITE_STATUSES.OK:
        break;
      case ATOMIC_TASK_WRITE_STATUSES.TASK_NOT_FOUND:
        return apiNotFound(t('common.taskNotFound'));
      case ATOMIC_TASK_WRITE_STATUSES.TASK_WRITE_CONFLICT:
        return apiError(t('tasks.taskTransitionConflict'), 409);
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_ASSIGNEES:
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_TASK_INPUT:
        return apiValidationError(t('tasks.usernamesArrayRequired'));
      default:
        logError({
          error: new Error(`Unexpected atomic assignee add status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'task_assignees_add_rpc_status', task_id: id },
        });
        return apiServerError();
    }

    const added = Array.isArray(result.mutation?.added)
      ? result.mutation.added.filter((value): value is string => typeof value === 'string')
      : [];
    if (added.length === 0) {
      return apiSuccess({ added: 0, message: t('tasks.usersAlreadyAssigned') });
    }

    added.forEach((username) => invalidateScopeCache(username));
    const deadlineLabel = notificationDeadlineLabel(
      task.due_date,
      task.due_at,
      task.production_deadline_exempt,
    );
    try {
      await notifyMany(supabase, added, {
        type: 'task_assigned',
        title: `تم تعيينك في مهمة: ${task.title}`, // i18n-exempt: persisted notification content
        message: `قام ${auth.pyraUser.display_name} بتعيينك في المهمة${deadlineLabel ? ` — الموعد النهائي ${deadlineLabel}` : ''}`, // i18n-exempt: persisted notification content
        link: `/dashboard/boards/${task.board_id}?task=${id}`,
        entity: { type: 'task', id },
        from: { username: auth.pyraUser.username, displayName: auth.pyraUser.display_name },
      });
    } catch (notificationError) {
      logError({
        error: notificationError,
        request: req,
        metadata: { action: 'task_assignees_add_notify', task_id: id },
      });
    }
    void Promise.allSettled(
      added
        .filter((username) => username !== auth.pyraUser.username)
        .map((username) => sendWhatsAppToUser(
          supabase,
          username,
          `📌 اتعينت على مهمة جديدة: ${task.title}\nالموعد النهائي: ${deadlineLabel || 'غير محدد'}\n${APP_URL}/dashboard/boards/${task.board_id}?task=${id}`, // i18n-exempt: persisted notification content
        )),
    );
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.UPDATE}`,
      `/dashboard/boards/${task.board_id}`,
      { source: 'task_assignee_add', task_id: id, added },
    );
    return apiSuccess({ added: added.length }, undefined, 201);
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_assignees_add' } });
    return apiServerError();
  }
}

// =============================================================
// DELETE /api/tasks/[id]/assignees?username=xxx
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

    const username = req.nextUrl.searchParams.get('username');
    if (!username || !username.trim() || username !== username.trim()) {
      return apiValidationError(t('common.usernameRequired'));
    }

    const supabase = await createServerSupabaseClient();
    const { data: taskData, error: taskError } = await supabase
      .from('pyra_tasks')
      .select('id, title, board_id, due_date, due_at, updated_at')
      .eq('id', id)
      .single();
    const task = taskData as TaskAssigneeSnapshot | null;
    if (taskError || !task) return apiNotFound(t('common.taskNotFound'));
    if (!(await checkBoardScope(task.board_id, auth))) {
      return apiForbidden(t('common.noAccessTask'));
    }

    const serviceSupabase = createServiceRoleClient();
    const { data: rpcRows, error: rpcError } = await serviceSupabase.rpc(
      'pyra_remove_task_assignee_atomic',
      {
        p_task_id: id,
        p_expected_board_id: task.board_id,
        p_expected_updated_at: task.updated_at,
        p_username: username,
        p_removed_by: auth.pyraUser.username,
        p_actor_display_name: auth.pyraUser.display_name,
        p_activity_id: generateId('tl'),
      },
    );
    if (rpcError) {
      logError({
        error: rpcError,
        request: req,
        metadata: { action: 'task_assignee_remove_rpc', task_id: id },
      });
      return apiServerError();
    }

    const result = parseAtomicResult(rpcRows);
    if (!result) {
      logError({
        error: new Error('Atomic assignee remove RPC returned no result'),
        request: req,
        metadata: { action: 'task_assignee_remove_rpc_empty', task_id: id },
      });
      return apiServerError();
    }
    switch (result.status) {
      case ATOMIC_TASK_WRITE_STATUSES.OK:
        break;
      case ATOMIC_TASK_WRITE_STATUSES.TASK_NOT_FOUND:
        return apiNotFound(t('common.taskNotFound'));
      case ATOMIC_TASK_WRITE_STATUSES.TASK_WRITE_CONFLICT:
        return apiError(t('tasks.taskTransitionConflict'), 409);
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_ASSIGNEES:
      case ATOMIC_TASK_WRITE_STATUSES.INVALID_TASK_INPUT:
        return apiValidationError(t('common.usernameRequired'));
      default:
        logError({
          error: new Error(`Unexpected atomic assignee remove status: ${String(result.status)}`),
          request: req,
          metadata: { action: 'task_assignee_remove_rpc_status', task_id: id },
        });
        return apiServerError();
    }

    const removed = typeof result.mutation?.removed === 'string'
      ? result.mutation.removed
      : null;
    if (removed) {
      invalidateScopeCache(removed);
      logActivity(
        auth.pyraUser.username,
        auth.pyraUser.display_name,
        `${ENTITY_TYPES.TASK}_${ACTIVITY_ACTIONS.UPDATE}`,
        `/dashboard/boards/${task.board_id}`,
        { source: 'task_assignee_remove', task_id: id, removed },
      );
    }
    return apiSuccess({ removed: removed ?? username });
  } catch (err) {
    logError({ error: err, request: req, metadata: { action: 'task_assignee_remove' } });
    return apiServerError();
  }
}
