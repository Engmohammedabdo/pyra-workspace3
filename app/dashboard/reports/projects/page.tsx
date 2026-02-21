'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Briefcase, CheckCircle, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { ReportDateFilter } from '@/components/reports/ReportDateFilter';
import { ReportChart } from '@/components/reports/ReportChart';
import { ExportButton } from '@/components/reports/ExportButton';
import { formatDate } from '@/lib/utils/format';

interface ProjectReportData {
  summary: {
    total: number;
    completed: number;
    avg_completion_days: number;
    overdue: number;
  };
  by_status: Array<{ name: string; count: number }>;
  recent_completions: Array<{
    id: string;
    name: string;
    client_company: string;
    completed_at: string;
    days_taken: number;
  }>;
}

export default function ProjectsReportPage() {
  const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const defaultTo = new Date().toISOString().split('T')[0];

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [data, setData] = useState<ProjectReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/projects?from=${from}&to=${to}`);
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
            <Briefcase className="h-6 w-6" />
            تقرير المشاريع
          </h1>
        </div>
        <ExportButton type="projects" from={from} to={to} />
      </div>

      <ReportDateFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
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
                  <Briefcase className="h-3.5 w-3.5" /> إجمالي المشاريع
                </p>
                <p className="text-2xl font-bold mt-1">{data?.summary.total ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <CheckCircle className="h-3.5 w-3.5" /> مكتمل في الفترة
                </p>
                <p className="text-2xl font-bold mt-1 text-green-600">{data?.summary.completed ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5" /> متوسط أيام الإنجاز
                </p>
                <p className="text-2xl font-bold mt-1">{data?.summary.avg_completion_days ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" /> متأخرة
                </p>
                <p className="text-2xl font-bold mt-1 text-red-600">{data?.summary.overdue ?? 0}</p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Status Distribution Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">توزيع حالات المشاريع</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ReportChart
              data={data?.by_status ?? []}
              type="bar"
              dataKey="count"
              nameKey="name"
              title="توزيع حالات المشاريع"
            />
          )}
        </CardContent>
      </Card>

      {/* Recent Completions Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">المشاريع المكتملة حديثاً</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">المشروع</th>
                  <th className="text-start p-3 font-medium">العميل</th>
                  <th className="text-start p-3 font-medium">تاريخ الإكتمال</th>
                  <th className="text-start p-3 font-medium">المدة (أيام)</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} className="p-3">
                          <Skeleton className="h-5 w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !data?.recent_completions?.length ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      لا توجد مشاريع مكتملة في هذه الفترة
                    </td>
                  </tr>
                ) : (
                  data.recent_completions.map((item) => (
                    <tr key={item.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3 text-muted-foreground">{item.client_company}</td>
                      <td className="p-3 text-muted-foreground">{formatDate(item.completed_at)}</td>
                      <td className="p-3">
                        <Badge variant="secondary">{item.days_taken} يوم</Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
