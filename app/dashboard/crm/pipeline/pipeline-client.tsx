'use client';

/**
 * Pipeline page client.
 *
 * Data flows:
 *   useCurrentUser              → know if admin (filter-bar owner dropdown visibility)
 *   usePipelineStages           → stage columns
 *   useLeads(filters)           → cards within columns
 *   useMoveLeadStageWithToasts  → toast-wrapped move-stage mutation
 *                                 (Phase 10 Commit 1 extracted the
 *                                 toast-handling wrapper to a custom hook
 *                                 so desktop drag AND the mobile stage
 *                                 sheet share the same code path —
 *                                 Q-UI-001 resolution)
 *
 * Drag-drop is owned by <PipelineBoard>; this client wires the resulting
 * onDropChangeStage callback. Mobile stage taps from <MobileStageSheet>
 * arrive via the same callback path (PipelineBoard passes it down to
 * PipelineCard as onChangeStage, so both surfaces hit
 * handleDropChangeStage with the same arguments). Optimistic update
 * lives inside useMoveLeadStage (the underlying mutation). Toast handling
 * lives in useMoveLeadStageWithToasts.
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
import { useLeads, useMoveLeadStageWithToasts } from '@/hooks/useLeads';
import { PipelineFilterBar } from '@/components/crm/pipeline/pipeline-filter-bar';
import { PipelineBoard } from '@/components/crm/pipeline/pipeline-board';
import { AddLeadModal } from '@/components/crm/add-lead-modal/add-lead-modal';
import {
  MoveStageConfirmModal,
  type MoveStageConfirmPayload,
  type MoveStageConfirmTargetId,
} from '@/components/crm/pipeline/move-stage-confirm-modal';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';
import type { PyraSalesLead } from '@/types/database';

export function PipelineClient() {
  const sp = useSearchParams();
  const { data: me } = useCurrentUser();
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  // Phase 10 Commit 1 (Q-UI-001): the toast-wrapped wrapper is now a custom
  // hook reused by both desktop drag (handleDropChangeStage below) and the
  // mobile MobileStageSheet (via PipelineBoard → PipelineCard onChangeStage
  // prop, which ultimately calls handleDropChangeStage with the same args).
  const { moveStage, runMoveStage } = useMoveLeadStageWithToasts();

  // Shared "needs-extra-data" modal state. Set when a card is dropped on
  // stg_contract_signed (needs attachment) or stg_closed_lost (needs
  // reason). The lead reference is the source-of-truth for the modal
  // title + client_id filtering; targetStageId picks the variant.
  // Mutation fires only on confirm.
  const [confirmModal, setConfirmModal] = useState<{
    open: boolean;
    lead: PyraSalesLead | null;
    targetStageId: MoveStageConfirmTargetId | null;
  }>({ open: false, lead: null, targetStageId: null });

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

  // Drop handler — fired by PipelineBoard after a cross-column drop (desktop
  // drag) AND from the mobile MobileStageSheet via the same onChangeStage
  // callback path. Three branches:
  // Three branches:
  //   1. stg_closed_won → BLOCKED client-side. No mutation, no flicker.
  //                       Toast tells the user the right path.
  //   2. stg_contract_signed / stg_closed_lost → INTERCEPT. Open the
  //                       confirm modal, source stays put until confirm.
  //   3. anything else  → routine mutation w/ optimistic update.
  const handleDropChangeStage = useCallback(
    (leadId: string, toStageId: string, fromStageId: string | null) => {
      // (1) closed_won client-side guard — never round-trip to the server.
      if (toStageId === PIPELINE_STAGE_IDS.CLOSED_WON) {
        toast.error(
          'لا يمكن النقل المباشر إلى "فوز بالصفقة" — اسحب إلى "تم توقيع العقد" وانتظر اعتماد المدير',
          { duration: 6000 },
        );
        return;
      }

      // (2) stages that require extra data via the modal.
      const needsModal =
        toStageId === PIPELINE_STAGE_IDS.CONTRACT_SIGNED ||
        toStageId === PIPELINE_STAGE_IDS.CLOSED_LOST;
      if (needsModal) {
        const lead = leads?.find((l) => l.id === leadId);
        if (!lead) {
          // Shouldn't happen — board already validated the lead exists.
          // Fall through to the routine path which will 422.
          void runMoveStage(leadId, toStageId, fromStageId);
          return;
        }
        setConfirmModal({
          open: true,
          lead,
          targetStageId: toStageId as MoveStageConfirmTargetId,
        });
        return;
      }

      // (3) routine.
      void runMoveStage(leadId, toStageId, fromStageId);
    },
    [leads, runMoveStage],
  );

  // Confirm handler shared between both modal variants — discriminates
  // on the payload's `mode` field.
  const handleConfirmModal = useCallback(
    async (payload: MoveStageConfirmPayload) => {
      const { lead, targetStageId } = confirmModal;
      if (!lead || !targetStageId) return;
      // Close the modal optimistically — the toast (success or error)
      // will surface either way; if the mutation fails the user sees the
      // error toast and the source card is still in its original column.
      setConfirmModal({ open: false, lead: null, targetStageId: null });
      if (payload.mode === 'contract_signed') {
        await runMoveStage(
          lead.id,
          PIPELINE_STAGE_IDS.CONTRACT_SIGNED,
          lead.stage_id ?? null,
          { attachment: payload.attachment },
        );
      } else {
        await runMoveStage(
          lead.id,
          PIPELINE_STAGE_IDS.CLOSED_LOST,
          lead.stage_id ?? null,
          { lost_reason: payload.lost_reason },
        );
      }
    },
    [confirmModal, runMoveStage],
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
        open={confirmModal.open}
        onOpenChange={(o) =>
          setConfirmModal((s) =>
            o ? s : { open: false, lead: null, targetStageId: null },
          )
        }
        lead={confirmModal.lead}
        targetStageId={confirmModal.targetStageId}
        submitting={moveStage.isPending}
        onConfirm={handleConfirmModal}
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
