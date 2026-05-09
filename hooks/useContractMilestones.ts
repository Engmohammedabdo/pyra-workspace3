'use client';

/**
 * Milestones for a single contract — wraps
 * `GET /api/finance/contracts/[id]/milestones` (pre-existing route, used
 * by /dashboard/finance/contracts editing flows).
 *
 * Phase 9 doesn't strictly need this hook — the dossier endpoint already
 * embeds milestones per-contract. But certain Steps (e.g., the contract-
 * milestones component when viewed standalone, or v1.1 inline-edit flows
 * on the customer page) benefit from invalidating just one contract's
 * milestones without invalidating the whole dossier.
 *
 * Caching: staleTime 60_000. No focus refetch — milestones are rarely
 * edited live, and the dossier hook handles the "user came back from
 * /dashboard/finance/contracts/" case via its refetchOnWindowFocus.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';

export interface ContractMilestone {
  id: string;
  contract_id: string;
  title: string | null;
  description: string | null;
  amount: number;
  due_date: string | null;
  /**
   * Workspace milestone statuses include 'pending', 'invoiced', 'completed'.
   * Per Phase 9 Q-A4, both 'invoiced' and 'completed' are treated as terminal/
   * done in dossier KPI rollups (CLAUDE.md "CRM Health Score" — Implementation
   * notes). UI-side, render this status raw — let the consumer decide how to
   * paint each value.
   */
  status: string | null;
  invoice_id: string | null;
  completed_at: string | null;
  created_at?: string;
  updated_at?: string | null;
}

export function useContractMilestones(contractId: string | undefined) {
  return useQuery<ContractMilestone[]>({
    queryKey: ['contracts', contractId, 'milestones'],
    queryFn: () => fetchAPI(`/api/finance/contracts/${contractId}/milestones`),
    enabled: !!contractId,
    staleTime: 60_000,
  });
}
