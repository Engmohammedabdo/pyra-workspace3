'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { TrendingUp, TrendingDown, FileText } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { DateRangeFilter } from './DateRangeFilter';
import { SummaryCard } from './SummaryCard';
import { EmptyState } from './EmptyState';

// Types
interface ExpenseBreakdown { total: number; salaries: number; operational: number; subscriptions: number; }
interface PnlPeriod { label: string; start: string; end: string; revenue: number; expenses: ExpenseBreakdown; profit: number; }
interface PnlTotals { revenue: number; expenses: ExpenseBreakdown; profit: number; margin: number; }
interface PnlData { periods: PnlPeriod[]; totals: PnlTotals; }

function getDefaultFrom(): string { const d = new Date(); return `${d.getFullYear()}-01-01`; }
function getDefaultTo(): string { return new Date().toISOString().slice(0, 10); }

export function PnlTab() {
  const [from, setFrom] = useState(getDefaultFrom);
  const [to, setTo] = useState(getDefaultTo);
  const [groupBy, setGroupBy] = useState<'month' | 'quarter'>('month');
  const [data, setData] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetchAPI<PnlData>(`/api/finance/reports/pnl?from=${from}&to=${to}&group_by=${groupBy}`)
      .then((result) => setData(result))
      .catch(() => toast.error('فشل في تحميل تقرير الأرباح والخسائر'))
      .finally(() => setLoading(false));
  }, [from, to, groupBy]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3"><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-40" /><Skeleton className="h-10 w-32" /></div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24" />)}</div>
        <Skeleton className="h-[350px]" /><Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <DateRangeFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} onApply={fetchData}>
        <div className="space-y-1.5">
          <Label className="text-xs">التجميع</Label>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'month' | 'quarter')}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="month">شهري</SelectItem><SelectItem value="quarter">ربع سنوي</SelectItem></SelectContent>
          </Select>
        </div>
      </DateRangeFilter>

      {!data ? <EmptyState message="لا توجد بيانات لعرضها" /> : (
        <>
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <SummaryCard title="إجمالي الإيرادات" value={formatCurrency(data.totals.revenue)} icon={TrendingUp} colorClass="text-green-600" />
            <SummaryCard title="إجمالي المصاريف" value={formatCurrency(data.totals.expenses.total)} icon={TrendingDown} colorClass="text-red-600" />
            <SummaryCard title="صافي الربح" value={formatCurrency(data.totals.profit)} icon={TrendingUp} colorClass={data.totals.profit >= 0 ? 'text-green-600' : 'text-red-600'} />
            <SummaryCard title="هامش الربح" value={`${data.totals.margin}%`} icon={FileText} colorClass={data.totals.margin >= 0 ? 'text-green-600' : 'text-red-600'} />
          </div>
          {data.periods.length > 0 && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2 text-base"><TrendingUp className="h-5 w-5" />الإيرادات مقابل المصاريف</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={data.periods.map(p => ({ label: p.label, revenue: p.revenue, salaries: p.expenses.salaries, operational: p.expenses.operational, subscriptions: p.expenses.subscriptions }))}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip contentStyle={{ backgroundColor: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '12px' }} formatter={(value: number, name: string) => [formatCurrency(value), { revenue: 'الإيرادات', salaries: 'الرواتب', operational: 'تشغيلية', subscriptions: 'الاشتراكات' }[name] || name]} />
                    <Legend formatter={(value: string) => ({ revenue: 'الإيرادات', salaries: 'الرواتب', operational: 'مصاريف تشغيلية', subscriptions: 'الاشتراكات' }[value] || value)} />
                    <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name="revenue" /><Bar dataKey="salaries" fill="#ef4444" stackId="expenses" name="salaries" /><Bar dataKey="operational" fill="#f97316" stackId="expenses" name="operational" /><Bar dataKey="subscriptions" fill="#8b5cf6" stackId="expenses" radius={[4, 4, 0, 0]} name="subscriptions" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle className="text-base">تفاصيل الفترات</CardTitle></CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground"><th className="text-right py-3 px-2 font-medium">الفترة</th><th className="text-right py-3 px-2 font-medium">الإيرادات</th><th className="text-right py-3 px-2 font-medium">الرواتب</th><th className="text-right py-3 px-2 font-medium">تشغيلية</th><th className="text-right py-3 px-2 font-medium">اشتراكات</th><th className="text-right py-3 px-2 font-medium">إجمالي المصاريف</th><th className="text-right py-3 px-2 font-medium">الربح</th></tr></thead>
                  <tbody>{data.periods.map((p) => <tr key={p.start} className="border-b last:border-0 hover:bg-muted/50"><td className="py-3 px-2 font-medium">{p.label}</td><td className="py-3 px-2 font-mono text-green-600">{formatCurrency(p.revenue)}</td><td className="py-3 px-2 font-mono text-red-500">{formatCurrency(p.expenses.salaries)}</td><td className="py-3 px-2 font-mono text-orange-500">{formatCurrency(p.expenses.operational)}</td><td className="py-3 px-2 font-mono text-violet-500">{formatCurrency(p.expenses.subscriptions)}</td><td className="py-3 px-2 font-mono text-red-600 font-semibold">{formatCurrency(p.expenses.total)}</td><td className={`py-3 px-2 font-mono font-semibold ${p.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(p.profit)}</td></tr>)}</tbody>
                  <tfoot><tr className="border-t-2 font-bold"><td className="py-3 px-2">الإجمالي</td><td className="py-3 px-2 font-mono text-green-600">{formatCurrency(data.totals.revenue)}</td><td className="py-3 px-2 font-mono text-red-500">{formatCurrency(data.totals.expenses.salaries)}</td><td className="py-3 px-2 font-mono text-orange-500">{formatCurrency(data.totals.expenses.operational)}</td><td className="py-3 px-2 font-mono text-violet-500">{formatCurrency(data.totals.expenses.subscriptions)}</td><td className="py-3 px-2 font-mono text-red-600">{formatCurrency(data.totals.expenses.total)}</td><td className={`py-3 px-2 font-mono ${data.totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatCurrency(data.totals.profit)}</td></tr></tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
