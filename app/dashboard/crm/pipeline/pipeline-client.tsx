'use client';

/**
 * Pipeline page client.
 *
 * Data flows:
 *   useCurrentUser    → know if admin (filter-bar owner dropdown visibility)
 *   usePipelineStages → stage columns
 *   useLeads(filters) → cards within columns
 *   useMoveLeadStage  → drag-drop mutation (Phase 7 Chunk 3.1)
 *
 * Drag-drop is owned by <PipelineBoard>; this client wires the resulting
 * onDropChangeStage callback. Optimistic update lives inside
 * useMoveLeadStage. Toasts on error are fired here because we have the
 * from→to label context.
 *
 * Phase 3.2 added: drops onto stg_contract_signed open the
 * <MoveStageConfirmModal> picker BEFORE firing the mutation, so the user
 * picks a contract or invoice attachment. The source card stays in its
 * original column until they confirm — no flicker.
 *
 * Modal for stg_closed_lost (reason chips) comes in Phase 3.3.
 * Phase 3.4 replaces the closed_won server-bounce with a client-side
 * toast guard.
 */

import { useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { GitBranch, Plus, Info } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { useLeads, useMoveLeadStage } from '@/hooks/useLeads';
import { PipelineFilterBar } from '@/components/crm/pipeline/pipeline-filter-bar';
import { PipelineBoard } from '@/components/crm/pipeline/pipeline-board';
import { AddLeadModal } from '@/components/crm/add-lead-modal/add-lead-modal';
import { MoveStageConfirmModal } from '@/components/crm/pipeline/move-stage-confirm-modal';
import {
  PIPELINE_STAGE_IDS,
  PIPELINE_STAGE_LABELS_AR,
  type PipelineStageId,
} from '@/lib/constants/statuses';
import type { PyraSalesLead } from '@/types/database';

export function PipelineClient() {
  const sp = useSearchParams();
  const { data: me } = useCurrentUser();
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const moveStage = useMoveLeadStage();

  // contract_signed modal state — set when a card is dropped on that
  // column. The lead reference is the source-of-truth for the modal title
  // + client_id filtering. Mutation fires only on confirm.
  const [contractSignedModal, setContractSignedModal] = useState<{
    open: boolean;
    lead: PyraSalesLead | null;
  }>({ open: false, lead: null });

  // Build filter object from URL (the same params the filter bar writes).
  const filters = useMemo<Record<string, string | undefined>>(() => {
    const params: Record<string, string | undefined> = {
      // Pipeline view shows all in-flight leads — load up to 500 to fit
      // realistic CRM volumes. Cursor pagination can be added if needed.
      limit: '500',
    };
    const search = sp.get('search');
    const owner = sp.get('assigned_to');
    const source = sp.get('source');
    const priority = sp.get('priority');
    if (search) params.search = search;
    if (owner) params.assigned_to = owner;
    if (source) params.source = source;
    if (priority) params.priority = priority;
    return params;
  }, [sp]);

  const { data: stages, isLoading: stagesLoading } = usePipelineStages();
  const { data: leadsResp, isLoading: leadsLoading } = useLeads(filters);

  const leads = leadsResp?.leads;
  const total = leadsResp?.total;
  const isAdmin = me?.role === 'admin';

  // Owner options derived from the loaded leads (admin can filter by any
  // unique owner currently in the dataset).
  const ownerOptions = useMemo(() => {
    if (!isAdmin || !leads) return [];
    return Array.from(new Set(leads.map((l) => l.assigned_to).filter((x): x is string => !!x))).sort();
  }, [isAdmin, leads]);

  // Shared mutation runner — used both by the routine drop path and by
  // the modal's confirm path. Surfaces a contextual success toast and
  // catches the rollback path with a clear error message. The hook owns
  // the optimistic update + rollback.
  const runMoveStage = useCallback(
    async (
      leadId: string,
      toStageId: string,
      fromStageId: string | null,
      attachment?: { type: 'contract' | 'invoice'; id: string },
    ) => {
      const fromLabel = fromStageId
        ? PIPELINE_STAGE_LABELS_AR[fromStageId as PipelineStageId] ?? fromStageId
        : null;
      const toLabel = PIPELINE_STAGE_LABELS_AR[toStageId as PipelineStageId] ?? toStageId;

      try {
        const res = await moveStage.mutateAsync({
          id: leadId,
          to_stage_id: toStageId,
          ...(attachment ? { attachment } : {}),
        });
        const movedToContractSigned = (res as { pending_approval?: boolean })?.pending_approval;
        if (movedToContractSigned) {
          toast.success(`تم نقل الـ Lead إلى "${toLabel}" — في انتظار اعتماد المدير`);
        } else if (fromLabel) {
          toast.success(`تم نقل الـ Lead من "${fromLabel}" إلى "${toLabel}"`);
        } else {
          toast.success(`تم نقل الـ Lead إلى "${toLabel}"`);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error && err.message ? err.message : 'فشل نقل المرحلة';
        if (message.includes('422')) {
          toast.error(`لا يمكن نقل الـ Lead إلى "${toLabel}" مباشرة — راجع متطلبات المرحلة`);
        } else {
          toast.error('فشل نقل المرحلة — حاول مرة أخرى');
        }
      }
    },
    [moveStage],
  );

  // Drop handler — fired by PipelineBoard after a cross-column drop.
  // For stg_contract_signed we INTERCEPT and open the attachment modal
  // (no optimistic update yet — source card stays put). For all other
  // stages, the routine mutation runs immediately.
  const handleDropChangeStage = useCallback(
    (leadId: string, toStageId: string, fromStageId: string | null) => {
      if (toStageId === PIPELINE_STAGE_IDS.CONTRACT_SIGNED) {
        const lead = leads?.find((l) => l.id === leadId);
        if (!lead) {
          // Shouldn't happen — board already validated the lead exists.
          // Fall through to the routine path which will 422.
          void runMoveStage(leadId, toStageId, fromStageId);
          return;
        }
        setContractSignedModal({ open: true, lead });
        return;
      }
      void runMoveStage(leadId, toStageId, fromStageId);
    },
    [leads, runMoveStage],
  );

  // Confirm handler from the contract_signed modal.
  const handleContractSignedConfirm = useCallback(
    async (attachment: { type: 'contract' | 'invoice'; id: string }) => {
      const lead = contractSignedModal.lead;
      if (!lead) return;
      // Close the modal optimistically — the toast (success or error)
      // will surface either way; if the mutation fails the user sees the
      // error toast and the source card is still in its original column.
      setContractSignedModal({ open: false, lead: null });
      await runMoveStage(
        lead.id,
        PIPELINE_STAGE_IDS.CONTRACT_SIGNED,
        lead.stage_id ?? null,
        attachment,
      );
    },
    [contractSignedModal.lead, runMoveStage],
  );

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitBranch className="size-6 text-orange-500" /> خط المبيعات
            </h1>
            </div>
          <p className="text-sm text-muted-foreground mt-1">
            اضغط على أي صفقة لفتح تفاصيلها، أو اسحبها بين الأعمدة لتغيير المرحلة (على سطح المكتب).
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setAddLeadOpen(true)} className="bg-orange-500 hover:bg-orange-600 text-white">
            <Plus className="size-4 me-2" /> Lead جديد
          </Button>
        </div>
      </header>

      <AddLeadModal open={addLeadOpen} onOpenChange={setAddLeadOpen} />

      <MoveStageConfirmModal
        open={contractSignedModal.open}
        onOpenChange={(o) =>
          setContractSignedModal((s) => (o ? s : { open: false, lead: null }))
        }
        lead={contractSignedModal.lead}
        submitting={moveStage.isPending}
        onConfirm={handleContractSignedConfirm}
      />

      <PipelineFilterBar isAdmin={!!isAdmin} ownerOptions={ownerOptions} total={total} />

      {/* Soft hint for first-day users — only when no filter is applied and
          the data layout makes the "everything is in stg_new_inquiry"
          shape obvious. */}
      {!stagesLoading && !leadsLoading && total !== undefined && total > 0 && filters.search === undefined && (
        <NewInquiryHint count={total} />
      )}

      <PipelineBoard
        stages={stages}
        leads={leads}
        loading={stagesLoading || leadsLoading}
        onDropChangeStage={handleDropChangeStage}
      />
    </div>
  );
}

function NewInquiryHint({ count }: { count: number }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-orange-200 dark:border-orange-800/40 bg-orange-500/5 px-3 py-2 text-xs text-orange-800 dark:text-orange-300">
      <Info className="size-4 shrink-0 mt-0.5" aria-hidden />
      <p className="leading-5">
        <strong>تذكير:</strong> بعد ترحيل البيانات، الـ {count} Lead الحاليين كلهم في
        <span className="mx-1 font-semibold">"استفسار جديد"</span>. لازم السايد يراجعهم ويحرّكهم للمراحل الصحيحة. ده القرار اللي اتفقنا عليه (Q-DB-002).
      </p>
    </div>
  );
}
