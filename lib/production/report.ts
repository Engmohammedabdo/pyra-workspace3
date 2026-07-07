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

export interface ProductivityReport {
  month: string;
  employees: EmployeeReport[];
}

export interface ProductivityTrendPoint extends EmployeeProductivity {
  month: string;
}

export interface ProductivityTrends {
  months: ProductivityTrendPoint[];
}

interface UserRow {
  username: string;
  display_name: string | null;
  work_schedule_id: string | null;
  hire_date: string | null;
}

interface LoadedProductivityJourneys {
  userList: string[];
  users: UserRow[];
  journeysByUser: Map<string, TaskJourney[]>;
  allJourneys: TaskJourney[];
}

/**
 * Expected work days in the month UP TO todayKey, given a schedule's work_days.
 * `hireDateKey` (YYYY-MM-DD), when provided, excludes days before the employee
 * was hired, matching the payroll pro-ration doctrine.
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

function shiftMonth(monthKey: string, delta: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function lastNMonthKeys(count: number, anchorMonth = dubaiDayKey().slice(0, 7)): string[] {
  return Array.from({ length: count }, (_, i) => shiftMonth(anchorMonth, i - count + 1));
}

async function loadProductivityJourneys(
  supabase: SupabaseClient,
  usernames?: string[],
): Promise<LoadedProductivityJourneys> {
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

  if (boardCols.size === 0) {
    return { userList: [], users: [], journeysByUser: new Map(), allJourneys: [] };
  }

  const { data: tasks } = await supabase
    .from('pyra_tasks')
    .select('id, title, board_id, due_date, created_at, is_archived, pyra_task_assignees(username)')
    .in('board_id', [...boardCols.keys()]);

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
        is_archived: t.is_archived,
      });
    }
  }

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

  const taskInputsByUser = new Map<string, ProductionTaskInput[]>();
  for (const t of taskInputs) {
    const arr = taskInputsByUser.get(t.assignee) || [];
    arr.push(t);
    taskInputsByUser.set(t.assignee, arr);
  }

  const userList = usernames?.length ? usernames : [...taskInputsByUser.keys()];
  if (!userList.length) {
    return { userList: [], users: [], journeysByUser: new Map(), allJourneys: [] };
  }

  const { data: users } = await supabase
    .from('pyra_users')
    .select('username, display_name, work_schedule_id, hire_date')
    .in('username', userList);

  const journeysByUser = new Map<string, TaskJourney[]>();
  for (const username of userList) {
    const journeys = (taskInputsByUser.get(username) || [])
      .map((t) => buildTaskJourney(t, events))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    journeysByUser.set(username, journeys);
  }

  return {
    userList,
    users: (users as UserRow[]) || [],
    journeysByUser,
    allJourneys: [...journeysByUser.values()].flat(),
  };
}

export async function computeProductivity(
  supabase: SupabaseClient,
  monthKey: string,
  usernames?: string[],
): Promise<ProductivityReport> {
  const loaded = await loadProductivityJourneys(supabase, usernames);
  if (!loaded.userList.length) return { month: monthKey, employees: [] };

  const scheduleIds = [
    ...new Set(loaded.users.map((u) => u.work_schedule_id).filter(Boolean)),
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
    .in('username', loaded.userList)
    .gte('date', `${monthKey}-01`)
    .lte('date', `${monthKey}-${String(lastDay).padStart(2, '0')}`);

  const todayKey = dubaiDayKey();
  const employees: EmployeeReport[] = loaded.userList.map((username) => {
    const journeys = loaded.journeysByUser.get(username) || [];
    const rows = (att || []).filter((r) => r.username === username);
    const user = loaded.users.find((u) => u.username === username);
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

export async function computeProductivityTrends(
  supabase: SupabaseClient,
  months = 6,
  usernames?: string[],
): Promise<ProductivityTrends> {
  const loaded = await loadProductivityJourneys(supabase, usernames);
  const todayKey = dubaiDayKey();
  return {
    months: lastNMonthKeys(months).map((month) => ({
      month,
      ...summarizeEmployee(loaded.allJourneys, month, todayKey),
    })),
  };
}
