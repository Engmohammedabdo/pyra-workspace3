'use client';

/**
 * Phase 15.1 Commit 5 — Calendar page client orchestrator.
 *
 * Responsibilities:
 *   - URL state: view, date, types (LOCK 2 — shareable + back/forward)
 *   - Window math: maps `view + currentDate` → from/to date range
 *   - React Query integration via useCalendarEvents
 *   - View dispatch: render month/week/day/agenda based on `view`
 *   - Mobile default: agenda on viewports < 768px (Q5-1 (a))
 *   - Empty state: inline per Q5-3 (a) with CTAs to source pages
 *   - Loading / error states per LOCK 5
 *
 * Window strategy:
 *   month  → startOfWeek(startOfMonth) → endOfWeek(endOfMonth)  (~35-42d)
 *   week   → startOfWeek → endOfWeek                              (7d)
 *   day    → currentDate → currentDate                            (1d)
 *   agenda → currentDate → currentDate + 30d                      (30d)
 *
 * All windows stay within the API's 62-day max (Commit 4).
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  startOfWeek, endOfWeek, startOfMonth, endOfMonth,
  format, addDays,
} from 'date-fns';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ClipboardList, Clock, CalendarClock, CalendarPlus, AlertCircle } from 'lucide-react';
import { useCalendarEvents } from '@/hooks/useCalendarEvents';
import { CalendarToolbar, type CalendarView } from '@/components/calendar/calendar-toolbar';
import { CalendarMonthView } from '@/components/calendar/calendar-month-view';
import { CalendarWeekView } from '@/components/calendar/calendar-week-view';
import { CalendarDayView } from '@/components/calendar/calendar-day-view';
import { CalendarAgendaView } from '@/components/calendar/calendar-agenda-view';
import { ApiError } from '@/hooks/api-helpers';
import { CALENDAR_MAX_WINDOW_DAYS } from '@/lib/constants/statuses';
import type { CalendarEventSource } from '@/types/database';

const ALL_TYPES: CalendarEventSource[] = ['task', 'follow_up', 'meeting'];
const VALID_VIEWS: CalendarView[] = ['month', 'week', 'day', 'agenda'];

interface CalendarClientProps {
  /** Default view when no `?view=` param is present. Server passes 'agenda'
   *  for mobile when User-Agent suggests it; client overrides via URL anyway. */
  defaultView?: CalendarView;
}

function parseView(raw: string | null, fallback: CalendarView): CalendarView {
  if (raw && (VALID_VIEWS as string[]).includes(raw)) return raw as CalendarView;
  return fallback;
}

function parseDate(raw: string | null): Date {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const d = new Date(`${raw}T12:00:00+04:00`);
    if (!isNaN(d.getTime())) return d;
  }
  return new Date();
}

function parseTypes(raw: string | null): CalendarEventSource[] {
  if (!raw) return ALL_TYPES;
  const parts = raw.split(',').map((s) => s.trim());
  const valid = parts.filter((s): s is CalendarEventSource =>
    ALL_TYPES.includes(s as CalendarEventSource),
  );
  return valid.length > 0 ? valid : ALL_TYPES;
}

/** Compute from/to window based on view + currentDate. */
function computeWindow(view: CalendarView, currentDate: Date): { from: string; to: string } {
  let from: Date;
  let to: Date;
  switch (view) {
    case 'month':
      from = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 0 });
      to = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 0 });
      break;
    case 'week':
      from = startOfWeek(currentDate, { weekStartsOn: 0 });
      to = endOfWeek(currentDate, { weekStartsOn: 0 });
      break;
    case 'day':
      from = currentDate;
      to = currentDate;
      break;
    case 'agenda':
      from = currentDate;
      to = addDays(currentDate, 30);
      break;
  }
  return {
    from: format(from, 'yyyy-MM-dd'),
    to: format(to, 'yyyy-MM-dd'),
  };
}

export function CalendarClient({ defaultView = 'month' }: CalendarClientProps) {
  const t = useTranslations('calendar');
  const router = useRouter();
  const sp = useSearchParams();

  // Mobile-default override: agenda on narrow viewports (Q5-1 (a)).
  // Detect via matchMedia after mount to avoid hydration mismatch.
  const [mobileDefault, setMobileDefault] = useState<CalendarView>(defaultView);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mq = window.matchMedia('(max-width: 767px)');
    if (mq.matches) setMobileDefault('agenda');
    const handler = (e: MediaQueryListEvent) => {
      // Only flip the default for users with no explicit ?view= — those
      // who have set a view via URL keep it across viewport changes.
      if (sp.get('view')) return;
      setMobileDefault(e.matches ? 'agenda' : defaultView);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [defaultView, sp]);

  // Derive state from URL
  const view = parseView(sp.get('view'), mobileDefault);
  const currentDate = parseDate(sp.get('date'));
  const selectedTypes = parseTypes(sp.get('types'));

  // Today reference (kept stable per mount; rebuilt on every render is fine —
  // not a render-perf concern since the calendar tree is small)
  const today = useMemo(() => new Date(), []);

  // URL writer — shallow replace, no scroll jump
  const updateUrl = useCallback(
    (patch: { view?: CalendarView; date?: Date; types?: CalendarEventSource[] }) => {
      const params = new URLSearchParams(sp.toString());
      if (patch.view !== undefined) {
        // Reviewer MEDIUM fix — ALWAYS serialize the explicit user choice
        // to the URL. Previously we deleted `?view=` when it matched
        // `mobileDefault`, but `mobileDefault` flips on viewport
        // rotation — causing silent view changes when the user later
        // rotated their device. With this change, an explicit click is
        // sticky: the URL records the choice, the choice survives
        // rotation, and shareable URLs always spell out the view.
        params.set('view', patch.view);
      }
      if (patch.date !== undefined) {
        const todayKey = format(today, 'yyyy-MM-dd');
        const dateKey = format(patch.date, 'yyyy-MM-dd');
        if (dateKey === todayKey) params.delete('date');
        else params.set('date', dateKey);
      }
      if (patch.types !== undefined) {
        const sortedSel = [...patch.types].sort();
        const sortedAll = [...ALL_TYPES].sort();
        if (
          sortedSel.length === sortedAll.length &&
          sortedSel.every((v, i) => v === sortedAll[i])
        ) {
          params.delete('types');
        } else {
          params.set('types', sortedSel.join(','));
        }
      }
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, sp, mobileDefault, today],
  );

  // Compute window per current view + date
  const { from, to } = useMemo(
    () => computeWindow(view, currentDate),
    [view, currentDate],
  );

  // React Query — different queryKey per window/types → independent caches
  const eventsQuery = useCalendarEvents({
    from,
    to,
    types: selectedTypes,
  });

  // LOCK 5 — surface 422 (window too large) via toast and revert to today
  // (shouldn't happen since we control the window math, but defense in depth)
  useEffect(() => {
    if (eventsQuery.error instanceof ApiError && eventsQuery.error.status === 422) {
      toast.error(t('page.windowTooLarge', { max: CALENDAR_MAX_WINDOW_DAYS }));
      updateUrl({ date: today });
    }
  }, [eventsQuery.error, updateUrl, today, t]);

  // ── Filter events client-side by selectedTypes for live toggle responsiveness.
  // Server also filters via ?types= so this is redundant when types matches the
  // active URL state, but a soft client filter avoids visual flicker if the
  // user toggles a chip before the server roundtrip completes.
  const visibleEvents = useMemo(() => {
    const typeSet = new Set(selectedTypes);
    return (eventsQuery.data?.events ?? []).filter((ev) => typeSet.has(ev.source));
  }, [eventsQuery.data, selectedTypes]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">{t('page.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('page.subtitle')}
        </p>
      </div>

      <CalendarToolbar
        view={view}
        currentDate={currentDate}
        selectedTypes={selectedTypes}
        onViewChange={(v) => updateUrl({ view: v })}
        onDateChange={(d) => updateUrl({ date: d })}
        onTypesChange={(types) => updateUrl({ types })}
      />

      {eventsQuery.isLoading ? (
        <CalendarSkeleton view={view} />
      ) : eventsQuery.error ? (
        <ErrorCard
          message={
            eventsQuery.error instanceof Error
              ? eventsQuery.error.message
              : t('page.loadError')
          }
          onRetry={() => void eventsQuery.refetch()}
        />
      ) : visibleEvents.length === 0 ? (
        <EmptyStateInline />
      ) : (
        <ViewDispatch
          view={view}
          currentDate={currentDate}
          today={today}
          events={visibleEvents}
        />
      )}
    </div>
  );
}

// ── Sub-components ──

function ViewDispatch({
  view, currentDate, today, events,
}: {
  view: CalendarView;
  currentDate: Date;
  today: Date;
  events: ReturnType<typeof useCalendarEvents>['data'] extends infer T
    ? T extends { events: infer E } ? E : never
    : never;
}) {
  switch (view) {
    case 'month':
      return <CalendarMonthView currentDate={currentDate} events={events} today={today} />;
    case 'week':
      return <CalendarWeekView currentDate={currentDate} events={events} today={today} />;
    case 'day':
      return (
        <CalendarDayView
          dateKey={format(currentDate, 'yyyy-MM-dd')}
          events={events}
          today={today}
        />
      );
    case 'agenda':
      return <CalendarAgendaView events={events} today={today} />;
  }
}

function CalendarSkeleton({ view }: { view: CalendarView }) {
  if (view === 'agenda') {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-12 w-full rounded-md" />
            <Skeleton className="h-12 w-full rounded-md" />
          </div>
        ))}
      </div>
    );
  }
  // Grid-based views — month / week / day
  return <Skeleton className="h-[600px] w-full rounded-lg" />;
}

function ErrorCard({ message, onRetry }: { message: string; onRetry: () => void }) {
  const t = useTranslations('calendar');
  return (
    <Card className="p-8 flex flex-col items-center gap-3 text-center">
      <AlertCircle className="size-10 text-red-500" aria-hidden />
      <p className="text-sm font-medium text-foreground">{t('page.error.title')}</p>
      <p className="text-xs text-muted-foreground max-w-sm">{message}</p>
      <Button variant="outline" size="sm" onClick={onRetry} className="h-11 mt-2">
        {t('page.error.retry')}
      </Button>
    </Card>
  );
}

function EmptyStateInline() {
  const t = useTranslations('calendar');
  return (
    <Card className="p-6 space-y-3 text-center">
      <CalendarPlus className="size-10 text-muted-foreground/40 mx-auto" aria-hidden />
      <p className="text-sm font-medium">{t('page.empty.title')}</p>
      <p className="text-xs text-muted-foreground">
        {t('page.empty.description')}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
        <Button asChild variant="outline" size="sm" className="h-11">
          <Link href="/dashboard/crm/pipeline">
            <ClipboardList className="size-3.5 me-1.5" aria-hidden />
            {t('page.empty.addTask')}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-11">
          <Link href="/dashboard/crm/follow-ups">
            <Clock className="size-3.5 me-1.5" aria-hidden />
            {t('page.empty.addFollowUp')}
          </Link>
        </Button>
        <Button asChild variant="outline" size="sm" className="h-11">
          <Link href="/dashboard/crm/pipeline">
            <CalendarClock className="size-3.5 me-1.5" aria-hidden />
            {t('page.empty.logMeeting')}
          </Link>
        </Button>
      </div>
    </Card>
  );
}
