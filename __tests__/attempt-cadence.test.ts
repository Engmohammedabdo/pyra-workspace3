import { describe, expect, it } from 'vitest';
import {
  nextAttemptAt,
  attemptsExhausted,
  MAX_ATTEMPTS,
  CADENCE_DAY_OFFSETS,
} from '@/lib/calls/attempt-cadence';

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;
// 09:00 UTC = 13:00 Dubai — a normal hour for a first call.
const first = Date.parse('2026-08-12T09:00:00.000Z');

describe('attempt cadence', () => {
  it('matches the owner decision: 4 attempts spanning 10 days', () => {
    expect(MAX_ATTEMPTS).toBe(4);
    expect(CADENCE_DAY_OFFSETS).toEqual([0, 2, 5, 10]);
    expect(CADENCE_DAY_OFFSETS.length).toBe(MAX_ATTEMPTS);
  });

  it('schedules each next attempt on its cadence day, hour shift included', () => {
    // The hour shift is part of the answer, so it is asserted here rather than
    // left to the separate distinct-hours test — an exact-equality assertion
    // that ignored the shift would contradict the implementation and fail.
    expect(nextAttemptAt(first, 1)).toBe(first + 2 * DAY + 2 * HOUR);
    expect(nextAttemptAt(first, 2)).toBe(first + 5 * DAY - 2 * HOUR);
    expect(nextAttemptAt(first, 3)).toBe(first + 10 * DAY + 3 * HOUR);
  });

  it('keeps every attempt within 3 hours of the first, so none leaves the working day', () => {
    // The shifts move across the working day; they must not push a call into
    // the evening. Targeting the measured-best hours (15:00 Dubai answers 65%
    // vs 51% at 10:00) is wave 3's job — this only stops four identical calls.
    for (const n of [1, 2, 3]) {
      const drift = Math.abs(nextAttemptAt(first, n)! - first) % DAY;
      const hours = Math.min(drift, DAY - drift) / HOUR;
      expect(hours).toBeLessThanOrEqual(3);
    }
  });

  it('returns null once the attempts are spent', () => {
    // Null means "stop", and the caller turns that into «لا يرد» — not another
    // silent slot the rep will never see.
    expect(nextAttemptAt(first, 4)).toBeNull();
    expect(nextAttemptAt(first, 9)).toBeNull();
  });

  it('shifts the hour on every attempt', () => {
    // The measured spread is real: 65% answered at 15:00 Dubai vs 51% at 10:00.
    // Four calls at the same hour to someone who is never free at that hour is
    // one attempt made four times.
    const hours = [1, 2, 3].map((n) => new Date(nextAttemptAt(first, n)!).getUTCHours());
    expect(new Set(hours).size).toBe(hours.length);
  });

  it('treats attemptsMade of 0 as "call now"', () => {
    expect(nextAttemptAt(first, 0)).toBe(first);
  });

  it('reports exhaustion exactly at the cap', () => {
    expect(attemptsExhausted(3)).toBe(false);
    expect(attemptsExhausted(4)).toBe(true);
    expect(attemptsExhausted(5)).toBe(true);
  });
});
