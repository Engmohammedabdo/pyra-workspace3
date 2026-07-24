import {
  ATTENDANCE_DEDUCTION_UNITS,
  ATTENDANCE_HALF_DAY_MAX_MINUTES,
  ATTENDANCE_QUARTER_DAY_MAX_MINUTES,
  DELIVERY_DEDUCTION_PERCENT,
  MONTHLY_DEDUCTION_CAP_PERCENT,
  QUALITY_AVG_ROUNDS_THRESHOLD,
  QUALITY_CONSECUTIVE_MONTHS_REQUIRED,
  QUALITY_REJECTION_RATE_THRESHOLD_PERCENT,
} from '@/lib/constants/deductions';
import {
  ATTENDANCE_GRACE_MINUTES,
  DEDUCTION_DAYS_PER_MONTH,
} from '@/lib/hr/attendance-policy';
import { isValidIsoInstant } from '@/lib/production/deadlines';
import { dubaiDayKey } from '@/lib/utils/format';
import type { TaskJourney } from '@/lib/production/metrics';

export type AttendanceDeductionUnits =
  (typeof ATTENDANCE_DEDUCTION_UNITS)[keyof typeof ATTENDANCE_DEDUCTION_UNITS];

export type DeliveryDeductionBand = 'none' | 'minor' | 'moderate' | 'major';

export interface AttendanceDeductionInput {
  date: string;
  /** null means a documented no-show for this work day. */
  late_minutes: number | null;
  excused?: boolean;
}

export interface AttendanceDeductionIncident {
  date: string;
  late_minutes: number | null;
  kind: 'late' | 'no_show';
  excused: boolean;
  units: AttendanceDeductionUnits;
}

export interface QualityMonthMetrics {
  avg_rounds: number | null;
  outright_rejection_rate: number | null;
  /** Exact stage-history numerator; deliveries is its denominator. */
  review_rounds_total?: number;
  deliveries?: number;
  /** Exact numerator/denominator used for policy; the rate may be display-rounded. */
  outright_rejection_count?: number;
  reviewed_task_count?: number;
}

export interface QualityMonthSnapshot extends QualityMonthMetrics {
  /** Calendar month represented by these metrics, in YYYY-MM form. */
  month: string;
}

export interface QualityThresholdPolicy {
  avg_rounds_above: number;
  rejection_rate_at_least_percent: number;
  consecutive_months_required: number;
}

export interface MonthlyDeductionCandidateInput {
  salary: number;
  /** Employee salary currency. Components in different currencies never enter this function. */
  currency: string;
  attendance: readonly AttendanceDeductionInput[];
  /** Derived by the production report; this function never re-measures tasks. */
  delivery_on_time_pct: number | null;
  /** Chronological quality snapshots, ending with the candidate month. */
  quality_months: readonly QualityMonthSnapshot[];
  /** Explicit admin input. Quality itself never generates a money amount. */
  quality_amount?: number;
  /** Same-employee, same-currency disciplinary deductions already consuming the cap. */
  already_used_amount?: number;
}

const DELIVERY_PERCENT_BY_BAND: Record<DeliveryDeductionBand, number> = {
  none: 0,
  minor: DELIVERY_DEDUCTION_PERCENT.MINOR,
  moderate: DELIVERY_DEDUCTION_PERCENT.MODERATE,
  major: DELIVERY_DEDUCTION_PERCENT.MAJOR,
};

const DEFAULT_QUALITY_THRESHOLD_POLICY: QualityThresholdPolicy = {
  avg_rounds_above: QUALITY_AVG_ROUNDS_THRESHOLD,
  rejection_rate_at_least_percent: QUALITY_REJECTION_RATE_THRESHOLD_PERCENT,
  consecutive_months_required: QUALITY_CONSECUTIVE_MONTHS_REQUIRED,
};

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function requireNonNegativeFinite(value: number, field: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new RangeError(`${field} must be a non-negative finite number`);
  }
}

/** The deductions product is employee-only; sales/admin/client get no money surface. */
export function isEmployeeDeductionAudience(role: string): boolean {
  return role === 'employee';
}

export interface LegacyDeliveryDelayEvidenceInput {
  due_date: string | null;
  first_submitted_at: string | null;
  exclusion_reason: TaskJourney['delivery_exclusion'];
}

function isValidDocumentedDay(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Legacy tasks never enter the automatic delivery band. This helper only
 * decides whether their surviving calendar-day evidence documents a delay
 * that an owner may cite for a separate manual deduction decision.
 */
export function isLegacyDeliveryDelayEvidence(
  task: LegacyDeliveryDelayEvidenceInput,
): boolean {
  if (
    task.exclusion_reason !== 'unverified_legacy_deadline'
    && task.exclusion_reason !== 'legacy_unverified_attribution'
  ) {
    return false;
  }
  if (
    !task.due_date
    || !isValidDocumentedDay(task.due_date)
    || !task.first_submitted_at
    || !isValidIsoInstant(task.first_submitted_at)
  ) {
    return false;
  }
  return dubaiDayKey(new Date(task.first_submitted_at)) > task.due_date;
}

function exactCountPair(
  numerator: number | undefined,
  denominator: number | undefined,
  numeratorField: string,
  denominatorField: string,
): { numerator: number; denominator: number } | null {
  const hasNumerator = numerator !== undefined;
  const hasDenominator = denominator !== undefined;
  if (hasNumerator !== hasDenominator) {
    throw new TypeError(`${numeratorField} and ${denominatorField} must be provided together`);
  }
  if (!hasNumerator || !hasDenominator) return null;
  requireNonNegativeFinite(numerator, numeratorField);
  requireNonNegativeFinite(denominator, denominatorField);
  if (!Number.isInteger(numerator) || !Number.isInteger(denominator)) {
    throw new RangeError(`${numeratorField} and ${denominatorField} must be integer counts`);
  }
  return { numerator, denominator };
}

export function attendanceUnitsForLateMinutes(
  lateMinutes: number | null,
  excused = false,
): AttendanceDeductionUnits {
  if (excused) return ATTENDANCE_DEDUCTION_UNITS.FREE;
  if (lateMinutes === null) return ATTENDANCE_DEDUCTION_UNITS.FULL;
  requireNonNegativeFinite(lateMinutes, 'lateMinutes');
  if (lateMinutes <= ATTENDANCE_GRACE_MINUTES) {
    return ATTENDANCE_DEDUCTION_UNITS.FREE;
  }
  if (lateMinutes <= ATTENDANCE_QUARTER_DAY_MAX_MINUTES) {
    return ATTENDANCE_DEDUCTION_UNITS.QUARTER;
  }
  if (lateMinutes <= ATTENDANCE_HALF_DAY_MAX_MINUTES) {
    return ATTENDANCE_DEDUCTION_UNITS.HALF;
  }
  return ATTENDANCE_DEDUCTION_UNITS.FULL;
}

export function calculateAttendanceDeduction(
  salary: number,
  inputs: readonly AttendanceDeductionInput[],
): {
  daily_rate: number;
  total_units: number;
  amount: number;
  incidents: AttendanceDeductionIncident[];
} {
  requireNonNegativeFinite(salary, 'salary');
  const seenDates = new Set<string>();
  const incidents = inputs.map((input): AttendanceDeductionIncident => {
    if (!input.date || seenDates.has(input.date)) {
      throw new Error(`attendance deduction date is missing or duplicated: ${input.date}`);
    }
    seenDates.add(input.date);
    return {
      date: input.date,
      late_minutes: input.late_minutes,
      kind: input.late_minutes === null ? 'no_show' : 'late',
      excused: input.excused === true,
      units: attendanceUnitsForLateMinutes(input.late_minutes, input.excused === true),
    };
  });
  const totalUnits = incidents.reduce((total, incident) => total + incident.units, 0);
  const rawDailyRate = salary / DEDUCTION_DAYS_PER_MONTH;
  return {
    daily_rate: roundMoney(rawDailyRate),
    total_units: totalUnits,
    amount: roundMoney(rawDailyRate * totalUnits),
    incidents,
  };
}

export function deliveryBandForOnTimePct(
  onTimePct: number | null,
): DeliveryDeductionBand {
  if (onTimePct === null) return 'none';
  if (!Number.isFinite(onTimePct) || onTimePct < 0 || onTimePct > 100) {
    throw new RangeError('onTimePct must be between 0 and 100');
  }
  if (onTimePct >= 90) return 'none';
  if (onTimePct >= 75) return 'minor';
  if (onTimePct >= 50) return 'moderate';
  return 'major';
}

export function calculateDeliveryDeduction(
  salary: number,
  onTimePct: number | null,
): {
  on_time_pct: number | null;
  band: DeliveryDeductionBand;
  percentage: number;
  amount: number;
} {
  requireNonNegativeFinite(salary, 'salary');
  const band = deliveryBandForOnTimePct(onTimePct);
  const percentage = DELIVERY_PERCENT_BY_BAND[band];
  return {
    on_time_pct: onTimePct,
    band,
    percentage,
    amount: roundMoney(salary * percentage / 100),
  };
}

function requireValidQualityPolicy(policy: QualityThresholdPolicy): void {
  requireNonNegativeFinite(policy.avg_rounds_above, 'avg_rounds_above');
  if (
    !Number.isFinite(policy.rejection_rate_at_least_percent)
    || policy.rejection_rate_at_least_percent < 0
    || policy.rejection_rate_at_least_percent > 100
  ) {
    throw new RangeError('rejection_rate_at_least_percent must be between 0 and 100');
  }
  if (
    !Number.isInteger(policy.consecutive_months_required)
    || policy.consecutive_months_required < 1
  ) {
    throw new RangeError('consecutive_months_required must be a positive integer');
  }
}

export function isQualityBelowBand(
  metrics: QualityMonthMetrics,
  policy: QualityThresholdPolicy = DEFAULT_QUALITY_THRESHOLD_POLICY,
): boolean {
  requireValidQualityPolicy(policy);
  if (metrics.avg_rounds !== null) {
    requireNonNegativeFinite(metrics.avg_rounds, 'avg_rounds');
  }
  if (metrics.outright_rejection_rate !== null) {
    if (
      !Number.isFinite(metrics.outright_rejection_rate)
      || metrics.outright_rejection_rate < 0
      || metrics.outright_rejection_rate > 100
    ) {
      throw new RangeError('outright_rejection_rate must be between 0 and 100');
    }
  }
  const reviewRoundTaskCount = metrics.deliveries ?? (
    metrics.review_rounds_total === undefined ? undefined : metrics.reviewed_task_count
  );
  const reviewRounds = exactCountPair(
    metrics.review_rounds_total,
    reviewRoundTaskCount,
    'review_rounds_total',
    metrics.deliveries === undefined ? 'reviewed_task_count' : 'deliveries',
  );
  const outrightRejections = exactCountPair(
    metrics.outright_rejection_count,
    metrics.reviewed_task_count,
    'outright_rejection_count',
    'reviewed_task_count',
  );
  if (
    outrightRejections
    && outrightRejections.numerator > outrightRejections.denominator
  ) {
    throw new RangeError('outright_rejection_count cannot exceed reviewed_task_count');
  }

  const roundsBelowBand = reviewRounds
    ? reviewRounds.denominator > 0
      && reviewRounds.numerator > policy.avg_rounds_above * reviewRounds.denominator
    : metrics.avg_rounds !== null
      && metrics.avg_rounds > policy.avg_rounds_above;
  const rejectionBelowBand = outrightRejections
    ? outrightRejections.denominator > 0
      && outrightRejections.numerator * 100
        >= policy.rejection_rate_at_least_percent * outrightRejections.denominator
    : metrics.outright_rejection_rate !== null
      && metrics.outright_rejection_rate >= policy.rejection_rate_at_least_percent;

  return roundsBelowBand || rejectionBelowBand;
}

function monthOrdinal(month: string): number {
  const match = /^(\d{4})-(\d{2})$/.exec(month);
  if (!match) throw new RangeError('quality month must use YYYY-MM');
  const year = Number(match[1]);
  const monthNumber = Number(match[2]);
  if (monthNumber < 1 || monthNumber > 12) {
    throw new RangeError('quality month must use YYYY-MM');
  }
  return year * 12 + monthNumber - 1;
}

/** Input months are chronological (oldest first, current month last). */
export function evaluateQualityEligibility(
  months: readonly QualityMonthSnapshot[],
  policy: QualityThresholdPolicy = DEFAULT_QUALITY_THRESHOLD_POLICY,
): {
  current_below_band: boolean;
  consecutive_months: number;
  eligible: boolean;
} {
  requireValidQualityPolicy(policy);
  const ordinals = months.map(month => monthOrdinal(month.month));
  for (let index = 1; index < ordinals.length; index += 1) {
    if (ordinals[index] <= ordinals[index - 1]) {
      throw new RangeError('quality months must be unique and chronological');
    }
  }

  let consecutiveMonths = 0;
  for (let index = months.length - 1; index >= 0; index -= 1) {
    if (
      index < months.length - 1
      && ordinals[index + 1] !== ordinals[index] + 1
    ) {
      break;
    }
    if (!isQualityBelowBand(months[index], policy)) break;
    consecutiveMonths += 1;
  }
  return {
    current_below_band: consecutiveMonths > 0,
    consecutive_months: consecutiveMonths,
    eligible: consecutiveMonths >= policy.consecutive_months_required,
  };
}

/**
 * Pure cap arithmetic. Attendance is passed as `capExemptAmount` and is added
 * in full after capping the requested disciplinary amount. `alreadyUsedAmount`
 * includes only prior delivery, quality, or manual disciplinary deductions.
 */
export function applyMonthlyDeductionCap(
  salary: number,
  capSubjectRequestedAmount: number,
  alreadyUsedAmount = 0,
  capExemptAmount = 0,
): {
  cap_amount: number;
  already_used_amount: number;
  remaining_cap_amount: number;
  cap_subject_requested_amount: number;
  cap_subject_approved_amount: number;
  cap_exempt_amount: number;
  approved_amount: number;
  capped: boolean;
} {
  requireNonNegativeFinite(salary, 'salary');
  requireNonNegativeFinite(capSubjectRequestedAmount, 'capSubjectRequestedAmount');
  requireNonNegativeFinite(alreadyUsedAmount, 'alreadyUsedAmount');
  requireNonNegativeFinite(capExemptAmount, 'capExemptAmount');

  const capAmount = roundMoney(salary * MONTHLY_DEDUCTION_CAP_PERCENT / 100);
  const normalizedAlreadyUsed = roundMoney(alreadyUsedAmount);
  const normalizedCapSubjectRequested = roundMoney(capSubjectRequestedAmount);
  const normalizedCapExempt = roundMoney(capExemptAmount);
  const remainingCapAmount = roundMoney(Math.max(0, capAmount - normalizedAlreadyUsed));
  const capSubjectApprovedAmount = roundMoney(
    Math.min(normalizedCapSubjectRequested, remainingCapAmount),
  );
  const approvedAmount = roundMoney(normalizedCapExempt + capSubjectApprovedAmount);
  return {
    cap_amount: capAmount,
    already_used_amount: normalizedAlreadyUsed,
    remaining_cap_amount: remainingCapAmount,
    cap_subject_requested_amount: normalizedCapSubjectRequested,
    cap_subject_approved_amount: capSubjectApprovedAmount,
    cap_exempt_amount: normalizedCapExempt,
    approved_amount: approvedAmount,
    capped: capSubjectApprovedAmount < normalizedCapSubjectRequested,
  };
}

export function computeMonthlyDeductionCandidate(
  input: MonthlyDeductionCandidateInput,
): {
  salary: number;
  currency: string;
  attendance: ReturnType<typeof calculateAttendanceDeduction>;
  delivery: ReturnType<typeof calculateDeliveryDeduction>;
  quality: ReturnType<typeof evaluateQualityEligibility> & { amount: number };
  requested_amount: number;
  cap: ReturnType<typeof applyMonthlyDeductionCap>;
} {
  requireNonNegativeFinite(input.salary, 'salary');
  if (!/^[A-Z]{3}$/.test(input.currency)) {
    throw new RangeError('currency must be a three-letter uppercase code');
  }

  const qualityAmount = input.quality_amount ?? 0;
  requireNonNegativeFinite(qualityAmount, 'quality_amount');
  const alreadyUsedAmount = input.already_used_amount ?? 0;
  requireNonNegativeFinite(alreadyUsedAmount, 'already_used_amount');

  const attendance = calculateAttendanceDeduction(input.salary, input.attendance);
  const delivery = calculateDeliveryDeduction(input.salary, input.delivery_on_time_pct);
  const qualityEligibility = evaluateQualityEligibility(input.quality_months);
  if (qualityAmount > 0 && !qualityEligibility.eligible) {
    throw new Error('quality amount requires an eligible repeated pattern');
  }

  const normalizedQualityAmount = roundMoney(qualityAmount);
  const capSubjectRequestedAmount = roundMoney(
    delivery.amount + normalizedQualityAmount,
  );
  const requestedAmount = roundMoney(
    attendance.amount + capSubjectRequestedAmount,
  );

  return {
    salary: roundMoney(input.salary),
    currency: input.currency,
    attendance,
    delivery,
    quality: {
      ...qualityEligibility,
      amount: normalizedQualityAmount,
    },
    requested_amount: requestedAmount,
    cap: applyMonthlyDeductionCap(
      input.salary,
      capSubjectRequestedAmount,
      alreadyUsedAmount,
      attendance.amount,
    ),
  };
}
