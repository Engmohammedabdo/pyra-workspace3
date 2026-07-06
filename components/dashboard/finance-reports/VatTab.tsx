'use client';

import { useState, useCallback, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import { fetchAPI } from '@/hooks/api-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { TrendingUp, TrendingDown, Receipt, FileText } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { DateRangeFilter } from './DateRangeFilter';
import { SummaryCard } from './SummaryCard';
import { EmptyState } from '@/components/ui/empty-state';

interface VatMonthly { month: string; collected: number; paid: number; net: number; }
interface VatData { summary: { vat_collected: number; vat_paid: number; net_vat: number; }; monthly: VatMonthly[]; }

function getDefaultTo(): string { return new Date().toISOString().slice(0, 10); }

export function VatTab() {
  const t = useTranslations('finance.reports');
  const [from, setFrom] = useState(() => { const d = new Date(); const q = Math.floor(d.getMonth() / 3); return `${d.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`; });
  const [to, setTo] = useState(getDefaultTo);
  const [data, setData] = useState<VatData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetchAPI<VatData>(`/api/finance/reports/vat?from=${from}&to=${to}`)
      .then((result) => setData(result))
      .catch(() => toast.error(t('vat.loadFailed')))
      .finally(() => setLoading(false));
  }, [from, to, t]);

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
      {!data ? <EmptyState icon={FileText} title={t('vat.noDataToDisplay')} /> : (
        <>
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <SummaryCard title={t('vat.summary.collected')} value={formatCurrency(data.summary.vat_collected)} icon={TrendingUp} colorClass="text-green-600 dark:text-green-400" />
            <SummaryCard title={t('vat.summary.paid')} value={formatCurrency(data.summary.vat_paid)} icon={TrendingDown} colorClass="text-red-600 dark:text-red-400" />
            <SummaryCard title={t('vat.summary.net')} value={formatCurrency(data.summary.net_vat)} icon={Receipt} colorClass={data.summary.net_vat >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} />
          </div>
          <Card>
            <CardHeader><CardTitle className="text-base">{t('vat.monthlyTitle')}</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground"><th className="text-end py-3 px-2 font-medium">{t('vat.table.month')}</th><th className="text-end py-3 px-2 font-medium">{t('vat.table.collected')}</th><th className="text-end py-3 px-2 font-medium">{t('vat.table.paid')}</th><th className="text-end py-3 px-2 font-medium">{t('vat.table.net')}</th></tr></thead>
                  <tbody>{data.monthly.map((m) => <tr key={m.month} className="border-b last:border-0 hover:bg-muted/50"><td className="py-3 px-2 font-medium">{m.month}</td><td className="py-3 px-2 font-mono text-green-600 dark:text-green-400">{formatCurrency(m.collected)}</td><td className="py-3 px-2 font-mono text-red-600 dark:text-red-400">{formatCurrency(m.paid)}</td><td className={`py-3 px-2 font-mono font-semibold ${m.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(m.net)}</td></tr>)}</tbody>
                  <tfoot><tr className="border-t-2 font-bold"><td className="py-3 px-2">{t('total')}</td><td className="py-3 px-2 font-mono text-green-600 dark:text-green-400">{formatCurrency(data.summary.vat_collected)}</td><td className="py-3 px-2 font-mono text-red-600 dark:text-red-400">{formatCurrency(data.summary.vat_paid)}</td><td className={`py-3 px-2 font-mono ${data.summary.net_vat >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(data.summary.net_vat)}</td></tr></tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
