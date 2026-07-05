'use client';

/**
 * Phase 15.1 Commit 5 — single calendar event chip.
 *
 * Used in all 4 views (month / week / day / agenda) as the smallest visual
 * unit. Click → navigate to source-specific detail per Q5-2 (a):
 *   - task      → /dashboard/crm/leads/{lead_id}?tab=tasks
 *   - follow_up → /dashboard/crm/leads/{lead_id}?tab=overview&followup={id}
 *   - meeting   → /dashboard/crm/leads/{lead_id}?tab=activity&highlight={id}
 *
 * Tone (color) per source comes from CALENDAR_EVENT_TONES (Commit 4 constant).
 * Icon per source: ClipboardList (task) / Clock (follow-up) / CalendarClock (meeting).
 *
 * Compact variant (used in month grid cells with limited space) hides the
 * time prefix and truncates the title hard. Full variant (used in
 * day/week/agenda) shows the time + a wider title.
 */

import Link from 'next/link';
import { ClipboardList, Clock, CalendarClock } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { CALENDAR_EVENT_TONES } from '@/lib/constants/statuses';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { CalendarEvent, CalendarEventSource } from '@/types/database';

const SOURCE_ICONS: Record<CalendarEventSource, React.ComponentType<{ className?: string }>> = {
  task: ClipboardList,
  follow_up: Clock,
  meeting: CalendarClock,
};

export interface CalendarEventPillProps {
  event: CalendarEvent;
  /** Compact = hide time prefix + tight truncation (month-cell density). */
  variant?: 'compact' | 'full';
  className?: string;
}

/**
 * Build the click-through href per Q5-2 (a) mapping. Lead-less events
 * (rare but possible — meeting with null lead_id) fall back to the
 * calendar root.
 */
function buildHref(event: CalendarEvent): string {
  if (!event.lead_id) return '/dashboard/calendar';
  switch (event.source) {
    case 'task':
      return `/dashboard/crm/leads/${event.lead_id}?tab=tasks`;
    case 'follow_up':
      return `/dashboard/crm/leads/${event.lead_id}?tab=overview&followup=${event.source_id}`;
    case 'meeting':
      return `/dashboard/crm/leads/${event.lead_id}?tab=activity&highlight=${event.source_id}`;
    default:
      return `/dashboard/crm/leads/${event.lead_id}`;
  }
}

/** Format the Dubai-ISO `start` to HH:MM in the same TZ for display. */
function formatTime(iso: string): string {
  // ISO is "2026-05-16T15:30:00+04:00" — slice the time portion directly
  // without going through new Date() (which would re-shift to local TZ).
  const tIdx = iso.indexOf('T');
  if (tIdx < 0) return '';
  return iso.slice(tIdx + 1, tIdx + 6); // "HH:MM"
}

export function CalendarEventPill({ event, variant = 'compact', className }: CalendarEventPillProps) {
  const sourceLabel = useStatusLabels('calendarEventSource');
  const tone = CALENDAR_EVENT_TONES[event.source];
  const Icon = SOURCE_ICONS[event.source];
  const href = buildHref(event);
  const time = event.all_day ? null : formatTime(event.start);

  const isCompleted = event.source === 'task' && event.status === 'completed';
  const isCompletedFu = event.source === 'follow_up' && event.follow_up_status === 'completed';
  const isDone = isCompleted || isCompletedFu;

  if (variant === 'compact') {
    return (
      <Link
        href={href}
        className={cn(
          'group block w-full truncate rounded px-1.5 py-0.5 text-[10px] font-medium border transition-colors',
          tone,
          isDone && 'line-through opacity-60',
          'hover:opacity-100 hover:saturate-150',
          className,
        )}
        title={`${event.title}${event.lead_name ? ` · ${event.lead_name}` : ''}${time ? ` · ${time}` : ''}`}
        aria-label={`${event.title} — ${sourceLabel(event.source)}`}
      >
        <span className="inline-flex items-center gap-1 truncate w-full">
          <Icon className="size-2.5 shrink-0" aria-hidden />
          {time && <span className="shrink-0 tabular-nums">{time}</span>}
          <span className="truncate">{event.title}</span>
        </span>
      </Link>
    );
  }

  // Full variant
  return (
    <Link
      href={href}
      className={cn(
        'group block rounded-md border px-2 py-1.5 transition-colors',
        tone,
        isDone && 'opacity-60',
        'hover:saturate-150 hover:shadow-sm',
        className,
      )}
      aria-label={`${event.title} — ${sourceLabel(event.source)}`}
    >
      <div className="flex items-start gap-2">
        <Icon className="size-3.5 shrink-0 mt-0.5" aria-hidden />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              'text-xs font-medium leading-4 truncate',
              isDone && 'line-through',
            )}
          >
            {event.title}
          </p>
          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] opacity-80">
            {time && <span className="tabular-nums">{time}</span>}
            {event.lead_name && (
              <>
                {time && <span aria-hidden>·</span>}
                <span className="truncate">{event.lead_name}</span>
              </>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}
