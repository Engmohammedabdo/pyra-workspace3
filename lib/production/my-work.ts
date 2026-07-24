import {
  compareIsoInstants,
  isDeadlineOverdue,
  isUnverifiedProductionDeadline,
  isoToDubaiDateTime,
  isValidIsoInstant,
  legacyDubaiDayEndToIso,
} from './deadlines';

export const MY_WORK_TASK_PAGE_SIZE = 250;

export interface MyWorkDeadlineTask {
  id: string;
  due_date: string | null;
  due_at: string | null;
  production_deadline_exempt?: boolean;
  is_done_column: boolean;
}

export interface ExactDeadlineAssignmentRow {
  task_id: string;
  pyra_tasks: {
    due_date: string | null;
    due_at: string | null;
    production_deadline_exempt?: boolean | null;
  } | Array<{
    due_date: string | null;
    due_at: string | null;
    production_deadline_exempt?: boolean | null;
  }> | null;
}

/**
 * Counts only trusted exact deadlines from an assignment join. The literal
 * migration-041 sentinel is rejected even before migration 044 backfills its
 * provenance flag, so it can never inflate an employee's overdue count.
 */
export function countVerifiedExactDeadlineRows(
  rows: readonly ExactDeadlineAssignmentRow[],
): number {
  return rows.reduce((count, row) => {
    const task = Array.isArray(row.pyra_tasks) ? row.pyra_tasks[0] : row.pyra_tasks;
    if (!task || typeof task.due_at !== 'string' || !isValidIsoInstant(task.due_at)) {
      return count;
    }
    return isUnverifiedProductionDeadline({
      dueDate: task.due_date,
      dueAt: task.due_at,
      deadlineExempt: task.production_deadline_exempt,
    }) ? count : count + 1;
  }, 0);
}

export function myWorkTaskDeadline(task: MyWorkDeadlineTask): string | null {
  if (isUnverifiedProductionDeadline({
    dueDate: task.due_date,
    dueAt: task.due_at,
    deadlineExempt: task.production_deadline_exempt,
  })) return null;
  if (task.due_at !== null) return task.due_at;
  return task.due_date ? legacyDubaiDayEndToIso(task.due_date) : null;
}

function myWorkTaskDeadlineDay(task: MyWorkDeadlineTask): string | null {
  if (isUnverifiedProductionDeadline({
    dueDate: task.due_date,
    dueAt: task.due_at,
    deadlineExempt: task.production_deadline_exempt,
  })) return task.due_date;
  if (task.due_at !== null) return isoToDubaiDateTime(task.due_at)?.date ?? null;
  return task.due_date;
}

function compareByDeadlineThenId<T extends MyWorkDeadlineTask>(a: T, b: T): number {
  const aDeadline = myWorkTaskDeadline(a);
  const bDeadline = myWorkTaskDeadline(b);
  const aValid = aDeadline !== null && isValidIsoInstant(aDeadline);
  const bValid = bDeadline !== null && isValidIsoInstant(bDeadline);

  if (aValid && bValid) {
    const exact = compareIsoInstants(aDeadline, bDeadline);
    if (exact !== null && exact !== 0) return exact;
  } else if (aValid !== bValid) {
    return aValid ? -1 : 1;
  }

  return a.id.localeCompare(b.id);
}

export function sortMyWorkTasks<T extends MyWorkDeadlineTask>(
  tasks: readonly T[],
  currentInstant: string,
): T[] {
  return [...tasks].sort((a, b) => {
    const aOverdue = isDeadlineOverdue(myWorkTaskDeadline(a), currentInstant);
    const bOverdue = isDeadlineOverdue(myWorkTaskDeadline(b), currentInstant);
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1;
    return compareByDeadlineThenId(a, b);
  });
}

export function categorizeMyWorkTasks<T extends MyWorkDeadlineTask>(
  tasks: readonly T[],
  currentInstant: string,
  todayKey: string,
  endOfWeekKey: string,
): { overdue: T[]; today: T[]; thisWeek: T[]; unverified: T[] } {
  const active = tasks.filter((task) => !task.is_done_column);
  const overdue: T[] = [];
  const today: T[] = [];
  const thisWeek: T[] = [];
  const unverified: T[] = [];

  for (const task of active) {
    if (isUnverifiedProductionDeadline({
      dueDate: task.due_date,
      dueAt: task.due_at,
      deadlineExempt: task.production_deadline_exempt,
    })) {
      unverified.push(task);
      continue;
    }

    const deadline = myWorkTaskDeadline(task);
    if (isDeadlineOverdue(deadline, currentInstant)) {
      overdue.push(task);
      continue;
    }

    const dueDay = myWorkTaskDeadlineDay(task);
    if (dueDay === todayKey) {
      today.push(task);
    } else if (dueDay !== null && dueDay > todayKey && dueDay <= endOfWeekKey) {
      thisWeek.push(task);
    }
  }

  return {
    overdue: overdue.sort(compareByDeadlineThenId),
    today: today.sort(compareByDeadlineThenId),
    thisWeek: thisWeek.sort(compareByDeadlineThenId),
    unverified: unverified.sort(compareByDeadlineThenId),
  };
}

/**
 * Loads every row from a stable, strictly ascending cursor query. The caller
 * owns the data source; this helper only enforces complete deterministic paging.
 */
export async function collectCursorPages<T>(
  loadPage: (after: string | null, pageSize: number) => Promise<readonly T[]>,
  cursorOf: (row: T) => string,
  pageSize = MY_WORK_TASK_PAGE_SIZE,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;

  while (true) {
    const page = [...await loadPage(after, pageSize)];
    if (page.length === 0) break;

    const nextCursor = cursorOf(page[page.length - 1]);
    if (after !== null && nextCursor <= after) {
      throw new Error('Cursor query did not advance');
    }

    rows.push(...page);
    if (page.length < pageSize) break;
    after = nextCursor;
  }

  return rows;
}

export function chunkValues<T>(values: readonly T[], size = MY_WORK_TASK_PAGE_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}
