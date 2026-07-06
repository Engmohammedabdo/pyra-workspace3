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

import type { Locale } from '@/lib/i18n/config';

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

/**
 * English month names, same index convention as MONTH_NAMES_AR (0 = January).
 * i18n Phase 4 — added so server routes/components can build locale-aware
 * month labels via `monthNamesFor(locale)` instead of reading MONTH_NAMES_AR
 * directly. MONTH_NAMES_AR itself is untouched (locked — Phase 4 constraint).
 */
export const MONTH_NAMES_EN: readonly string[] = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

/**
 * Locale-aware month-names accessor — returns MONTH_NAMES_AR for 'ar', else
 * MONTH_NAMES_EN. Same index convention as both arrays (0 = January).
 */
export function monthNamesFor(locale: Locale): readonly string[] {
  return locale === 'ar' ? MONTH_NAMES_AR : MONTH_NAMES_EN;
}
