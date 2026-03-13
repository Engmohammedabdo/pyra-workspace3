'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LeadKanban } from '@/components/sales/lead-kanban';
import { LeadCreateDialog } from '@/components/sales/lead-create-dialog';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate } from '@/lib/utils/format';
import Link from 'next/link';
import {
  UserPlus, Search, LayoutGrid, List, Phone, Mail,
  Building2, User, Plus
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

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [stages, setStages] = useState<Stage[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'kanban'>('kanban');
  const [search, setSearch] = useState('');
  const [filterPriority, setFilterPriority] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [showCreate, setShowCreate] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterPriority !== 'all') params.set('priority', filterPriority);
      if (filterSource !== 'all') params.set('source', filterSource);

      const [leadsRes, stagesRes] = await Promise.all([
        fetch(`/api/dashboard/sales/leads?${params}`),
        fetch('/api/dashboard/sales/pipeline-stages'),
      ]);

      const leadsData = await leadsRes.json();
      const stagesData = await stagesRes.json();

      setLeads(leadsData.data || []);
      setStages(stagesData.data || []);
    } catch {
      console.error('Failed to fetch leads');
    } finally {
      setLoading(false);
    }
  }, [search, filterPriority, filterSource]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">العملاء المحتملين</h1>
        <Button onClick={() => setShowCreate(true)} className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5">
          <Plus className="h-4 w-4" />
          عميل جديد
        </Button>
      </div>

      {/* Filters Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            placeholder="بحث بالاسم أو الهاتف أو البريد..."
            className="ps-9"
          />
        </div>

        <Select value={filterPriority} onValueChange={setFilterPriority}>
          <SelectTrigger className="w-36">
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
          <SelectTrigger className="w-36">
            <SelectValue placeholder="المصدر" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل المصادر</SelectItem>
            {Object.entries(SOURCE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center border rounded-lg overflow-hidden ms-auto">
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
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-start p-3 font-medium">الاسم</th>
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
                    return (
                      <tr key={lead.id} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="p-3">
                          <Link href={`/dashboard/sales/leads/${lead.id}`} className="font-medium hover:text-orange-600 transition-colors">
                            {lead.name}
                          </Link>
                          {lead.is_converted && (
                            <Badge className="ms-2 text-[10px] bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300">محوّل</Badge>
                          )}
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
      )}

      {/* Create Dialog */}
      <LeadCreateDialog open={showCreate} onOpenChange={setShowCreate} onCreated={fetchData} />
    </div>
  );
}
