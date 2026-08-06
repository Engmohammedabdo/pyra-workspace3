'use client';

import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';
import type { PyraLeadActivity } from '@/types/database';

// ── Types ──

export type LeadActivity = PyraLeadActivity & {
  created_by_display_name?: string | null;
};

export interface LeadActivitiesPage {
  activities: LeadActivity[];
  has_more: boolean;
}

// ── Queries ──

const PAGE_SIZE = 50; // Q-UI-002: load 50, then "تحميل المزيد"

/**
 * Activity timeline for a lead. Cursor-paginated via ?before=<created_at>.
 * Returns an `useInfiniteQuery` — call `fetchNextPage()` for "Load more".
 */
export function useLeadActivities(
  leadId: string | undefined,
  filters?: { type?: string },
) {
  return useInfiniteQuery<LeadActivitiesPage>({
    queryKey: ['crm', 'leads', leadId, 'activities', filters],
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams();
      sp.set('limit', String(PAGE_SIZE));
      if (filters?.type) sp.set('type', filters.type);
      if (pageParam) sp.set('before', pageParam as string);
      return fetchAPI(`/api/crm/leads/${leadId}/activities?${sp.toString()}`);
    },
    enabled: !!leadId,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.has_more || lastPage.activities.length === 0) return undefined;
      return lastPage.activities[lastPage.activities.length - 1].created_at;
    },
    staleTime: 30_000,
  });
}

/**
 * Calls-only activity timeline for a lead — CR-T7. Backs the chat thread's
 * inline call pills (`message-list.tsx`), which used to read the SAME
 * mixed-activity query as the CRM timeline (`useLeadActivities`). Because
 * the webhook mirrors every WhatsApp message into `pyra_lead_activities`
 * too, a busy lead's `call_logged`/`call_attempt` rows could fall off the
 * timeline's first 50-activity page and silently vanish from the thread.
 *
 * This hook requests `types=call_logged,call_attempt` (server-validated
 * allowlist, `app/api/crm/leads/[id]/activities/route.ts`) so the 50-row
 * page is 50 CALLS, unaffected by message volume. Additive only — the CRM
 * timeline keeps using `useLeadActivities` untouched.
 */
export function useLeadCallActivities(leadId: string | undefined) {
  return useInfiniteQuery<LeadActivitiesPage>({
    queryKey: ['crm', 'leads', leadId, 'activities', { types: 'call_logged,call_attempt' }],
    queryFn: ({ pageParam }) => {
      const sp = new URLSearchParams();
      sp.set('limit', String(PAGE_SIZE));
      sp.set('types', 'call_logged,call_attempt');
      if (pageParam) sp.set('before', pageParam as string);
      return fetchAPI(`/api/crm/leads/${leadId}/activities?${sp.toString()}`);
    },
    enabled: !!leadId,
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => {
      if (!lastPage.has_more || lastPage.activities.length === 0) return undefined;
      return lastPage.activities[lastPage.activities.length - 1].created_at;
    },
    staleTime: 30_000,
  });
}

// ── Mutation (endpoint lands in Phase 6) ──

export interface CreateLeadActivityInput {
  lead_id: string;
  activity_type: 'note' | 'call_logged' | 'meeting_scheduled' | 'email_sent';
  content: string;
  metadata?: Record<string, unknown>;
  pinned?: boolean;
}

export function useCreateLeadActivity() {
  const qc = useQueryClient();
  return useMutation<{ activity: PyraLeadActivity }, Error, CreateLeadActivityInput>({
    mutationFn: ({ lead_id, ...rest }) =>
      mutateAPI(`/api/crm/leads/${lead_id}/activities`, 'POST', rest),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id, 'activities'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id] });
      qc.invalidateQueries({ queryKey: ['crm', 'dashboard', 'recent-activity'] });
      // meeting_scheduled activities project into the unified calendar feed.
      qc.invalidateQueries({ queryKey: ['calendar'] });
      // The customer dossier embeds this lead's activity — refresh it too.
      qc.invalidateQueries({ queryKey: ['crm', 'customers', vars.lead_id, 'dossier'] });
    },
  });
}
