'use client';

import { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Receipt } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { DateRangeFilter } from './DateRangeFilter';
import { SummaryCard } from './SummaryCard';
import { EmptyState } from './EmptyState';

interface VatMonthly { month: string; collected: number; paid: number; net: number; }
interface VatData { summary: { vat_collected: number; vat_paid: number; net_vat: number; }; monthly: VatMonthly[]; }

function getDefaultTo(): string { return new Date().toISOString().slice(0, 10); }

export function VatTab() {
  const [from, setFrom] = useState(() => { const d = new Date(); const q = Math.floor(d.getMonth() / 3); return `${d.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`; });
  const [to, setTo] = useState(getDefaultTo);
  const [data, setData] = useState<VatData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/finance/reports/vat?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((res) => { if (res.data) setData(res.data); })
      .catch(() => toast.error('فشل في تحميل تقرير الضريبة'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3"><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-40" /></div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} onApply={fetchData} />
      {!data ? <EmptyState message="لا توجد بيانات ضريبية" /> : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <SummaryCard title="ضريبة محصّلة" value={formatCurrency(data.summary.vat_collected)} icon={TrendingUp} colorClass="text-green-600" />
            <SummaryCard title="ضريبة مدفوعة" value={formatCurrency(data.summary.vat_paid)} icon={TrendingDown} colorClass="text-red-600" />
            <SummaryCard title="صافي الضريبة" value={formatCurrency(data.summary.net_vat)} icon={Receipt} colorClass={data.summary.net_vat >= 0 ? 'text-green-600' : 'text-red-600'} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">التفاصيل الشهرية</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground"><th className="text-right py-3 px-2 font-medium">الشهر</th><th className="text-right py-3 px-2 font-medium">محصّلة</th><th className="text-right py-3 px-2 font-medium">مدفوعة</th><th className="text-right py-3 px-2 font-medium">الصافي</th></tr></thead>
                  <tbody>{data.monthly.map((m) => <tr key={m.month} className="border-b last:border-0 hover:bg-muted/50"><td className="py-3 px-2 font-medium">{m.month}</td><td className="py-3 px-2 font-mono text-green-600">{formatCurrency(m.collected)}</td><td className="py-3 px-2 font-mono text-red-600">{formatCurrency(m.paid)}</td><td className={`py-3 px-2 font-mono font-semibold ${m.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(m.net)}</td></tr>)}</tbody>
                  <tfoot><tr className="border-t-2 font-bold"><td className="py-3 px-2">الإجمالي</td><td className="py-3 px-2 font-mono text-green-600">{formatCurrency(data.summary.vat_collected)}</td><td className="py-3 px-2 font-mono text-red-600">{formatCurrency(data.summary.vat_paid)}</td><td className={`py-3 px-2 font-mono ${data.summary.net_vat >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(data.summary.net_vat)}</td></tr></tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
