'use client';

import { useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { fetchAPI, mutateAPI, buildQueryString, ApiError } from './api-helpers';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';
import { isStaticPipelineStageId } from '@/lib/crm/pipeline-stages';
import { usePipelineStages } from './usePipelineStages';
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
  lead: PyraSalesLead & { client_name?: string | null };
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
    invoice_number: string | null;
    currency: string | null;
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
      // Lead detail is the single editable surface for converted customers too,
      // so refresh the customer dossier (header/notes/KPIs read the same row).
      qc.invalidateQueries({ queryKey: ['crm', 'customers', vars.id, 'dossier'] });
    },
  });
}

export interface MoveStageInput {
  id: string;
  to_stage_id: string;
  attachment?: { type: 'contract' | 'invoice'; id: string };
  lost_reason?: string;
  reopen_reason?: string;
}

interface MoveStageContext {
  // Snapshots of every cached LIST query before the optimistic write.
  snapshots: Array<[readonly unknown[], LeadsListResponse | undefined]>;
}

/**
 * Move a lead to a different pipeline stage.
 *
 * Optimistic update lifecycle:
 *   onMutate   — cancel ['crm','leads'] queries, snapshot every LIST cache
 *                entry, optimistically rewrite the lead's stage_id in each
 *                so the pipeline UI reflects the move instantly. Single-lead
 *                queries are deliberately NOT touched here (they invalidate
 *                on settle).
 *   onError    — restore each snapshot verbatim. The call-site shows the
 *                toast (it has the from/to context for a richer message).
 *   onSettled  — invalidate ['crm','leads'], the specific lead, dashboard
 *                KPIs, approvals queue, AND the sidebar badge (since a move
 *                to stg_contract_signed mints a fresh approval).
 *
 * Predicate filter on setQueriesData: only LIST queries (whose third key
 * segment is the params object, not a string ID). Single-lead detail
 * queries have a string id at index 2 and a different shape, so we skip
 * those — they reconcile on the onSettled invalidate.
 */
export function useMoveLeadStage() {
  const qc = useQueryClient();
  return useMutation<{ lead: PyraSalesLead }, Error, MoveStageInput, MoveStageContext>({
    mutationFn: ({ id, ...rest }) => mutateAPI(`/api/crm/leads/${id}/move-stage`, 'POST', rest),
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ['crm', 'leads'] });
      const snapshots = qc.getQueriesData<LeadsListResponse>({
        predicate: (q) =>
          q.queryKey[0] === 'crm' &&
          q.queryKey[1] === 'leads' &&
          typeof q.queryKey[2] === 'object' &&
          q.queryKey[2] !== null,
      });
      qc.setQueriesData<LeadsListResponse>(
        {
          predicate: (q) =>
            q.queryKey[0] === 'crm' &&
            q.queryKey[1] === 'leads' &&
            typeof q.queryKey[2] === 'object' &&
            q.queryKey[2] !== null,
        },
        (old) => {
          if (!old || !Array.isArray(old.leads)) return old;
          let touched = false;
          const nextLeads = old.leads.map((l) => {
            if (l.id !== vars.id) return l;
            touched = true;
            return { ...l, stage_id: vars.to_stage_id };
          });
          return touched ? { ...old, leads: nextLeads } : old;
        },
      );
      return { snapshots };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx?.snapshots) return;
      for (const [key, data] of ctx.snapshots) {
        qc.setQueryData(key, data);
      }
    },
    onSettled: (_data, _err, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.id] });
      qc.invalidateQueries({ queryKey: ['crm', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['crm', 'approvals'] });
      qc.invalidateQueries({ queryKey: ['sidebar-badges'] });
      // A reopen/move changes the customer dossier's stage + health.
      qc.invalidateQueries({ queryKey: ['crm', 'customers', vars.id, 'dossier'] });
    },
  });
}

export interface RunMoveStageExtras {
  attachment?: { type: 'contract' | 'invoice'; id: string };
  lost_reason?: string;
}

/**
 * Toast-wrapped variant of useMoveLeadStage. Both desktop drag-drop
 * (pipeline-client.tsx → handleDropChangeStage → runMoveStage) and the
 * mobile stage picker (PipelineCard's MobileStageSheet → onChangeStage
 * → handleDropChangeStage → runMoveStage) use this same hook.
 *
 * - moveStage: the underlying useMoveLeadStage mutation (exposes .isPending
 *   for the MoveStageConfirmModal's submitting prop).
 * - runMoveStage: the toast-wrapped wrapper. Handles 5 success variants
 *   (closed_lost + reason, pending_approval, from→to, to-only, generic)
 *   and 4 error variants (403 perm, 409/410 stale, 422 server message,
 *   422 generic, fallback). Mutation owns optimistic update + rollback.
 *
 * Extracted from pipeline-client.tsx during Phase 10 Commit 1 (Q-UI-001).
 */
export function useMoveLeadStageWithToasts() {
  const moveStage = useMoveLeadStage();
  const t = useTranslations('crm.pipeline.moveToasts');
  const locale = useLocale();
  const stageLabel = useStatusLabels('pipelineStage');
  const { data: stages } = usePipelineStages();

  const labelForStage = useCallback(
    (stageId: string) => {
      if (isStaticPipelineStageId(stageId)) return stageLabel(stageId);
      const stage = stages?.find((s) => s.id === stageId);
      if (!stage) return stageId;
      return locale === 'ar' ? stage.name_ar : (stage.name || stage.name_ar);
    },
    [locale, stageLabel, stages],
  );

  const runMoveStage = useCallback(
    async (
      leadId: string,
      toStageId: string,
      fromStageId: string | null,
      extras?: RunMoveStageExtras,
    ): Promise<void> => {
      const fromLabel = fromStageId ? labelForStage(fromStageId) : null;
      const toLabel = labelForStage(toStageId);

      try {
        const res = await moveStage.mutateAsync({
          id: leadId,
          to_stage_id: toStageId,
          ...(extras?.attachment ? { attachment: extras.attachment } : {}),
          ...(extras?.lost_reason ? { lost_reason: extras.lost_reason } : {}),
        });
        const movedToContractSigned = (res as { pending_approval?: boolean })?.pending_approval;
        if (toStageId === PIPELINE_STAGE_IDS.CLOSED_LOST) {
          toast.success(t('closedLostSuccess', { to: toLabel }));
        } else if (movedToContractSigned) {
          toast.success(t('pendingApprovalSuccess', { to: toLabel }));
        } else if (fromLabel) {
          toast.success(t('fromToSuccess', { from: fromLabel, to: toLabel }));
        } else {
          toast.success(t('toOnlySuccess', { to: toLabel }));
        }
      } catch (err: unknown) {
        const apiErr = err instanceof ApiError ? err : null;
        const status = apiErr?.status;
        const serverMessage =
          apiErr?.message && !apiErr.message.startsWith('API error:')
            ? apiErr.message
            : null;

        if (status === 403) {
          toast.error(t('forbidden'));
        } else if (status === 409 || status === 410) {
          toast.error(t('conflict'));
        } else if (status === 422 && serverMessage) {
          toast.error(serverMessage);
        } else if (status === 422) {
          toast.error(t('invalidTransition', { to: toLabel }));
        } else {
          toast.error(serverMessage ?? t('fallback'));
        }
      }
    },
    [moveStage, t, labelForStage],
  );

  return { moveStage, runMoveStage };
}

/**
 * Soft-archive (or un-archive) a lead. DELETE /api/crm/leads/[id] sets
 * archived_at; passing `{ unarchive: true }` clears it. Backed by migration
 * 030 + the `leads.delete` permission (admin OR owner). Archived leads drop
 * out of the pipeline/list by default.
 */
export function useArchiveLead() {
  const qc = useQueryClient();
  return useMutation<unknown, Error, { id: string; unarchive?: boolean }>({
    mutationFn: ({ id, unarchive }) =>
      mutateAPI(`/api/crm/leads/${id}`, 'DELETE', unarchive ? { unarchive: true } : undefined),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.id] });
      qc.invalidateQueries({ queryKey: ['crm', 'dashboard'] });
      qc.invalidateQueries({ queryKey: ['crm', 'customers', vars.id, 'dossier'] });
    },
  });
}

// ── Phase 11.5: Link a lead to an existing pyra_clients row ──
// POST /api/crm/leads/[id]/link-client → see route for full contract.
// Does NOT flip is_converted (that's the separate convert-to-customer flow).

export interface LinkClientInput {
  leadId: string;
  clientId: string;
}

export interface LinkClientResponse {
  lead_id: string;
  client_id: string;
  client_name: string;
}

export function useLinkClient() {
  const qc = useQueryClient();
  return useMutation<LinkClientResponse, Error, LinkClientInput>({
    mutationFn: ({ leadId, clientId }) =>
      mutateAPI(`/api/crm/leads/${leadId}/link-client`, 'POST', { client_id: clientId }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads', vars.leadId] });
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
    },
  });
}

// ── Option B (Commit 2): bulk reassign owner from the pipeline ──
// POST /api/dashboard/sales/leads/bulk { action:'assign', lead_ids, assigned_to }
// Reuses the existing (Phase-12-surviving) bulk endpoint. The server gates on
// sales_leads.manage AND scopes non-admins to their OWN leads; the pipeline
// selection UI itself is admin-gated (leads.assign). The endpoint caps at 50
// ids/request and logs a per-lead `transfer` activity (metadata.bulk=true).
// NOTE: unlike the per-lead PATCH path, the bulk endpoint does NOT emit a
// new-owner notification (documented divergence — see CRM-PROGRESS).
export interface BulkAssignInput {
  lead_ids: string[];
  assigned_to: string;
}

export function useBulkAssignLeads() {
  const qc = useQueryClient();
  return useMutation<{ action: string; affected: number }, Error, BulkAssignInput>({
    mutationFn: ({ lead_ids, assigned_to }) =>
      mutateAPI('/api/dashboard/sales/leads/bulk', 'POST', {
        action: 'assign',
        lead_ids,
        assigned_to,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['crm', 'leads'] });
      qc.invalidateQueries({ queryKey: ['crm', 'dashboard'] });
    },
  });
}
