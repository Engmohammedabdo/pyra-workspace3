import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_WORK_DAYS } from '@/lib/constants/auth';
import { EMPLOYEE_PAYMENT_SOURCE_TYPE } from '@/lib/constants/payroll';
import { QUALITY_CONSECUTIVE_MONTHS_REQUIRED } from '@/lib/constants/deductions';
import {
  EMPLOYEE_PAYMENT_STATUS,
  LEAVE_STATUS,
  NON_DEDUCTIBLE_ATTENDANCE_STATUSES,
} from '@/lib/constants/statuses';
import { PRODUCTION_ATTRIBUTION_STATUS } from '@/lib/constants/production';
import {
  isOnTimeClockIn,
  lateMinutesOf,
  listDeductibleAbsenceDates,
} from '@/lib/hr/attendance-policy';
import {
  applyMonthlyDeductionCap,
  computeMonthlyDeductionCandidate,
  type AttendanceDeductionInput,
  type QualityMonthSnapshot,
} from '@/lib/hr/deductions';
import { dubaiDayKey } from '@/lib/utils/format';
import type { PyraDeductionCase, PyraManualDeduction } from '@/types/database';
import type { EmployeeProductivity, TaskJourney } from '@/lib/production/metrics';
import {
  computeProductivity,
  fetchAllProductivityPages,
  lastNMonthKeys,
  type EmployeeReport,
  type ProductivityReport,
} from '@/lib/production/report';

export interface DeductionsEmployeeInput {
  username: string;
  display_name: string;
  role: string;
  status: string | null;
  salary: number | string | null;
  salary_currency: string | null;
  work_schedule_id: string | null;
  hire_date: string | null;
  attendance_tracking_started_on: string | null;
  attendance_tracking_start_source: 'observed' | 'admin' | null;
}

export interface DeductionsScheduleInput {
  id: string;
  start_time: string;
  work_days: unknown;
  is_default: boolean | null;
}

export interface DeductionsAttendanceInput {
  username: string;
  date: string;
  clock_in: string | null;
  status: string | null;
}

export interface DeductionsLeaveInput {
  username: string;
  start_date: string;
  end_date: string;
}

export interface DeductionPaymentEvidence {
  id: string;
  username: string;
  source_id: string | null;
  description: string | null;
  amount: number | string;
  /** Approved attendance portion; it never consumes the 25% disciplinary cap. */
  deduction_cap_exempt_amount: number | string | null;
  currency: string | null;
  status: string | null;
  payroll_id: string | null;
  effective_month: string | null;
  approved_at: string | null;
  paid_at: string | null;
  cancelled_at?: string | null;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  created_at: string | null;
}

export interface DeductionsReportInput {
  month: string;
  current_month: string;
  as_of_date: string;
  now_uae_minutes: number;
  generated_at: string;
  employees: readonly DeductionsEmployeeInput[];
  schedules: readonly DeductionsScheduleInput[];
  attendance: readonly DeductionsAttendanceInput[];
  approved_leaves: readonly DeductionsLeaveInput[];
  current_productivity: ProductivityReport;
  /** Chronological quality evidence ending with the requested month. */
  quality_productivity: readonly ProductivityReport[];
  deduction_cases: readonly PyraDeductionCase[];
  manual_deductions: readonly PyraManualDeduction[];
  deduction_payments: readonly DeductionPaymentEvidence[];
}

export type DeductionIntegrityBlocker =
  | { code: 'invalid_salary' }
  | { code: 'invalid_salary_currency'; actual_currency: string | null }
  | { code: 'historical_salary_unverified'; month: string }
  | { code: 'inactive_employee' }
  | { code: 'attendance_tracking_unverified' }
  | { code: 'missing_productivity_evidence'; month: string }
  | { code: 'deduction_missing_effective_month'; payment_id: string }
  | { code: 'deduction_cap_exemption_invalid'; payment_id: string }
  | {
    code: 'deduction_currency_mismatch';
    payment_id: string;
    expected_currency: string;
    actual_currency: string | null;
  }
  | { code: 'deduction_case_payment_missing'; payment_id: string }
  | { code: 'deduction_case_payment_mismatch'; payment_id: string }
  | { code: 'manual_deduction_payment_missing'; payment_id: string }
  | { code: 'manual_deduction_payment_mismatch'; payment_id: string }
  | { code: 'candidate_calculation_failed' };

/** Productivity gaps block computed/quality money, not a separately proven legacy cause. */
export function isManualDeductionLedgerBlocker(
  blocker: DeductionIntegrityBlocker,
): boolean {
  return blocker.code !== 'missing_productivity_evidence'
    && blocker.code !== 'attendance_tracking_unverified'
    && blocker.code !== 'candidate_calculation_failed';
}

export type DeliveryTaskOutcome = 'on_time' | 'late' | 'excluded' | 'pending';

export interface DeliveryTaskEvidence {
  task_id: string;
  title: string;
  created_at: string;
  due_date: string | null;
  due_at: string | null;
  deadline_unverified: boolean;
  first_submitted_at: string | null;
  delivered_at: string | null;
  on_time: boolean | null;
  delay_days: number | null;
  review_rounds: number;
  outcome: DeliveryTaskOutcome;
  exclusion_reason:
    | TaskJourney['delivery_exclusion']
    | 'legacy_unverified_attribution';
  attribution_status: TaskJourney['attribution_status'];
}

export interface MonthlyEmployeeDeductionReport {
  username: string;
  display_name: string;
  hire_date: string | null;
  attendance_tracking_started_on: string | null;
  attendance_tracking_start_source: 'observed' | 'admin' | null;
  salary: number | null;
  currency: string | null;
  attendance_inputs: AttendanceDeductionInput[];
  delivery_tasks: DeliveryTaskEvidence[];
  quality_months: QualityMonthSnapshot[];
  deduction_payments: DeductionPaymentEvidence[];
  existing_case: {
    case: PyraDeductionCase;
    payment: DeductionPaymentEvidence | null;
  } | null;
  manual_deductions: Array<{
    manual: PyraManualDeduction;
    payment: DeductionPaymentEvidence | null;
  }>;
  integrity_blockers: DeductionIntegrityBlocker[];
  cap_ledger: {
    cap_amount: number;
    used_amount: number;
    remaining_amount: number;
  } | null;
  candidate: ReturnType<typeof computeMonthlyDeductionCandidate> | null;
}

export interface MonthlyDeductionsReport {
  month: string;
  as_of_date: string;
  generated_at: string;
  employees: MonthlyEmployeeDeductionReport[];
  /** Admin-only evidence with no proven historical employee owner. */
  unattributed_tasks: DeliveryTaskEvidence[];
}

export interface LoadMonthlyDeductionsReportOptions {
  month: string;
  today_key: string;
  current_instant: string;
  usernames?: readonly string[];
  include_unattributed?: boolean;
}

function validMonthKey(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  return Boolean(match && Number(match[2]) >= 1 && Number(match[2]) <= 12);
}

export function resolveAdminDeductionsMonth(
  requestedMonth: string | null,
  currentMonth: string,
): string | null {
  const month = requestedMonth === null ? currentMonth : requestedMonth;
  if (!validMonthKey(currentMonth) || !validMonthKey(month)) return null;
  return month <= currentMonth ? month : null;
}

function lastDayKey(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const day = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return `${month}-${String(day).padStart(2, '0')}`;
}

function dateMonth(value: string | null): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 7) : null;
}

function instantMonth(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : dubaiDayKey(parsed).slice(0, 7);
}

function numericSalary(value: number | string | null): number | null {
  if (value === null || value === '') return null;
  const salary = Number(value);
  return Number.isFinite(salary) && salary >= 0 ? salary : null;
}

function numericAmount(value: number | string): number | null {
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function employeeMetricsSnapshot(
  month: string,
  employee: EmployeeReport,
): QualityMonthSnapshot {
  return {
    month,
    avg_rounds: employee.metrics.avg_rounds,
    review_rounds_total: employee.metrics.review_rounds_total,
    reviewed_task_count: employee.metrics.reviewed_task_count,
    outright_rejection_count: employee.metrics.outright_rejection_count,
    outright_rejection_rate: employee.metrics.outright_rejection_rate,
  };
}

function visibleInMonth(task: TaskJourney, month: string, currentMonth: string): boolean {
  if (instantMonth(task.delivered_at) === month) return true;
  if (instantMonth(task.first_submitted_at) === month) return true;
  if (instantMonth(task.effective_due_at) === month) return true;
  if (task.due_date?.slice(0, 7) === month) return true;
  return month === currentMonth
    && !task.first_submitted_at
    && !task.delivered_at
    && !task.is_archived;
}

function deliveryTaskEvidence(task: TaskJourney): DeliveryTaskEvidence {
  const legacyAttribution =
    task.attribution_status === PRODUCTION_ATTRIBUTION_STATUS.LEGACY_UNVERIFIED;
  const excluded = legacyAttribution || !task.delivery_eligible;
  const outcome: DeliveryTaskOutcome = excluded
    ? 'excluded'
    : task.on_time === true
      ? 'on_time'
      : task.on_time === false
        ? 'late'
        : 'pending';
  return {
    task_id: task.task_id,
    title: task.title,
    created_at: task.created_at,
    due_date: task.due_date,
    due_at: task.effective_due_at,
    deadline_unverified: task.production_deadline_exempt,
    first_submitted_at: task.first_submitted_at,
    delivered_at: task.delivered_at,
    on_time: task.on_time,
    delay_days: task.delay_days,
    review_rounds: task.review_rounds,
    outcome,
    exclusion_reason: legacyAttribution
      ? 'legacy_unverified_attribution'
      : task.delivery_exclusion,
    attribution_status: task.attribution_status,
  };
}

function leaveDatesForEmployee(
  username: string,
  leaves: readonly DeductionsLeaveInput[],
  monthStart: string,
  asOfDate: string,
): Set<string> {
  const dates = new Set<string>();
  for (const leave of leaves) {
    if (leave.username !== username) continue;
    const from = leave.start_date > monthStart ? leave.start_date : monthStart;
    const to = leave.end_date < asOfDate ? leave.end_date : asOfDate;
    for (
      let day = new Date(`${from}T00:00:00Z`);
      day <= new Date(`${to}T00:00:00Z`);
      day.setUTCDate(day.getUTCDate() + 1)
    ) {
      dates.add(day.toISOString().slice(0, 10));
    }
  }
  return dates;
}

function attendanceTrackingStart(
  employee: DeductionsEmployeeInput,
): string | null {
  const trackingStart = employee.attendance_tracking_started_on?.slice(0, 10) ?? null;
  if (
    !trackingStart
    || !['observed', 'admin'].includes(employee.attendance_tracking_start_source ?? '')
    || !/^\d{4}-\d{2}-\d{2}$/.test(trackingStart)
    || (employee.hire_date && trackingStart < employee.hire_date.slice(0, 10))
  ) {
    return null;
  }
  return trackingStart;
}

function attendanceInputsForEmployee(
  employee: DeductionsEmployeeInput,
  input: DeductionsReportInput,
): AttendanceDeductionInput[] {
  const defaultSchedule = input.schedules.find((schedule) => schedule.is_default);
  const assignedSchedule = input.schedules.find(
    (schedule) => schedule.id === employee.work_schedule_id,
  );
  const schedule = assignedSchedule ?? defaultSchedule;
  const startTime = schedule?.start_time ?? '09:00:00';
  const workDays = Array.isArray(schedule?.work_days)
    ? schedule.work_days.filter((day): day is number => Number.isInteger(day))
    : [...DEFAULT_WORK_DAYS];
  const trackingStart = attendanceTrackingStart(employee);
  if (!trackingStart) return [];
  const rows = input.attendance
    .filter((row) => row.username === employee.username)
    .sort((left, right) => left.date.localeCompare(right.date));

  const rowsByDate = new Map(rows.map((row) => [row.date.slice(0, 10), row]));
  const onTimeDates = new Set<string>();
  const excusedDates = new Set<string>();
  const excusedStatuses = new Set<string>(NON_DEDUCTIBLE_ATTENDANCE_STATUSES);
  for (const row of rows) {
    const date = row.date.slice(0, 10);
    if (isOnTimeClockIn(row.clock_in, startTime)) onTimeDates.add(date);
    if (row.status && excusedStatuses.has(row.status)) excusedDates.add(date);
  }

  const monthStart = `${input.month}-01`;
  const candidateDates = listDeductibleAbsenceDates({
    monthKey: input.month,
    todayKey: input.as_of_date,
    workDays,
    startHHMM: startTime,
    nowUaeMinutes: input.now_uae_minutes,
    onTimeDates,
    leaveDates: leaveDatesForEmployee(
      employee.username,
      input.approved_leaves,
      monthStart,
      input.as_of_date,
    ),
    excusedDates,
    hireDateKey: employee.hire_date ? employee.hire_date.slice(0, 10) : null,
    startCountingFrom: trackingStart,
  });
  return candidateDates.map((date) => {
    const row = rowsByDate.get(date);
    return {
      date,
      late_minutes: row?.clock_in ? lateMinutesOf(row.clock_in, startTime) : null,
    };
  });
}

function relevantPayments(
  username: string,
  month: string,
  payments: readonly DeductionPaymentEvidence[],
): DeductionPaymentEvidence[] {
  return payments.filter((payment) => {
    if (payment.username !== username) return false;
    if (payment.status === EMPLOYEE_PAYMENT_STATUS.REJECTED) {
      return Boolean(
        payment.effective_month
        && dateMonth(payment.effective_month) === month
        && payment.cancelled_at
        && payment.cancelled_by?.trim()
        && payment.cancellation_reason?.trim(),
      );
    }
    return [EMPLOYEE_PAYMENT_STATUS.APPROVED, EMPLOYEE_PAYMENT_STATUS.PAID]
      .includes(payment.status as 'approved' | 'paid')
      && (payment.effective_month === null || dateMonth(payment.effective_month) === month);
  });
}

function paymentLifecycleIsValid(payment: DeductionPaymentEvidence): boolean {
  if (payment.status === EMPLOYEE_PAYMENT_STATUS.REJECTED) {
    return Boolean(
      payment.cancelled_at
      && payment.cancelled_by?.trim()
      && payment.cancellation_reason?.trim()
      && payment.payroll_id === null
      && payment.paid_at === null,
    );
  }
  return (
    [EMPLOYEE_PAYMENT_STATUS.APPROVED, EMPLOYEE_PAYMENT_STATUS.PAID]
      .includes(payment.status as 'approved' | 'paid')
    && (payment.cancelled_at ?? null) === null
    && (payment.cancelled_by ?? null) === null
    && (payment.cancellation_reason ?? null) === null
  );
}

function capSubjectPaymentAmount(payment: DeductionPaymentEvidence): number | null {
  const amount = numericAmount(payment.amount);
  const exemptAmount = numericAmount(payment.deduction_cap_exempt_amount ?? 0);
  if (
    amount === null
    || exemptAmount === null
    || exemptAmount < 0
    || exemptAmount > amount
  ) {
    return null;
  }
  return roundMoney(amount - exemptAmount);
}

function casePaymentBlocker(
  existingCase: PyraDeductionCase,
  payment: DeductionPaymentEvidence | undefined,
): DeductionIntegrityBlocker | null {
  if (!payment) {
    return { code: 'deduction_case_payment_missing', payment_id: existingCase.payment_id };
  }
  const amount = numericAmount(payment.amount);
  const exemptAmount = numericAmount(payment.deduction_cap_exempt_amount ?? 0);
  if (
    payment.username !== existingCase.employee_username
    || payment.source_id !== existingCase.id
    || payment.effective_month !== existingCase.period_month
    || payment.currency !== existingCase.salary_currency
    || amount === null
    || exemptAmount === null
    || roundMoney(exemptAmount) !== roundMoney(Number(existingCase.attendance_amount))
    || roundMoney(amount) !== roundMoney(Number(existingCase.approved_amount))
    || !paymentLifecycleIsValid(payment)
  ) {
    return { code: 'deduction_case_payment_mismatch', payment_id: existingCase.payment_id };
  }
  return null;
}

function manualPaymentBlocker(
  manual: PyraManualDeduction,
  payment: DeductionPaymentEvidence | undefined,
): DeductionIntegrityBlocker | null {
  if (!payment) {
    return { code: 'manual_deduction_payment_missing', payment_id: manual.payment_id };
  }
  const amount = numericAmount(payment.amount);
  const exemptAmount = numericAmount(payment.deduction_cap_exempt_amount ?? 0);
  if (
    payment.username !== manual.employee_username
    || payment.source_id !== manual.id
    || payment.effective_month !== manual.period_month
    || payment.currency !== manual.salary_currency
    || amount === null
    || exemptAmount === null
    || roundMoney(exemptAmount) !== 0
    || roundMoney(amount) !== roundMoney(Number(manual.approved_amount))
    || !paymentLifecycleIsValid(payment)
  ) {
    return { code: 'manual_deduction_payment_mismatch', payment_id: manual.payment_id };
  }
  return null;
}

export function buildMonthlyDeductionsReport(
  input: DeductionsReportInput,
): MonthlyDeductionsReport {
  const requiredQualityMonths = lastNMonthKeys(
    QUALITY_CONSECUTIVE_MONTHS_REQUIRED,
    input.month,
  );
  if (
    !validMonthKey(input.month)
    || !validMonthKey(input.current_month)
    || input.current_productivity.month !== input.month
    || input.quality_productivity.length !== requiredQualityMonths.length
    || input.quality_productivity.some(
      (report, index) => report.month !== requiredQualityMonths[index],
    )
  ) {
    throw new Error('deductions report period inputs are inconsistent');
  }

  const currentProductivity = new Map(
    input.current_productivity.employees.map((employee) => [employee.username, employee]),
  );
  const qualityProductivity = input.quality_productivity.map((report) => ({
    month: report.month,
    employees: new Map(
      report.employees.map((employee) => [employee.username, employee]),
    ),
  }));
  const casesByEmployee = new Map(
    input.deduction_cases
      .filter((deductionCase) => dateMonth(deductionCase.period_month) === input.month)
      .map((deductionCase) => [deductionCase.employee_username, deductionCase]),
  );
  const manualDeductionsByEmployee = new Map<string, PyraManualDeduction[]>();
  for (const manual of input.manual_deductions) {
    if (dateMonth(manual.period_month) !== input.month) continue;
    const rows = manualDeductionsByEmployee.get(manual.employee_username) ?? [];
    rows.push(manual);
    manualDeductionsByEmployee.set(manual.employee_username, rows);
  }
  const employees = input.employees
    .filter((employee) => employee.role === 'employee' && (
      employee.status === 'active'
      || casesByEmployee.has(employee.username)
      || (manualDeductionsByEmployee.get(employee.username)?.length ?? 0) > 0
      || relevantPayments(employee.username, input.month, input.deduction_payments).length > 0
    ))
    .sort((left, right) => left.username.localeCompare(right.username))
    .map((employee): MonthlyEmployeeDeductionReport => {
      const salary = numericSalary(employee.salary);
      const currency = employee.salary_currency;
      const isActive = employee.status === 'active';
      const blockers: DeductionIntegrityBlocker[] = [];
      if (!isActive) {
        blockers.push({ code: 'inactive_employee' });
      } else {
        if (salary === null) blockers.push({ code: 'invalid_salary' });
        if (!currency || !/^[A-Z]{3}$/.test(currency)) {
          blockers.push({ code: 'invalid_salary_currency', actual_currency: currency });
        }
        if (input.month !== input.current_month) {
          blockers.push({ code: 'historical_salary_unverified', month: input.month });
        }
        if (!attendanceTrackingStart(employee)) {
          blockers.push({ code: 'attendance_tracking_unverified' });
        }
      }

      const current = currentProductivity.get(employee.username);
      if (isActive && !current) {
        blockers.push({ code: 'missing_productivity_evidence', month: input.month });
      }
      const qualityEvidence = qualityProductivity.map((report) => ({
        month: report.month,
        employee: report.employees.get(employee.username),
      }));
      for (const evidence of qualityEvidence) {
        if (
          isActive
          && !evidence.employee
          && !blockers.some(
            (blocker) => blocker.code === 'missing_productivity_evidence'
              && blocker.month === evidence.month,
          )
        ) {
          blockers.push({ code: 'missing_productivity_evidence', month: evidence.month });
        }
      }

      const existingCase = casesByEmployee.get(employee.username);
      const linkedPayment = existingCase
        ? input.deduction_payments.find((payment) => payment.id === existingCase.payment_id)
        : undefined;
      if (existingCase) {
        const blocker = casePaymentBlocker(existingCase, linkedPayment);
        if (blocker) blockers.push(blocker);
      }

      const manualDeductions = (manualDeductionsByEmployee.get(employee.username) ?? [])
        .sort((left, right) => left.created_at.localeCompare(right.created_at))
        .map((manual) => {
          const payment = input.deduction_payments.find(
            (candidatePayment) => candidatePayment.id === manual.payment_id,
          );
          const blocker = manualPaymentBlocker(manual, payment);
          if (blocker) blockers.push(blocker);
          return { manual, payment: payment ?? null };
        });

      const payments = relevantPayments(employee.username, input.month, input.deduction_payments);
      for (const payment of payments) {
        if (capSubjectPaymentAmount(payment) === null) {
          blockers.push({
            code: 'deduction_cap_exemption_invalid',
            payment_id: payment.id,
          });
        } else if (payment.effective_month === null) {
          blockers.push({
            code: 'deduction_missing_effective_month',
            payment_id: payment.id,
          });
        } else if (isActive && currency && payment.currency !== currency) {
          blockers.push({
            code: 'deduction_currency_mismatch',
            payment_id: payment.id,
            expected_currency: currency,
            actual_currency: payment.currency,
          });
        }
      }

      const attendanceInputs = isActive ? attendanceInputsForEmployee(employee, input) : [];
      const qualityMonths = qualityEvidence.every((evidence) => evidence.employee)
        ? qualityEvidence.map((evidence) => employeeMetricsSnapshot(
            evidence.month,
            evidence.employee as EmployeeReport,
          ))
        : [];
      const deliveryTasks = (current?.tasks ?? [])
        .filter((task) => visibleInMonth(task, input.month, input.current_month))
        .map(deliveryTaskEvidence);

      const ledgerUsed = payments.reduce((total, payment) => {
        if (
          payment.effective_month === null
          || dateMonth(payment.effective_month) !== input.month
          || payment.currency !== currency
          || ![
            EMPLOYEE_PAYMENT_STATUS.APPROVED,
            EMPLOYEE_PAYMENT_STATUS.PAID,
          ].includes(payment.status as 'approved' | 'paid')
        ) {
          return total;
        }
        const amount = capSubjectPaymentAmount(payment);
        return amount === null ? total : total + amount;
      }, 0);

      let candidate: ReturnType<typeof computeMonthlyDeductionCandidate> | null = null;
      if (isActive && blockers.length === 0 && salary !== null && currency && current) {
        const ownPaymentId = existingCase?.payment_id;
        const alreadyUsed = payments.reduce((total, payment) => {
          if (
            payment.id === ownPaymentId
            || payment.effective_month === null
            || dateMonth(payment.effective_month) !== input.month
            || payment.currency !== currency
            || ![
              EMPLOYEE_PAYMENT_STATUS.APPROVED,
              EMPLOYEE_PAYMENT_STATUS.PAID,
            ].includes(payment.status as 'approved' | 'paid')
          ) {
            return total;
          }
          const amount = capSubjectPaymentAmount(payment);
          return amount === null ? total : total + amount;
        }, 0);
        try {
          candidate = computeMonthlyDeductionCandidate({
            salary,
            currency,
            attendance: attendanceInputs,
            delivery_on_time_pct: current.metrics.on_time_pct,
            quality_months: qualityMonths,
            quality_amount: 0,
            already_used_amount: roundMoney(alreadyUsed),
          });
        } catch {
          blockers.push({ code: 'candidate_calculation_failed' });
        }
      }

      const cap = isActive
        && !blockers.some(isManualDeductionLedgerBlocker)
        && salary !== null
        && currency
        ? applyMonthlyDeductionCap(salary, 0, roundMoney(ledgerUsed))
        : null;

      return {
        username: employee.username,
        display_name: employee.display_name,
        hire_date: employee.hire_date,
        attendance_tracking_started_on: employee.attendance_tracking_started_on,
        attendance_tracking_start_source: employee.attendance_tracking_start_source,
        salary,
        currency,
        attendance_inputs: attendanceInputs,
        delivery_tasks: deliveryTasks,
        quality_months: qualityMonths,
        deduction_payments: payments,
        existing_case: existingCase
          ? { case: existingCase, payment: linkedPayment ?? null }
          : null,
        manual_deductions: manualDeductions,
        integrity_blockers: blockers,
        cap_ledger: cap ? {
          cap_amount: cap.cap_amount,
          used_amount: cap.already_used_amount,
          remaining_amount: cap.remaining_cap_amount,
        } : null,
        candidate: blockers.length === 0 ? candidate : null,
      };
    });

  const unattributedTasks = input.current_productivity.unattributed_tasks
    .filter((task) => visibleInMonth(task, input.month, input.current_month))
    .map(deliveryTaskEvidence);

  return {
    month: input.month,
    as_of_date: input.as_of_date,
    generated_at: input.generated_at,
    employees,
    unattributed_tasks: unattributedTasks,
  };
}

function chunksOf<T>(values: readonly T[], size = 200): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

function uaeMinutesOfInstant(instant: string): number {
  const parsed = new Date(instant);
  const uae = new Date(parsed.getTime() + 4 * 60 * 60 * 1000);
  return uae.getUTCHours() * 60 + uae.getUTCMinutes();
}

export async function loadMonthlyDeductionsReport(
  supabase: SupabaseClient,
  options: LoadMonthlyDeductionsReportOptions,
): Promise<MonthlyDeductionsReport> {
  const currentMonth = options.today_key.slice(0, 7);
  if (resolveAdminDeductionsMonth(options.month, currentMonth) !== options.month) {
    throw new Error('deductions report month must be current or past');
  }

  const requestedUsernames = options.usernames
    ? [...new Set(options.usernames)].sort()
    : null;
  const employees = await fetchAllProductivityPages<DeductionsEmployeeInput>(
    (from, to) => {
      let query = supabase
        .from('pyra_users')
        .select(
          'username, display_name, role, status, salary, salary_currency, work_schedule_id, hire_date, attendance_tracking_started_on, attendance_tracking_start_source',
        )
        .eq('role', 'employee');
      if (requestedUsernames) query = query.in('username', requestedUsernames);
      return query.order('username').range(from, to);
    },
    500,
    'deductions employees',
  );
  const usernames = employees.map((employee) => employee.username);
  const monthStart = `${options.month}-01`;
  const asOfDate = options.month === currentMonth
    ? options.today_key
    : lastDayKey(options.month);
  const qualityMonths = lastNMonthKeys(
    QUALITY_CONSECUTIVE_MONTHS_REQUIRED,
    options.month,
  );

  if (usernames.length === 0 && !options.include_unattributed) {
    return buildMonthlyDeductionsReport({
      month: options.month,
      current_month: currentMonth,
      as_of_date: asOfDate,
      now_uae_minutes: options.month === currentMonth
        ? uaeMinutesOfInstant(options.current_instant)
        : 24 * 60,
      generated_at: options.current_instant,
      employees: [],
      schedules: [],
      attendance: [],
      approved_leaves: [],
      current_productivity: {
        month: options.month,
        employees: [],
        unattributed_tasks: [],
        next_open_deadline_at: null,
      },
      quality_productivity: qualityMonths.map((month) => ({
        month,
        employees: [],
        unattributed_tasks: [],
        next_open_deadline_at: null,
      })),
      deduction_cases: [],
      manual_deductions: [],
      deduction_payments: [],
    });
  }

  const schedulesPromise = fetchAllProductivityPages<DeductionsScheduleInput>(
      (from, to) => supabase
        .from('pyra_work_schedules')
        .select('id, start_time, work_days, is_default')
        .order('id')
        .range(from, to),
      500,
      'deductions work schedules',
    );
  const attendancePromise = Promise.all(
    chunksOf(usernames).map((usernameChunk) =>
      fetchAllProductivityPages<DeductionsAttendanceInput>(
          (from, to) => supabase
            .from('pyra_attendance')
            .select('username, date, clock_in, status')
            .in('username', usernameChunk)
            .gte('date', monthStart)
            .lte('date', asOfDate)
            .order('date')
            .order('username')
            .range(from, to),
          500,
          'deductions attendance',
        ),
    ),
  ).then((groups) => groups.flat());
  const approvedLeavesPromise = Promise.all(
    chunksOf(usernames).map((usernameChunk) =>
      fetchAllProductivityPages<DeductionsLeaveInput>(
          (from, to) => supabase
            .from('pyra_leave_requests')
            .select('username, start_date, end_date')
            .eq('status', LEAVE_STATUS.APPROVED)
            .in('username', usernameChunk)
            .lte('start_date', asOfDate)
            .gte('end_date', monthStart)
            .order('start_date')
            .order('username')
            .range(from, to),
          500,
          'deductions approved leave',
        ),
    ),
  ).then((groups) => groups.flat());
  const deductionCasesPromise = Promise.all(
    chunksOf(usernames).map((usernameChunk) =>
      fetchAllProductivityPages<PyraDeductionCase>(
          (from, to) => supabase
            .from('pyra_deduction_cases')
            .select('*')
            .in('employee_username', usernameChunk)
            .eq('period_month', monthStart)
            .order('employee_username')
            .order('id')
            .range(from, to),
          500,
          'deductions approval cases',
        ),
    ),
  ).then((groups) => groups.flat());
  const manualDeductionsPromise = Promise.all(
    chunksOf(usernames).map((usernameChunk) =>
      fetchAllProductivityPages<PyraManualDeduction>(
          (from, to) => supabase
            .from('pyra_manual_deductions')
            .select('*')
            .in('employee_username', usernameChunk)
            .eq('period_month', monthStart)
            .order('employee_username')
            .order('created_at')
            .order('id')
            .range(from, to),
          500,
          'manual deduction approvals',
        ),
    ),
  ).then((groups) => groups.flat());
  const deductionPaymentsPromise = Promise.all(
    chunksOf(usernames).map((usernameChunk) =>
      fetchAllProductivityPages<DeductionPaymentEvidence>(
          (from, to) => supabase
            .from('pyra_employee_payments')
            .select(
              'id, username, source_id, description, amount, deduction_cap_exempt_amount, currency, status, payroll_id, effective_month, approved_at, paid_at, cancelled_at, cancelled_by, cancellation_reason, created_at',
            )
            .eq('source_type', EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION)
            .in('username', usernameChunk)
            .order('created_at')
            .order('id')
            .range(from, to),
          500,
          'deductions employee payments',
        ),
    ),
  ).then((groups) => groups.flat());
  const currentProductivityPromise = computeProductivity(
    supabase,
    options.month,
    usernames,
    options.include_unattributed === true,
  );
  const qualityProductivityPromise = Promise.all(
    qualityMonths.map((month) => month === options.month
      ? currentProductivityPromise
      : computeProductivity(supabase, month, usernames, false)),
  );
  const [
    schedules,
    attendance,
    approvedLeaves,
    deductionCases,
    manualDeductions,
    deductionPayments,
    currentProductivity,
    qualityProductivityReports,
  ] = await Promise.all([
    schedulesPromise,
    attendancePromise,
    approvedLeavesPromise,
    deductionCasesPromise,
    manualDeductionsPromise,
    deductionPaymentsPromise,
    currentProductivityPromise,
    qualityProductivityPromise,
  ]);

  return buildMonthlyDeductionsReport({
    month: options.month,
    current_month: currentMonth,
    as_of_date: asOfDate,
    now_uae_minutes: options.month === currentMonth
      ? uaeMinutesOfInstant(options.current_instant)
      : 24 * 60,
    generated_at: options.current_instant,
    employees,
    schedules,
    attendance,
    approved_leaves: approvedLeaves,
    current_productivity: currentProductivity,
    quality_productivity: qualityProductivityReports,
    deduction_cases: deductionCases,
    manual_deductions: manualDeductions,
    deduction_payments: deductionPayments,
  });
}
