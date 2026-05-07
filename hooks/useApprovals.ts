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

// ── Mutations ──
//
// Endpoints live (Phase 7 Chunk 1):
//   POST /api/crm/approvals/[lead_id]/approve
//   POST /api/crm/approvals/[lead_id]/reject  { reason: string }
//
// Both mutations invalidate the same key set on settle so the approvals
// queue, lead detail, sales dashboard, AND the sidebar badge all reconcile
// with the server response. Optimistic updates live at the call-site
// (ApprovalCard) using the cancelQueries/getQueriesData/setQueriesData/
// rollback pattern — same shape as the Phase-6 mark-complete button.

export interface DecideApprovalInput {
  lead_id: string;
  reason?: string;
}

const APPROVAL_INVALIDATIONS = [
  ['crm', 'approvals'],
  ['crm', 'leads'],
  ['crm', 'dashboard'],
  ['sidebar-badges'],
] as const;

export function useApproveCloseLeadWin() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, DecideApprovalInput>({
    mutationFn: ({ lead_id }) =>
      mutateAPI(`/api/crm/approvals/${lead_id}/approve`, 'POST'),
    onSettled: (_data, _err, vars) => {
      for (const key of APPROVAL_INVALIDATIONS) {
        qc.invalidateQueries({ queryKey: key as unknown as string[] });
      }
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id] });
    },
  });
}

export function useRejectCloseLeadWin() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, DecideApprovalInput>({
    mutationFn: ({ lead_id, reason }) =>
      mutateAPI(`/api/crm/approvals/${lead_id}/reject`, 'POST', { reason }),
    onSettled: (_data, _err, vars) => {
      for (const key of APPROVAL_INVALIDATIONS) {
        qc.invalidateQueries({ queryKey: key as unknown as string[] });
      }
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.lead_id] });
    },
  });
}
