'use client';

/**
 * Phase 15.1 Commit 4 — calendar events React Query hook.
 *
 * Wraps GET /api/calendar/events. Filters are part of the query key so
 * different windows / scopes cache independently.
 *
 * Server-enforced max window: 62 days. The hook does NOT pre-validate
 * (server returns 422 with Arabic message on overflow) — keeps the
 * hook surface minimal.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from './api-helpers';
import type {
  CalendarEventsResponse,
  CalendarEventSource,
} from '@/types/database';

export interface UseCalendarEventsParams {
  /** YYYY-MM-DD inclusive */
  from: string;
  /** YYYY-MM-DD inclusive */
  to: string;
  /** Defaults to all 3 sources when omitted. */
  types?: CalendarEventSource[];
  /** Admin-only: filter to a specific user. Non-admin requests are
   *  silently scoped to the caller by the server regardless of this value. */
  assigned_to?: string;
  /** Filter to a single lead's events */
  lead_id?: string;
  /** Pass false to skip the fetch (e.g. while user is picking window). */
  enabled?: boolean;
}

export function useCalendarEvents(params: UseCalendarEventsParams) {
  const {
    from,
    to,
    types,
    assigned_to,
    lead_id,
    enabled = true,
  } = params;

  return useQuery<CalendarEventsResponse>({
    queryKey: ['calendar', 'events', { from, to, types, assigned_to, lead_id }],
    queryFn: () => {
      const sp = new URLSearchParams();
      sp.set('from', from);
      sp.set('to', to);
      if (types && types.length > 0) sp.set('types', types.join(','));
      if (assigned_to) sp.set('assigned_to', assigned_to);
      if (lead_id) sp.set('lead_id', lead_id);
      return fetchAPI<CalendarEventsResponse>(`/api/calendar/events?${sp.toString()}`);
    },
    enabled: enabled && !!from && !!to,
    staleTime: 30_000,
  });
}
