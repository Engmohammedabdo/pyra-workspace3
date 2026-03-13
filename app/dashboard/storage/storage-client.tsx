'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { HardDrive, File, FolderOpen, TrendingUp } from 'lucide-react';
import { EmptyState } from '@/components/ui/empty-state';
import { formatFileSize } from '@/lib/utils/format';
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';

interface StorageStats {
  totalSize: number;
  totalFiles: number;
  typeBreakdown: { name: string; size: number; count: number }[];
  topFolders: { name: string; size: number; count: number }[];
  largestFiles: { name: string; path: string; size: number; type: string }[];
}

const CHART_COLORS = [
  '#f97316', '#3b82f6', '#22c55e', '#8b5cf6',
  '#ef4444', '#ec4899', '#14b8a6', '#f59e0b',
  '#6366f1', '#6b7280',
];

export default function StorageClient() {
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/storage-stats')
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setStats(json.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <HardDrive className="h-6 w-6" /> التخزين
          </h1>
          <p className="text-muted-foreground">إحصائيات استخدام مساحة التخزين</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
          <Card><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <EmptyState
        icon={HardDrive}
        title="فشل في تحميل إحصائيات التخزين"
        description="حدث خطأ أثناء تحميل البيانات، حاول تحديث الصفحة"
      />
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HardDrive className="h-6 w-6" /> التخزين
        </h1>
        <p className="text-muted-foreground">إحصائيات استخدام مساحة التخزين</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <HardDrive className="h-6 w-6 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">إجمالي التخزين المستخدم</p>
                <p className="text-2xl font-bold">{formatFileSize(stats.totalSize)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <File className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">إجمالي الملفات</p>
                <p className="text-2xl font-bold">{stats.totalFiles.toLocaleString('ar-SA')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center">
                <FolderOpen className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">عدد المجلدات</p>
                <p className="text-2xl font-bold">{stats.topFolders.length.toLocaleString('ar-SA')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Type Breakdown Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              التوزيع حسب النوع
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.typeBreakdown.length > 0 ? (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width="50%" height={220}>
                  <PieChart>
                    <Pie
                      data={stats.typeBreakdown}
                      dataKey="size"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={90}
                      paddingAngle={2}
                    >
                      {stats.typeBreakdown.map((_, index) => (
                        <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => formatFileSize(value)}
                      contentStyle={{ direction: 'rtl', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-2">
                  {stats.typeBreakdown.map((item, index) => (
                    <div key={item.name} className="flex items-center gap-2 text-sm">
                      <div
                        className="w-3 h-3 rounded-sm shrink-0"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="flex-1 truncate">{item.name}</span>
                      <span className="text-muted-foreground text-xs tabular-nums">
                        {formatFileSize(item.size)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState icon={File} title="لا توجد بيانات" description="" />
            )}
          </CardContent>
        </Card>

        {/* Top Folders Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FolderOpen className="h-4 w-4 text-muted-foreground" />
              أكبر المجلدات
            </CardTitle>
          </CardHeader>
          <CardContent>
            {stats.topFolders.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={stats.topFolders.slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 0, right: 20 }}
                >
                  <XAxis
                    type="number"
                    tickFormatter={(v) => formatFileSize(v)}
                    fontSize={11}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={80}
                    fontSize={11}
                    tickFormatter={(v: string) => decodeURIComponent(v).length > 12 ? decodeURIComponent(v).slice(0, 12) + '...' : decodeURIComponent(v)}
                  />
                  <Tooltip
                    formatter={(value: number) => formatFileSize(value)}
                    labelFormatter={(label: string) => decodeURIComponent(label)}
                    contentStyle={{ direction: 'rtl', fontSize: '12px' }}
                  />
                  <Bar dataKey="size" fill="#f97316" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState icon={File} title="لا توجد بيانات" description="" />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Largest Files Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <File className="h-4 w-4 text-muted-foreground" />
            أكبر الملفات
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">#</th>
                  <th className="text-start p-3 font-medium">الملف</th>
                  <th className="text-start p-3 font-medium">المسار</th>
                  <th className="text-start p-3 font-medium">النوع</th>
                  <th className="text-start p-3 font-medium">الحجم</th>
                </tr>
              </thead>
              <tbody>
                {stats.largestFiles.map((file, i) => (
                  <tr key={file.path} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3 text-muted-foreground">{i + 1}</td>
                    <td className="p-3 font-medium truncate max-w-[200px]">
                      {decodeURIComponent(file.name)}
                    </td>
                    <td className="p-3 text-muted-foreground text-xs font-mono truncate max-w-[250px]">
                      {file.path}
                    </td>
                    <td className="p-3">
                      <Badge variant="outline" className="text-xs">
                        {file.type.split('/').pop() || 'unknown'}
                      </Badge>
                    </td>
                    <td className="p-3 font-medium text-orange-600 dark:text-orange-400 tabular-nums">
                      {formatFileSize(file.size)}
                    </td>
                  </tr>
                ))}
                {stats.largestFiles.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6">
                      <EmptyState icon={File} title="لا توجد ملفات" description="" />
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
