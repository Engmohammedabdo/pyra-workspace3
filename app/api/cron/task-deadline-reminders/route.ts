import { NextRequest } from 'next/server';
import { getExternalAuth } from '@/lib/api/external-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { notifyMany } from '@/lib/notifications/notify';
import { sendWhatsAppToUser, APP_URL } from '@/lib/notifications/whatsapp';
import { logError } from '@/lib/observability/log-error';
import { dubaiDayKey } from '@/lib/utils/format';

// ────────────────────────────────────────────────────────────────────────────
// POST /api/cron/task-deadline-reminders
// Auth: x-api-key → pyra_api_keys; permission cron.task-deadline-reminders or *
// Schedule: daily 09:00 Asia/Dubai via n8n Schedule Trigger → HTTP Request
//
// Scope: tasks on PIPELINE boards only (is_pipeline=true), with a due_date,
// not archived, not in a done column.
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
  due_date: string;
  is_archived: boolean | null;
  pyra_task_assignees: AssigneeRow[] | null;
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getExternalAuth(request);
    if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
    const perms = ctx.apiKey.permissions;
    if (!perms.includes('cron.task-deadline-reminders') && !perms.includes('*')) {
      return apiError('المفتاح لا يملك صلاحية cron.task-deadline-reminders', 403);
    }

    const supabase = createServiceRoleClient();
    const todayKey = dubaiDayKey();
    const tomorrowKey = dubaiDayKey(new Date(Date.now() + 86_400_000));
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

    const { data: tasks } = await supabase
      .from('pyra_tasks')
      .select('id, title, board_id, column_id, due_date, is_archived, pyra_task_assignees(username)')
      .in('board_id', boardIds)
      .not('due_date', 'is', null)
      .lte('due_date', tomorrowKey);

    let processed = 0;
    for (const task of (tasks as TaskRow[]) || []) {
      try {
        if (task.is_archived || doneCols.has(task.column_id)) continue;

        const bucket =
          task.due_date < todayKey ? 'overdue'
          : task.due_date === todayKey ? 'today'
          : 'tomorrow';
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

        const label =
          bucket === 'overdue' ? `متأخرة عن موعدها (${task.due_date})`
          : bucket === 'today' ? 'موعد تسليمها اليوم'
          : 'موعد تسليمها غداً';
        const title = bucket === 'overdue' ? `⚠️ مهمة متأخرة: ${task.title}` : `⏰ تذكير موعد: ${task.title}`;
        const link = `/dashboard/boards/${task.board_id}?task=${task.id}`;

        await notifyMany(supabase, assignees, {
          type,
          title,
          message: `المهمة "${task.title}" ${label} — ارفع نسخة للمراجعة`,
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
            title: `مهمة متأخرة: ${task.title}`,
            message: `تجاوزت موعد التسليم (${task.due_date}) — المسؤول: ${assignees.join('، ')}`,
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
