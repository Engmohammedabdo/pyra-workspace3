'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowRight, DollarSign, Receipt, AlertTriangle, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { ReportDateFilter } from '@/components/reports/ReportDateFilter';
import { ReportChart } from '@/components/reports/ReportChart';
import { ExportButton } from '@/components/reports/ExportButton';
import { formatCurrency } from '@/lib/utils/format';

interface RevenueReportData {
  summary: {
    total_revenue: number;
    total_invoiced: number;
    outstanding: number;
    overdue: number;
  };
  revenue_trend: Array<{ name: string; amount: number }>;
  by_payment_method: Array<{ name: string; amount: number }>;
}

export default function RevenueReportPage() {
  const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const defaultTo = new Date().toISOString().split('T')[0];

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [period, setPeriod] = useState('monthly');
  const [data, setData] = useState<RevenueReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/reports/revenue?from=${from}&to=${to}&period=${period}`
      );
      const json = await res.json();
      if (json.data) setData(json.data);
    } catch {
      toast.error('فشل في تحميل التقرير');
    } finally {
      setLoading(false);
    }
  }, [from, to, period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/reports">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <DollarSign className="h-6 w-6" />
            تقرير الإيرادات
          </h1>
        </div>
        <ExportButton type="revenue" from={from} to={to} />
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <ReportDateFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">الفترة:</span>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-[140px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="monthly">شهري</SelectItem>
              <SelectItem value="quarterly">ربع سنوي</SelectItem>
              <SelectItem value="yearly">سنوي</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-24" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3.5 w-3.5" /> إجمالي الإيرادات
                </p>
                <p className="text-2xl font-bold mt-1 text-green-600">
                  {formatCurrency(data?.summary?.total_revenue ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Receipt className="h-3.5 w-3.5" /> إجمالي الفواتير
                </p>
                <p className="text-2xl font-bold mt-1">
                  {formatCurrency(data?.summary?.total_invoiced ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <TrendingUp className="h-3.5 w-3.5" /> مستحقة
                </p>
                <p className="text-2xl font-bold mt-1 text-orange-600">
                  {formatCurrency(data?.summary?.outstanding ?? 0)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> متأخرة
                </p>
                <p className="text-2xl font-bold mt-1 text-red-600">
                  {formatCurrency(data?.summary?.overdue ?? 0)}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Revenue Trend Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">اتجاه الإيرادات</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ReportChart
              data={data?.revenue_trend ?? []}
              type="line"
              dataKey="amount"
              nameKey="name"
              title="اتجاه الإيرادات"
              color="#22c55e"
            />
          )}
        </CardContent>
      </Card>

      {/* Payment Method Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">توزيع طرق الدفع</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ReportChart
              data={data?.by_payment_method ?? []}
              type="pie"
              dataKey="amount"
              nameKey="name"
              title="توزيع طرق الدفع"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
