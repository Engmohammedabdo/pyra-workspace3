import { WEEKEND_DAYS } from '@/lib/constants/auth';

/**
 * Count working days between two YYYY-MM-DD dates INCLUSIVE, excluding weekend
 * days (default: Sunday only — Pyramedia's weekend per WEEKEND_DAYS). Returns 0
 * if either date is invalid or end < start. Dates are parsed as UTC midday to
 * avoid timezone/DST drift when iterating day-by-day.
 */
export function countLeaveDays(
  startDate: string,
  endDate: string,
  weekendDays: readonly number[] = WEEKEND_DAYS,
): number {
  const start = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return 0;
  let count = 0;
  const cur = new Date(start);
  while (cur <= end) {
    if (!weekendDays.includes(cur.getUTCDay())) count++;
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return count;
}
