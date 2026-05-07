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
 * onDropChangeStage callback to the mutation. Optimistic update lives
 * inside useMoveLeadStage (onMutate / onError / onSettled). Toasts on
 * error are fired here because we have the from→to label context.
 *
 * Modals for stg_contract_signed (attachment picker) and stg_closed_lost
 * (reason chips) come in Phase 3.2 + 3.3 — until then those drops fire
 * the mutation directly and the server returns 422 ("attachment required"
 * / "lost_reason required") which the rollback path catches with a toast.
 * Same pattern for stg_closed_won — server 422 with the "use approve flow"
 * message. Phase 3.4 replaces those server-side bounces with client-side
 * pre-checks for snappier UX.
 */

import { useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GitBranch, Plus, Info } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { useLeads, useMoveLeadStage } from '@/hooks/useLeads';
import { PipelineFilterBar } from '@/components/crm/pipeline/pipeline-filter-bar';
import { PipelineBoard } from '@/components/crm/pipeline/pipeline-board';
import { AddLeadModal } from '@/components/crm/add-lead-modal/add-lead-modal';
import {
  PIPELINE_STAGE_LABELS_AR,
  type PipelineStageId,
} from '@/lib/constants/statuses';

export function PipelineClient() {
  const sp = useSearchParams();
  const { data: me } = useCurrentUser();
  const [addLeadOpen, setAddLeadOpen] = useState(false);
  const moveStage = useMoveLeadStage();

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

  // Drop handler — fired by PipelineBoard after a cross-column drop.
  // The hook handles the optimistic update + rollback; we only need to
  // surface a toast on error and a (optional) success toast for routine
  // moves. The 422 family from the server (missing attachment / reason /
  // direct closed_won) is caught here so the user sees a meaningful
  // message instead of a generic "فشل".
  const handleDropChangeStage = useCallback(
    async (leadId: string, toStageId: string, fromStageId: string | null) => {
      const fromLabel = fromStageId
        ? PIPELINE_STAGE_LABELS_AR[fromStageId as PipelineStageId] ?? fromStageId
        : null;
      const toLabel = PIPELINE_STAGE_LABELS_AR[toStageId as PipelineStageId] ?? toStageId;

      try {
        const res = await moveStage.mutateAsync({ id: leadId, to_stage_id: toStageId });
        const movedToContractSigned = (res as { pending_approval?: boolean })?.pending_approval;
        if (movedToContractSigned) {
          toast.success(`تم نقل الـ Lead إلى "${toLabel}" — في انتظار اعتماد المدير`);
        } else if (fromLabel) {
          toast.success(`تم نقل الـ Lead من "${fromLabel}" إلى "${toLabel}"`);
        } else {
          toast.success(`تم نقل الـ Lead إلى "${toLabel}"`);
        }
      } catch (err: unknown) {
        // The hook already rolled back the optimistic update via onError.
        // We just need to surface the server's reason.
        const message =
          err instanceof Error && err.message ? err.message : 'فشل نقل المرحلة';
        // The server returns Arabic copy on 422 (e.g.,
        // "attachment مطلوب لمرحلة..."), but mutateAPI flattens to
        // "API error: 422" since it doesn't unwrap the body. So we use a
        // generic prefix and rely on the rollback to hint the user that
        // something went wrong; the modal flows in 3.2/3.3 will replace
        // these server bounces with client-side guards.
        if (message.includes('422')) {
          toast.error(`لا يمكن نقل الـ Lead إلى "${toLabel}" مباشرة — راجع متطلبات المرحلة`);
        } else {
          toast.error('فشل نقل المرحلة — حاول مرة أخرى');
        }
      }
    },
    [moveStage],
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
