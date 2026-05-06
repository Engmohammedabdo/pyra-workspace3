'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from './api-helpers';

// ── Types ──

export interface PendingApproval {
  id: string;
  name: string;
  phone: string | null;
  company: string | null;
  assigned_to: string | null;
  stage_id: string | null;
  expected_value: number;
  expected_value_currency: string;
  deal_type: string | null;
  last_contact_at: string | null;
  updated_at: string;
  assigned_display_name: string | null;
  pending_request: {
    metadata: unknown;
    created_by: string | null;
    created_at: string;
  } | null;
}

// ── Queries ──

export function usePendingApprovals() {
  return useQuery<{ approvals: PendingApproval[] }>({
    queryKey: ['crm', 'approvals', 'pending'],
    queryFn: () => fetchAPI('/api/crm/approvals/pending'),
    staleTime: 15_000,        // approvals are time-sensitive
    refetchInterval: 30_000,  // poll every 30s for fresh requests
  });
}

// ── Mutations (endpoints land in Phase 7) ──

export interface DecideApprovalInput {
  lead_id: string;
  reason?: string;
}

export function useApproveCloseLeadWin() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, DecideApprovalInput>({
    mutationFn: ({ lead_id }) =>
      mutateAPI(`/api/crm/approvals/${lead_id}/approve`, 'POST'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'approvals'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
      qc.invalidateQueries({ queryKey: ['crm', 'dashboard'] });
    },
  });
}

export function useRejectCloseLeadWin() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, DecideApprovalInput>({
    mutationFn: ({ lead_id, reason }) =>
      mutateAPI(`/api/crm/approvals/${lead_id}/reject`, 'POST', { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'approvals'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
      qc.invalidateQueries({ queryKey: ['crm', 'dashboard'] });
    },
  });
}
