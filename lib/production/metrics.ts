// Pure functions — NO DB access, NO side effects (mirrors lib/hr/overview-helpers.ts).
// Source of truth for all numbers = pyra_task_stage_history events.
import { dubaiDayKey } from '@/lib/utils/format';

export interface StageEvent {
  task_id: string;
  from_column_id: string | null;
  to_column_id: string;
  created_at: string; // UTC ISO
}

export interface ProductionTaskInput {
  id: string;
  title: string;
  assignee: string;
  due_date: string | null; // YYYY-MM-DD (date-only)
  created_at: string;      // UTC ISO
  review_column_id: string;
  done_column_id: string;
}

export interface TaskJourney {
  task_id: string;
  title: string;
  assignee: string;
  due_date: string | null;
  created_at: string;
  first_submitted_at: string | null;
  delivered_at: string | null;
  review_rounds: number;
  /** one entry per DECIDED round (entered review → left review), in hours */
  review_wait_hours: number[];
  /** null = no due date OR not yet submitted */
  on_time: boolean | null;
  /** whole days late (>0 only when on_time === false) */
  delay_days: number | null;
  days_to_first_submission: number | null;
}

export interface EmployeeProductivity {
  deliveries: number;
  on_time_pct: number | null;
  late_count: number;
  avg_delay_days: number | null;
  avg_rounds: number | null;
  avg_days_to_first_submission: number | null;
  avg_review_wait_hours: number | null;
  /** due date passed, never submitted, not delivered */
  open_overdue: number;
}

const HOUR = 3_600_000;
const DAY = 86_400_000;

function monthOf(iso: string): string {
  return dubaiDayKey(new Date(iso)).slice(0, 7);
}

function avg(nums: number[], digits = 1): number | null {
  if (!nums.length) return null;
  const f = 10 ** digits;
  return Math.round((nums.reduce((s, n) => s + n, 0) / nums.length) * f) / f;
}

export function buildTaskJourney(
  task: ProductionTaskInput,
  events: StageEvent[],
): TaskJourney {
  const mine = events
    .filter((e) => e.task_id === task.id)
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

  const reviewEntries = mine.filter((e) => e.to_column_id === task.review_column_id);
  const firstSubmitted = reviewEntries[0]?.created_at ?? null;
  const delivered = mine.find((e) => e.to_column_id === task.done_column_id)?.created_at ?? null;

  const waits: number[] = [];
  let searchFrom = 0;
  for (const entry of reviewEntries) {
    const entryIdx = mine.indexOf(entry);
    const startIdx = Math.max(entryIdx + 1, searchFrom);
    let decisionIdx = -1;
    for (let i = startIdx; i < mine.length; i++) {
      if (mine[i].from_column_id === task.review_column_id) {
        decisionIdx = i;
        break;
      }
    }
    if (decisionIdx === -1) continue;
    searchFrom = decisionIdx + 1;
    waits.push(
      Math.round(((Date.parse(mine[decisionIdx].created_at) - Date.parse(entry.created_at)) / HOUR) * 10) / 10,
    );
  }

  let onTime: boolean | null = null;
  let delayDays: number | null = null;
  if (task.due_date && firstSubmitted) {
    const submittedDay = dubaiDayKey(new Date(firstSubmitted));
    onTime = submittedDay <= task.due_date;
    if (!onTime) {
      delayDays = Math.round((Date.parse(submittedDay) - Date.parse(task.due_date)) / DAY);
    }
  }

  return {
    task_id: task.id,
    title: task.title,
    assignee: task.assignee,
    due_date: task.due_date,
    created_at: task.created_at,
    first_submitted_at: firstSubmitted,
    delivered_at: delivered,
    review_rounds: reviewEntries.length,
    review_wait_hours: waits,
    on_time: onTime,
    delay_days: delayDays,
    days_to_first_submission: firstSubmitted
      ? Math.max(0, Math.round(((Date.parse(firstSubmitted) - Date.parse(task.created_at)) / DAY) * 10) / 10)
      : null,
  };
}

export function summarizeEmployee(
  journeys: TaskJourney[],
  monthKey: string, // 'YYYY-MM'
  todayKey: string, // dubaiDayKey()
): EmployeeProductivity {
  const deliveredInMonth = journeys.filter(
    (j) => j.delivered_at && monthOf(j.delivered_at) === monthKey,
  );
  const submittedInMonth = journeys.filter(
    (j) => j.first_submitted_at && monthOf(j.first_submitted_at) === monthKey,
  );

  // a task is "active this month" if it was delivered OR first-submitted in it
  const active = new Map<string, TaskJourney>();
  for (const j of [...deliveredInMonth, ...submittedInMonth]) active.set(j.task_id, j);
  const activeJourneys = [...active.values()];

  const onTimeEligible = activeJourneys.filter((j) => j.on_time !== null);
  const onTimeCount = onTimeEligible.filter((j) => j.on_time === true).length;
  const late = onTimeEligible.filter((j) => j.on_time === false);

  return {
    deliveries: deliveredInMonth.length,
    on_time_pct: onTimeEligible.length
      ? Math.round((onTimeCount / onTimeEligible.length) * 100)
      : null,
    late_count: late.length,
    avg_delay_days: avg(late.map((j) => j.delay_days || 0)),
    avg_rounds: avg(deliveredInMonth.map((j) => j.review_rounds)),
    avg_days_to_first_submission: avg(
      submittedInMonth.map((j) => j.days_to_first_submission || 0),
    ),
    avg_review_wait_hours: avg(activeJourneys.flatMap((j) => j.review_wait_hours)),
    open_overdue: journeys.filter(
      (j) => !j.first_submitted_at && !j.delivered_at && j.due_date && j.due_date < todayKey,
    ).length,
  };
}
