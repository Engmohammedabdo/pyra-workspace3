'use client';

import { useState, useCallback, useEffect } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { DateRangeFilter } from './DateRangeFilter';
import { EmptyState } from './EmptyState';

interface ClientProfitability { client_id: string; client_name: string; company: string | null; revenue: number; expenses: number; profit: number; margin: number; contract_count: number; }
function getDefaultFrom(): string { const d = new Date(); return `${d.getFullYear()}-01-01`; }
function getDefaultTo(): string { return new Date().toISOString().slice(0, 10); }

export function ClientProfitabilityTab() {
  const [from, setFrom] = useState(getDefaultFrom);
  const [to, setTo] = useState(getDefaultTo);
  const [data, setData] = useState<ClientProfitability[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetchAPI<ClientProfitability[]>(`/api/finance/reports/client-profitability?from=${from}&to=${to}`)
      .then((result) => setData(result))
      .catch(() => toast.error('فشل في تحميل تقرير ربحية العملاء'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div className="space-y-4"><div className="flex gap-3"><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-40" /></div><Skeleton className="h-96" /></div>;
  }

  return (
    <div className="space-y-6">
      <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} onApply={fetchData} />
      {!data || data.length === 0 ? <EmptyState message="لا توجد بيانات ربحية للعملاء" /> : (
        <Card>
          <CardHeader><CardTitle className="text-base">ربحية العملاء</CardTitle></CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead><tr className="border-b text-muted-foreground"><th className="text-end py-3 px-2 font-medium">العميل</th><th className="text-end py-3 px-2 font-medium">الشركة</th><th className="text-end py-3 px-2 font-medium">الإيرادات</th><th className="text-end py-3 px-2 font-medium">المصاريف</th><th className="text-end py-3 px-2 font-medium">الربح</th><th className="text-end py-3 px-2 font-medium">الهامش</th><th className="text-end py-3 px-2 font-medium">العقود</th></tr></thead>
                <tbody>{data.map((c) => <tr key={c.client_id} className="border-b last:border-0 hover:bg-muted/50"><td className="py-3 px-2 font-medium">{c.client_name}</td><td className="py-3 px-2 text-muted-foreground">{c.company || '—'}</td><td className="py-3 px-2 font-mono text-green-600">{formatCurrency(c.revenue)}</td><td className="py-3 px-2 font-mono text-red-600">{formatCurrency(c.expenses)}</td><td className={`py-3 px-2 font-mono font-semibold ${c.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(c.profit)}</td><td className="py-3 px-2"><Badge variant={c.margin >= 0 ? 'outline' : 'destructive'} className={c.margin >= 0 ? 'border-green-500/40 text-green-600' : ''}>{c.margin}%</Badge></td><td className="py-3 px-2 font-mono">{c.contract_count}</td></tr>)}</tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
