/**
 * How many times we try a number before calling it dead, and when.
 *
 * ## Measured problem
 *
 * 2026-08-12: 258 leads were dialled and never reached — but only 24 of them
 * got 3 or more attempts, and 5 got five. The average is 1.6 dials. The lead
 * does not die on the first ring; somebody decides to stop.
 *
 * ## Owner decision (2026-08-12): 4 attempts over 10 days
 *
 * Deliberately lighter than the 6-over-20 industry default, and for a specific
 * reason: 812 new leads arrive every 30 days. A longer cadence would grow the
 * queue faster than the reps can close it, and a queue nobody can finish is the
 * same as no queue.
 *
 * The HOUR rotation matters as much as the count. Answer rate by Dubai hour
 * runs 51% (10:00) to 65% (15:00), so four calls at the same hour to somebody
 * never free at that hour is one attempt made four times.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

export const MAX_ATTEMPTS = 4;

/** Days after the FIRST attempt. Length must equal MAX_ATTEMPTS. */
export const CADENCE_DAY_OFFSETS = [0, 2, 5, 10] as const;

/**
 * Hour shift applied per attempt so consecutive tries never land at the same
 * time of day. Deliberately within ±3 hours, in both directions: a first call
 * placed at a sane hour keeps all four inside the working day, which a larger
 * drift would not. From 13:00 Dubai the four land at 13:00, 15:00, 11:00, 16:00.
 *
 * This only stops four identical calls. Actively TARGETING the measured-best
 * hour (15:00 Dubai answers 65% against 51% at 10:00) is wave 3 feature #09 —
 * doing it here would need the per-agent aggregate that wave builds.
 */
const CADENCE_HOUR_SHIFTS = [0, 2, -2, 3] as const;

/**
 * @param firstAttemptMs epoch ms of attempt #1
 * @param attemptsMade how many attempts have already happened
 * @returns epoch ms for the next attempt, or `null` when they are spent —
 *   which the caller turns into «لا يرد», never into another invisible slot.
 *
 * Negative `attemptsMade` returns `null`, treating it as a caller error.
 * Off-by-one mistakes must surface loud, not silently reschedule the current
 * attempt — the cost of masking the defect (a missed call rescheduled as-is)
 * is higher than the cost of failing the caller.
 */
export function nextAttemptAt(firstAttemptMs: number, attemptsMade: number): number | null {
  if (attemptsMade < 0) return null;
  if (attemptsMade >= MAX_ATTEMPTS) return null;
  const index = attemptsMade;
  return (
    firstAttemptMs +
    CADENCE_DAY_OFFSETS[index] * DAY_MS +
    CADENCE_HOUR_SHIFTS[index] * HOUR_MS
  );
}

export function attemptsExhausted(attemptsMade: number): boolean {
  return attemptsMade >= MAX_ATTEMPTS;
}
