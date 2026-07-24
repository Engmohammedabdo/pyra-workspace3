import { CALENDAR_TIMEZONE, CALENDAR_TIMEZONE_OFFSET } from '@/lib/constants/statuses';
import { PRODUCTION_BOARD_ID } from '@/lib/constants/production';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ISO_INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/;
const dubaiDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CALENDAR_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export type TaskDeadlineFields = {
  due_date: string | null;
  due_at: string | null;
};

export type TaskDeadlineResolution =
  | { ok: true; value: TaskDeadlineFields }
  | { ok: false; error: 'required' | 'invalid' | 'locked' };

type TaskDeadlineInput = {
  boardId: string;
  dueDate: unknown;
  dueTime: unknown;
};

type TaskDeadlineUpdateInput = TaskDeadlineInput & {
  hasReviewSubmission: boolean;
};

type TaskTransferDeadlineInput = {
  targetBoardId: string;
  sourceDueDate: unknown;
  sourceDueAt: unknown;
  sourceDeadlineExempt?: unknown;
  dueDate: unknown;
  dueTime: unknown;
  /** Duplicates in production are new commitments and must never inherit a deadline. */
  requireFreshDeadline?: boolean;
};

function isValidDubaiDate(date: string): boolean {
  if (!DATE_PATTERN.test(date)) return false;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

function toIso(date: string, time: string, seconds: string, milliseconds: string): string | null {
  if (!isValidDubaiDate(date) || !TIME_PATTERN.test(time)) return null;
  const parsed = new Date(`${date}T${time}:${seconds}.${milliseconds}${CALENDAR_TIMEZONE_OFFSET}`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

interface ParsedIsoInstant {
  epochMilliseconds: number;
  subMillisecondMicroseconds: number;
}

function parseIsoInstant(iso: string): ParsedIsoInstant | null {
  const match = ISO_INSTANT_PATTERN.exec(iso);
  if (!match) return null;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', timezone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.slice(0, 3).padEnd(3, '0'));

  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return null;
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (
    local.getUTCFullYear() !== year
    || local.getUTCMonth() !== month - 1
    || local.getUTCDate() !== day
    || local.getUTCHours() !== hour
    || local.getUTCMinutes() !== minute
    || local.getUTCSeconds() !== second
    || local.getUTCMilliseconds() !== millisecond
  ) return null;

  if (timezone !== 'Z') {
    const [offsetHour, offsetMinute] = timezone.slice(1).split(':').map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return null;
  }

  const epochMilliseconds = Date.parse(iso);
  if (!Number.isFinite(epochMilliseconds)) return null;
  const paddedFraction = fraction.padEnd(6, '0');
  return {
    epochMilliseconds,
    subMillisecondMicroseconds: Number(paddedFraction.slice(3, 6)),
  };
}

export function isValidIsoInstant(iso: string): boolean {
  return parseIsoInstant(iso) !== null;
}

/** Compare two timezone-qualified ISO instants without dropping microseconds. */
export function compareIsoInstants(leftIso: string, rightIso: string): -1 | 0 | 1 | null {
  const left = parseIsoInstant(leftIso);
  const right = parseIsoInstant(rightIso);
  if (!left || !right) return null;

  if (left.epochMilliseconds < right.epochMilliseconds) return -1;
  if (left.epochMilliseconds > right.epochMilliseconds) return 1;
  if (left.subMillisecondMicroseconds < right.subMillisecondMicroseconds) return -1;
  if (left.subMillisecondMicroseconds > right.subMillisecondMicroseconds) return 1;
  return 0;
}

/** Exact left-minus-right duration in microseconds for valid instants. */
export function isoInstantDifferenceMicroseconds(
  leftIso: string,
  rightIso: string,
): number | null {
  const left = parseIsoInstant(leftIso);
  const right = parseIsoInstant(rightIso);
  if (!left || !right) return null;
  return (left.epochMilliseconds - right.epochMilliseconds) * 1_000
    + left.subMillisecondMicroseconds
    - right.subMillisecondMicroseconds;
}

export function dubaiDateTimeToIso(date: string, time: string): string | null {
  return toIso(date, time, '00', '000');
}

export function legacyDubaiDayEndToIso(date: string): string | null {
  return toIso(date, '23:59', '59', '999');
}

/** Exact sentinel written by migration 041 for a date that had no real time. */
export function isLegacySyntheticDeadline(
  dueDateValue: unknown,
  dueAtValue: unknown,
): boolean {
  if (typeof dueDateValue !== 'string' || typeof dueAtValue !== 'string') return false;
  const dueDate = dueDateValue.trim();
  const dueAt = dueAtValue.trim();
  const expected = legacyDubaiDayEndToIso(dueDate);
  return Boolean(expected && dueAt && compareIsoInstants(dueAt, expected) === 0);
}

export function isUnverifiedProductionDeadline(input: {
  dueDate: unknown;
  dueAt: unknown;
  deadlineExempt?: unknown;
}): boolean {
  return input.deadlineExempt === true
    || isLegacySyntheticDeadline(input.dueDate, input.dueAt);
}

export function isoToDubaiDateTime(iso: string): { date: string; time: string } | null {
  if (!isValidIsoInstant(iso)) return null;
  const parsed = new Date(iso);

  const parts = Object.fromEntries(
    dubaiDateTimeFormatter
      .formatToParts(parsed)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );

  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

export function isDeadlineOverdue(dueAt: string | null, at: string | null): boolean {
  if (!dueAt || !at) return false;
  return compareIsoInstants(at, dueAt) === 1;
}

function normalizedText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function resolveTaskDeadlineInput(input: TaskDeadlineInput): TaskDeadlineResolution {
  const dueDate = normalizedText(input.dueDate);
  const dueTime = normalizedText(input.dueTime);

  if (input.boardId === PRODUCTION_BOARD_ID) {
    if (!dueDate || !dueTime) {
      const hasNonStringValue = (
        (input.dueDate !== null && input.dueDate !== undefined && typeof input.dueDate !== 'string')
        || (input.dueTime !== null && input.dueTime !== undefined && typeof input.dueTime !== 'string')
      );
      return hasNonStringValue
        ? { ok: false, error: 'invalid' }
        : { ok: false, error: 'required' };
    }

    const dueAt = dubaiDateTimeToIso(dueDate, dueTime);
    if (!dueAt) return { ok: false, error: 'invalid' };
    return { ok: true, value: { due_date: dueDate, due_at: dueAt } };
  }

  if (!dueDate) {
    if (input.dueDate !== null && input.dueDate !== undefined && normalizedText(input.dueDate) === null) {
      return typeof input.dueDate === 'string'
        ? { ok: true, value: { due_date: null, due_at: null } }
        : { ok: false, error: 'invalid' };
    }
    return { ok: true, value: { due_date: null, due_at: null } };
  }

  if (!isValidDubaiDate(dueDate)) return { ok: false, error: 'invalid' };
  const dueAt = dueTime ? dubaiDateTimeToIso(dueDate, dueTime) : null;
  return {
    ok: true,
    value: {
      due_date: dueDate,
      due_at: dueAt,
    },
  };
}

export function resolveTaskDeadlineUpdate(input: TaskDeadlineUpdateInput): TaskDeadlineResolution {
  if (input.boardId === PRODUCTION_BOARD_ID && input.hasReviewSubmission) {
    return { ok: false, error: 'locked' };
  }
  return resolveTaskDeadlineInput(input);
}

function hasExactTaskDeadline(dueDateValue: unknown, dueAtValue: unknown): boolean {
  const dueDate = normalizedText(dueDateValue);
  const dueAt = normalizedText(dueAtValue);
  if (!dueDate || !dueAt || !isValidDubaiDate(dueDate)) return false;
  return isoToDubaiDateTime(dueAt)?.date === dueDate;
}

export function resolveTaskTransferDeadline(input: TaskTransferDeadlineInput): TaskDeadlineResolution {
  const sourceDueDate = normalizedText(input.sourceDueDate);
  const sourceDueAt = normalizedText(input.sourceDueAt);
  const sourceDeadlineExempt = isUnverifiedProductionDeadline({
    dueDate: sourceDueDate,
    dueAt: sourceDueAt,
    deadlineExempt: input.sourceDeadlineExempt,
  });

  if (input.targetBoardId !== PRODUCTION_BOARD_ID) {
    return {
      ok: true,
      value: {
        due_date: sourceDueDate,
        // An exempt instant is migration provenance, not an employee deadline.
        // Keep only the documented calendar date when duplicating elsewhere.
        due_at: sourceDeadlineExempt ? null : sourceDueAt,
      },
    };
  }

  if (input.requireFreshDeadline) {
    return resolveTaskDeadlineInput({
      boardId: PRODUCTION_BOARD_ID,
      dueDate: input.dueDate,
      dueTime: input.dueTime,
    });
  }

  if (!sourceDeadlineExempt && hasExactTaskDeadline(sourceDueDate, sourceDueAt)) {
    return {
      ok: true,
      value: {
        due_date: sourceDueDate,
        due_at: sourceDueAt,
      },
    };
  }

  return resolveTaskDeadlineInput({
    boardId: PRODUCTION_BOARD_ID,
    dueDate: input.dueDate,
    dueTime: input.dueTime,
  });
}
