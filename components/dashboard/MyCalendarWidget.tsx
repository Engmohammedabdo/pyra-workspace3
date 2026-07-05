'use client';

/**
 * Phase 15.1 Commit 6 — Dashboard calendar widget.
 *
 * Compact 7-day preview of the user's calendar events, sourced from the
 * unified API shipped in Commit 4. Three sections:
 *   - Overdue: events with start < today (not yet done)
 *   - Today: events on today
 *   - This week: events from today+1 to today+6
 *
 * Section headers are clickable buttons (LOCK 1) — click → calendar with
 * the matching view + date. Footer link → full calendar page.
 *
 * Mobile-first: stacks vertically on narrow screens; the dashboard parent
 * grid puts this widget alongside MyWorkInbox on lg+ viewports (LOCK 2).
 *
 * Permission gate (Q6-1 (a)): widget renders null when user lacks
 * `calendar.view`. No API call fires for unauthorized users (the
 * useCalendarEvents hook is gated by `enabled: hasCalendarView`).
 *
 * Dubai TZ: uses dubaiDayKey for every "today" comparison (Phase 15.1
 * Commit 5 HIGH 1 — `.toISOString().slice(0,10)` would mis-classify the
 * last 4h of every Dubai day).
 */

import { useMemo } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { useTranslations } from 'next-intl';
import {
  CalendarClock,
  CalendarCheck,
  AlertTriangle,
  Calendar as CalendarIcon,
  ArrowLeft,
  ArrowUpRight,
} from 'lucide-react';
import { fetchAPI } from '@/hooks/api-helpers';
import { usePermission } from '@/hooks/usePermission';
import { Skeleton } from '@/components/ui/skeleton';
import { CalendarEventPill } from '@/components/calendar/calendar-event-pill';
import { dubaiDayKey } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import type { CalendarEvent, CalendarEventsResponse } from '@/types/database';

const THIS_WEEK_MAX_PREVIEW = 5;

/**
 * Local fetcher (vs useCalendarEvents hook) so we can apply the widget's
 * refresh strategy (LOCK 3): refetchOnWindowFocus:true,
 * refetchOnMount:'always', staleTime:60s. The shared hook uses 30s stale
 * with no focus refetch — different cache semantics required here.
 */
function useMyCalendarWindow(enabled: boolean) {
  const today = useMemo(() => new Date(), []);
  const from = format(today, 'yyyy-MM-dd');
  const to = format(addDays(today, 6), 'yyyy-MM-dd');
  return useQuery<CalendarEventsResponse>({
    queryKey: ['calendar', 'widget', 'events', { from, to }],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set('from', from);
      sp.set('to', to);
      return fetchAPI<CalendarEventsResponse>(`/api/calendar/events?${sp.toString()}`);
    },
    enabled,
    staleTime: 60_000,
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
  });
}

interface CategorizedEvents {
  overdue: CalendarEvent[];
  today: CalendarEvent[];
  thisWeek: CalendarEvent[];
}

function isEventDone(ev: CalendarEvent): boolean {
  if (ev.source === 'task') return ev.status === 'completed';
  if (ev.source === 'follow_up') return ev.follow_up_status === 'completed';
  return false; // meetings have no done state in v1
}

function categorize(events: CalendarEvent[], todayKey: string): CategorizedEvents {
  const overdue: CalendarEvent[] = [];
  const today: CalendarEvent[] = [];
  const thisWeek: CalendarEvent[] = [];
  for (const ev of events) {
    const evKey = ev.start.slice(0, 10);
    if (evKey < todayKey) {
      // Only show as overdue if not already completed (avoids surfacing
      // "you missed it" for items already handled)
      if (!isEventDone(ev)) overdue.push(ev);
    } else if (evKey === todayKey) {
      today.push(ev);
    } else {
      thisWeek.push(ev);
    }
  }
  return { overdue, today, thisWeek };
}

export function MyCalendarWidget() {
  const t = useTranslations('calendar.widget');
  // LOCK Q6-1 — hide widget entirely for users without calendar.view
  const hasCalendarView = usePermission('calendar.view');
  const query = useMyCalendarWindow(hasCalendarView);

  // Compute todayKey unconditionally so hook order is stable
  const todayKey = useMemo(() => dubaiDayKey(), []);

  const { overdue, today, thisWeek } = useMemo(
    () => categorize(query.data?.events ?? [], todayKey),
    [query.data, todayKey],
  );

  if (!hasCalendarView) return null;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border/40 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/15">
            <CalendarClock className="h-4 w-4 text-white" aria-hidden />
          </div>
          <h2 className="font-bold text-sm">{t('title')}</h2>
        </div>
        <Link
          href="/dashboard/calendar"
          className="text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400 flex items-center gap-1 font-medium"
        >
          {t('viewAll')} <ArrowLeft className="h-3 w-3 rtl:rotate-180" aria-hidden />
        </Link>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4 flex-1">
        {query.isLoading ? (
          <WidgetSkeleton />
        ) : query.error ? (
          <ErrorMini onRetry={() => void query.refetch()} />
        ) : overdue.length === 0 && today.length === 0 && thisWeek.length === 0 ? (
          <EmptyMini />
        ) : (
          <>
            <Section
              title={t('sections.overdue')}
              icon={AlertTriangle}
              tone="destructive"
              count={overdue.length}
              events={overdue}
              href={`/dashboard/calendar?view=agenda&date=${todayKey}`}
            />
            <Section
              title={t('sections.today')}
              icon={CalendarIcon}
              tone="primary"
              count={today.length}
              events={today}
              href={`/dashboard/calendar?view=day&date=${todayKey}`}
            />
            <Section
              title={t('sections.thisWeek')}
              icon={CalendarClock}
              tone="muted"
              count={thisWeek.length}
              events={thisWeek}
              href={`/dashboard/calendar?view=week&date=${todayKey}`}
              maxPreview={THIS_WEEK_MAX_PREVIEW}
            />
          </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ──

interface SectionProps {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'destructive' | 'primary' | 'muted';
  count: number;
  events: CalendarEvent[];
  href: string;
  /** Limit visible events; show an overflow link when exceeded. */
  maxPreview?: number;
}

const TONE_HEADER: Record<SectionProps['tone'], string> = {
  destructive: 'text-red-700 dark:text-red-400',
  primary: 'text-orange-700 dark:text-orange-400',
  muted: 'text-muted-foreground',
};
const TONE_BADGE: Record<SectionProps['tone'], string> = {
  destructive: 'bg-red-500/10 text-red-700 dark:text-red-400',
  primary: 'bg-orange-500/10 text-orange-700 dark:text-orange-400',
  muted: 'bg-muted text-muted-foreground',
};

function Section({ title, icon: Icon, tone, count, events, href, maxPreview }: SectionProps) {
  const t = useTranslations('calendar.widget');
  if (count === 0) return null;
  const visible = maxPreview ? events.slice(0, maxPreview) : events;
  const overflow = events.length - visible.length;
  return (
    <div className="space-y-2">
      <Link
        href={href}
        className={cn(
          'group flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-muted/50 transition-colors',
          'cursor-pointer',
        )}
        aria-label={t('openSectionAria', { section: title })}
      >
        <div className="flex items-center gap-2">
          <Icon className={cn('h-4 w-4', TONE_HEADER[tone])} aria-hidden />
          <span className={cn('text-sm font-semibold', TONE_HEADER[tone])}>{title}</span>
          <span
            className={cn(
              'text-[10px] font-bold tabular-nums rounded-full px-2 py-0.5',
              TONE_BADGE[tone],
            )}
          >
            {count}
          </span>
        </div>
        <ArrowUpRight
          className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity rtl:rotate-90"
          aria-hidden
        />
      </Link>
      <div className="space-y-1.5">
        {visible.map((ev) => (
          <CalendarEventPill key={ev.id} event={ev} variant="full" />
        ))}
        {overflow > 0 && (
          <Link
            href={href}
            className="block text-[11px] text-orange-600 dark:text-orange-400 hover:underline px-2"
          >
            {t('overflow', { count: overflow })}
          </Link>
        )}
      </div>
    </div>
  );
}

function WidgetSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full rounded-md" />
      ))}
    </div>
  );
}

function EmptyMini() {
  const t = useTranslations('calendar.widget');
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
      <CalendarCheck className="h-10 w-10 text-muted-foreground/40" aria-hidden />
      <p className="text-sm font-medium">{t('empty.title')}</p>
      <Link
        href="/dashboard/calendar"
        className="text-xs text-orange-600 dark:text-orange-400 hover:underline"
      >
        {t('empty.cta')}
      </Link>
    </div>
  );
}

function ErrorMini({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations('calendar.widget');
  return (
    <div className="flex flex-col items-center justify-center text-center py-8 gap-2">
      <AlertTriangle className="h-8 w-8 text-red-500" aria-hidden />
      <p className="text-sm font-medium text-foreground">{t('error.title')}</p>
      <button
        type="button"
        onClick={onRetry}
        className="text-xs text-orange-600 dark:text-orange-400 hover:underline"
      >
        {t('error.retry')}
      </button>
    </div>
  );
}
