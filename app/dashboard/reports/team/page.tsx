'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, UserCheck, Users } from 'lucide-react';
import { toast } from 'sonner';
import { ReportDateFilter } from '@/components/reports/ReportDateFilter';
import { ReportChart } from '@/components/reports/ReportChart';
import { ExportButton } from '@/components/reports/ExportButton';
import { formatDate } from '@/lib/utils/format';

interface TeamReportData {
  summary: {
    total_members: number;
  };
  activity: Array<{ name: string; actions: number }>;
  activity_summary: Array<{
    username: string;
    display_name: string;
    role: string;
    actions: number;
    files_uploaded: number;
    last_active: string;
  }>;
}

const ROLE_MAP: Record<string, string> = {
  admin: 'مدير',
  member: 'عضو',
  viewer: 'مشاهد',
  editor: 'محرر',
  super_admin: 'مدير أعلى',
};

export default function TeamReportPage() {
  const defaultFrom = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
  const defaultTo = new Date().toISOString().split('T')[0];

  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(defaultTo);
  const [data, setData] = useState<TeamReportData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/reports/team?from=${from}&to=${to}`);
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
            <UserCheck className="h-6 w-6" />
            تقرير الفريق
          </h1>
        </div>
        <ExportButton type="team" from={from} to={to} />
      </div>

      <ReportDateFilter from={from} to={to} onFromChange={setFrom} onToChange={setTo} />

      {/* Summary Card */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {loading ? (
          <Card>
            <CardContent className="p-4">
              <Skeleton className="h-4 w-20 mb-2" />
              <Skeleton className="h-8 w-16" />
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                <Users className="h-3.5 w-3.5" /> إجمالي الأعضاء
              </p>
              <p className="text-2xl font-bold mt-1">{data?.summary.total_members ?? 0}</p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Activity by Team Member */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">النشاط حسب العضو</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ReportChart
              data={data?.activity ?? []}
              type="bar"
              dataKey="actions"
              nameKey="name"
              title="النشاط حسب العضو"
              color="#a855f7"
            />
          )}
        </CardContent>
      </Card>

      {/* Activity Summary Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">ملخص نشاط الفريق</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">اسم المستخدم</th>
                  <th className="text-start p-3 font-medium">الاسم</th>
                  <th className="text-start p-3 font-medium">الدور</th>
                  <th className="text-start p-3 font-medium">الإجراءات</th>
                  <th className="text-start p-3 font-medium">الملفات المرفوعة</th>
                  <th className="text-start p-3 font-medium">آخر نشاط</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 6 }).map((_, j) => (
                        <td key={j} className="p-3">
                          <Skeleton className="h-5 w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !data?.activity_summary?.length ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted-foreground">
                      لا توجد بيانات نشاط في هذه الفترة
                    </td>
                  </tr>
                ) : (
                  data.activity_summary.map((member) => (
                    <tr
                      key={member.username}
                      className="border-b hover:bg-muted/30 transition-colors"
                    >
                      <td className="p-3 font-mono text-xs">{member.username}</td>
                      <td className="p-3 font-medium">{member.display_name}</td>
                      <td className="p-3">
                        <Badge variant="outline">
                          {ROLE_MAP[member.role] || member.role}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono">{member.actions}</td>
                      <td className="p-3 font-mono">{member.files_uploaded}</td>
                      <td className="p-3 text-muted-foreground text-xs">
                        {member.last_active ? formatDate(member.last_active) : '—'}
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
