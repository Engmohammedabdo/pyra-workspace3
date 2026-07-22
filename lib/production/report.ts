// Server-side aggregation for the productivity report. Callers pass a
// service-role client AFTER their own permission gate (hr.view / productivity.view).
import type { SupabaseClient } from '@supabase/supabase-js';
import { dubaiDayKey } from '@/lib/utils/format';
import { DEFAULT_WORK_DAYS } from '@/lib/constants/auth';
import {
  PRODUCTION_ATTRIBUTION_STATUS,
  PRODUCTION_BOARD_ID,
} from '@/lib/constants/production';
import { resolveProductionAttribution } from './attribution';
import {
  buildTaskJourney,
  nextOpenDeadlineAt,
  summarizeEmployee,
  type EmployeeProductivity,
  type ProductionTaskInput,
  type QualityReviewDecisionEvent,
  type StageEvent,
  type TaskJourney,
} from './metrics';
import {
  normalizeReviewDecisionQualityEvent,
  type TaskReviewDecisionQualityInput,
} from './quality';

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
  /** Reviewed/current tasks that cannot truthfully be assigned to an employee. */
  unattributed_tasks: TaskJourney[];
  next_open_deadline_at: string | null;
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
  unattributedJourneys: TaskJourney[];
  allJourneys: TaskJourney[];
  qualityDecisions: QualityReviewDecisionEvent[];
}

interface BoardColumnRow {
  id: string;
  column_type: string | null;
  is_done_column: boolean | null;
}

interface ProductionTaskRow {
  id: string;
  title: string;
  board_id: string;
  due_date: string | null;
  due_at: string | null;
  created_at: string;
  is_archived: boolean | null;
  production_deadline_exempt: boolean;
  pyra_task_assignees: Array<{ username: string }> | null;
}

interface ReviewDecisionRow extends TaskReviewDecisionQualityInput {}

interface WorkScheduleRow {
  id: string;
  work_days: unknown;
}

interface AttendanceRow {
  id: string;
  username: string;
  status: string | null;
  total_hours: number | null;
}

interface ProductivityPageResult<T> {
  data: T[] | null;
  error: unknown;
}

const PRODUCTIVITY_PAGE_SIZE = 500;
const PRODUCTIVITY_ID_CHUNK_SIZE = 200;

function supabaseErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === 'object' && 'message' in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

/** Fetch every page and throw on the first database error (never return partial evidence). */
export async function fetchAllProductivityPages<T>(
  loadPage: (
    from: number,
    to: number,
  ) => PromiseLike<ProductivityPageResult<T>> | Promise<ProductivityPageResult<T>>,
  pageSize = PRODUCTIVITY_PAGE_SIZE,
  context = 'productivity query',
): Promise<T[]> {
  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error(`${context}: invalid page size`);
  }

  const rows: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const result = await loadPage(from, from + pageSize - 1);
    if (result.error) {
      throw new Error(`${context}: ${supabaseErrorMessage(result.error)}`);
    }
    const page = result.data || [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

function chunksOf<T>(values: readonly T[], size = PRODUCTIVITY_ID_CHUNK_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
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

export function nextOpenDeadlineForReportMonth(
  journeys: readonly TaskJourney[],
  monthKey: string,
  currentInstant: string,
): string | null {
  const now = new Date(currentInstant);
  if (Number.isNaN(now.getTime()) || dubaiDayKey(now).slice(0, 7) !== monthKey) return null;
  return nextOpenDeadlineAt(journeys, currentInstant);
}

async function loadProductivityJourneys(
  supabase: SupabaseClient,
  usernames?: string[],
  includeUnattributed = usernames === undefined,
): Promise<LoadedProductivityJourneys> {
  const boards = await fetchAllProductivityPages<{ id: string }>(
    (from, to) => supabase
      .from('pyra_boards')
      .select('id')
      .eq('id', PRODUCTION_BOARD_ID)
      .order('id')
      .range(from, to),
    PRODUCTIVITY_PAGE_SIZE,
    'production board',
  );
  if (boards.length !== 1) {
    throw new Error(`production board: ${PRODUCTION_BOARD_ID} is missing or duplicated`);
  }

  const columns = await fetchAllProductivityPages<BoardColumnRow>(
    (from, to) => supabase
      .from('pyra_board_columns')
      .select('id, column_type, is_done_column')
      .eq('board_id', PRODUCTION_BOARD_ID)
      .order('position')
      .order('id')
      .range(from, to),
    PRODUCTIVITY_PAGE_SIZE,
    'production columns',
  );
  const reviewColumn = columns.find((column) => column.column_type === 'review');
  const doneColumn = columns.find((column) => column.is_done_column);
  if (!reviewColumn || !doneColumn) {
    throw new Error('production columns: review or done column is missing');
  }

  // History is scoped by its immutable production board id, so reviewed work
  // remains reportable after a later cross-board move.
  const events = await fetchAllProductivityPages<StageEvent>(
    (from, to) => supabase
      .from('pyra_task_stage_history')
      .select(
        'id, task_id, board_id, from_column_id, to_column_id, created_at, due_at_snapshot, task_created_at_snapshot, assignees_snapshot',
      )
      .eq('board_id', PRODUCTION_BOARD_ID)
      .order('created_at')
      .order('id')
      .range(from, to),
    PRODUCTIVITY_PAGE_SIZE,
    'production history',
  );

  const currentTasks = await fetchAllProductivityPages<ProductionTaskRow>(
    (from, to) => supabase
      .from('pyra_tasks')
      .select(
        'id, title, board_id, due_date, due_at, created_at, is_archived, production_deadline_exempt, pyra_task_assignees(username)',
      )
      .eq('board_id', PRODUCTION_BOARD_ID)
      .order('id')
      .range(from, to),
    PRODUCTIVITY_PAGE_SIZE,
    'current production tasks',
  );

  const tasksById = new Map(currentTasks.map((task) => [task.id, task]));
  const reviewedHistoricalIds = [...new Set(
    events
      .filter((event) => event.to_column_id === reviewColumn.id)
      .map((event) => event.task_id),
  )].filter((taskId) => !tasksById.has(taskId));

  // PostgREST `.in(...)` URLs are bounded; fetch moved historical tasks in
  // deterministic chunks rather than issuing one oversized request.
  for (const taskIdChunk of chunksOf(reviewedHistoricalIds)) {
    const historicalTasks = await fetchAllProductivityPages<ProductionTaskRow>(
      (from, to) => supabase
        .from('pyra_tasks')
        .select(
          'id, title, board_id, due_date, due_at, created_at, is_archived, production_deadline_exempt, pyra_task_assignees(username)',
        )
        .in('id', taskIdChunk)
        .order('id')
        .range(from, to),
      PRODUCTIVITY_PAGE_SIZE,
      'historical production tasks',
    );
    for (const task of historicalTasks) tasksById.set(task.id, task);
  }

  const reviewDecisions = await fetchAllProductivityPages<ReviewDecisionRow>(
    (from, to) => supabase
      .from('pyra_task_review_decisions')
      .select('history_id, task_id, board_id, action, rejection_kind, decided_at')
      .eq('board_id', PRODUCTION_BOARD_ID)
      .order('decided_at')
      .order('history_id')
      .range(from, to),
    PRODUCTIVITY_PAGE_SIZE,
    'production review decisions',
  );

  const eventsById = new Map(
    events
      .filter((event): event is StageEvent & { id: string } => typeof event.id === 'string')
      .map((event) => [event.id, event]),
  );
  const qualityDecisions = reviewDecisions.map((decision) =>
    normalizeReviewDecisionQualityEvent(
      decision,
      eventsById.get(decision.history_id),
      PRODUCTION_BOARD_ID,
      reviewColumn.id,
    ),
  );

  const eventsByTask = new Map<string, StageEvent[]>();
  for (const event of events) {
    const taskEvents = eventsByTask.get(event.task_id) || [];
    taskEvents.push(event);
    eventsByTask.set(event.task_id, taskEvents);
  }

  const requestedUsernames = usernames?.length ? new Set(usernames) : null;
  const taskInputsByUser = new Map<string, ProductionTaskInput[]>();
  const unattributedInputsByTask = new Map<string, ProductionTaskInput>();

  for (const task of tasksById.values()) {
    const taskEvents = eventsByTask.get(task.id) || [];
    const firstReviewEvent = taskEvents.find(
      (event) => event.to_column_id === reviewColumn.id,
    ) || null;
    if (task.board_id !== PRODUCTION_BOARD_ID && !firstReviewEvent) continue;

    const currentAssignees = (task.pyra_task_assignees || []).map(
      (assignee) => assignee.username,
    );
    const attribution = resolveProductionAttribution({
      currentAssignees,
      currentTaskCreatedAt: task.created_at,
      firstReviewEvent,
    });
    const baseInput = {
      id: task.id,
      title: task.title,
      due_date: task.due_date,
      due_at: task.due_at,
      production_deadline_exempt: task.production_deadline_exempt,
      created_at: attribution.taskCreatedAt || task.created_at,
      review_column_id: reviewColumn.id,
      done_column_id: doneColumn.id,
      is_archived: task.is_archived,
      attribution_status: attribution.status,
    } satisfies Omit<ProductionTaskInput, 'assignee'>;

    if (attribution.assignees.length === 0) {
      // Admin reports retain a separate unowned copy because current
      // assignment cannot prove who owned reviewed legacy work.
      if (!requestedUsernames || includeUnattributed) {
        unattributedInputsByTask.set(task.id, { ...baseInput, assignee: null });
      }
    }

    // A legacy reviewed task may still be shown to its exact current
    // assignee for transparency. Its LEGACY_UNVERIFIED status makes
    // summarizeEmployee exclude it from delivery and quality metrics.
    for (const assignee of attribution.visibilityAssignees) {
      if (requestedUsernames && !requestedUsernames.has(assignee)) continue;
      const input: ProductionTaskInput = { ...baseInput, assignee };
      const assignedTasks = taskInputsByUser.get(assignee) || [];
      assignedTasks.push(input);
      taskInputsByUser.set(assignee, assignedTasks);
    }
  }

  const candidateUserList = requestedUsernames
    ? [...requestedUsernames]
    : [...taskInputsByUser.keys()].sort();
  const users: UserRow[] = [];
  for (const usernameChunk of chunksOf(candidateUserList)) {
    users.push(...await fetchAllProductivityPages<UserRow>(
      (from, to) => supabase
        .from('pyra_users')
        .select('username, display_name, work_schedule_id, hire_date')
        .in('username', usernameChunk)
        .order('username')
        .range(from, to),
      PRODUCTIVITY_PAGE_SIZE,
      'productivity users',
    ));
  }

  // A snapshot/current assignment is not a resolvable employee identity until
  // the username exists in pyra_users. Keep valid co-assignees, but move one
  // defensive copy per affected task to admin-only unowned evidence. Never
  // fabricate a historical owner from the other assignees.
  const resolvedUsernames = new Set(users.map((user) => user.username));
  for (const [username, inputs] of taskInputsByUser) {
    if (resolvedUsernames.has(username)) continue;
    taskInputsByUser.delete(username);
    if (requestedUsernames && !includeUnattributed) continue;
    for (const input of inputs) {
      if (unattributedInputsByTask.has(input.id)) continue;
      unattributedInputsByTask.set(input.id, {
        ...input,
        assignee: null,
        attribution_status: PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
      });
    }
  }
  const userList = candidateUserList.filter((username) => resolvedUsernames.has(username));

  const journeysByUser = new Map<string, TaskJourney[]>();
  for (const username of userList) {
    const journeys = (taskInputsByUser.get(username) || [])
      .map((task) => buildTaskJourney(task, eventsByTask.get(task.id) || []))
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    journeysByUser.set(username, journeys);
  }
  const unattributedJourneys = [...unattributedInputsByTask.values()]
    .map((task) => buildTaskJourney(task, eventsByTask.get(task.id) || []))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const attributedJourneys = [...journeysByUser.values()].flat();

  return {
    userList,
    users,
    journeysByUser,
    unattributedJourneys,
    // Company trends are still employee-attributed metrics. Keep unowned
    // evidence visible in the response, but never turn it into money input.
    allJourneys: attributedJourneys,
    qualityDecisions,
  };
}

export async function computeProductivity(
  supabase: SupabaseClient,
  monthKey: string,
  usernames?: string[],
  includeUnattributed = usernames === undefined,
): Promise<ProductivityReport> {
  const loaded = await loadProductivityJourneys(
    supabase,
    usernames,
    includeUnattributed,
  );

  const scheduleIds = [
    ...new Set(loaded.users.map((u) => u.work_schedule_id).filter(Boolean)),
  ] as string[];
  const schedules: WorkScheduleRow[] = [];
  for (const scheduleIdChunk of chunksOf(scheduleIds)) {
    schedules.push(...await fetchAllProductivityPages<WorkScheduleRow>(
      (from, to) => supabase
        .from('pyra_work_schedules')
        .select('id, work_days')
        .in('id', scheduleIdChunk)
        .order('id')
        .range(from, to),
      PRODUCTIVITY_PAGE_SIZE,
      'productivity work schedules',
    ));
  }

  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const attendance: AttendanceRow[] = [];
  for (const usernameChunk of chunksOf(loaded.userList)) {
    attendance.push(...await fetchAllProductivityPages<AttendanceRow>(
      (from, to) => supabase
        .from('pyra_attendance')
        .select('id, username, status, total_hours')
        .in('username', usernameChunk)
        .gte('date', `${monthKey}-01`)
        .lte('date', `${monthKey}-${String(lastDay).padStart(2, '0')}`)
        .order('id')
        .range(from, to),
      PRODUCTIVITY_PAGE_SIZE,
      'productivity attendance',
    ));
  }

  const now = new Date();
  const todayKey = dubaiDayKey(now);
  const currentInstant = now.toISOString();
  const employees: EmployeeReport[] = loaded.userList.map((username) => {
    const journeys = loaded.journeysByUser.get(username) || [];
    const rows = attendance.filter((row) => row.username === username);
    const user = loaded.users.find((u) => u.username === username);
    const workDays =
      (schedules.find((s) => s.id === user?.work_schedule_id)
        ?.work_days as number[]) || [...DEFAULT_WORK_DAYS];
    const presentDays = rows.filter((r) => r.status === 'present').length;
    const lateDays = rows.filter((r) => r.status === 'late').length;
    const hireDateKey = user?.hire_date ? String(user.hire_date).slice(0, 10) : null;
    const expected = countExpectedWorkDays(workDays, monthKey, todayKey, hireDateKey);
    return {
      username,
      display_name: user?.display_name || username,
      metrics: summarizeEmployee(
        journeys,
        monthKey,
        currentInstant,
        loaded.qualityDecisions,
      ),
      attendance: {
        present_days: presentDays,
        late_days: lateDays,
        absent_days: Math.max(0, expected - (presentDays + lateDays)),
        total_hours:
          Math.round(rows.reduce((sum, row) => sum + Number(row.total_hours || 0), 0) * 10) / 10,
      },
      tasks: journeys,
    };
  });

  return {
    month: monthKey,
    employees,
    unattributed_tasks: loaded.unattributedJourneys,
    next_open_deadline_at: nextOpenDeadlineForReportMonth(
      loaded.allJourneys,
      monthKey,
      currentInstant,
    ),
  };
}

export async function computeProductivityTrends(
  supabase: SupabaseClient,
  months = 6,
  usernames?: string[],
): Promise<ProductivityTrends> {
  const loaded = await loadProductivityJourneys(supabase, usernames);
  const currentInstant = new Date().toISOString();
  return {
    months: lastNMonthKeys(months).map((month) => ({
      month,
      ...summarizeEmployee(
        loaded.allJourneys,
        month,
        currentInstant,
        loaded.qualityDecisions,
      ),
    })),
  };
}
