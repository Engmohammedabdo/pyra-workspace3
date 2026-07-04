// Server-side aggregation for the productivity report. Callers pass a
// service-role client AFTER their own permission gate (hr.view / productivity.view).
import type { SupabaseClient } from '@supabase/supabase-js';
import { dubaiDayKey } from '@/lib/utils/format';
import { DEFAULT_WORK_DAYS } from '@/lib/constants/auth';
import {
  buildTaskJourney,
  summarizeEmployee,
  type EmployeeProductivity,
  type ProductionTaskInput,
  type StageEvent,
  type TaskJourney,
} from './metrics';

export interface EmployeeReport {
  username: string;
  display_name: string;
  metrics: EmployeeProductivity;
  attendance: {
    present_days: number;
    late_days: number;
    absent_days: number;
    total_hours: number;
  };
  tasks: TaskJourney[];
}

/**
 * Expected work days in the month UP TO todayKey, given a schedule's work_days.
 * `hireDateKey` (YYYY-MM-DD), when provided, excludes days before the employee
 * was hired — same pro-ration doctrine as `hireProrationFactor` in
 * lib/payroll/calculate-item.ts (don't count pre-hire days as absences).
 */
function countExpectedWorkDays(
  workDays: number[],
  monthKey: string,
  todayKey: string,
  hireDateKey?: string | null,
): number {
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  let expected = 0;
  for (let d = 1; d <= lastDay; d++) {
    const dateStr = `${monthKey}-${String(d).padStart(2, '0')}`;
    if (dateStr > todayKey) break;
    if (hireDateKey && dateStr < hireDateKey) continue;
    const dow = new Date(y, m - 1, d).getDay(); // 0=Sunday
    if (workDays.includes(dow)) expected++;
  }
  return expected;
}

export interface ProductivityReport {
  month: string;
  employees: EmployeeReport[];
}

export async function computeProductivity(
  supabase: SupabaseClient,
  monthKey: string,
  usernames?: string[],
): Promise<ProductivityReport> {
  // 1. pipeline boards → per-board review/done columns
  const { data: boards } = await supabase
    .from('pyra_boards')
    .select('id, pyra_board_columns(id, column_type, is_done_column)')
    .eq('is_pipeline', true);

  const boardCols = new Map<string, { review: string; done: string }>();
  for (const b of boards || []) {
    const cols =
      (b.pyra_board_columns as Array<{
        id: string;
        column_type: string | null;
        is_done_column: boolean | null;
      }>) || [];
    const review = cols.find((c) => c.column_type === 'review');
    const done = cols.find((c) => c.is_done_column);
    if (review && done) boardCols.set(b.id, { review: review.id, done: done.id });
  }
  if (boardCols.size === 0) return { month: monthKey, employees: [] };

  // 2. tasks on those boards + assignees
  const { data: tasks } = await supabase
    .from('pyra_tasks')
    .select('id, title, board_id, due_date, created_at, pyra_task_assignees(username)')
    .in('board_id', [...boardCols.keys()])
    .eq('is_archived', false);

  const taskInputs: ProductionTaskInput[] = [];
  for (const t of tasks || []) {
    const cols = boardCols.get(t.board_id);
    if (!cols) continue;
    const assignees = ((t.pyra_task_assignees as Array<{ username: string }>) || []).map(
      (a) => a.username,
    );
    for (const assignee of assignees) {
      if (usernames && !usernames.includes(assignee)) continue;
      taskInputs.push({
        id: t.id,
        title: t.title,
        assignee,
        due_date: t.due_date,
        created_at: t.created_at,
        review_column_id: cols.review,
        done_column_id: cols.done,
      });
    }
  }

  // 3. stage events for those tasks
  const taskIds = [...new Set(taskInputs.map((t) => t.id))];
  let events: StageEvent[] = [];
  if (taskIds.length) {
    const { data } = await supabase
      .from('pyra_task_stage_history')
      .select('task_id, from_column_id, to_column_id, created_at')
      .in('task_id', taskIds)
      .order('created_at');
    events = (data as StageEvent[]) || [];
  }

  // 4. group per employee
  const byUser = new Map<string, ProductionTaskInput[]>();
  for (const t of taskInputs) {
    const arr = byUser.get(t.assignee) || [];
    arr.push(t);
    byUser.set(t.assignee, arr);
  }
  const userList = usernames?.length ? usernames : [...byUser.keys()];
  if (!userList.length) return { month: monthKey, employees: [] };

  // 5. display names + schedules + month attendance
  const { data: users } = await supabase
    .from('pyra_users')
    .select('username, display_name, work_schedule_id, hire_date')
    .in('username', userList);

  const scheduleIds = [
    ...new Set((users || []).map((u) => u.work_schedule_id).filter(Boolean)),
  ] as string[];
  const { data: schedules } = scheduleIds.length
    ? await supabase
        .from('pyra_work_schedules')
        .select('id, work_days')
        .in('id', scheduleIds)
    : { data: [] as Array<{ id: string; work_days: unknown }> };

  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const { data: att } = await supabase
    .from('pyra_attendance')
    .select('username, status, total_hours')
    .in('username', userList)
    .gte('date', `${monthKey}-01`)
    .lte('date', `${monthKey}-${String(lastDay).padStart(2, '0')}`);

  const todayKey = dubaiDayKey();
  const employees: EmployeeReport[] = userList.map((username) => {
    const journeys = (byUser.get(username) || [])
      .map((t) => buildTaskJourney(t, events))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const rows = (att || []).filter((r) => r.username === username);
    const user = users?.find((u) => u.username === username);
    const workDays =
      ((schedules || []).find((s) => s.id === user?.work_schedule_id)
        ?.work_days as number[]) || [...DEFAULT_WORK_DAYS];
    const presentDays = rows.filter((r) => r.status === 'present').length;
    const lateDays = rows.filter((r) => r.status === 'late').length;
    const hireDateKey = user?.hire_date ? String(user.hire_date).slice(0, 10) : null;
    const expected = countExpectedWorkDays(workDays, monthKey, todayKey, hireDateKey);
    return {
      username,
      display_name: user?.display_name || username,
      metrics: summarizeEmployee(journeys, monthKey, todayKey),
      attendance: {
        present_days: presentDays,
        late_days: lateDays,
        absent_days: Math.max(0, expected - (presentDays + lateDays)),
        total_hours:
          Math.round(rows.reduce((s, r) => s + (r.total_hours || 0), 0) * 10) / 10,
      },
      tasks: journeys,
    };
  });

  return { month: monthKey, employees };
}
