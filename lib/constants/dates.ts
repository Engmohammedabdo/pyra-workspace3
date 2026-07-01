/**
 * Shared date-related constants.
 *
 * Phase 6B — extracted from per-file duplicates across attendance components,
 * payroll components, the HR Overview route, and the payslip PDF generator.
 * All sites used index 0 = January (months are 1-based in the DB; callers
 * do `MONTH_NAMES_AR[month - 1]`).
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
