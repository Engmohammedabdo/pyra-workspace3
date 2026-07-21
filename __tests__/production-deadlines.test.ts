import { describe, expect, it } from 'vitest';
import {
  dubaiDateTimeToIso,
  isoToDubaiDateTime,
  isDeadlineOverdue,
  legacyDubaiDayEndToIso,
} from '@/lib/production/deadlines';

describe('Dubai deadline conversion', () => {
  it('converts a valid Dubai date and time to the exact UTC instant', () => {
    expect(dubaiDateTimeToIso('2026-07-21', '18:30')).toBe('2026-07-21T14:30:00.000Z');
  });

  it('returns null rather than normalizing malformed or impossible date and time values', () => {
    expect(dubaiDateTimeToIso('2026-02-30', '18:30')).toBeNull();
    expect(dubaiDateTimeToIso('2026-07-21', '24:00')).toBeNull();
    expect(dubaiDateTimeToIso('2026-7-21', '18:30')).toBeNull();
  });

  it('round-trips a UTC instant into the same Dubai wall-clock date and minute', () => {
    expect(isoToDubaiDateTime('2026-07-21T14:30:00.000Z')).toEqual({
      date: '2026-07-21',
      time: '18:30',
    });
  });

  it('returns null when asked to format an invalid ISO instant', () => {
    expect(isoToDubaiDateTime('not-an-iso-instant')).toBeNull();
  });

  it('rejects date-only and normalized impossible ISO instants', () => {
    expect(isoToDubaiDateTime('2026-07-21')).toBeNull();
    expect(isoToDubaiDateTime('2026-02-30T10:00:00Z')).toBeNull();
  });
});

describe('legacy Dubai day-end deadlines', () => {
  it('maps the legacy date-only deadline to Dubai day end', () => {
    expect(legacyDubaiDayEndToIso('2026-07-21')).toBe('2026-07-21T19:59:59.999Z');
  });

  it('keeps malformed legacy dates unscored', () => {
    expect(legacyDubaiDayEndToIso('2026-02-30')).toBeNull();
  });
});

describe('precise overdue checks', () => {
  const dueAt = '2026-07-21T14:30:00.000Z';

  it('is not overdue exactly at the deadline', () => {
    expect(isDeadlineOverdue(dueAt, dueAt)).toBe(false);
  });

  it('is overdue one millisecond after the deadline', () => {
    expect(isDeadlineOverdue(dueAt, '2026-07-21T14:30:00.001Z')).toBe(true);
  });

  it('returns false for missing or invalid instants', () => {
    expect(isDeadlineOverdue(null, dueAt)).toBe(false);
    expect(isDeadlineOverdue(dueAt, 'invalid')).toBe(false);
    expect(isDeadlineOverdue('2026-02-30T10:00:00Z', dueAt)).toBe(false);
    expect(isDeadlineOverdue(dueAt, '2026-07-21')).toBe(false);
  });
});
