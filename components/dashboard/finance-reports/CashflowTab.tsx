'use client';

import { useEffect, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import { fetchAPI } from '@/hooks/api-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { ArrowDownCircle, ArrowUpCircle, Wallet, Banknote } from 'lucide-react';
import { formatCurrency, dubaiDayKey } from '@/lib/utils/format';
import { toast } from 'sonner';
import { DateRangeFilter } from './DateRangeFilter';
import { SummaryCard } from './SummaryCard';
import { EmptyState } from '@/components/ui/empty-state';
import { useStatusLabels } from '@/lib/i18n/status-labels';

// Types (mirror /api/finance/reports/cashflow response)
interface CashflowPeriod { label: string; start: string; end: string; inflow: number; outflow: number; refunds: number; net: number; running_balance: number; }
interface CashflowTotals { inflow: number; outflow: number; refunds: number; net: number; }
interface CashflowData {
  periods: CashflowPeriod[];
  totals: CashflowTotals;
  by_method: { method: string; total: number }[];
  by_category: { category: string; total: number }[];
  forecast: { expected_inflow: number };
}

function getDefaultFrom(): string { const d = new Date(); return `${d.getFullYear()}-01-01`; }
function getDefaultTo(): string { return dubaiDayKey(); }

export function CashflowTab() {
  const t = useTranslations('finance.reports');
  const paymentMethodLabel = useStatusLabels('paymentMethod');
  const [from, setFrom] = useState(getDefaultFrom);
  const [to, setTo] = useState(getDefaultTo);
  const [data, setData] = useState<CashflowData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetchAPI<CashflowData>(`/api/finance/reports/cashflow?from=${from}&to=${to}`)
      .then((result) => setData(result))
      .catch(() => toast.error(t('cashflow.loadFailed')))
      .finally(() => setLoading(false));
  }, [from, to, t]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3"><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-40" /></div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-[350px]" /><Skeleton className="h-64" />
      </div>
    );
  }

  const legendInflow = t('cashflow.legend.inflow');
  const legendOutflow = t('cashflow.legend.outflow');
  const legendMap: Record<string, string> = { inflow: legendInflow, outflow: legendOutflow };

  return (
    <div className="space-y-6">
      <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} onApply={fetchData} />

      {!data ? <EmptyState icon={Wallet} title={t('noDataToDisplay')} /> : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <SummaryCard title={t('cashflow.summary.inflow')} value={formatCurrency(data.totals.inflow)} icon={ArrowDownCircle} colorClass="text-green-600 dark:text-green-400" />
            <SummaryCard title={t('cashflow.summary.outflow')} value={formatCurrency(data.totals.outflow)} icon={ArrowUpCircle} colorClass="text-red-600 dark:text-red-400" />
            <SummaryCard title={t('cashflow.summary.refunds')} value={formatCurrency(data.totals.refunds)} icon={Banknote} colorClass="text-amber-600 dark:text-amber-400" />
            <SummaryCard title={t('cashflow.summary.net')} value={formatCurrency(data.totals.net)} icon={Wallet} colorClass={data.totals.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'} />
          </div>

          {data.periods.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Wallet className="h-5 w-5" />{t('cashflow.chartTitle')}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={data.periods.map(p => ({ label: p.label, inflow: p.inflow, outflow: p.outflow + p.refunds }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} formatter={(value: number, name: string) => [formatCurrency(value), legendMap[name] || name]} />
                    <Legend formatter={(value: string) => legendMap[value] || value} />
                    <Bar dataKey="inflow" fill="#22c55e" radius={[4, 4, 0, 0]} name="inflow" />
                    <Bar dataKey="outflow" fill="#ef4444" radius={[4, 4, 0, 0]} name="outflow" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">{t('cashflow.monthsTitle')}</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground"><th className="text-end py-3 px-2 font-medium">{t('cashflow.table.month')}</th><th className="text-end py-3 px-2 font-medium">{t('cashflow.table.inflow')}</th><th className="text-end py-3 px-2 font-medium">{t('cashflow.table.outflow')}</th><th className="text-end py-3 px-2 font-medium">{t('cashflow.table.refunds')}</th><th className="text-end py-3 px-2 font-medium">{t('cashflow.table.net')}</th><th className="text-end py-3 px-2 font-medium">{t('cashflow.table.runningBalance')}</th></tr></thead>
                  <tbody>{data.periods.map((p) => <tr key={p.start} className="border-b last:border-0 hover:bg-muted/50"><td className="py-3 px-2 font-medium">{p.label}</td><td className="py-3 px-2 font-mono text-green-600 dark:text-green-400">{formatCurrency(p.inflow)}</td><td className="py-3 px-2 font-mono text-red-500">{formatCurrency(p.outflow)}</td><td className="py-3 px-2 font-mono text-amber-600 dark:text-amber-400">{formatCurrency(p.refunds)}</td><td className={`py-3 px-2 font-mono font-semibold ${p.net >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(p.net)}</td><td className={`py-3 px-2 font-mono ${p.running_balance >= 0 ? '' : 'text-red-600 dark:text-red-400'}`}>{formatCurrency(p.running_balance)}</td></tr>)}</tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader><CardTitle className="text-base">{t('cashflow.byMethodTitle')}</CardTitle></CardHeader>
              <CardContent>
                {data.by_method.length === 0 ? <p className="text-sm text-muted-foreground">{t('cashflow.noInflowInPeriod')}</p> : (
                  <div className="space-y-2">
                    {data.by_method.map((m) => (
                      <div key={m.method} className="flex items-center justify-between text-sm border-b last:border-0 pb-2">
                        <span>{paymentMethodLabel(m.method) || m.method}</span>
                        <span className="font-mono font-semibold">{formatCurrency(m.total)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle className="text-base">{t('cashflow.forecastTitle')}</CardTitle></CardHeader>
              <CardContent>
                <p className="text-2xl font-bold font-mono text-orange-600 dark:text-orange-400">{formatCurrency(data.forecast.expected_inflow)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('cashflow.forecastHint')}</p>
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
