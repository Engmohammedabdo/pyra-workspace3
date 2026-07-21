import { CALENDAR_TIMEZONE, CALENDAR_TIMEZONE_OFFSET } from '@/lib/constants/statuses';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const dubaiDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: CALENDAR_TIMEZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

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

export function dubaiDateTimeToIso(date: string, time: string): string | null {
  return toIso(date, time, '00', '000');
}

export function legacyDubaiDayEndToIso(date: string): string | null {
  return toIso(date, '23:59', '59', '999');
}

export function isoToDubaiDateTime(iso: string): { date: string; time: string } | null {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;

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

export function isDeadlineOverdue(dueAt: string | null, at: string): boolean {
  if (!dueAt) return false;
  const due = Date.parse(dueAt);
  const now = Date.parse(at);
  return Number.isFinite(due) && Number.isFinite(now) && now > due;
}
