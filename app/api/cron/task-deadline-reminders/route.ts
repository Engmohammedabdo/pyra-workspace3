import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';
import {
  isDeadlineOverdue,
  isUnverifiedProductionDeadline,
  isoToDubaiDateTime,
  legacyDubaiDayEndToIso,
} from '@/lib/production/deadlines';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/task-deadline-reminders
// Auth: x-api-key → pyra_api_keys; permission cron.task-deadline-reminders or *
// Schedule: daily 09:00 Asia/Dubai via n8n Schedule Trigger → HTTP Request
//
// Scope: tasks on PIPELINE boards only (is_pipeline=true), with an exact or
// legacy deadline, not archived, not in a done column.
// Buckets: overdue / due today / due tomorrow (Dubai days).
// Dedup: one reminder per task per Dubai day via pyra_notifications
// (type IN task_due_soon|task_overdue, entity_id = task id, created today).
// WhatsApp failure never blocks the in-app notify (graceful degradation).
// ────────────────────────────────────────────────────────────────────────────

interface AssigneeRow { username: string }
interface TaskRow {
  id: string;
  title: string;
  board_id: string;
  column_id: string;
  due_date: string | null;
  due_at: string | null;
  production_deadline_exempt: boolean;
  is_archived: boolean | null;
  pyra_task_assignees: AssigneeRow[] | null;
}

const TASK_PAGE_SIZE = 500;

export async function POST(request: NextRequest) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.task-deadline-reminders') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.task-deadline-reminders', 403);
    }

    const supabase = createServiceRoleClient();
    const now = new Date();
    const nowIso = now.toISOString();
    const todayKey = dubaiDayKey(now);
    const tomorrowKey = dubaiDayKey(new Date(now.getTime() + 86_400_000));
    const tomorrowEndIso = legacyDubaiDayEndToIso(tomorrowKey);
    if (!tomorrowEndIso) throw new Error('Could not resolve the Dubai reminder window');
    const dayStartUtcIso = new Date(Date.parse(`${todayKey}T00:00:00+04:00`)).toISOString();

    const { data: boards } = await supabase
      .from('pyra_boards')
      .select('id, pyra_board_columns(id, is_done_column)')
      .eq('is_pipeline', true);
    const boardIds = (boards || []).map((b) => b.id);
    if (!boardIds.length) return apiSuccess({ processed: 0 });

    const doneCols = new Set<string>();
    for (const b of boards || []) {
      for (const c of (b.pyra_board_columns as Array<{ id: string; is_done_column: boolean | null }>) || []) {
        if (c.is_done_column) doneCols.add(c.id);
      }
    }

    // Server-filter the exact/legacy deadline window and keyset-paginate it.
    // The legacy branch is deliberately gated by due_at IS NULL: invalid or
    // otherwise present exact data must never silently fall back to due_date.
    const tasks: TaskRow[] = [];
    let lastTaskId: string | null = null;
    while (true) {
      let taskQuery = supabase
        .from('pyra_tasks')
        .select('id, title, board_id, column_id, due_date, due_at, production_deadline_exempt, is_archived, pyra_task_assignees(username)')
        .in('board_id', boardIds)
        .eq('production_deadline_exempt', false)
        .or(`due_at.lte.${tomorrowEndIso},and(due_at.is.null,due_date.lte.${tomorrowKey})`)
        .order('id', { ascending: true })
        .limit(TASK_PAGE_SIZE);
      if (lastTaskId !== null) taskQuery = taskQuery.gt('id', lastTaskId);

      const { data: taskPage, error: taskPageError } = await taskQuery;
      if (taskPageError) throw taskPageError;
      const page = (taskPage as TaskRow[]) || [];
      tasks.push(...page);
      if (page.length < TASK_PAGE_SIZE) break;
      lastTaskId = page[page.length - 1].id;
    }

    let processed = 0;
    for (const task of tasks) {
      try {
        if (
          isUnverifiedProductionDeadline({
            dueDate: task.due_date,
            dueAt: task.due_at,
            deadlineExempt: task.production_deadline_exempt,
          })
          || task.is_archived
          || doneCols.has(task.column_id)
        ) continue;

        const effectiveDeadline = task.due_at !== null
          ? task.due_at
          : task.due_date
            ? legacyDubaiDayEndToIso(task.due_date)
            : null;
        const dubaiDeadline = effectiveDeadline
          ? isoToDubaiDateTime(effectiveDeadline)
          : null;
        if (!effectiveDeadline || !dubaiDeadline) continue;

        const bucket = isDeadlineOverdue(effectiveDeadline, nowIso)
          ? 'overdue'
          : dubaiDeadline.date === todayKey
            ? 'today'
            : dubaiDeadline.date === tomorrowKey
              ? 'tomorrow'
              : null;
        if (!bucket) continue;
        const type = bucket === 'overdue' ? 'task_overdue' : 'task_due_soon';

        // dedup: one reminder per task per Dubai day
        const { count } = await supabase
          .from('pyra_notifications')
          .select('id', { count: 'exact', head: true })
          .eq('entity_id', task.id)
          .in('type', ['task_due_soon', 'task_overdue'])
          .gte('created_at', dayStartUtcIso);
        if ((count || 0) > 0) continue;

        const assignees = (task.pyra_task_assignees || []).map((a) => a.username);
        if (!assignees.length) continue;

        const deadlineText = task.due_at !== null
          ? `${dubaiDeadline.date} ${dubaiDeadline.time} (UTC+4)`
          : task.due_date!;
        const label = bucket === 'overdue'
          ? `متأخرة عن موعدها (${deadlineText})` // i18n-exempt: persisted Arabic deadline notification
          : bucket === 'today'
            ? `موعد تسليمها اليوم (${deadlineText})` // i18n-exempt: persisted Arabic deadline notification
            : `موعد تسليمها غداً (${deadlineText})`; // i18n-exempt: persisted Arabic deadline notification
        const title = bucket === 'overdue' ? `⚠️ مهمة متأخرة: ${task.title}` : `⏰ تذكير موعد: ${task.title}`; // i18n-exempt: persisted Arabic deadline notification
        const link = `/dashboard/boards/${task.board_id}?task=${task.id}`;

        await notifyMany(supabase, assignees, {
          type,
          title,
          message: `المهمة "${task.title}" ${label} — ارفع نسخة للمراجعة`, // i18n-exempt: persisted Arabic deadline notification
          link,
          entity: { type: 'task', id: task.id },
        });
        for (const u of assignees) {
          await sendWhatsAppToUser(supabase, u, `${title}\n${label}\n${APP_URL}${link}`);
        }

        if (bucket === 'overdue') {
          const { data: adminRows } = await supabase
            .from('pyra_users')
            .select('username')
            .eq('role', 'admin')
            .eq('status', 'active');
          await notifyMany(supabase, (adminRows || []).map((a) => a.username), {
            type: 'task_overdue',
            title: `مهمة متأخرة: ${task.title}`, // i18n-exempt: persisted Arabic deadline notification
            message: `تجاوزت موعد التسليم (${deadlineText}) — المسؤول: ${assignees.join('، ')}`, // i18n-exempt: persisted Arabic deadline notification
            link,
            entity: { type: 'task', id: task.id },
          });
        }
        processed++;
      } catch (rowErr) {
        logError({ error: rowErr, request, metadata: { action: 'task-deadline-reminder-row', task_id: task.id } });
      }
    }

    return apiSuccess({ processed });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'task-deadline-reminders' } });
    console.error('[cron/task-deadline-reminders] threw:', err);
    return apiServerError();
  }
}
