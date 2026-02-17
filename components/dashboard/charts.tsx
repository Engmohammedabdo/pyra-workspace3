'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BarChart3, PieChart as PieChartIcon, TrendingUp } from 'lucide-react';
import { formatFileSize } from '@/lib/utils/format';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  Legend,
} from 'recharts';

interface ChartData {
  activityTrend: Array<{ date: string; label: string; count: number }>;
  projectStatus: Array<{ status: string; label: string; count: number }>;
  storageByType: Array<{ type: string; label: string; size: number; count: number }>;
}

const PROJECT_COLORS: Record<string, string> = {
  active: '#22c55e',
  in_progress: '#3b82f6',
  review: '#f59e0b',
  completed: '#10b981',
  archived: '#6b7280',
};

const STORAGE_COLORS = ['#f97316', '#3b82f6', '#8b5cf6', '#ef4444', '#22c55e', '#f59e0b', '#6b7280'];

export function DashboardCharts() {
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/dashboard/charts')
      .then((res) => res.json())
      .then((json) => {
        if (json.data) setData(json.data);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Activity Trend - Line Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            نشاط آخر 7 أيام
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.activityTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={data.activityTrend}>
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid hsl(var(--border))',
                    backgroundColor: 'hsl(var(--card))',
                    color: 'hsl(var(--foreground))',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [value, 'إجراء']}
                  labelFormatter={(label: string) => `يوم: ${label}`}
                />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="#f97316"
                  strokeWidth={2.5}
                  dot={{ r: 4, fill: '#f97316' }}
                  activeDot={{ r: 6, fill: '#f97316' }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
              لا توجد بيانات
            </div>
          )}
        </CardContent>
      </Card>

      {/* Project Status - Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            حالات المشاريع
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.projectStatus.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.projectStatus} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="opacity-30" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
                <YAxis
                  dataKey="label"
                  type="category"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={70}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid hsl(var(--border))',
                    backgroundColor: 'hsl(var(--card))',
                    color: 'hsl(var(--foreground))',
                    fontSize: '12px',
                  }}
                  formatter={(value: number) => [value, 'مشروع']}
                />
                <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                  {data.projectStatus.map((entry) => (
                    <Cell
                      key={entry.status}
                      fill={PROJECT_COLORS[entry.status] || '#6b7280'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
              لا توجد مشاريع
            </div>
          )}
        </CardContent>
      </Card>

      {/* Storage by Type - Pie Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <PieChartIcon className="h-4 w-4" />
            التخزين حسب النوع
          </CardTitle>
        </CardHeader>
        <CardContent>
          {data.storageByType.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie
                  data={data.storageByType}
                  cx="50%"
                  cy="50%"
                  innerRadius={45}
                  outerRadius={75}
                  paddingAngle={3}
                  dataKey="size"
                  nameKey="label"
                >
                  {data.storageByType.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={STORAGE_COLORS[index % STORAGE_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid hsl(var(--border))',
                    backgroundColor: 'hsl(var(--card))',
                    color: 'hsl(var(--foreground))',
                    fontSize: '12px',
                  }}
                  formatter={(value: number, name: string) => [formatFileSize(value), name]}
                />
                <Legend
                  formatter={(value: string) => <span className="text-xs">{value}</span>}
                  iconSize={8}
                />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[220px] text-sm text-muted-foreground">
              لا توجد ملفات
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
