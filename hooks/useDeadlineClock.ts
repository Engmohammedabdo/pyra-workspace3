'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  isValidIsoInstant,
  isoToDubaiDateTime,
  legacyDubaiDayEndToIso,
} from '@/lib/production/deadlines';

const CLOCK_FALLBACK_INTERVAL_MS = 60_000;

const dateOnlyFormatters = {
  ar: new Intl.DateTimeFormat('ar-EG', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }),
  en: new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }),
};

export type TaskDeadlineDisplay =
  | { kind: 'exact'; date: string; time: string }
  | { kind: 'legacy'; label: string };

function nextClockDelay(nowMs: number, deadlines: number[]): number {
  const nextDeadline = deadlines
    .filter((deadline) => deadline >= nowMs)
    .reduce<number | null>(
      (nearest, deadline) => nearest === null || deadline < nearest ? deadline : nearest,
      null,
    );
  const untilNextMinute = CLOCK_FALLBACK_INTERVAL_MS
    - (nowMs % CLOCK_FALLBACK_INTERVAL_MS)
    + 1;
  const untilDeadline = nextDeadline === null
    ? Number.POSITIVE_INFINITY
    : nextDeadline - nowMs + 1;
  return Math.max(1, Math.min(untilNextMinute, untilDeadline));
}

/**
 * Keeps exact-deadline consumers current even while the page is idle. It wakes
 * one millisecond after the nearest known deadline, with a minute-boundary
 * fallback for Dubai day changes and newly received data.
 */
export function useDeadlineClock(
  deadlineInstants: readonly (string | null | undefined)[] = [],
): string {
  const deadlineKey = deadlineInstants.filter((value): value is string => !!value).join('|');
  const deadlines = useMemo(
    () => deadlineKey
      .split('|')
      .filter((value) => isValidIsoInstant(value))
      .map((value) => Date.parse(value)),
    [deadlineKey],
  );
  const [currentInstant, setCurrentInstant] = useState(() => new Date().toISOString());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = () => {
      const nowMs = Date.now();
      setCurrentInstant(new Date(nowMs).toISOString());
      timer = setTimeout(tick, nextClockDelay(nowMs, deadlines));
    };

    tick();
    return () => {
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [deadlines]);

  return currentInstant;
}

/**
 * A non-null exact value is authoritative. Invalid exact data is hidden rather
 * than silently replaced by the legacy date-only value.
 */
export function resolveTaskDeadlineDisplay(
  dueAt: string | null | undefined,
  dueDate: string | null | undefined,
  locale: string,
): TaskDeadlineDisplay | null {
  if (dueAt !== null && dueAt !== undefined) {
    const exact = isoToDubaiDateTime(dueAt);
    return exact ? { kind: 'exact', ...exact } : null;
  }

  if (!dueDate || !legacyDubaiDayEndToIso(dueDate)) return null;
  const formatter = locale.startsWith('ar') ? dateOnlyFormatters.ar : dateOnlyFormatters.en;
  return {
    kind: 'legacy',
    label: formatter.format(new Date(`${dueDate}T00:00:00.000Z`)),
  };
}
