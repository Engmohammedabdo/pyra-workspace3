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
