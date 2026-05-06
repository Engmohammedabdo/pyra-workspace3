'use client';

/**
 * Pipeline page client.
 *
 * Phase 4: read-only board. Data flows
 *   useCurrentUser  → know if admin (filter-bar owner dropdown visibility)
 *   usePipelineStages → stage columns
 *   useLeads(filters from URL)  → cards within columns
 *
 * Phase 7 will wrap PipelineBoard in @dnd-kit and turn drag-drop on.
 */

import { useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GitBranch, Plus, Info } from 'lucide-react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { usePipelineStages } from '@/hooks/usePipelineStages';
import { useLeads } from '@/hooks/useLeads';
import { PipelineFilterBar } from '@/components/crm/pipeline/pipeline-filter-bar';
import { PipelineBoard } from '@/components/crm/pipeline/pipeline-board';

export function PipelineClient() {
  const sp = useSearchParams();
  const { data: me } = useCurrentUser();

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

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <GitBranch className="size-6 text-orange-500" /> خط المبيعات
            </h1>
            <Badge variant="outline" className="bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800/40">
              Phase 4 · للقراءة فقط
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            اضغط على أي صفقة لفتح تفاصيلها. السحب والإفلات بين المراحل بييجي في Phase 7.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" disabled title="إنشاء Lead جديد — جاي في Phase 6">
            <Plus className="size-4 me-2" /> Lead جديد
          </Button>
        </div>
      </header>

      <PipelineFilterBar isAdmin={!!isAdmin} ownerOptions={ownerOptions} total={total} />

      {/* Soft hint for first-day users — only when no filter is applied and
          the data layout makes the "everything is in stg_new_inquiry"
          shape obvious. */}
      {!stagesLoading && !leadsLoading && total !== undefined && total > 0 && filters.search === undefined && (
        <NewInquiryHint count={total} />
      )}

      <PipelineBoard stages={stages} leads={leads} loading={stagesLoading || leadsLoading} />
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
