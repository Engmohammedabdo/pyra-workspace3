'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI, buildQueryString } from './api-helpers';
import type { PyraSalesLead } from '@/types/database';

// ── Types returned by API endpoints ──

export type Lead = PyraSalesLead & {
  activity_count?: number;
  last_activity_type?: string | null;
};

export interface LeadsListResponse {
  leads: Lead[];
  total: number;
  has_more: boolean;
}

export interface LeadDetail {
  lead: PyraSalesLead;
  contracts: Array<{
    id: string;
    title: string | null;
    status: string;
    contract_type: string | null;
    total_value: number;
    currency: string;
    start_date: string | null;
    end_date: string | null;
    retainer_amount: number | null;
    retainer_cycle: string | null;
    amount_billed: number;
    amount_collected: number;
  }>;
  invoices: Array<{
    id: string;
    contract_id: string | null;
    client_id: string | null;
    total: number;
    status: string;
    due_date: string | null;
  }>;
  payments_summary: { total_paid: number; currency: string };
  activity_count: number;
  follow_ups_pending: number;
  files_count: number;
}

// ── Queries ──

/**
 * List leads with optional filters. Server-side scoping applies.
 *
 * @param params  e.g. { stage_id, priority, lead_type, source, is_converted, search, limit, offset, sort, assigned_to (admin) }
 */
export function useLeads(params?: Record<string, string | undefined>) {
  const qs = buildQueryString(params);
  return useQuery<LeadsListResponse>({
    queryKey: ['crm', 'leads', params],
    queryFn: () => fetchAPI(`/api/crm/leads${qs}`),
    staleTime: 30_000,
  });
}

/** Single lead detail (with contracts, invoices, summary). */
export function useLead(id: string | undefined) {
  return useQuery<LeadDetail>({
    queryKey: ['crm', 'leads', id],
    queryFn: () => fetchAPI(`/api/crm/leads/${id}`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ── Mutations (endpoints land in Phase 6 / 7) ──

export interface CreateLeadInput {
  name: string;
  phone: string;
  email?: string;
  company?: string;
  lead_type?: 'b2b' | 'b2c';
  industry?: string;
  source?: string;
  deal_type?: string;
  expected_value?: number;
  expected_value_currency?: string;
  billing_cycle?: 'one_time' | 'monthly' | 'quarterly' | 'annual';
  contact_person?: string;
  contact_role?: string;
  notes?: string;
  priority?: 'low' | 'medium' | 'high' | 'urgent';
  assigned_to?: string;
  stage_id?: string;
  next_follow_up?: string;
  follow_up_title?: string;
}

export function useCreateLead() {
  const qc = useQueryClient();
  return useMutation<{ lead: PyraSalesLead }, Error, CreateLeadInput>({
    mutationFn: (data) => mutateAPI('/api/crm/leads', 'POST', data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
      qc.invalidateQueries({ queryKey: ['crm', 'dashboard'] });
    },
  });
}

export function useUpdateLead() {
  const qc = useQueryClient();
  return useMutation<{ lead: PyraSalesLead }, Error, { id: string; data: Partial<PyraSalesLead> }>({
    mutationFn: ({ id, data }) => mutateAPI(`/api/crm/leads/${id}`, 'PATCH', data),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.id] });
    },
  });
}

export interface MoveStageInput {
  id: string;
  to_stage_id: string;
  attachment?: { type: 'contract' | 'invoice'; id: string };
  lost_reason?: string;
}

export function useMoveLeadStage() {
  const qc = useQueryClient();
  return useMutation<{ lead: PyraSalesLead }, Error, MoveStageInput>({
    mutationFn: ({ id, ...rest }) => mutateAPI(`/api/crm/leads/${id}/move-stage`, 'POST', rest),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.id] });
      qc.invalidateQueries({ queryKey: ['crm', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['crm', 'approvals'] });
    },
  });
}

export function useArchiveLead() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, string>({
    mutationFn: (id) => mutateAPI(`/api/crm/leads/${id}`, 'DELETE'),
    onSuccess: (_res, id) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', id] });
    },
  });
}
