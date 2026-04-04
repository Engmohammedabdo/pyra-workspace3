'use client';

import { useState, useCallback, useEffect } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { DateRangeFilter } from './DateRangeFilter';
import { EmptyState } from './EmptyState';

interface ProjectProfitability { project_id: string; project_name: string; client_name: string | null; budget: number | null; revenue: number; expenses: number; profit: number; margin: number; budget_utilization: number | null; }
function getDefaultFrom(): string { const d = new Date(); return `${d.getFullYear()}-01-01`; }
function getDefaultTo(): string { return new Date().toISOString().slice(0, 10); }

export function ProjectProfitabilityTab() {
  const [from, setFrom] = useState(getDefaultFrom);
  const [to, setTo] = useState(getDefaultTo);
  const [data, setData] = useState<ProjectProfitability[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetchAPI<{ projects?: ProjectProfitability[] }>(`/api/finance/reports/project-profitability?from=${from}&to=${to}`)
      .then((result) => setData(result.projects || []))
      .catch(() => { toast.error('فشل في تحميل تقرير ربحية المشاريع'); setData([]); })
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div className="space-y-4"><div className="flex gap-3"><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-40" /></div><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="space-y-6">
      <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} onApply={fetchData} />
      {!data || data.length === 0 ? <EmptyState message="لا توجد بيانات ربحية للمشاريع" /> : (
        <Card>
          <CardHeader><CardTitle className="text-base">ربحية المشاريع</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-muted-foreground"><th className="text-end py-3 px-2 font-medium">المشروع</th><th className="text-end py-3 px-2 font-medium">الميزانية</th><th className="text-end py-3 px-2 font-medium">الإيرادات</th><th className="text-end py-3 px-2 font-medium">المصاريف</th><th className="text-end py-3 px-2 font-medium">الربح</th><th className="text-end py-3 px-2 font-medium">استخدام الميزانية</th></tr></thead>
                <tbody>{data.map((p) => <tr key={p.project_id} className="border-b last:border-0 hover:bg-muted/50"><td className="py-3 px-2"><div className="font-medium">{p.project_name}</div>{p.client_name && <div className="text-xs text-muted-foreground">{p.client_name}</div>}</td><td className="py-3 px-2 font-mono">{p.budget != null ? formatCurrency(p.budget) : <span className="text-muted-foreground">—</span>}</td><td className="py-3 px-2 font-mono text-green-600">{formatCurrency(p.revenue)}</td><td className="py-3 px-2 font-mono text-red-600">{formatCurrency(p.expenses)}</td><td className={`py-3 px-2 font-mono font-semibold ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(p.profit)}</td><td className="py-3 px-2">{p.budget_utilization != null ? (<div className="flex items-center gap-2"><div className="flex-1 h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full transition-all ${p.budget_utilization > 100 ? 'bg-red-500' : p.budget_utilization > 80 ? 'bg-orange-500' : 'bg-green-500'}`} style={{ width: `${Math.min(p.budget_utilization, 100)}%` }} /></div><span className={`text-xs font-mono font-medium ${p.budget_utilization > 100 ? 'text-red-600' : p.budget_utilization > 80 ? 'text-orange-600' : 'text-green-600'}`}>{p.budget_utilization}%</span></div>) : <span className="text-xs text-muted-foreground">—</span>}</td></tr>)}</tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
