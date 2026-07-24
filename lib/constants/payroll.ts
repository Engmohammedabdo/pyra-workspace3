// ============================================================
// Payroll constants — single source of truth.
// Moved out of inline magic numbers in the payroll routes
// (audit 2026-06-30, Phase D). v1.1 backlog: make working-days
// + multiplier admin-editable via pyra_settings + a settings UI.
// ============================================================

/** UAE standard working days per month — basis for the daily rate
 *  used in unpaid-leave deductions (baseSalary / this × days). */
export const PAYROLL_WORKING_DAYS_PER_MONTH = 22;

/** Fallback overtime multiplier when a timesheet row has no
 *  `overtime_multiplier` set. */
export const DEFAULT_OVERTIME_MULTIPLIER = 1.5;

/** Default currency for a new payroll run when none is specified. */
export const DEFAULT_PAYROLL_CURRENCY = 'AED';

/** Employee-payment source types accepted by the payroll APIs. */
export const EMPLOYEE_PAYMENT_SOURCE_TYPE = {
  TASK: 'task',
  OVERTIME: 'overtime',
  BONUS: 'bonus',
  DEDUCTION: 'deduction',
  COMMISSION: 'commission',
  FINAL_SETTLEMENT: 'final_settlement',
} as const;

export const EMPLOYEE_PAYMENT_SOURCE_TYPES = Object.values(EMPLOYEE_PAYMENT_SOURCE_TYPE);

/** Expected business outcomes returned by service-role payroll RPCs. */
export const PAYROLL_RPC_STATUS = {
  OK: 'ok',
  NOT_FOUND: 'not_found',
  INVALID_STATUS: 'invalid_status',
  INVALID_PAYLOAD: 'invalid_payload',
  STALE_CALCULATION: 'stale_calculation',
  STATE_CHANGED: 'state_changed',
  BLOCKED_INPUT: 'blocked_input',
  INTEGRITY_CONFLICT: 'integrity_conflict',
  ALREADY_APPROVED: 'already_approved',
  ALREADY_PAID: 'already_paid',
  ALREADY_CANCELLED: 'already_cancelled',
  PAYMENT_LINKED: 'payment_linked',
  PAYMENT_LINKED_TO_CLOSED_RUN: 'payment_linked_to_closed_run',
  DIRECT_PAY_DISALLOWED: 'direct_pay_disallowed',
  IDEMPOTENCY_CONFLICT: 'idempotency_conflict',
  AMBIGUOUS_PERIOD: 'ambiguous_period',
  CAP_EXHAUSTED: 'cap_exhausted',
  CAP_CHANGED: 'cap_changed',
  CLOSED_PERIOD: 'closed_period',
  FUTURE_PERIOD: 'future_period',
  CURRENT_MONTH_ONLY: 'current_month_only',
  CURRENCY_CONFLICT: 'currency_conflict',
  DUPLICATE_CAUSE: 'duplicate_cause',
  QUALITY_TIMING_UNCONFIRMED: 'quality_timing_unconfirmed',
} as const;
