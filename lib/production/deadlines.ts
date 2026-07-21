import { CALENDAR_TIMEZONE, CALENDAR_TIMEZONE_OFFSET } from '@/lib/constants/statuses';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const ISO_INSTANT_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/;
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

export function isValidIsoInstant(iso: string): boolean {
  const match = ISO_INSTANT_PATTERN.exec(iso);
  if (!match) return false;

  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', timezone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  const millisecond = Number(fraction.padEnd(3, '0'));

  if (month < 1 || month > 12 || day < 1 || hour > 23 || minute > 59 || second > 59) return false;
  const local = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  if (
    local.getUTCFullYear() !== year
    || local.getUTCMonth() !== month - 1
    || local.getUTCDate() !== day
    || local.getUTCHours() !== hour
    || local.getUTCMinutes() !== minute
    || local.getUTCSeconds() !== second
    || local.getUTCMilliseconds() !== millisecond
  ) return false;

  if (timezone !== 'Z') {
    const [offsetHour, offsetMinute] = timezone.slice(1).split(':').map(Number);
    if (offsetHour > 23 || offsetMinute > 59) return false;
  }

  return Number.isFinite(Date.parse(iso));
}

export function dubaiDateTimeToIso(date: string, time: string): string | null {
  return toIso(date, time, '00', '000');
}

export function legacyDubaiDayEndToIso(date: string): string | null {
  return toIso(date, '23:59', '59', '999');
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
  if (!dueAt || !at || !isValidIsoInstant(dueAt) || !isValidIsoInstant(at)) return false;
  const due = Date.parse(dueAt);
  const now = Date.parse(at);
  return now > due;
}
