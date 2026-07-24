import {
  PAYROLL_WORKING_DAYS_PER_MONTH,
  DEFAULT_OVERTIME_MULTIPLIER,
} from '@/lib/constants/payroll';
import { MONTHLY_DEDUCTION_CAP_PERCENT } from '@/lib/constants/deductions';

export interface PayrollPaymentInput {
  source_type: string; // 'task' | 'bonus' | 'commission' | 'deduction' | 'overtime'
  amount: number | string;
  /** Explicitly approved portion that does not consume the general deduction cap. */
  deduction_cap_exempt_amount?: number | string | null;
}
export interface OvertimeTimesheetInput {
  hours: number | string;
  multiplier: number | string | null | undefined;
}
export interface UnpaidLeaveInput {
  days: number;
  typeName: string;
}
export interface PayrollItemInput {
  baseSalary: number;
  hourlyRate: number;
  payments: PayrollPaymentInput[];              // approved, unlinked, this month
  overtimeTimesheets: OvertimeTimesheetInput[]; // approved is_overtime rows, this month
  unpaidLeave: UnpaidLeaveInput[];
  /** 0..1 — pro-rates the BASE salary for a partial first month (hire-date
   *  pro-ration). Defaults to 1 (full month). Additions are never pro-rated. */
  prorationFactor?: number;
}
export interface DeductionDetail {
  type: string;
  amount: number;
  reason?: string;
}
export interface PayrollItemResult {
  base_salary: number;
  task_payments: number;
  overtime_amount: number;
  bonus: number;
  commission: number;
  deductions: number;
  monetary_deductions: number;
  unpaid_leave_deductions: number;
  deduction_details: DeductionDetail[];
  net_pay: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const sum = (rows: PayrollPaymentInput[], type: string) =>
  rows.filter(p => p.source_type === type).reduce((s, p) => s + Number(p.amount), 0);

/**
 * Pure per-employee payroll math. No DB access.
 *
 * Locked model (2026-06-30): fixed base salary + manual additions
 * (task / bonus / commission / overtime payments) + timesheet overtime,
 * minus manual deductions + unpaid-leave deductions. net floored at 0.
 *
 * Attendance remains detection-only and raw attendance is never a payroll
 * factor. It reaches payroll only through an explicitly approved deduction
 * payment. An approved attendance portion may be marked cap-exempt on that
 * payment; unpaid leave also remains outside the general deduction cap.
 */
export function calculatePayrollItem(
  input: PayrollItemInput,
  opts?: { workingDays?: number },
): PayrollItemResult {
  const workingDays = opts?.workingDays ?? PAYROLL_WORKING_DAYS_PER_MONTH;
  const baseSalary = Number(input.baseSalary) || 0;
  const hourlyRate = Number(input.hourlyRate) || 0;

  // Hire-date pro-ration applies to the BASE salary only (a new hire's first
  // partial month). Additions (task/bonus/commission/overtime) are paid in full.
  const factor = input.prorationFactor ?? 1;
  const proratedBase = round2(baseSalary * factor);

  const taskPayments = sum(input.payments, 'task');
  const bonus = sum(input.payments, 'bonus');
  const commission = sum(input.payments, 'commission');

  // Overtime = timesheet overtime (hours × hourlyRate × multiplier)
  //          + manual overtime payments
  const timesheetOvertime = input.overtimeTimesheets.reduce(
    (s, t) => s + Number(t.hours) * hourlyRate * (Number(t.multiplier) || DEFAULT_OVERTIME_MULTIPLIER),
    0,
  );
  const overtimeAmount = timesheetOvertime + sum(input.payments, 'overtime');

  // Deductions: manual deduction payments + unpaid-leave (base/workingDays × days)
  const monetaryDeductionCap = round2(baseSalary * MONTHLY_DEDUCTION_CAP_PERCENT / 100);
  let remainingMonetaryCap = monetaryDeductionCap;
  const deductionDetails: DeductionDetail[] = input.payments
    .filter(p => p.source_type === 'deduction')
    .map(p => {
      const rawRequested = Number(p.amount);
      const requested = Number.isFinite(rawRequested)
        ? Math.max(0, round2(rawRequested))
        : 0;
      const rawExempt = Number(p.deduction_cap_exempt_amount ?? 0);
      const exemptAmount = Number.isFinite(rawExempt)
        ? Math.min(requested, Math.max(0, round2(rawExempt)))
        : 0;
      const capEligibleAmount = round2(requested - exemptAmount);
      const cappedAmount = Math.min(capEligibleAmount, remainingMonetaryCap);
      const amount = round2(exemptAmount + cappedAmount);
      remainingMonetaryCap = round2(remainingMonetaryCap - cappedAmount);
      return { type: 'deduction', amount };
    })
    .filter(detail => detail.amount > 0);
  const monetaryDeductions = round2(deductionDetails.reduce((s, d) => s + d.amount, 0));
  let unpaidLeaveDeductions = 0;
  let deductions = monetaryDeductions;

  if (baseSalary > 0) {
    const dailyRate = baseSalary / workingDays;
    for (const leave of input.unpaidLeave) {
      const amount = round2(dailyRate * leave.days);
      deductions += amount;
      unpaidLeaveDeductions += amount;
      deductionDetails.push({ type: 'unpaid_leave', amount, reason: `${leave.typeName} — ${leave.days} يوم` }); // i18n-exempt: stored data (pyra_payroll_items.deduction_details), computed-per-request
    }
  }

  const netPay = Math.max(
    0,
    proratedBase + taskPayments + overtimeAmount + bonus + commission - deductions,
  );

  return {
    base_salary: proratedBase,
    task_payments: taskPayments,
    overtime_amount: round2(overtimeAmount),
    bonus,
    commission,
    deductions: round2(deductions),
    monetary_deductions: monetaryDeductions,
    unpaid_leave_deductions: round2(unpaidLeaveDeductions),
    deduction_details: deductionDetails,
    net_pay: round2(netPay),
  };
}

/**
 * Inclusive count of calendar days a leave [leaveStart, leaveEnd] overlaps a
 * run month [monthStart, monthEnd]. All args are 'YYYY-MM-DD'. Returns 0 when
 * there is no overlap. Used so a leave spanning a month boundary only deducts
 * the days that actually fall inside the run month (cross-month safe).
 */
export function leaveOverlapDays(
  leaveStart: string,
  leaveEnd: string,
  monthStart: string,
  monthEnd: string,
): number {
  const ls = Date.parse(leaveStart.slice(0, 10) + 'T00:00:00Z');
  const le = Date.parse(leaveEnd.slice(0, 10) + 'T00:00:00Z');
  const ms = Date.parse(monthStart.slice(0, 10) + 'T00:00:00Z');
  const me = Date.parse(monthEnd.slice(0, 10) + 'T00:00:00Z');
  if ([ls, le, ms, me].some((n) => Number.isNaN(n))) return 0;
  const from = Math.max(ls, ms);
  const to = Math.min(le, me);
  if (to < from) return 0;
  return Math.floor((to - from) / 86_400_000) + 1;
}

/**
 * Pro-ration factor (0..1) for an employee's FIRST partial month based on
 * hire date, relative to the run's (year, month) — `month` is 1-based.
 *
 *  - No hire date, or hired on/before the run month → 1 (full month).
 *  - Hired AFTER the run month → 0 (not yet employed; caller should skip).
 *  - Hired WITHIN the run month → daysWorked / daysInThatMonth, where
 *    daysWorked counts calendar days from the hire day to month end inclusive.
 *
 * Example: hired 2026-06-29 in a June run (30 days) → 2/30.
 */
export function hireProrationFactor(
  hireDate: string | null | undefined,
  year: number,
  month: number,
): number {
  if (!hireDate) return 1;
  const parts = hireDate.slice(0, 10).split('-');
  if (parts.length < 3) return 1;
  const hy = Number(parts[0]);
  const hm = Number(parts[1]);
  const hd = Number(parts[2]);
  if (!hy || !hm || !hd) return 1;

  // Hired before the run month → employed the whole month.
  if (hy < year || (hy === year && hm < month)) return 1;
  // Hired after the run month → not employed yet.
  if (hy > year || (hy === year && hm > month)) return 0;

  // Hired within the run month → pro-rate by calendar days worked.
  const daysInMonth = new Date(year, month, 0).getDate();
  const daysWorked = daysInMonth - hd + 1;
  if (daysWorked <= 0) return 0;
  if (daysWorked >= daysInMonth) return 1;
  return daysWorked / daysInMonth;
}
