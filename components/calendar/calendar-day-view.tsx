'use client';

/**
 * Phase 15.1 Commit 5 — Day view.
 *
 * Single-day timeline with:
 *   - All-day events (tasks) shown in a row at the top
 *   - 24 hour rows (00:00–23:00) below, each containing the events that
 *     fall in that hour
 *
 * LOCK 4 — hour granularity (v1):
 *   - All timed events snap to their starting hour row
 *   - Event at 14:30 → renders in the 14:00 row
 *   - Time prefix in the pill shows the actual HH:MM for clarity
 *   - Stacked vertically within a row; limit 3 + a "+N more" overflow link
 *   - v1.1 backlog: minute-precision + side-by-side overlapping layout
 *
 * Reused by week view via the bucketByHour helper.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { CalendarEventPill } from './calendar-event-pill';
import { cn } from '@/lib/utils/cn';
import { dubaiDayKey } from '@/lib/utils/format';
import type { CalendarEvent } from '@/types/database';

interface CalendarDayViewProps {
  /** ISO date YYYY-MM-DD of the day to show */
  dateKey: string;
  events: CalendarEvent[];
  today: Date;
}

/** Extract the hour (0-23) from a Dubai-offset ISO start string. */
export function hourOf(start: string): number {
  // "2026-05-16T15:30:00+04:00" → "15" → 15
  const tIdx = start.indexOf('T');
  if (tIdx < 0) return 0;
  const hh = start.slice(tIdx + 1, tIdx + 3);
  const n = parseInt(hh, 10);
  return Number.isFinite(n) ? n : 0;
}

/** Bucket events into 24 hour-rows + an all-day row. */
export function bucketByHour(events: CalendarEvent[]): {
  allDay: CalendarEvent[];
  hours: CalendarEvent[][];
} {
  const hours: CalendarEvent[][] = Array.from({ length: 24 }, () => []);
  const allDay: CalendarEvent[] = [];
  for (const ev of events) {
    if (ev.all_day) {
      allDay.push(ev);
    } else {
      const h = hourOf(ev.start);
      hours[h].push(ev);
    }
  }
  return { allDay, hours };
}

const MAX_VISIBLE_PER_HOUR = 3;

export function CalendarDayView({ dateKey, events, today }: CalendarDayViewProps) {
  const t = useTranslations('calendar');
  // Filter events to just the target day (caller usually provides only
  // that day's events, but be defensive — week-view shares one query).
  const dayEvents = useMemo(
    () => events.filter((ev) => ev.start.slice(0, 10) === dateKey),
    [events, dateKey],
  );
  const { allDay, hours } = useMemo(() => bucketByHour(dayEvents), [dayEvents]);

  // Dubai-day key (Reviewer HIGH 1 fix) — .toISOString().slice(0,10)
  // would mis-classify the last 4h of every Dubai day as "tomorrow".
  const todayKey = dubaiDayKey(today);
  const isToday = dateKey === todayKey;

  return (
    <div className="space-y-3">
      {/* All-day row */}
      {allDay.length > 0 && (
        <div
          className={cn(
            'rounded-lg border p-2 space-y-1',
            isToday
              ? 'bg-orange-50/30 border-orange-300 dark:bg-orange-950/30 dark:border-orange-700'
              : 'bg-muted/30 border-border',
          )}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{t('dayView.allDay')}</p>
          <div className="space-y-1">
            {allDay.map((ev) => (
              <CalendarEventPill key={ev.id} event={ev} variant="full" />
            ))}
          </div>
        </div>
      )}

      {/* Hour grid */}
      <div className="rounded-lg border border-border overflow-hidden">
        {hours.map((evs, h) => {
          const hourLabel = `${String(h).padStart(2, '0')}:00`;
          const visible = evs.slice(0, MAX_VISIBLE_PER_HOUR);
          const overflow = evs.length - visible.length;
          return (
            <div
              key={h}
              className={cn(
                'flex items-start gap-3 px-3 py-1.5 border-b border-border last:border-b-0 min-h-[44px]',
                isToday && 'bg-orange-50/10 dark:bg-orange-950/10',
              )}
            >
              <span className="w-12 shrink-0 text-[10px] tabular-nums text-muted-foreground pt-1">{hourLabel}</span>
              <div className="flex-1 space-y-1 min-w-0">
                {visible.length === 0 ? (
                  <span className="text-[10px] text-muted-foreground/40">—</span>
                ) : (
                  <>
                    {visible.map((ev) => (
                      <CalendarEventPill key={ev.id} event={ev} variant="full" />
                    ))}
                    {overflow > 0 && (
                      <Link
                        href={`/dashboard/calendar?view=day&date=${dateKey}`}
                        className="block text-[10px] text-orange-600 dark:text-orange-400 hover:underline pt-0.5"
                      >
                        {t('dayView.overflow', { count: overflow })}
                      </Link>
                    )}
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
