'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, HardDrive, FileText, FolderOpen } from 'lucide-react';
import { toast } from 'sonner';
import { ReportChart } from '@/components/reports/ReportChart';
import { ExportButton } from '@/components/reports/ExportButton';
import { formatFileSize } from '@/lib/utils/format';

interface StorageReportData {
  summary: {
    total_files: number;
    total_folders: number;
    total_size: number;
  };
  by_mime_type: Array<{ name: string; size: number; count: number }>;
  largest_files: Array<{
    id: string;
    name: string;
    size: number;
    mime_type: string;
    project_name: string;
  }>;
}

export default function StorageReportPage() {
  const today = new Date().toISOString().split('T')[0];
  const [data, setData] = useState<StorageReportData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/reports/storage')
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setData(json.data);
      })
      .catch(() => {
        toast.error('فشل في تحميل التقرير');
      })
      .finally(() => setLoading(false));
  }, []);

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
            <HardDrive className="h-6 w-6" />
            تقرير التخزين
          </h1>
        </div>
        <ExportButton type="storage" from="" to={today} />
      </div>

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
                  <FileText className="h-3.5 w-3.5" /> إجمالي الملفات
                </p>
                <p className="text-2xl font-bold mt-1">{data?.summary.total_files ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <FolderOpen className="h-3.5 w-3.5" /> إجمالي المجلدات
                </p>
                <p className="text-2xl font-bold mt-1">{data?.summary.total_folders ?? 0}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground flex items-center gap-1">
                  <HardDrive className="h-3.5 w-3.5" /> الحجم الإجمالي
                </p>
                <p className="text-2xl font-bold mt-1">
                  {formatFileSize(data?.summary.total_size ?? 0)}
                </p>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Storage by MIME Type */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">التخزين حسب نوع الملف</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-[300px] w-full" />
          ) : (
            <ReportChart
              data={(data?.by_mime_type ?? []).map((item) => ({
                ...item,
                label: `${item.name} (${formatFileSize(item.size)})`,
              }))}
              type="pie"
              dataKey="size"
              nameKey="name"
              title="التخزين حسب نوع الملف"
            />
          )}
        </CardContent>
      </Card>

      {/* Largest Files Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">أكبر الملفات</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">اسم الملف</th>
                  <th className="text-start p-3 font-medium">الحجم</th>
                  <th className="text-start p-3 font-medium">النوع</th>
                  <th className="text-start p-3 font-medium">المشروع</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b">
                      {Array.from({ length: 4 }).map((_, j) => (
                        <td key={j} className="p-3">
                          <Skeleton className="h-5 w-24" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : !data?.largest_files?.length ? (
                  <tr>
                    <td colSpan={4} className="p-8 text-center text-muted-foreground">
                      لا توجد ملفات
                    </td>
                  </tr>
                ) : (
                  data.largest_files.map((file) => (
                    <tr key={file.id} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="p-3 font-medium">{file.name}</td>
                      <td className="p-3 text-muted-foreground">{formatFileSize(file.size)}</td>
                      <td className="p-3 text-muted-foreground">{file.mime_type}</td>
                      <td className="p-3 text-muted-foreground">{file.project_name}</td>
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
