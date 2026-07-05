'use client';

/**
 * Phase 15.1 Commit 5 — Month view (default on desktop).
 *
 * 7×N grid (N = 5 or 6 depending on month boundaries). Each cell shows:
 *   - Date number (clickable → switches to day view for that date)
 *   - Up to 3 event chips (compact variant)
 *   - "+N more" link when more events exist (→ day view)
 *
 * Today highlighted with orange tint + border per LOCK 3.
 *
 * Out-of-month days (the "padding" from prev/next month rendered to keep
 * the grid 7-column-aligned) are dimmed.
 */

import { useMemo } from 'react';
import Link from 'next/link';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameDay, isSameMonth,
} from 'date-fns';
import { useTranslations, useLocale } from 'next-intl';
import { CalendarEventPill } from './calendar-event-pill';
import { cn } from '@/lib/utils/cn';
import { getDateFnsLocale } from '@/lib/i18n/date-locale';
import type { Locale } from '@/lib/i18n/config';
import type { CalendarEvent } from '@/types/database';

interface CalendarMonthViewProps {
  currentDate: Date;
  events: CalendarEvent[];
  today: Date;
}

const MAX_VISIBLE_PER_CELL = 3;

// Sunday-first order (UAE working-week convention) — matches the
// `weekStartsOn: 0` grid math below. Keys are plain objects rather than a
// JSON array: a top-level `string[]` value poisons next-intl's global
// `NestedKeyOf<Messages>` type inference (array index signatures resolve to
// a generic `string[]`, not a tuple, which collapses namespace-key lookups
// for the WHOLE `calendar` namespace — verified while wiring this up).
const DAY_NAME_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export function CalendarMonthView({ currentDate, events, today }: CalendarMonthViewProps) {
  const t = useTranslations('calendar');
  const locale = useLocale() as Locale;
  const dateFnsLocale = getDateFnsLocale(locale);
  const dayNames = DAY_NAME_KEYS.map((key) => t(`dayNames.${key}`));

  // Grid spans from startOfWeek(startOfMonth) to endOfWeek(endOfMonth)
  // with Sunday start (UAE working-week convention).
  const gridDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const gridStart = startOfWeek(monthStart, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });
    return eachDayOfInterval({ start: gridStart, end: gridEnd });
  }, [currentDate]);

  // Bucket events per day key for O(1) lookup
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const ev of events) {
      const key = ev.start.slice(0, 10);
      const list = map.get(key) ?? [];
      list.push(ev);
      map.set(key, list);
    }
    return map;
  }, [events]);

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      {/* Day-name header */}
      <div className="grid grid-cols-7 bg-muted/30 border-b border-border">
        {dayNames.map((name) => (
          <div
            key={name}
            className="px-2 py-2 text-center text-[11px] font-semibold text-muted-foreground uppercase tracking-wider"
          >
            {name}
          </div>
        ))}
      </div>

      {/* Day cells — 7 columns, N rows */}
      <div className="grid grid-cols-7 auto-rows-fr">
        {gridDays.map((day, idx) => {
          const key = format(day, 'yyyy-MM-dd');
          const inMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, today);
          const dayEvents = byDay.get(key) ?? [];
          const visible = dayEvents.slice(0, MAX_VISIBLE_PER_CELL);
          const overflow = dayEvents.length - visible.length;
          // Hide bottom border on last row to avoid double-border with parent
          const isLastRow = idx >= gridDays.length - 7;
          // Hide end-border on last column of each row (CSS Grid in RTL handles direction)
          const isWeekEnd = (idx + 1) % 7 === 0;
          return (
            <div
              key={key}
              className={cn(
                'min-h-[100px] p-1.5 space-y-1 transition-colors',
                !isLastRow && 'border-b border-border',
                !isWeekEnd && 'border-e border-border',
                !inMonth && 'bg-muted/10 opacity-50',
                isToday &&
                  'bg-orange-50/30 border-orange-300 dark:bg-orange-950/30 dark:border-orange-700',
              )}
            >
              <div className="flex items-center justify-between">
                <Link
                  href={`/dashboard/calendar?view=day&date=${key}`}
                  className={cn(
                    'text-xs tabular-nums hover:underline',
                    isToday
                      ? 'font-bold text-orange-700 dark:text-orange-400'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                  aria-label={t('monthView.viewDay', { date: format(day, 'd MMMM', { locale: dateFnsLocale }) })}
                >
                  {format(day, 'd', { locale: dateFnsLocale })}
                </Link>
              </div>
              <div className="space-y-0.5">
                {visible.map((ev) => (
                  <CalendarEventPill key={ev.id} event={ev} variant="compact" />
                ))}
                {overflow > 0 && (
                  <Link
                    href={`/dashboard/calendar?view=day&date=${key}`}
                    className="block text-[10px] text-orange-600 dark:text-orange-400 hover:underline px-1"
                  >
                    {t('monthView.overflow', { count: overflow })}
                  </Link>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
