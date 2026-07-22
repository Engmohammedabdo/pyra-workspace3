import { EMPLOYEE_PAYMENT_SOURCE_TYPE } from '@/lib/constants/payroll';
import { CALENDAR_TIMEZONE_OFFSET } from '@/lib/constants/statuses';

export interface PaymentPeriodRecord {
  id: string;
  source_type: string;
  effective_month: string | null;
  created_at: string;
}

interface PaymentPeriodRange {
  monthKey: string;
  monthStart: string;
  createdAtStart: string;
  createdAtEndExclusive: string;
}

export function payrollPaymentPeriodRange(monthKey: string): PaymentPeriodRange | null {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(year) || month < 1 || month > 12) return null;

  const normalizedMonth = String(month).padStart(2, '0');
  const normalizedKey = `${year}-${normalizedMonth}`;
  const monthStart = `${normalizedKey}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthStart = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  return {
    monthKey: normalizedKey,
    monthStart,
    createdAtStart: `${monthStart}T00:00:00${CALENDAR_TIMEZONE_OFFSET}`,
    createdAtEndExclusive: `${nextMonthStart}T00:00:00${CALENDAR_TIMEZONE_OFFSET}`,
  };
}

function dateMonthKey(value: string | null | undefined): string | null {
  if (!value || !/^\d{4}-\d{2}/.test(value)) return null;
  return value.slice(0, 7);
}

/**
 * Pure payroll guard matching the two database queries:
 * Deductions require an explicit effective_month. Non-deduction rows with no
 * effective month use created_at; final settlements are always off-cycle.
 */
export function paymentBelongsToPayrollPeriod(
  payment: PaymentPeriodRecord,
  monthKey: string,
): boolean {
  const period = payrollPaymentPeriodRange(monthKey);
  if (!period || payment.source_type === EMPLOYEE_PAYMENT_SOURCE_TYPE.FINAL_SETTLEMENT) {
    return false;
  }

  if (payment.effective_month !== null) {
    return payment.source_type === EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION &&
      dateMonthKey(payment.effective_month) === period.monthKey;
  }

  if (payment.source_type === EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION) {
    return false;
  }

  const createdAt = Date.parse(payment.created_at);
  const start = Date.parse(period.createdAtStart);
  const end = Date.parse(period.createdAtEndExclusive);
  return Number.isFinite(createdAt) && createdAt >= start && createdAt < end;
}

export function mergePayrollPeriodPayments<T extends PaymentPeriodRecord>(
  monthKey: string,
  ...groups: ReadonlyArray<ReadonlyArray<T>>
): T[] {
  const merged = new Map<string, T>();

  for (const group of groups) {
    for (const payment of group) {
      if (!merged.has(payment.id) && paymentBelongsToPayrollPeriod(payment, monthKey)) {
        merged.set(payment.id, payment);
      }
    }
  }

  return [...merged.values()];
}

/** PostgREST OR filter used by the generic employee-payments listing route. */
export function buildEmployeePaymentMonthFilter(monthKey: string): string | null {
  const period = payrollPaymentPeriodRange(monthKey);
  if (!period) return null;

  return [
    `and(source_type.eq.${EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION},effective_month.eq.${period.monthStart})`,
    `and(source_type.neq.${EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION},effective_month.is.null,created_at.gte.${period.createdAtStart},created_at.lt.${period.createdAtEndExclusive})`,
  ].join(',');
}
