/**
 * Shared date-related constants.
 *
 * Phase 6B — extracted from per-file duplicates across attendance components,
 * payroll components, the HR Overview route, and the payslip PDF generator.
 *
 * Index 0 = January. Two calling conventions exist — pick by where the month
 * number came from:
 *   • 1-based DB month → `MONTH_NAMES_AR[month - 1]`
 *     (payslip PDF, HR Overview, payroll/attendance/my-payslips).
 *   • 0-based JS `Date.getMonth()` → `MONTH_NAMES_AR[month]` directly
 *     (finance vat/pnl/cashflow report routes).
 */

export const MONTH_NAMES_AR: readonly string[] = [
  'يناير',   // 1  January
  'فبراير',  // 2  February
  'مارس',    // 3  March
  'أبريل',   // 4  April
  'مايو',    // 5  May
  'يونيو',   // 6  June
  'يوليو',   // 7  July
  'أغسطس',  // 8  August
  'سبتمبر', // 9  September
  'أكتوبر', // 10 October
  'نوفمبر', // 11 November
  'ديسمبر', // 12 December
] as const;
