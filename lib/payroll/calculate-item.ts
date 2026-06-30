import {
  PAYROLL_WORKING_DAYS_PER_MONTH,
  DEFAULT_OVERTIME_MULTIPLIER,
} from '@/lib/constants/payroll';

export interface PayrollPaymentInput {
  source_type: string; // 'task' | 'bonus' | 'commission' | 'deduction' | 'overtime'
  amount: number | string;
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
 * Attendance/absence is intentionally NOT a factor (user decision).
 */
export function calculatePayrollItem(
  input: PayrollItemInput,
  opts?: { workingDays?: number },
): PayrollItemResult {
  const workingDays = opts?.workingDays ?? PAYROLL_WORKING_DAYS_PER_MONTH;
  const baseSalary = Number(input.baseSalary) || 0;
  const hourlyRate = Number(input.hourlyRate) || 0;

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
  const deductionDetails: DeductionDetail[] = input.payments
    .filter(p => p.source_type === 'deduction')
    .map(p => ({ type: 'deduction', amount: Number(p.amount) }));
  let deductions = deductionDetails.reduce((s, d) => s + d.amount, 0);

  if (baseSalary > 0) {
    const dailyRate = baseSalary / workingDays;
    for (const leave of input.unpaidLeave) {
      const amount = round2(dailyRate * leave.days);
      deductions += amount;
      deductionDetails.push({ type: 'unpaid_leave', amount, reason: `${leave.typeName} — ${leave.days} يوم` });
    }
  }

  const netPay = Math.max(
    0,
    baseSalary + taskPayments + overtimeAmount + bonus + commission - deductions,
  );

  return {
    base_salary: baseSalary,
    task_payments: taskPayments,
    overtime_amount: round2(overtimeAmount),
    bonus,
    commission,
    deductions: round2(deductions),
    deduction_details: deductionDetails,
    net_pay: round2(netPay),
  };
}
