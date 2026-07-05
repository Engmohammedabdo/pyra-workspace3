'use client';

/**
 * Phase 15.1 Commit 5 — Week view.
 *
 * 7-column grid (Sunday start, matching ar locale default in date-fns) +
 * 24 hour rows. All-day events shown in a dedicated row at top per column.
 *
 * Layout (RTL — Sat ← ... ← Sun visually right-to-left):
 *
 *   ┌───────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐
 *   │ time  │ Sun │ Mon │ Tue │ Wed │ Thu │ Fri │ Sat │  ← all-day row
 *   ├───────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤
 *   │ 00:00 │  …  │  …  │  …  │  …  │  …  │  …  │  …  │
 *   │ 01:00 │  …  │  …  │  …  │  …  │  …  │  …  │  …  │
 *   │  …    │ ... │ ... │ ... │ ... │ ... │ ... │ ... │
 *   └───────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘
 *
 * Today column is highlighted (orange tint).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { startOfWeek, addDays, format, isSameDay } from 'date-fns';
import { useTranslations, useLocale } from 'next-intl';
import { CalendarEventPill } from './calendar-event-pill';
import { bucketByHour } from './calendar-day-view';
import { cn } from '@/lib/utils/cn';
import { getDateFnsLocale } from '@/lib/i18n/date-locale';
import type { Locale } from '@/lib/i18n/config';
import type { CalendarEvent } from '@/types/database';

interface CalendarWeekViewProps {
  /** Any date within the week to render (we compute startOfWeek). */
  currentDate: Date;
  events: CalendarEvent[];
  today: Date;
}

const MAX_VISIBLE_PER_HOUR = 2; // tighter than day view since columns are narrow

export function CalendarWeekView({ currentDate, events, today }: CalendarWeekViewProps) {
  const t = useTranslations('calendar');
  const locale = useLocale() as Locale;
  const dateFnsLocale = getDateFnsLocale(locale);

  // ar locale defaults to Saturday-start (6). Use weekStartsOn: 0 (Sunday)
  // to match GCC working-week convention (Sun-Thu = workdays in UAE).
  const weekStart = useMemo(
    () => startOfWeek(currentDate, { weekStartsOn: 0 }),
    [currentDate],
  );

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );

  // Bucket events per-day. Each day's bucket reuses bucketByHour.
  const dayBuckets = useMemo(() => {
    return days.map((day) => {
      const key = format(day, 'yyyy-MM-dd');
      const dayEvents = events.filter((ev) => ev.start.slice(0, 10) === key);
      return { day, key, ...bucketByHour(dayEvents) };
    });
  }, [days, events]);

  return (
    <div className="rounded-lg border border-border overflow-x-auto">
      <div className="min-w-[640px]">
        {/* Header row with day names */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/30">
          <div className="px-2 py-2 text-[10px] text-muted-foreground text-center"></div>
          {days.map((day) => {
            const isToday = isSameDay(day, today);
            return (
              <Link
                key={day.toISOString()}
                href={`/dashboard/calendar?view=day&date=${format(day, 'yyyy-MM-dd')}`}
                className={cn(
                  'px-2 py-2 text-center text-[11px] font-semibold hover:bg-muted/50 transition-colors',
                  isToday && 'bg-orange-50/30 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400',
                )}
              >
                <div>{format(day, 'EEE', { locale: dateFnsLocale })}</div>
                <div className="tabular-nums text-sm">{format(day, 'd', { locale: dateFnsLocale })}</div>
              </Link>
            );
          })}
        </div>

        {/* All-day row */}
        <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/10 min-h-[28px]">
          <div className="px-2 py-1 text-[9px] text-muted-foreground text-center uppercase tracking-wider">{t('weekView.allDay')}</div>
          {dayBuckets.map((db) => {
            const isToday = isSameDay(db.day, today);
            return (
              <div
                key={db.key}
                className={cn(
                  'px-1 py-1 space-y-0.5 border-s border-border min-w-0',
                  isToday && 'bg-orange-50/20 dark:bg-orange-950/20',
                )}
              >
                {db.allDay.map((ev) => (
                  <CalendarEventPill key={ev.id} event={ev} variant="compact" />
                ))}
              </div>
            );
          })}
        </div>

        {/* 24 hour rows */}
        {Array.from({ length: 24 }, (_, h) => h).map((h) => {
          const hourLabel = `${String(h).padStart(2, '0')}:00`;
          return (
            <div
              key={h}
              className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border last:border-b-0 min-h-[44px]"
            >
              <div className="px-2 py-1 text-[10px] tabular-nums text-muted-foreground text-center pt-1.5">
                {hourLabel}
              </div>
              {dayBuckets.map((db) => {
                const isToday = isSameDay(db.day, today);
                const evs = db.hours[h];
                const visible = evs.slice(0, MAX_VISIBLE_PER_HOUR);
                const overflow = evs.length - visible.length;
                return (
                  <div
                    key={db.key}
                    className={cn(
                      'px-1 py-1 space-y-0.5 border-s border-border min-w-0',
                      isToday && 'bg-orange-50/10 dark:bg-orange-950/10',
                    )}
                  >
                    {visible.map((ev) => (
                      <CalendarEventPill key={ev.id} event={ev} variant="compact" />
                    ))}
                    {overflow > 0 && (
                      <Link
                        href={`/dashboard/calendar?view=day&date=${db.key}`}
                        className="block text-[9px] text-orange-600 dark:text-orange-400 hover:underline"
                      >
                        {t('weekView.overflow', { count: overflow })}
                      </Link>
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
