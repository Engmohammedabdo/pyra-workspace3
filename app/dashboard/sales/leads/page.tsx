'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { LeadKanban } from '@/components/sales/lead-kanban';
import { LeadCreateDialog } from '@/components/sales/lead-create-dialog';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import Link from 'next/link';
import {
  UserPlus, Search, LayoutGrid, List, Plus,
  Download, Trash2, Users, ChevronLeft, ChevronRight,
  TrendingUp, Star, Target, CircleDot,
} from 'lucide-react';

interface Stage {
  id: string;
  name_ar: string;
  color: string;
}

interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  company?: string;
  source: string;
  priority: string;
  stage_id: string;
  assigned_to?: string;
  is_converted: boolean;
  score?: number;
  created_at: string;
}

const PRIORITY_COLORS: Record<string, string> = {
  low: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  medium: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  high: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  urgent: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const PRIORITY_LABELS: Record<string, string> = {
  low: 'منخفضة',
  medium: 'متوسطة',
  high: 'عالية',
  urgent: 'عاجلة',
};

const SOURCE_LABELS: Record<string, string> = {
  manual: 'يدوي',
  whatsapp: 'واتساب',
  website: 'موقع',
  referral: 'إحالة',
  ad: 'إعلان',
  social: 'سوشيال',
};

function ScoreBadge({ score }: { score?: number }) {
  if (score === undefined || score === null) return null;
  const color = score >= 75 ? 'text-emerald-600 dark:text-emerald-400' :
                score >= 50 ? 'text-orange-600 dark:text-orange-400' :
                score >= 25 ? 'text-blue-600 dark:text-blue-400' :
                'text-muted-foreground';
  return (
    <span className={cn('text-[11px] font-bold tabular-nums flex items-center gap-0.5', color)}>
      <Star className="h-3 w-3" />
      {score}
    </span>
  );
}

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'kanban'>('kanban');
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  // Pagination
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  // Bulk selection
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

      const [leadsRes, stagesRes] = await Promise.all([
        fetch(`/api/dashboard/sales/leads?${params}`),
        fetch('/api/dashboard/sales/pipeline-stages'),
      ]);

      const leadsData = await leadsRes.json();
      const stagesData = await stagesRes.json();

      setLeads(leadsData.data || []);
      setStages(stagesData.data || []);

      // Pagination meta
      if (leadsData.meta) {
        setTotalPages(leadsData.meta.totalPages || 1);
        setTotal(leadsData.meta.total || 0);
      } else {
        setTotal(leadsData.data?.length || 0);
      }
    } catch {
      console.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, [search, filterPriority, filterSource, view, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => { setSearch(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Reset page on filter change
  useEffect(() => { setPage(1); }, [filterPriority, filterSource]);

  // Clear selection on data change
  useEffect(() => { setSelectedIds(new Set()); }, [leads]);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === leads.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(leads.map(l => l.id)));
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`هل أنت متأكد من حذف ${selectedIds.size} عميل محتمل؟`)) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/dashboard/sales/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', lead_ids: Array.from(selectedIds) }),
      });
      if (!res.ok) throw new Error();
      toast.success(`تم حذف ${selectedIds.size} عميل محتمل`);
      setSelectedIds(new Set());
      fetchData();
    } catch {
      toast.error('فشل الحذف');
    } finally {
      setBulkLoading(false);
    }
  }

  async function handleBulkStage(stageId: string) {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      const res = await fetch('/api/dashboard/sales/leads/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stage', lead_ids: Array.from(selectedIds), stage_id: stageId }),
      });
      if (!res.ok) throw new Error();
      toast.success(`تم تحديث المرحلة لـ ${selectedIds.size} عميل محتمل`);
      setSelectedIds(new Set());
      fetchData();
    } catch {
      toast.error('فشل التحديث');
    } finally {
      setBulkLoading(false);
    }
  }

  function handleExport() {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (filterPriority !== 'all') params.set('priority', filterPriority);
    if (filterSource !== 'all') params.set('source', filterSource);
    window.open(`/api/dashboard/sales/leads/export?${params}`, '_blank');
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">العملاء المحتملين</h1>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 rounded-lg" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  const stageMap = new Map(stages.map(s => [s.id, s]));

  // Summary stats
  const convertedCount = leads.filter(l => l.is_converted).length;
  const avgScore = leads.length > 0
    ? Math.round(leads.reduce((s, l) => s + (l.score || 0), 0) / leads.length)
    : 0;
  const highPriorityCount = leads.filter(l => l.priority === 'high' || l.priority === 'urgent').length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Target className="h-5 w-5 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">العملاء المحتملين</h1>
            <p className="text-xs text-muted-foreground">{total} عميل محتمل</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            className="rounded-xl gap-1.5"
          >
            <Download className="h-4 w-4" />
            تصدير
          </Button>
          <Button onClick={() => setShowCreate(true)} className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5 rounded-xl">
            <Plus className="h-4 w-4" />
            عميل جديد
          </Button>
        </div>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <MiniStat icon={Users} label="إجمالي" value={total} color="orange" />
        <MiniStat icon={TrendingUp} label="محوّلين" value={convertedCount} color="emerald" />
        <MiniStat icon={Star} label="متوسط النقاط" value={avgScore} color="blue" />
        <MiniStat icon={CircleDot} label="أولوية عالية" value={highPriorityCount} color="red" />
      </div>

      {/* Filters Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو البريد..."
            className="ps-9 rounded-xl"
          />
        </div>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36 rounded-xl">
            <SelectValue placeholder="الأولوية" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الأولويات</SelectItem>
            {Object.entries(PRIORITY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filterSource} onValueChange={setFilterSource}>
          <SelectTrigger className="w-36 rounded-xl">
            <SelectValue placeholder="المصدر" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المصادر</SelectItem>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center border rounded-xl overflow-hidden ms-auto">
          <button
            onClick={() => setView('kanban')}
            className={cn(
              'p-2 transition-colors',
              view === 'kanban' ? 'bg-orange-500 text-white' : 'hover:bg-muted'
            )}
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            onClick={() => setView('table')}
            className={cn(
              'p-2 transition-colors',
              view === 'table' ? 'bg-orange-500 text-white' : 'hover:bg-muted'
            )}
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2 bg-orange-50 dark:bg-orange-950/20 border border-orange-200 dark:border-orange-900/40 rounded-xl animate-in slide-in-from-top-2 duration-200">
          <span className="text-sm font-medium text-orange-700 dark:text-orange-400">
            {selectedIds.size} محدد
          </span>
          <div className="flex items-center gap-1 ms-auto">
            <Select onValueChange={handleBulkStage}>
              <SelectTrigger className="w-36 h-8 text-xs rounded-lg">
                <SelectValue placeholder="نقل لمرحلة..." />
              </SelectTrigger>
              <SelectContent>
                {stages.map(s => (
                  <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleBulkDelete}
              disabled={bulkLoading}
              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg h-8"
            >
              <Trash2 className="h-3.5 w-3.5 me-1" />
              حذف
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      {leads.length === 0 && !loading ? (
        <EmptyState
          icon={UserPlus}
          title="لا يوجد عملاء محتملين"
          description="ابدأ بإضافة عميل محتمل جديد لتتبعه في خط المبيعات"
          actionLabel="إضافة عميل محتمل"
          onAction={() => setShowCreate(true)}
        />
      ) : view === 'kanban' ? (
        <LeadKanban stages={stages} leads={leads} onRefresh={fetchData} />
      ) : (
        <>
          <Card className="border-0 shadow-lg shadow-black/5 dark:shadow-black/15 rounded-2xl overflow-hidden">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="p-3 w-10">
                        <Checkbox
                          checked={selectedIds.size === leads.length && leads.length > 0}
                          onCheckedChange={toggleSelectAll}
                        />
                      </th>
                      <th className="text-start p-3 font-medium">الاسم</th>
                      <th className="text-start p-3 font-medium">النقاط</th>
                      <th className="text-start p-3 font-medium">الهاتف</th>
                      <th className="text-start p-3 font-medium">الشركة</th>
                      <th className="text-start p-3 font-medium">المرحلة</th>
                      <th className="text-start p-3 font-medium">الأولوية</th>
                      <th className="text-start p-3 font-medium">المصدر</th>
                      <th className="text-start p-3 font-medium">المسؤول</th>
                      <th className="text-start p-3 font-medium">التاريخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map(lead => {
                      const stage = stageMap.get(lead.stage_id);
                      const isSelected = selectedIds.has(lead.id);
                      return (
                        <tr
                          key={lead.id}
                          className={cn(
                            'border-b hover:bg-muted/30 transition-colors',
                            isSelected && 'bg-orange-50/50 dark:bg-orange-950/10'
                          )}
                        >
                          <td className="p-3">
                            <Checkbox
                              checked={isSelected}
                              onCheckedChange={() => toggleSelect(lead.id)}
                            />
                          </td>
                          <td className="p-3">
                            <Link href={`/dashboard/sales/leads/${lead.id}`} className="font-medium hover:text-orange-600 transition-colors">
                              {lead.name}
                            </Link>
                            {lead.is_converted && (
                              <Badge className="ms-2 text-[10px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">محوّل</Badge>
                            )}
                          </td>
                          <td className="p-3">
                            <ScoreBadge score={lead.score} />
                          </td>
                          <td className="p-3 text-muted-foreground" dir="ltr">{lead.phone || '—'}</td>
                          <td className="p-3 text-muted-foreground">{lead.company || '—'}</td>
                          <td className="p-3">
                            {stage ? (
                              <Badge variant="outline" className="text-xs">{stage.name_ar}</Badge>
                            ) : '—'}
                          </td>
                          <td className="p-3">
                            <Badge variant="secondary" className={cn('text-xs', PRIORITY_COLORS[lead.priority])}>
                              {PRIORITY_LABELS[lead.priority] || lead.priority}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">
                            {SOURCE_LABELS[lead.source] || lead.source}
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">{lead.assigned_to || '—'}</td>
                          <td className="p-3 text-muted-foreground text-xs">{formatRelativeDate(lead.created_at)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                صفحة {page} من {totalPages} — {total} نتيجة
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={page <= 1}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = page <= 3 ? i + 1 : page + i - 2;
                  if (p < 1 || p > totalPages) return null;
                  return (
                    <Button
                      key={p}
                      variant={p === page ? 'default' : 'outline'}
                      size="icon"
                      className={cn(
                        'h-8 w-8 rounded-lg text-xs',
                        p === page && 'bg-orange-500 hover:bg-orange-600 text-white'
                      )}
                      onClick={() => setPage(p)}
                    >
                      {p}
                    </Button>
                  );
                })}
                <Button
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 rounded-lg"
                  disabled={page >= totalPages}
                  onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Create Dialog */}
      <LeadCreateDialog open={showCreate} onOpenChange={setShowCreate} onCreated={fetchData} />
    </div>
  );
}

function MiniStat({ icon: Icon, label, value, color }: {
  icon: React.ElementType;
  label: string;
  value: number;
  color: string;
}) {
  const colorMap: Record<string, string> = {
    orange: 'from-orange-500/10 to-orange-500/5 dark:from-orange-500/15 dark:to-orange-500/5 text-orange-600 dark:text-orange-400',
    emerald: 'from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/15 dark:to-emerald-500/5 text-emerald-600 dark:text-emerald-400',
    blue: 'from-blue-500/10 to-blue-500/5 dark:from-blue-500/15 dark:to-blue-500/5 text-blue-600 dark:text-blue-400',
    red: 'from-red-500/10 to-red-500/5 dark:from-red-500/15 dark:to-red-500/5 text-red-600 dark:text-red-400',
  };

  return (
    <div className={cn(
      'rounded-2xl bg-gradient-to-br p-3 border border-border/30',
      colorMap[color]
    )}>
      <div className="flex items-center justify-between">
        <Icon className="h-4 w-4 opacity-60" />
        <span className="text-xl font-bold">{value}</span>
      </div>
      <p className="text-[11px] mt-0.5 opacity-70">{label}</p>
    </div>
  );
}
