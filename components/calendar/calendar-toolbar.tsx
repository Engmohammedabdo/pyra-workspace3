'use client';

/**
 * Phase 15.1 Commit 5 — Calendar toolbar.
 *
 * Three rows of controls:
 *   1. View switcher tabs (4 buttons): Month / Week / Day / Agenda
 *   2. Date navigation: prev / current-window-label / next / "Today"
 *   3. Type filter chips: Tasks / Follow-ups / Meetings (multi-select)
 *
 * Touch targets: h-11 per Phase 10 mobile standard.
 *
 * RTL chevrons (Reviewer HIGH 2 fix): use ChevronLeft for prev + ChevronRight
 * for next (LTR semantic — "left = back, right = forward") then let
 * `rtl:rotate-180` flip them so they point the correct visual direction in
 * RTL (Arabic reads right-to-left, so "forward in time" = leftward).
 * Matches workspace convention in components/layout/breadcrumb.tsx:106.
 */

import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { format, startOfWeek, endOfWeek } from 'date-fns';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { CALENDAR_EVENT_TONES } from '@/lib/constants/statuses';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { getDateFnsLocale } from '@/lib/i18n/date-locale';
import type { Locale } from '@/lib/i18n/config';
import type { CalendarEventSource } from '@/types/database';

export type CalendarView = 'month' | 'week' | 'day' | 'agenda';

const ALL_SOURCES: CalendarEventSource[] = ['task', 'follow_up', 'meeting'];

interface CalendarToolbarProps {
  view: CalendarView;
  currentDate: Date;
  selectedTypes: CalendarEventSource[];
  onViewChange: (v: CalendarView) => void;
  onDateChange: (d: Date) => void;
  onTypesChange: (t: CalendarEventSource[]) => void;
}

/** Window label shown between prev/next nav buttons. */
function windowLabel(view: CalendarView, currentDate: Date, locale: Locale): string {
  const dateFnsLocale = getDateFnsLocale(locale);
  switch (view) {
    case 'month':
      return format(currentDate, 'MMMM yyyy', { locale: dateFnsLocale });
    case 'week': {
      const start = startOfWeek(currentDate, { weekStartsOn: 0 });
      const end = endOfWeek(currentDate, { weekStartsOn: 0 });
      return `${format(start, 'd', { locale: dateFnsLocale })} – ${format(end, 'd MMMM yyyy', { locale: dateFnsLocale })}`;
    }
    case 'day':
      return format(currentDate, 'EEEE · d MMMM yyyy', { locale: dateFnsLocale });
    case 'agenda':
      return format(currentDate, 'd MMMM yyyy', { locale: dateFnsLocale });
  }
}

/** Step delta in milliseconds per view (for prev/next). */
function stepDate(view: CalendarView, currentDate: Date, direction: 1 | -1): Date {
  const d = new Date(currentDate);
  switch (view) {
    case 'month':
      d.setMonth(d.getMonth() + direction);
      break;
    case 'week':
      d.setDate(d.getDate() + 7 * direction);
      break;
    case 'day':
      d.setDate(d.getDate() + direction);
      break;
    case 'agenda':
      // Agenda is a 30-day rolling window — step by 30 days
      d.setDate(d.getDate() + 30 * direction);
      break;
  }
  return d;
}

export function CalendarToolbar({
  view,
  currentDate,
  selectedTypes,
  onViewChange,
  onDateChange,
  onTypesChange,
}: CalendarToolbarProps) {
  const t = useTranslations('calendar');
  const locale = useLocale() as Locale;
  const sourceLabel = useStatusLabels('calendarEventSource');
  const typeSet = new Set(selectedTypes);

  const VIEW_ORDER: CalendarView[] = ['month', 'week', 'day', 'agenda'];

  function toggleType(source: CalendarEventSource) {
    const next = new Set(typeSet);
    if (next.has(source)) {
      next.delete(source);
    } else {
      next.add(source);
    }
    // Don't allow zero-selection (forces at least one type)
    if (next.size === 0) return;
    onTypesChange(Array.from(next));
  }

  return (
    <div className="space-y-3">
      {/* Row 1: View switcher */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
        <div className="inline-flex rounded-lg border border-border overflow-hidden">
          {VIEW_ORDER.map((v) => {
            const isActive = v === view;
            return (
              <button
                key={v}
                type="button"
                onClick={() => onViewChange(v)}
                className={cn(
                  'h-11 px-4 text-sm transition-colors',
                  isActive
                    ? 'bg-orange-500 text-white font-semibold'
                    : 'bg-background text-muted-foreground hover:bg-muted',
                )}
                aria-pressed={isActive}
              >
                {t(`views.${v}`)}
              </button>
            );
          })}
        </div>
      </div>

      {/* Row 2: Date navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDateChange(stepDate(view, currentDate, -1))}
            className="h-11 w-11 p-0"
            aria-label={t('toolbar.prev')}
          >
            <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDateChange(stepDate(view, currentDate, 1))}
            className="h-11 w-11 p-0"
            aria-label={t('toolbar.next')}
          >
            <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onDateChange(new Date())}
            className="h-11 px-3 ms-1"
          >
            {t('toolbar.today')}
          </Button>
        </div>
        <h2 className="text-base font-semibold text-foreground tabular-nums">
          {windowLabel(view, currentDate, locale)}
        </h2>
      </div>

      {/* Row 3: Type filter chips */}
      <div className="flex flex-wrap items-center gap-1.5">
        {ALL_SOURCES.map((source) => {
          const isActive = typeSet.has(source);
          return (
            <button
              key={source}
              type="button"
              onClick={() => toggleType(source)}
              className={cn(
                'h-9 inline-flex items-center gap-1.5 rounded-full px-3 text-xs font-medium border transition-colors',
                isActive
                  ? CALENDAR_EVENT_TONES[source]
                  : 'bg-muted/30 text-muted-foreground border-border opacity-50 hover:opacity-100',
              )}
              aria-pressed={isActive}
            >
              {isActive && <Check className="size-3" aria-hidden />}
              {sourceLabel(source)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
