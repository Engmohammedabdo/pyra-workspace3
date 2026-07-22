// Pure functions — NO DB access, NO side effects (mirrors lib/hr/overview-helpers.ts).
// Source of truth for all numbers = pyra_task_stage_history events.
import { dubaiDayKey } from '@/lib/utils/format';
import { DELIVERY_MIN_LEAD_TIME_HOURS } from '@/lib/constants/deductions';
import {
  PRODUCTION_ATTRIBUTION_STATUS,
  type ProductionAttributionStatus,
} from '@/lib/constants/production';
import {
  compareIsoInstants,
  isDeadlineOverdue,
  isUnverifiedProductionDeadline,
  isValidIsoInstant,
  isoInstantDifferenceMicroseconds,
} from './deadlines';

export interface StageEvent {
  id?: string;
  task_id: string;
  board_id?: string;
  from_column_id: string | null;
  to_column_id: string;
  created_at: string; // UTC ISO
  due_at_snapshot?: string | null;
  task_created_at_snapshot?: string | null;
  assignees_snapshot?: unknown;
}

export interface QualityReviewDecisionEvent {
  task_id: string;
  created_at: string;
  action: 'approve' | 'reject';
  kind: 'revision' | 'outright' | null;
}

/** Legacy activity-only rejection shape; never use it as the monthly cohort. */
export interface QualityRejectionEvent {
  task_id: string;
  created_at: string;
  kind: 'revision' | 'outright';
}

export interface ProductionTaskInput {
  id: string;
  title: string;
  assignee: string | null;
  attribution_status?: ProductionAttributionStatus;
  due_date: string | null; // YYYY-MM-DD (date-only)
  due_at: string | null; // UTC ISO exact deadline
  production_deadline_exempt: boolean;
  created_at: string;      // UTC ISO
  review_column_id: string;
  done_column_id: string;
  is_archived?: boolean | null;
}

export interface TaskJourney {
  task_id: string;
  title: string;
  assignee: string | null;
  attribution_status?: ProductionAttributionStatus;
  due_date: string | null;
  effective_due_at: string | null;
  production_deadline_exempt: boolean;
  created_at: string;
  first_submitted_at: string | null;
  review_entry_timestamps: string[];
  delivered_at: string | null;
  review_rounds: number;
  /** one entry per DECIDED round (entered review → left review), in hours */
  review_wait_hours: number[];
  /** null = no deadline OR not yet submitted */
  on_time: boolean | null;
  /** Dubai calendar days late (0 when a late submission is still on the due day) */
  delay_days: number | null;
  delivery_eligible: boolean;
  delivery_exclusion:
    | 'missing_deadline'
    | 'invalid_timestamp'
    | 'lead_time_under_24h'
    | 'unverified_legacy_deadline'
    | 'legacy_unverified_attribution'
    | null;
  days_to_first_submission: number | null;
  is_archived?: boolean | null;
}

export interface EmployeeProductivity {
  deliveries: number;
  on_time_pct: number | null;
  on_time_count: number;
  on_time_eligible_count: number;
  late_count: number;
  avg_delay_days: number | null;
  avg_rounds: number | null;
  review_rounds_total: number;
  avg_days_to_first_submission: number | null;
  avg_review_wait_hours: number | null;
  reviewed_task_count: number;
  outright_rejection_count: number;
  outright_rejection_rate: number | null;
  /** verified exact deadline instant passed, never submitted, not delivered */
  open_overdue: number;
}

const HOUR_MICROSECONDS = 3_600_000_000;
const DAY = 86_400_000;

function monthOf(iso: string): string {
  return dubaiDayKey(new Date(iso)).slice(0, 7);
}

function dubaiDayOrdinal(iso: string): number {
  const [year, month, day] = dubaiDayKey(new Date(iso)).split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY;
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
    .sort((a, b) => {
      const exactOrder = compareIsoInstants(a.created_at, b.created_at);
      if (exactOrder !== null) {
        return exactOrder || (a.id || '').localeCompare(b.id || '');
      }
      return a.created_at.localeCompare(b.created_at) || (a.id || '').localeCompare(b.id || '');
    });

  const reviewEntries = mine.filter((e) => e.to_column_id === task.review_column_id);
  const firstSubmitted = reviewEntries[0]?.created_at ?? null;
  const delivered = mine.find((e) => e.to_column_id === task.done_column_id)?.created_at ?? null;
  const snapshotDueAt = reviewEntries[0]?.due_at_snapshot;
  const selectedExactDueAt = snapshotDueAt == null ? task.due_at : snapshotDueAt;
  const deadlineExempt = isUnverifiedProductionDeadline({
    dueDate: task.due_date,
    dueAt: selectedExactDueAt,
    deadlineExempt: task.production_deadline_exempt,
  });
  const effectiveDueAt = deadlineExempt ? null : selectedExactDueAt;
  const invalidDeliveryTimestamp = (effectiveDueAt !== null && !isValidIsoInstant(effectiveDueAt))
    || (effectiveDueAt !== null && !isValidIsoInstant(task.created_at))
    || (firstSubmitted !== null && !isValidIsoInstant(firstSubmitted));
  const legacyAttribution =
    task.attribution_status === PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED;
  const deliveryExclusion = legacyAttribution
    ? 'legacy_unverified_attribution'
    : deadlineExempt
    ? 'unverified_legacy_deadline'
    : !effectiveDueAt
      ? 'missing_deadline'
    : invalidDeliveryTimestamp
      ? 'invalid_timestamp'
    : (isoInstantDifferenceMicroseconds(effectiveDueAt, task.created_at) ?? 0)
        < DELIVERY_MIN_LEAD_TIME_HOURS * HOUR_MICROSECONDS
      ? 'lead_time_under_24h'
      : null;

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
    const waitMicroseconds = isoInstantDifferenceMicroseconds(
      mine[decisionIdx].created_at,
      entry.created_at,
    );
    if (waitMicroseconds !== null) {
      waits.push(Math.round((waitMicroseconds / HOUR_MICROSECONDS) * 10) / 10);
    }
  }

  let onTime: boolean | null = null;
  let delayDays: number | null = null;
  if (effectiveDueAt && firstSubmitted && deliveryExclusion !== 'invalid_timestamp') {
    const submissionOrder = compareIsoInstants(firstSubmitted, effectiveDueAt);
    onTime = submissionOrder !== null && submissionOrder <= 0;
    if (!onTime) {
      delayDays = Math.round(
        dubaiDayOrdinal(firstSubmitted) - dubaiDayOrdinal(effectiveDueAt),
      );
    }
  }

  return {
    task_id: task.id,
    title: task.title,
    assignee: task.assignee,
    attribution_status:
      task.attribution_status ?? PRODUCTION_ATTRIBUTION_STATUS.SNAPSHOT_VERIFIED,
    due_date: task.due_date,
    effective_due_at: effectiveDueAt,
    production_deadline_exempt: deadlineExempt,
    created_at: task.created_at,
    first_submitted_at: firstSubmitted,
    review_entry_timestamps: reviewEntries.map((entry) => entry.created_at),
    delivered_at: delivered,
    review_rounds: reviewEntries.length,
    review_wait_hours: waits,
    on_time: onTime,
    delay_days: delayDays,
    delivery_eligible: deliveryExclusion === null,
    delivery_exclusion: deliveryExclusion,
    days_to_first_submission: (() => {
      if (!firstSubmitted) return null;
      const elapsed = isoInstantDifferenceMicroseconds(firstSubmitted, task.created_at);
      return elapsed === null
        ? null
        : Math.max(0, Math.round((elapsed / (DAY * 1_000)) * 10) / 10);
    })(),
    is_archived: task.is_archived ?? false,
  };
}

export function summarizeEmployee(
  journeys: TaskJourney[],
  monthKey: string, // 'YYYY-MM'
  currentInstant: string, // timezone-qualified ISO instant
  qualityDecisions: QualityReviewDecisionEvent[],
): EmployeeProductivity {
  const metricJourneys = journeys.filter(
    (journey) => journey.attribution_status !== PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED,
  );
  const deliveredInMonth = metricJourneys.filter(
    (j) => j.delivered_at && monthOf(j.delivered_at) === monthKey,
  );
  const submittedInMonth = metricJourneys.filter(
    (j) => j.first_submitted_at && monthOf(j.first_submitted_at) === monthKey,
  );

  // a task is "active this month" if it was delivered OR first-submitted in it
  const active = new Map<string, TaskJourney>();
  for (const j of [...deliveredInMonth, ...submittedInMonth]) active.set(j.task_id, j);
  const activeJourneys = [...active.values()];

  const onTimeEligible = activeJourneys.filter((j) => j.delivery_eligible && j.on_time !== null);
  const onTimeCount = onTimeEligible.filter((j) => j.on_time === true).length;
  const late = onTimeEligible.filter((j) => j.on_time === false);
  const metricTaskIds = new Set(metricJourneys.map((journey) => journey.task_id));
  const monthlyQualityDecisions = qualityDecisions.filter(
    (decision) => monthOf(decision.created_at) === monthKey
      && metricTaskIds.has(decision.task_id),
  );
  const reviewedTaskIds = new Set(
    monthlyQualityDecisions.map((decision) => decision.task_id),
  );
  const outrightRejectedTaskIds = new Set(
    monthlyQualityDecisions
      .filter(
        (event) => event.kind === 'outright'
          && event.action === 'reject',
      )
      .map((event) => event.task_id),
  );
  const reviewRoundsTotal = monthlyQualityDecisions.length;

  return {
    deliveries: deliveredInMonth.length,
    on_time_pct: onTimeEligible.length
      ? Math.round((onTimeCount / onTimeEligible.length) * 100)
      : null,
    on_time_count: onTimeCount,
    on_time_eligible_count: onTimeEligible.length,
    late_count: late.length,
    avg_delay_days: avg(late.map((j) => j.delay_days || 0)),
    avg_rounds: reviewedTaskIds.size
      ? Math.round((reviewRoundsTotal / reviewedTaskIds.size) * 10) / 10
      : null,
    review_rounds_total: reviewRoundsTotal,
    avg_days_to_first_submission: avg(
      submittedInMonth.map((j) => j.days_to_first_submission || 0),
    ),
    avg_review_wait_hours: avg(activeJourneys.flatMap((j) => j.review_wait_hours)),
    reviewed_task_count: reviewedTaskIds.size,
    outright_rejection_count: outrightRejectedTaskIds.size,
    outright_rejection_rate: reviewedTaskIds.size
      ? Math.round((outrightRejectedTaskIds.size / reviewedTaskIds.size) * 100)
      : null,
    open_overdue: journeys.filter(
      (j) => !j.is_archived
        && !j.first_submitted_at
        && !j.delivered_at
        && isDeadlineOverdue(j.effective_due_at, currentInstant),
    ).length,
  };
}

/** Nearest boundary that can increment open_overdue for an untouched open task. */
export function nextOpenDeadlineAt(
  journeys: readonly TaskJourney[],
  currentInstant: string,
): string | null {
  if (!isValidIsoInstant(currentInstant)) return null;
  let nearest: string | null = null;

  for (const journey of journeys) {
    if (journey.is_archived || journey.first_submitted_at || journey.delivered_at) continue;
    const deadline = journey.effective_due_at;
    if (!deadline || !isValidIsoInstant(deadline)) continue;
    const deadlineVsNow = compareIsoInstants(deadline, currentInstant);
    if (deadlineVsNow === null || deadlineVsNow === -1) continue;
    if (nearest && compareIsoInstants(deadline, nearest) !== -1) continue;
    nearest = deadline;
  }

  return nearest;
}
