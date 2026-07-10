import { describe, it, expect } from 'vitest';
import {
  ATTENDANCE_GRACE_MINUTES,
  uaeMinutesOfDay,
  startMinutesOf,
  isOnTimeClockIn,
  lateMinutesOf,
  deriveDayStatus,
  countDeductibleAbsences,
} from '@/lib/hr/attendance-policy';

// UAE is UTC+4 (no DST): a UAE wall-clock time T is the UTC instant T-4h.
const uae = (isoUtc: string) => isoUtc; // clarity alias — pass UTC ISO directly

describe('attendance-policy time math', () => {
  it('uaeMinutesOfDay converts a UTC timestamp to UAE minutes-of-day', () => {
    expect(uaeMinutesOfDay('2026-07-08T06:56:00Z')).toBe(10 * 60 + 56); // UAE 10:56
    expect(uaeMinutesOfDay('2026-07-09T15:30:00Z')).toBe(19 * 60 + 30); // UAE 19:30
  });

  it('startMinutesOf parses HH:MM and HH:MM:SS', () => {
    expect(startMinutesOf('11:00')).toBe(660);
    expect(startMinutesOf('11:00:00')).toBe(660);
    expect(startMinutesOf('09:30')).toBe(570);
  });
});

describe('isOnTimeClockIn (grace window)', () => {
  const start = '11:00';
  it('on/before start is on time', () => {
    expect(isOnTimeClockIn('2026-07-06T06:52:00Z', start)).toBe(true); // 10:52
  });
  it('within the 15-min grace is on time (11:11, 11:15)', () => {
    expect(isOnTimeClockIn('2026-07-07T07:11:00Z', start)).toBe(true); // 11:11
    expect(isOnTimeClockIn('2026-07-07T07:15:00Z', start)).toBe(true); // 11:15 (== grace edge)
  });
  it('after the grace is NOT on time (11:16, 19:30)', () => {
    expect(isOnTimeClockIn('2026-07-07T07:16:00Z', start)).toBe(false); // 11:16
    expect(isOnTimeClockIn('2026-07-09T15:30:00Z', start)).toBe(false); // 19:30
  });
  it('null clock-in is never on time', () => {
    expect(isOnTimeClockIn(null, start)).toBe(false);
  });
  it('grace constant is 15 minutes', () => {
    expect(ATTENDANCE_GRACE_MINUTES).toBe(15);
  });
});

describe('lateMinutesOf', () => {
  it('is 0 on/before start and within grace still reports raw minutes', () => {
    expect(lateMinutesOf('2026-07-06T06:52:00Z', '11:00')).toBe(0); // 10:52
    expect(lateMinutesOf('2026-07-07T07:11:00Z', '11:00')).toBe(11); // 11:11
    expect(lateMinutesOf('2026-07-09T15:30:00Z', '11:00')).toBe(510); // 19:30
  });
});

describe('deriveDayStatus', () => {
  const start = '11:00';
  const now = 16 * 60; // 16:00
  it('on-time clock-in → present', () => {
    expect(deriveDayStatus('2026-07-08T06:56:00Z', start, now)).toBe('present'); // 10:56
  });
  it('after-grace clock-in → absent (even though they clocked in)', () => {
    expect(deriveDayStatus('2026-07-09T15:30:00Z', start, now)).toBe('absent'); // 19:30
  });
  it('no clock-in, grace already passed → absent', () => {
    expect(deriveDayStatus(null, start, now)).toBe('absent');
  });
  it('no clock-in, grace not yet passed → pending', () => {
    expect(deriveDayStatus(null, start, 11 * 60 + 5)).toBe('pending'); // 11:05, before 11:15
  });
});

describe('countDeductibleAbsences — Abdelrahman scenario (July 2026)', () => {
  // Mon–Sat work week (weekend = Sunday only). Shift starts 11:00.
  const workDays = [1, 2, 3, 4, 5, 6];
  const base = {
    monthKey: '2026-07',
    todayKey: '2026-07-10', // Friday
    workDays,
    startHHMM: '11:00',
    nowUaeMinutes: 15 * 60 + 54, // 15:54 → today's grace has passed
    startCountingFrom: '2026-07-06', // first attendance record
  };

  it('counts Thu (19:30, after grace) + Fri (no clock-in) = 2 absences', () => {
    const onTimeDates = new Set(['2026-07-06', '2026-07-07', '2026-07-08']); // 10:52, 11:11, 10:56
    expect(countDeductibleAbsences({ ...base, onTimeDates })).toBe(2);
  });

  it('an approved-leave day is not an absence', () => {
    const onTimeDates = new Set(['2026-07-06', '2026-07-07', '2026-07-08']);
    const leaveDates = new Set(['2026-07-10']); // Friday on approved leave
    expect(countDeductibleAbsences({ ...base, onTimeDates, leaveDates })).toBe(1); // only Thu
  });

  it('does not count days before the first attendance record (setup gap)', () => {
    // Without startCountingFrom, July 1–4 work days would all count as absences.
    const onTimeDates = new Set(['2026-07-06', '2026-07-07', '2026-07-08']);
    const withGap = countDeductibleAbsences({ ...base, startCountingFrom: null, onTimeDates });
    expect(withGap).toBeGreaterThan(2); // over-counts the pre-tracking days
  });

  it('today is not counted as absent before its grace window passes', () => {
    const onTimeDates = new Set(['2026-07-06', '2026-07-07', '2026-07-08']);
    const earlyToday = countDeductibleAbsences({
      ...base,
      nowUaeMinutes: 11 * 60 + 5, // 11:05, before the 11:15 grace edge
      onTimeDates,
    });
    expect(earlyToday).toBe(1); // only Thu; Fri (today) still pending
  });
});
