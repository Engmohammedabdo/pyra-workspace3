'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';

// ── Types ──

export interface FollowUp {
  id: string;
  lead_id: string | null;
  assigned_to: string | null;
  due_at: string;
  /** When the WhatsApp reminder fires (Phase 11). Defaulted to
   *  `due_at - 30 minutes` by the API when the body omits it. The
   *  cron endpoint at /api/cron/follow-up-reminders processes rows
   *  where `reminder_at <= NOW()` AND `whatsapp_reminder_sent = false`
   *  AND `send_whatsapp_reminder = true` AND `status = 'pending'`. */
  reminder_at: string | null;
  /** Idempotency flag set by the cron after a successful Evolution
   *  send. Prevents re-fire on subsequent 5-minute ticks. */
  whatsapp_reminder_sent: boolean;
  /** User-facing toggle (Phase 11). Default true. When false, the
   *  cron skips this row entirely. */
  send_whatsapp_reminder: boolean;
  title: string | null;
  notes: string | null;
  status: 'pending' | 'completed' | 'overdue' | 'cancelled';
  completed_at: string | null;
  created_by: string | null;
  created_at: string;
  quote_id: string | null;
  // joined
  lead_name: string | null;
  lead_phone: string | null;
  lead_company: string | null;
  assigned_display_name: string | null;
}

export interface FollowUpsResponse {
  follow_ups: FollowUp[];
  total: number;
}

// ── Queries ──

/**
 * List follow-ups (scoped to self for non-admin).
 * Params: status, lead_id, due_before, due_after, limit
 */
export function useFollowUps(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<FollowUpsResponse>({
    queryKey: ['crm', 'follow-ups', params],
    queryFn: () => fetchAPI(`/api/crm/follow-ups${qs}`),
    staleTime: 30_000,
  });
}

// ── Mutations (endpoints land in Phase 6) ──

export interface CreateFollowUpInput {
  lead_id: string;
  title: string;
  due_at: string;
  reminder_at?: string;
  notes?: string;
  assigned_to?: string;
  send_whatsapp_reminder?: boolean;
}

export function useCreateFollowUp() {
  const qc = useQueryClient();
  return useMutation<{ follow_up: FollowUp }, Error, CreateFollowUpInput>({
    mutationFn: (data) => mutateAPI('/api/crm/follow-ups', 'POST', data),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'follow-ups'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id, 'activities'] });
      qc.invalidateQueries({ queryKey: ['crm', 'dashboard'] });
    },
  });
}

export interface CompleteFollowUpInput {
  id: string;
  outcome_note?: string;
}

export function useCompleteFollowUp() {
  const qc = useQueryClient();
  return useMutation<{ follow_up: FollowUp }, Error, CompleteFollowUpInput>({
    mutationFn: ({ id, ...rest }) =>
      mutateAPI(`/api/crm/follow-ups/${id}/complete`, 'POST', rest),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'follow-ups'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
      qc.invalidateQueries({ queryKey: ['crm', 'dashboard'] });
    },
  });
}
