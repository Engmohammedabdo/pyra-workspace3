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
import Link from 'next/link';
import { GitBranch, Plus, CheckSquare, X, Archive } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePermission } from '@/hooks/usePermission';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { useLeads, useMoveLeadStageWithToasts, useBulkAssignLeads } from '@/hooks/useLeads';
import { useLeadCapableUsers } from '@/hooks/useLeadCapableUsers';
import { PipelineFilterBar } from '@/components/crm/pipeline/pipeline-filter-bar';
import { PipelineBoard } from '@/components/crm/pipeline/pipeline-board';
import { BulkActionBar } from '@/components/crm/pipeline/bulk-action-bar';
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

  // ── Option B (Commit 2) — bulk selection + assign ──
  // Admin-only: gated by leads.assign (sales agents lack it, so the toggle
  // never renders for them). Selection state is board-level (shared across
  // cards) so it lives here, not per-card. Entering selection mode disables
  // drag board-wide (PipelineBoard sets the sensor distance unreachable).
  const canBulk = usePermission('leads.assign');
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const bulkAssign = useBulkAssignLeads();

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const exitSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, []);

  const handleBulkAssign = useCallback(
    async (username: string) => {
      const ids = Array.from(selectedIds);
      if (ids.length === 0) return;
      try {
        const res = await bulkAssign.mutateAsync({ lead_ids: ids, assigned_to: username });
        toast.success(`تم تعيين ${res.affected ?? ids.length} صفقة بنجاح`);
        exitSelection();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'فشل التعيين الجماعي');
      }
    },
    [selectedIds, bulkAssign, exitSelection],
  );

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

  // Owner options from the FULL lead-capable user list (admin only) — NOT the
  // currently-filtered `leads`. Deriving from `leads` collapsed the dropdown to
  // just the selected owner once a filter was applied (a one-way trap: you had
  // to reset to "all" before you could switch to a different agent).
  const { leadCapable } = useLeadCapableUsers();
  const ownerOptions = useMemo(
    () => (isAdmin ? leadCapable.map((u) => ({ value: u.username, label: u.display_name })) : []),
    [isAdmin, leadCapable],
  );

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
          {isAdmin && (
            <Button asChild variant="outline">
              <Link href="/dashboard/crm/leads/archived">
                <Archive className="size-4 me-2" /> الأرشيف
              </Link>
            </Button>
          )}
          {canBulk &&
            (selectionMode ? (
              <Button variant="outline" onClick={exitSelection}>
                <X className="size-4 me-2" /> إنهاء التحديد
              </Button>
            ) : (
              <Button variant="outline" onClick={() => setSelectionMode(true)}>
                <CheckSquare className="size-4 me-2" /> تحديد متعدد
              </Button>
            ))}
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

      <PipelineBoard
        stages={stages}
        leads={leads}
        loading={stagesLoading || leadsLoading}
        onDropChangeStage={handleDropChangeStage}
        selectionMode={selectionMode}
        selectedIds={selectedIds}
        onToggleSelect={toggleSelect}
      />

      {selectionMode && selectedIds.size > 0 && (
        <BulkActionBar
          count={selectedIds.size}
          busy={bulkAssign.isPending}
          onAssign={handleBulkAssign}
          onCancel={exitSelection}
        />
      )}
    </div>
  );
}
