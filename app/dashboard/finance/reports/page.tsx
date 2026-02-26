'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts';
import { ArrowRight, FileText, TrendingUp, TrendingDown, Receipt } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { ExportButton } from '@/components/reports/ExportButton';

/* ══════════════════════════════════════════════════════
   Types
   ══════════════════════════════════════════════════════ */

interface PnlPeriod {
  label: string;
  start: string;
  end: string;
  revenue: number;
  expenses: number;
  profit: number;
}

interface PnlTotals {
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
}

interface PnlData {
  periods: PnlPeriod[];
  totals: PnlTotals;
}

interface VatMonthly {
  month: string;
  collected: number;
  paid: number;
  net: number;
}

interface VatData {
  summary: {
    vat_collected: number;
    vat_paid: number;
    net_vat: number;
  };
  monthly: VatMonthly[];
}

interface ClientProfitability {
  client_id: string;
  client_name: string;
  company: string | null;
  revenue: number;
  expenses: number;
  profit: number;
  margin: number;
  contract_count: number;
}

interface ProjectProfitability {
  project_id: string;
  project_name: string;
  client_name: string | null;
  budget: number;
  revenue: number;
  expenses: number;
  profit: number;
  budget_usage: number;
}

/* ══════════════════════════════════════════════════════
   Helpers
   ══════════════════════════════════════════════════════ */

function getDefaultFrom(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

function getDefaultTo(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ══════════════════════════════════════════════════════
   Summary Card Component
   ══════════════════════════════════════════════════════ */

function SummaryCard({
  title,
  value,
  icon: Icon,
  colorClass,
}: {
  title: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  colorClass: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${colorClass}`} />
      </CardHeader>
      <CardContent>
        <div className={`text-2xl font-bold font-mono ${colorClass}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

/* ══════════════════════════════════════════════════════
   Date Range Filter Component
   ══════════════════════════════════════════════════════ */

function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onApply,
  children,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onApply: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      <div className="space-y-1.5">
        <Label className="text-xs">من</Label>
        <Input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">إلى</Label>
        <Input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="w-40"
        />
      </div>
      {children}
      <Button onClick={onApply} size="sm">
        عرض التقرير
      </Button>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Tab 1: P&L (الأرباح والخسائر)
   ══════════════════════════════════════════════════════ */

function PnlTab() {
  const [from, setFrom] = useState(getDefaultFrom);
  const [to, setTo] = useState(getDefaultTo);
  const [groupBy, setGroupBy] = useState<'month' | 'quarter'>('month');
  const [data, setData] = useState<PnlData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/finance/reports/pnl?from=${from}&to=${to}&group_by=${groupBy}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) setData(res.data);
      })
      .catch(() => toast.error('فشل في تحميل تقرير الأرباح والخسائر'))
      .finally(() => setLoading(false));
  }, [from, to, groupBy]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-32" />
        </div>
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-[350px]" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <DateRangeFilter
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={fetchData}
      >
        <div className="space-y-1.5">
          <Label className="text-xs">التجميع</Label>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as 'month' | 'quarter')}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">شهري</SelectItem>
              <SelectItem value="quarter">ربع سنوي</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </DateRangeFilter>

      {!data ? (
        <EmptyState message="لا توجد بيانات لعرضها" />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="إجمالي الإيرادات"
              value={formatCurrency(data.totals.revenue)}
              icon={TrendingUp}
              colorClass="text-green-600"
            />
            <SummaryCard
              title="إجمالي المصاريف"
              value={formatCurrency(data.totals.expenses)}
              icon={TrendingDown}
              colorClass="text-red-600"
            />
            <SummaryCard
              title="صافي الربح"
              value={formatCurrency(data.totals.profit)}
              icon={TrendingUp}
              colorClass={data.totals.profit >= 0 ? 'text-green-600' : 'text-red-600'}
            />
            <SummaryCard
              title="هامش الربح"
              value={`${data.totals.margin}%`}
              icon={FileText}
              colorClass={data.totals.margin >= 0 ? 'text-green-600' : 'text-red-600'}
            />
          </div>

          {/* Bar Chart */}
          {data.periods.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-5 w-5" />
                  الإيرادات مقابل المصاريف
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={350}>
                  <BarChart data={data.periods} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} className="text-muted-foreground" />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      className="text-muted-foreground"
                      tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--popover))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                        fontSize: '12px',
                      }}
                      formatter={(value: number, name: string) => [
                        formatCurrency(value),
                        name === 'revenue' ? 'الإيرادات' : name === 'expenses' ? 'المصاريف' : 'الربح',
                      ]}
                    />
                    <Legend
                      formatter={(value: string) => {
                        const labels: Record<string, string> = {
                          revenue: 'الإيرادات',
                          expenses: 'المصاريف',
                        };
                        return labels[value] || value;
                      }}
                    />
                    <Bar dataKey="revenue" fill="#22c55e" radius={[4, 4, 0, 0]} name="revenue" />
                    <Bar dataKey="expenses" fill="#ef4444" radius={[4, 4, 0, 0]} name="expenses" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">تفاصيل الفترات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-3 px-2 font-medium">الفترة</th>
                      <th className="text-right py-3 px-2 font-medium">الإيرادات</th>
                      <th className="text-right py-3 px-2 font-medium">المصاريف</th>
                      <th className="text-right py-3 px-2 font-medium">الربح</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.periods.map((p) => (
                      <tr key={p.start} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 px-2 font-medium">{p.label}</td>
                        <td className="py-3 px-2 font-mono text-green-600">
                          {formatCurrency(p.revenue)}
                        </td>
                        <td className="py-3 px-2 font-mono text-red-600">
                          {formatCurrency(p.expenses)}
                        </td>
                        <td
                          className={`py-3 px-2 font-mono font-semibold ${
                            p.profit >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(p.profit)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td className="py-3 px-2">الإجمالي</td>
                      <td className="py-3 px-2 font-mono text-green-600">
                        {formatCurrency(data.totals.revenue)}
                      </td>
                      <td className="py-3 px-2 font-mono text-red-600">
                        {formatCurrency(data.totals.expenses)}
                      </td>
                      <td
                        className={`py-3 px-2 font-mono ${
                          data.totals.profit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {formatCurrency(data.totals.profit)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Tab 2: VAT (الضريبة)
   ══════════════════════════════════════════════════════ */

function VatTab() {
  const [from, setFrom] = useState(() => {
    const d = new Date();
    const q = Math.floor(d.getMonth() / 3);
    return `${d.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`;
  });
  const [to, setTo] = useState(getDefaultTo);
  const [data, setData] = useState<VatData | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/finance/reports/vat?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) setData(res.data);
      })
      .catch(() => toast.error('فشل في تحميل تقرير الضريبة'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid gap-4 grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <DateRangeFilter
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={fetchData}
      />

      {!data ? (
        <EmptyState message="لا توجد بيانات ضريبية" />
      ) : (
        <>
          {/* Summary Cards */}
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-3">
            <SummaryCard
              title="ضريبة محصّلة"
              value={formatCurrency(data.summary.vat_collected)}
              icon={TrendingUp}
              colorClass="text-green-600"
            />
            <SummaryCard
              title="ضريبة مدفوعة"
              value={formatCurrency(data.summary.vat_paid)}
              icon={TrendingDown}
              colorClass="text-red-600"
            />
            <SummaryCard
              title="صافي الضريبة"
              value={formatCurrency(data.summary.net_vat)}
              icon={Receipt}
              colorClass={data.summary.net_vat >= 0 ? 'text-green-600' : 'text-red-600'}
            />
          </div>

          {/* Monthly Breakdown Table */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">التفاصيل الشهرية</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-muted-foreground">
                      <th className="text-right py-3 px-2 font-medium">الشهر</th>
                      <th className="text-right py-3 px-2 font-medium">محصّلة</th>
                      <th className="text-right py-3 px-2 font-medium">مدفوعة</th>
                      <th className="text-right py-3 px-2 font-medium">الصافي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.monthly.map((m) => (
                      <tr key={m.month} className="border-b last:border-0 hover:bg-muted/50">
                        <td className="py-3 px-2 font-medium">{m.month}</td>
                        <td className="py-3 px-2 font-mono text-green-600">
                          {formatCurrency(m.collected)}
                        </td>
                        <td className="py-3 px-2 font-mono text-red-600">
                          {formatCurrency(m.paid)}
                        </td>
                        <td
                          className={`py-3 px-2 font-mono font-semibold ${
                            m.net >= 0 ? 'text-green-600' : 'text-red-600'
                          }`}
                        >
                          {formatCurrency(m.net)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 font-bold">
                      <td className="py-3 px-2">الإجمالي</td>
                      <td className="py-3 px-2 font-mono text-green-600">
                        {formatCurrency(data.summary.vat_collected)}
                      </td>
                      <td className="py-3 px-2 font-mono text-red-600">
                        {formatCurrency(data.summary.vat_paid)}
                      </td>
                      <td
                        className={`py-3 px-2 font-mono ${
                          data.summary.net_vat >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {formatCurrency(data.summary.net_vat)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Tab 3: Client Profitability (ربحية العملاء)
   ══════════════════════════════════════════════════════ */

function ClientProfitabilityTab() {
  const [from, setFrom] = useState(getDefaultFrom);
  const [to, setTo] = useState(getDefaultTo);
  const [data, setData] = useState<ClientProfitability[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/finance/reports/client-profitability?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) setData(res.data);
      })
      .catch(() => toast.error('فشل في تحميل تقرير ربحية العملاء'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <DateRangeFilter
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={fetchData}
      />

      {!data || data.length === 0 ? (
        <EmptyState message="لا توجد بيانات ربحية للعملاء" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ربحية العملاء</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-right py-3 px-2 font-medium">العميل</th>
                    <th className="text-right py-3 px-2 font-medium">الشركة</th>
                    <th className="text-right py-3 px-2 font-medium">الإيرادات</th>
                    <th className="text-right py-3 px-2 font-medium">المصاريف</th>
                    <th className="text-right py-3 px-2 font-medium">الربح</th>
                    <th className="text-right py-3 px-2 font-medium">الهامش</th>
                    <th className="text-right py-3 px-2 font-medium">العقود</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((c) => (
                    <tr key={c.client_id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2 font-medium">{c.client_name}</td>
                      <td className="py-3 px-2 text-muted-foreground">{c.company || '—'}</td>
                      <td className="py-3 px-2 font-mono text-green-600">
                        {formatCurrency(c.revenue)}
                      </td>
                      <td className="py-3 px-2 font-mono text-red-600">
                        {formatCurrency(c.expenses)}
                      </td>
                      <td
                        className={`py-3 px-2 font-mono font-semibold ${
                          c.profit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {formatCurrency(c.profit)}
                      </td>
                      <td className="py-3 px-2">
                        <Badge
                          variant={c.margin >= 0 ? 'outline' : 'destructive'}
                          className={
                            c.margin >= 0
                              ? 'border-green-500/40 text-green-600'
                              : ''
                          }
                        >
                          {c.margin}%
                        </Badge>
                      </td>
                      <td className="py-3 px-2 font-mono">{c.contract_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Tab 4: Project Profitability (ربحية المشاريع)
   ══════════════════════════════════════════════════════ */

function ProjectProfitabilityTab() {
  const [from, setFrom] = useState(getDefaultFrom);
  const [to, setTo] = useState(getDefaultTo);
  const [data, setData] = useState<ProjectProfitability[] | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(() => {
    setLoading(true);
    fetch(`/api/finance/reports/project-profitability?from=${from}&to=${to}`)
      .then((r) => r.json())
      .then((res) => {
        if (res.data) setData(res.data);
      })
      .catch(() => toast.error('فشل في تحميل تقرير ربحية المشاريع'))
      .finally(() => setLoading(false));
  }, [from, to]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex gap-3">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-10 w-40" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <DateRangeFilter
        from={from}
        to={to}
        onFromChange={setFrom}
        onToChange={setTo}
        onApply={fetchData}
      />

      {!data || data.length === 0 ? (
        <EmptyState message="لا توجد بيانات ربحية للمشاريع" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">ربحية المشاريع</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-right py-3 px-2 font-medium">المشروع</th>
                    <th className="text-right py-3 px-2 font-medium">الميزانية</th>
                    <th className="text-right py-3 px-2 font-medium">الإيرادات</th>
                    <th className="text-right py-3 px-2 font-medium">المصاريف</th>
                    <th className="text-right py-3 px-2 font-medium">الربح</th>
                    <th className="text-right py-3 px-2 font-medium">استخدام الميزانية</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((p) => (
                    <tr key={p.project_id} className="border-b last:border-0 hover:bg-muted/50">
                      <td className="py-3 px-2">
                        <div className="font-medium">{p.project_name}</div>
                        {p.client_name && (
                          <div className="text-xs text-muted-foreground">{p.client_name}</div>
                        )}
                      </td>
                      <td className="py-3 px-2 font-mono">
                        {formatCurrency(p.budget)}
                      </td>
                      <td className="py-3 px-2 font-mono text-green-600">
                        {formatCurrency(p.revenue)}
                      </td>
                      <td className="py-3 px-2 font-mono text-red-600">
                        {formatCurrency(p.expenses)}
                      </td>
                      <td
                        className={`py-3 px-2 font-mono font-semibold ${
                          p.profit >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {formatCurrency(p.profit)}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${
                                p.budget_usage > 100
                                  ? 'bg-red-500'
                                  : p.budget_usage > 80
                                    ? 'bg-orange-500'
                                    : 'bg-green-500'
                              }`}
                              style={{ width: `${Math.min(p.budget_usage, 100)}%` }}
                            />
                          </div>
                          <span
                            className={`text-xs font-mono font-medium ${
                              p.budget_usage > 100
                                ? 'text-red-600'
                                : p.budget_usage > 80
                                  ? 'text-orange-600'
                                  : 'text-green-600'
                            }`}
                          >
                            {p.budget_usage}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Empty State Component
   ══════════════════════════════════════════════════════ */

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
      <FileText className="h-10 w-10 opacity-40" />
      <span className="text-sm">{message}</span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════
   Main Page
   ══════════════════════════════════════════════════════ */

export default function FinanceReportsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard/finance"
            className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
          >
            <ArrowRight className="h-5 w-5" />
          </Link>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
              <FileText className="h-5 w-5 text-orange-500" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">التقارير المالية</h1>
              <p className="text-muted-foreground text-sm">تحليل مالي شامل للأرباح والضرائب والعملاء</p>
            </div>
          </div>
        </div>
        <ExportButton
          type="finance"
          from={getDefaultFrom()}
          to={getDefaultTo()}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="pnl" dir="rtl">
        <TabsList className="w-full justify-start flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="pnl" className="text-xs sm:text-sm">
            الأرباح والخسائر
          </TabsTrigger>
          <TabsTrigger value="vat" className="text-xs sm:text-sm">
            الضريبة
          </TabsTrigger>
          <TabsTrigger value="clients" className="text-xs sm:text-sm">
            ربحية العملاء
          </TabsTrigger>
          <TabsTrigger value="projects" className="text-xs sm:text-sm">
            ربحية المشاريع
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pnl">
          <PnlTab />
        </TabsContent>

        <TabsContent value="vat">
          <VatTab />
        </TabsContent>

        <TabsContent value="clients">
          <ClientProfitabilityTab />
        </TabsContent>

        <TabsContent value="projects">
          <ProjectProfitabilityTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
