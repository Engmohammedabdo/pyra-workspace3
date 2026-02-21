'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Users, UserPlus, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { ReportDateFilter } from '@/components/reports/ReportDateFilter';
import { ReportChart } from '@/components/reports/ReportChart';
import { ExportButton } from '@/components/reports/ExportButton';
import { formatCurrency } from '@/lib/utils/format';

interface ClientReportData {
  summary: {
    total: number;
    active: number;
    new_this_period: number;
  };
  top_clients: Array<{ name: string; revenue: number }>;
  client_distribution: Array<{ name: string; count: number }>;
}

export default function ClientsReportPage() {
  const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const defaultTo = new Date().toISOString().split('T')[0];

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [data, setData] = useState<ClientReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/clients?from=${from}&to=${to}`);
      const json = await res.json();
      if (json.data) setData(json.data);
    } catch {
      toast.error('فشل في تحميل التقرير');
    } finally {
      setLoading(false);
    }
  }, [from, to]);

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
            <Users className="h-6 w-6" />
            تقرير العملاء
          </h1>
        </div>
        <ExportButton type="clients" from={from} to={to} />
      </div>

      <ReportDateFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <Skeleton className="h-4 w-20 mb-2" />
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))
        ) : (
          <>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Users className="h-3.5 w-3.5" /> إجمالي العملاء
                </p>
                <p className="text-2xl font-bold mt-1">{data?.summary.total ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <UserCheck className="h-3.5 w-3.5" /> نشط
                </p>
                <p className="text-2xl font-bold mt-1 text-green-600">{data?.summary.active ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <UserPlus className="h-3.5 w-3.5" /> جديد في الفترة
                </p>
                <p className="text-2xl font-bold mt-1 text-blue-600">{data?.summary.new_this_period ?? 0}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Top Clients by Revenue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">أعلى العملاء حسب الإيرادات</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ReportChart
              data={(data?.top_clients ?? []).map((c) => ({
                ...c,
                label: `${c.name} (${formatCurrency(c.revenue)})`,
              }))}
              type="bar"
              dataKey="revenue"
              nameKey="name"
              title="أعلى العملاء حسب الإيرادات"
              color="#3b82f6"
            />
          )}
        </CardContent>
      </Card>

      {/* Client Distribution */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">توزيع العملاء حسب الشركة</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ReportChart
              data={data?.client_distribution ?? []}
              type="pie"
              dataKey="count"
              nameKey="name"
              title="توزيع العملاء حسب الشركة"
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
