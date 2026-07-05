'use client';

/**
 * Phase 15.1 Commit 5 — Agenda view.
 *
 * Linear list grouped by date with section headers. Best UX for narrow
 * screens (Q5-1 default on mobile) and long-range scanning.
 *
 * Section header label uses formatTaskDueDate semantics (Today / Tomorrow /
 * "DD MMM") for friendly relative dates. Within-section sort matches API
 * (start ASC + tiebreakers).
 *
 * Empty section: rendered with inline text per Q5-3 (a).
 */

import { useMemo } from 'react';
import { format } from 'date-fns';
import { useTranslations, useLocale } from 'next-intl';
import { CalendarEventPill } from './calendar-event-pill';
import { formatTaskDueDate, dubaiDayKey } from '@/lib/utils/format';
import { getDateFnsLocale } from '@/lib/i18n/date-locale';
import type { Locale } from '@/lib/i18n/config';
import type { CalendarEvent } from '@/types/database';

interface CalendarAgendaViewProps {
  events: CalendarEvent[];
  /** Used to label "today" relative to the user's current view. */
  today?: Date;
}

interface DateGroup {
  /** YYYY-MM-DD key for grouping */
  key: string;
  /** Friendly label: Today / Tomorrow / "DD MMM YYYY" */
  label: string;
  events: CalendarEvent[];
}

/** Group events by their day component (in Dubai TZ, derived from the
 *  Dubai-offset ISO string we get from the API). */
function groupByDay(events: CalendarEvent[], locale: Locale): DateGroup[] {
  const today = new Date();
  const dateFnsLocale = getDateFnsLocale(locale);
  const map = new Map<string, CalendarEvent[]>();
  for (const ev of events) {
    // "2026-05-16T15:30:00+04:00" → "2026-05-16"
    const dayKey = ev.start.slice(0, 10);
    const list = map.get(dayKey) ?? [];
    list.push(ev);
    map.set(dayKey, list);
  }
  // Sort keys ascending then build groups with friendly labels
  const sortedKeys = Array.from(map.keys()).sort();
  return sortedKeys.map((key) => {
    const day = new Date(`${key}T12:00:00+04:00`); // noon Dubai → safe day identity
    const due = formatTaskDueDate(key, today, locale);
    // Use the formatter's label when it's a relative-friendly term;
    // for non-friendly (the "DD MMM" fallback), prefer a fuller
    // "DD MMM YYYY · weekday" header for the agenda's reading flow.
    // Structural check (Phase 2 Task 4) — replaces the former AR-label
    // string-sniff (`due.label === '<Today (AR)>' || ...`), which broke
    // once formatTaskDueDate became locale-aware. `kind` is locale-independent:
    // 'today' | 'tomorrow' | 'upcoming' | 'overdue' are all relative-friendly;
    // 'date' (and 'none') fall back to the fuller weekday header.
    const isRelative = due.kind !== 'date' && due.kind !== 'none';
    const label = isRelative
      ? due.label
      : format(day, 'EEEE · dd MMMM yyyy', { locale: dateFnsLocale });
    return { key, label, events: map.get(key) ?? [] };
  });
}

export function CalendarAgendaView({ events, today: _today }: CalendarAgendaViewProps) {
  const t = useTranslations('calendar');
  const locale = useLocale() as Locale;
  const groups = useMemo(() => groupByDay(events, locale), [events, locale]);

  // Detect "today" group for styling — Dubai-day, NOT UTC-day (Reviewer
  // HIGH 1 fix). `.toISOString().slice(0,10)` would mis-attribute the
  // last 4 hours of every Dubai day to the NEXT day's group.
  const todayKey = dubaiDayKey(_today);

  if (groups.length === 0) {
    // The parent renders the global empty state; agenda just shows nothing
    // here when there are no events at all (parent handles the full empty).
    return null;
  }

  return (
    <div className="space-y-4">
      {groups.map((g) => {
        const isToday = g.key === todayKey;
        return (
          <section key={g.key} className="space-y-2">
            <header
              className={
                isToday
                  ? 'flex items-center gap-2 text-sm font-bold text-orange-700 dark:text-orange-400'
                  : 'flex items-center gap-2 text-sm font-semibold text-foreground'
              }
            >
              <span>{g.label}</span>
              <span className="text-[10px] font-normal text-muted-foreground tabular-nums">
                {t('agenda.eventCount', { count: g.events.length })}
              </span>
            </header>
            <div className="space-y-1.5">
              {g.events.map((ev) => (
                <CalendarEventPill key={ev.id} event={ev} variant="full" />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
