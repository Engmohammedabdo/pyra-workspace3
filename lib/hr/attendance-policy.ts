// Attendance policy — the "late = absent" deduction rule (locked 2026-07-10).
//
// Company rule: a clock-in later than (schedule start + GRACE) minutes, OR no
// clock-in at all on a work day, counts as an ABSENCE for that day (deductible
// from salary) — UNLESS the admin accepts an excuse / grants permission (that
// stays a manual admin call; the system only DETECTS and counts).
//
// All wall-clock math is UAE (UTC+4, no DST) — consistent with dubaiDayKey.

export const ATTENDANCE_GRACE_MINUTES = 15;

/** Minutes-of-day (0–1439) of a timestamptz in UAE wall-clock (UTC+4). */
export function uaeMinutesOfDay(iso: string): number {
  const d = new Date(new Date(iso).getTime() + 4 * 60 * 60 * 1000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

/** Minutes-of-day for a schedule start string ("HH:MM" or "HH:MM:SS"). */
export function startMinutesOf(startHHMM: string): number {
  const [h, m] = startHHMM.split(':').map(Number);
  return h * 60 + (m || 0);
}

/**
 * Did this clock-in land within the grace window? (null clock-in = not on time.)
 * Strictly: onTime ⇔ clockInMinutes ≤ startMinutes + grace.
 */
export function isOnTimeClockIn(
  clockInIso: string | null | undefined,
  startHHMM: string,
  grace = ATTENDANCE_GRACE_MINUTES,
): boolean {
  if (!clockInIso) return false;
  return uaeMinutesOfDay(clockInIso) <= startMinutesOf(startHHMM) + grace;
}

/** Minutes a clock-in landed after the schedule start (0 if on/before start). */
export function lateMinutesOf(clockInIso: string | null | undefined, startHHMM: string): number {
  if (!clockInIso) return 0;
  return Math.max(0, uaeMinutesOfDay(clockInIso) - startMinutesOf(startHHMM));
}

/**
 * Derived attendance status for a day, per the grace policy:
 *   - clock-in ≤ start+grace       → 'present'
 *   - clock-in >  start+grace      → 'absent'   (deductible)
 *   - no clock-in, grace passed    → 'absent'   (deductible; only on a work day)
 *   - no clock-in, grace not passed→ 'pending'  (day still in progress)
 * Re-derived from clock_in (NOT the stored status) so historical rows written
 * under the old >start-only rule re-classify correctly.
 */
export function deriveDayStatus(
  clockInIso: string | null | undefined,
  startHHMM: string,
  nowUaeMinutes: number,
  grace = ATTENDANCE_GRACE_MINUTES,
): 'present' | 'absent' | 'pending' {
  if (clockInIso) {
    return isOnTimeClockIn(clockInIso, startHHMM, grace) ? 'present' : 'absent';
  }
  return nowUaeMinutes > startMinutesOf(startHHMM) + grace ? 'absent' : 'pending';
}

/**
 * Count deductible-absence days in a month, UP TO todayKey.
 * A work day counts as a deductible absence when it is elapsed, is a scheduled
 * work day, is not on approved leave, is on/after the hire date, and has NO
 * on-time clock-in. Today only counts once its grace window has passed.
 */
export function countDeductibleAbsences(params: {
  monthKey: string;              // "YYYY-MM"
  todayKey: string;              // "YYYY-MM-DD" (UAE)
  workDays: number[];            // 0=Sun … 6=Sat
  startHHMM: string;             // schedule start
  nowUaeMinutes: number;         // minutes-of-day now (UAE)
  onTimeDates: Set<string>;      // "YYYY-MM-DD" with an on-time clock-in
  leaveDates?: Set<string>;      // "YYYY-MM-DD" on approved leave (excluded)
  hireDateKey?: string | null;   // exclude days before hire
  // Do NOT count days before the employee started being tracked (their first
  // attendance record). Prevents counting the setup gap — days before they
  // ever clocked in — as absences. When absent, the caller should pass the
  // employee's earliest attendance date this month.
  startCountingFrom?: string | null;
  grace?: number;
}): number {
  const { monthKey, todayKey, workDays, startHHMM, nowUaeMinutes, onTimeDates } = params;
  const leaveDates = params.leaveDates ?? new Set<string>();
  const grace = params.grace ?? ATTENDANCE_GRACE_MINUTES;
  const [y, m] = monthKey.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  let count = 0;
  for (let day = 1; day <= lastDay; day++) {
    const dateStr = `${monthKey}-${String(day).padStart(2, '0')}`;
    if (dateStr > todayKey) break;
    if (params.hireDateKey && dateStr < params.hireDateKey) continue;
    if (params.startCountingFrom && dateStr < params.startCountingFrom) continue;
    const dow = new Date(y, m - 1, day).getDay();
    if (!workDays.includes(dow)) continue;          // weekend / non-work day
    if (leaveDates.has(dateStr)) continue;          // approved leave — not absence
    if (onTimeDates.has(dateStr)) continue;         // clocked in on time
    // today only counts once its grace window has elapsed
    if (dateStr === todayKey && nowUaeMinutes <= startMinutesOf(startHHMM) + grace) continue;
    count++;
  }
  return count;
}
