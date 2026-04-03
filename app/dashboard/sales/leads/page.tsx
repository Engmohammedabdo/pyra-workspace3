'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { LeadsHeader, MiniStat } from '@/components/dashboard/leads-list/leads-header';
import { BulkActions } from '@/components/dashboard/leads-list/bulk-actions';
import { LeadsTable } from '@/components/dashboard/leads-list/leads-table';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { LeadKanban } from '@/components/sales/lead-kanban';
import { LeadCreateDialog } from '@/components/sales/lead-create-dialog';
import { toast } from 'sonner';
import { Users, TrendingUp, Star, CircleDot } from 'lucide-react';

export default function LeadsPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'kanban'>('kanban');
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [showCreate, setShowCreate] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterPriority !== 'all') params.set('priority', filterPriority);
      if (filterSource !== 'all') params.set('source', filterSource);
      if (view === 'table') {
        params.set('page', String(page));
        params.set('limit', '50');
      }
      const [leadsData, stagesData] = await Promise.all([
        fetchAPI<any>(`/api/dashboard/sales/leads?${params}`),
        fetchAPI<any>('/api/dashboard/sales/pipeline-stages'),
      ]);
      setLeads((leadsData as any).data || []);
      setStages((stagesData as any).data || []);
      setTotalPages((leadsData as any).meta?.totalPages || 1);
      setTotal((leadsData as any).meta?.total || ((leadsData as any).data?.length || 0));
    } catch {
      toast.error('فشل تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, [search, filterPriority, filterSource, view, page]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  function handleExport() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    window.open(`/api/dashboard/sales/leads/export?${params}`, '_blank');
  }

  async function handleBulkAction(action: 'delete' | 'stage', stageId?: string) {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await mutateAPI('/api/dashboard/sales/leads/bulk', 'POST', { action, lead_ids: Array.from(selectedIds), stage_id: stageId });
      toast.success('تم التحديث بنجاح');
      setSelectedIds(new Set());
      fetchData();
    } catch { toast.error('فشل العملية'); } finally { setBulkLoading(false); }
  }

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-full" /><Skeleton className="h-96 w-full" /></div>;

  return (
    <div className="space-y-4">
      <LeadsHeader
        total={total} onExport={handleExport} onCreate={() => setShowCreate(true)}
        view={view} onViewChange={setView} searchInput={searchInput} setSearchInput={setSearchInput}
        filterPriority={filterPriority} setFilterPriority={setFilterPriority}
        filterSource={filterSource} setFilterSource={setFilterSource}
      />
      
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={Users} label="إجمالي" value={total} color="orange" />
        <MiniStat icon={TrendingUp} label="محوّلين" value={leads.filter(l => l.is_converted).length} color="emerald" />
        <MiniStat icon={Star} label="متوسط النقاط" value={Math.round(leads.reduce((s, l) => s + (l.score || 0), 0) / (leads.length || 1))} color="blue" />
        <MiniStat icon={CircleDot} label="أولوية عالية" value={leads.filter(l => ['high', 'urgent'].includes(l.priority)).length} color="red" />
      </div>

      {selectedIds.size > 0 && <BulkActions count={selectedIds.size} stages={stages} onStageChange={id => handleBulkAction('stage', id)} onDelete={() => handleBulkAction('delete')} loading={bulkLoading} />}

      {leads.length === 0 ? <EmptyState icon={Users} title="لا عملاء" onAction={() => setShowCreate(true)} /> : view === 'kanban' ? <LeadKanban stages={stages} leads={leads} onRefresh={fetchData} /> : <LeadsTable leads={leads} stageMap={new Map(stages.map(s => [s.id, s]))} selectedIds={selectedIds} toggleSelect={id => setSelectedIds(prev => { const n = new Set(prev); if(n.has(id)) n.delete(id); else n.add(id); return n; })} toggleSelectAll={() => setSelectedIds(selectedIds.size === leads.length ? new Set() : new Set(leads.map(l => l.id)))} onPageChange={setPage} page={page} totalPages={totalPages} total={total} />}
      <LeadCreateDialog open={showCreate} onOpenChange={setShowCreate} onCreated={fetchData} />
    </div>
  );
}
