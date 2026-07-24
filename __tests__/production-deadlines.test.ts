import { describe, expect, it } from 'vitest';
import {
  dubaiDateTimeToIso,
  isoToDubaiDateTime,
  isDeadlineOverdue,
  isLegacySyntheticDeadline,
  legacyDubaiDayEndToIso,
  resolveTaskDeadlineInput,
  resolveTaskDeadlineUpdate,
  resolveTaskTransferDeadline,
} from '@/lib/production/deadlines';
import { PRODUCTION_BOARD_ID } from '@/lib/constants/production';

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

  it('accepts PostgreSQL microsecond fractions but rejects fractions longer than six digits', () => {
    expect(isoToDubaiDateTime('2026-07-21T14:30:00.123456+00:00')).toEqual({
      date: '2026-07-21',
      time: '18:30',
    });
    expect(isoToDubaiDateTime('2026-07-21T14:30:00.1234567+00:00')).toBeNull();
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

  it('is overdue one microsecond after the deadline', () => {
    expect(
      isDeadlineOverdue(
        '2026-07-21T14:30:00.000000Z',
        '2026-07-21T14:30:00.000001Z',
      ),
    ).toBe(true);
  });

  it('treats differently formatted representations of the same microsecond as equality', () => {
    expect(
      isDeadlineOverdue(
        '2026-07-21T14:30:00.123456Z',
        '2026-07-21T18:30:00.123456+04:00',
      ),
    ).toBe(false);
  });

  it('returns false for missing or invalid instants', () => {
    expect(isDeadlineOverdue(null, dueAt)).toBe(false);
    expect(isDeadlineOverdue(dueAt, 'invalid')).toBe(false);
    expect(isDeadlineOverdue('2026-02-30T10:00:00Z', dueAt)).toBe(false);
    expect(isDeadlineOverdue(dueAt, '2026-07-21')).toBe(false);
  });
});

describe('server-owned task deadline policy', () => {
  it('recognizes only the migration-generated Dubai day-end sentinel as synthetic', () => {
    expect(isLegacySyntheticDeadline(
      '2026-07-21',
      '2026-07-21T19:59:59.999Z',
    )).toBe(true);
    expect(isLegacySyntheticDeadline(
      '2026-07-21',
      '2026-07-21T19:59:00.000Z',
    )).toBe(false);
    expect(isLegacySyntheticDeadline('2026-07-21', null)).toBe(false);
  });

  it('rejects a production task when either exact deadline input is missing', () => {
    expect(resolveTaskDeadlineInput({
      boardId: PRODUCTION_BOARD_ID,
      dueDate: '2026-07-21',
      dueTime: undefined,
    })).toEqual({ ok: false, error: 'required' });

    expect(resolveTaskDeadlineInput({
      boardId: PRODUCTION_BOARD_ID,
      dueDate: undefined,
      dueTime: '18:30',
    })).toEqual({ ok: false, error: 'required' });
  });

  it('rejects a production task with an invalid calendar date or wall-clock time', () => {
    expect(resolveTaskDeadlineInput({
      boardId: PRODUCTION_BOARD_ID,
      dueDate: '2026-02-30',
      dueTime: '18:30',
    })).toEqual({ ok: false, error: 'invalid' });

    expect(resolveTaskDeadlineInput({
      boardId: PRODUCTION_BOARD_ID,
      dueDate: '2026-07-21',
      dueTime: '24:00',
    })).toEqual({ ok: false, error: 'invalid' });
  });

  it('derives the trusted UTC instant from a valid production date and time pair', () => {
    expect(resolveTaskDeadlineInput({
      boardId: PRODUCTION_BOARD_ID,
      dueDate: '2026-07-21',
      dueTime: '18:30',
    })).toEqual({
      ok: true,
      value: {
        due_date: '2026-07-21',
        due_at: '2026-07-21T14:30:00.000Z',
      },
    });
  });

  it('keeps a generic board date-only deadline and ignores a lone or invalid time', () => {
    expect(resolveTaskDeadlineInput({
      boardId: 'bd_generic',
      dueDate: '2026-07-21',
      dueTime: undefined,
    })).toEqual({
      ok: true,
      value: { due_date: '2026-07-21', due_at: null },
    });

    expect(resolveTaskDeadlineInput({
      boardId: 'bd_generic',
      dueDate: '2026-07-21',
      dueTime: 'invalid',
    })).toEqual({
      ok: true,
      value: { due_date: '2026-07-21', due_at: null },
    });
  });

  it('derives an exact instant for a generic board only when the pair is valid', () => {
    expect(resolveTaskDeadlineInput({
      boardId: 'bd_generic',
      dueDate: '2026-07-21',
      dueTime: '18:30',
    })).toEqual({
      ok: true,
      value: {
        due_date: '2026-07-21',
        due_at: '2026-07-21T14:30:00.000Z',
      },
    });
  });

  it('rejects a production deadline edit after the first review entry', () => {
    expect(resolveTaskDeadlineUpdate({
      boardId: PRODUCTION_BOARD_ID,
      dueDate: '2026-07-22',
      dueTime: '10:00',
      hasReviewSubmission: true,
    })).toEqual({ ok: false, error: 'locked' });
  });

  it('copies an already exact source deadline when transferring into production', () => {
    expect(resolveTaskTransferDeadline({
      targetBoardId: PRODUCTION_BOARD_ID,
      sourceDueDate: '2026-07-21',
      sourceDueAt: '2026-07-21T14:30:00.000Z',
      dueDate: undefined,
      dueTime: undefined,
    })).toEqual({
      ok: true,
      value: {
        due_date: '2026-07-21',
        due_at: '2026-07-21T14:30:00.000Z',
      },
    });
  });

  it('requires every production duplicate to supply a fresh exact deadline', () => {
    expect(resolveTaskTransferDeadline({
      targetBoardId: PRODUCTION_BOARD_ID,
      sourceDueDate: '2026-07-21',
      sourceDueAt: '2026-07-21T14:30:00.000Z',
      dueDate: undefined,
      dueTime: undefined,
      requireFreshDeadline: true,
    })).toEqual({ ok: false, error: 'required' });

    expect(resolveTaskTransferDeadline({
      targetBoardId: PRODUCTION_BOARD_ID,
      sourceDueDate: '2026-07-21',
      sourceDueAt: '2026-07-21T14:30:00.000Z',
      dueDate: '2026-07-23',
      dueTime: '18:45',
      requireFreshDeadline: true,
    })).toEqual({
      ok: true,
      value: {
        due_date: '2026-07-23',
        due_at: '2026-07-23T14:45:00.000Z',
      },
    });
  });

  it('rejects a transfer into production when neither a trusted source nor a new pair exists', () => {
    expect(resolveTaskTransferDeadline({
      targetBoardId: PRODUCTION_BOARD_ID,
      sourceDueDate: '2026-07-21',
      sourceDueAt: null,
      dueDate: undefined,
      dueTime: undefined,
    })).toEqual({ ok: false, error: 'required' });
  });

  it('does not treat a mismatched source date and instant as an exact production deadline', () => {
    expect(resolveTaskTransferDeadline({
      targetBoardId: PRODUCTION_BOARD_ID,
      sourceDueDate: '2026-07-22',
      sourceDueAt: '2026-07-21T14:30:00.000Z',
      dueDate: undefined,
      dueTime: undefined,
    })).toEqual({ ok: false, error: 'required' });
  });

  it('derives a supplied pair when moving or duplicating a date-only task into production', () => {
    expect(resolveTaskTransferDeadline({
      targetBoardId: PRODUCTION_BOARD_ID,
      sourceDueDate: '2026-07-21',
      sourceDueAt: null,
      dueDate: '2026-07-22',
      dueTime: '09:15',
    })).toEqual({
      ok: true,
      value: {
        due_date: '2026-07-22',
        due_at: '2026-07-22T05:15:00.000Z',
      },
    });
  });

  it('never promotes an exempt synthetic source deadline into a trusted production deadline', () => {
    expect(resolveTaskTransferDeadline({
      targetBoardId: PRODUCTION_BOARD_ID,
      sourceDueDate: '2026-07-21',
      sourceDueAt: '2026-07-21T19:59:59.999Z',
      sourceDeadlineExempt: true,
      dueDate: undefined,
      dueTime: undefined,
    })).toEqual({ ok: false, error: 'required' });
  });

  it('accepts an explicit exact pair when replacing an exempt synthetic source deadline', () => {
    expect(resolveTaskTransferDeadline({
      targetBoardId: PRODUCTION_BOARD_ID,
      sourceDueDate: '2026-07-21',
      sourceDueAt: '2026-07-21T19:59:59.999Z',
      sourceDeadlineExempt: true,
      dueDate: '2026-07-23',
      dueTime: '18:45',
    })).toEqual({
      ok: true,
      value: {
        due_date: '2026-07-23',
        due_at: '2026-07-23T14:45:00.000Z',
      },
    });
  });

  it('drops an exempt synthetic instant when duplicating into a generic board', () => {
    expect(resolveTaskTransferDeadline({
      targetBoardId: 'bd_generic',
      sourceDueDate: '2026-07-21',
      sourceDueAt: '2026-07-21T19:59:59.999Z',
      sourceDeadlineExempt: true,
      dueDate: undefined,
      dueTime: undefined,
    })).toEqual({
      ok: true,
      value: {
        due_date: '2026-07-21',
        due_at: null,
      },
    });
  });
});
