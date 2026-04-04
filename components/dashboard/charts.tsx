'use client';

import { useEffect, useState } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
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
import { CHART_COLORS, CHART_PRIMARY, CHART_STATUS_COLORS, CHART_TOOLTIP_STYLE } from '@/lib/constants/chart-colors';

interface ChartData {
  activityTrend: Array<{ date: string; label: string; count: number }>;
  projectStatus: Array<{ status: string; label: string; count: number }>;
  storageByType: Array<{ type: string; label: string; size: number; count: number }>;
}

const PROJECT_COLORS: Record<string, string> = {
  active: CHART_STATUS_COLORS.active,
  in_progress: CHART_STATUS_COLORS.in_progress,
  review: CHART_COLORS[3], // yellow
  completed: CHART_STATUS_COLORS.completed,
  archived: CHART_STATUS_COLORS.draft,
};

/* ── Chart Card wrapper ── */
function ChartCard({ icon: Icon, title, gradient, children }: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  gradient: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-md`}>
          <Icon className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-bold text-sm">{title}</h3>
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function DashboardCharts() {
  const [data, setData] = useState<ChartData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchAPI<ChartData>('/api/dashboard/charts')
      .then((result) => setData(result))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="grid gap-4 lg:grid-cols-3">
        {[1, 2, 3].map(i => (
          <div key={i} className="rounded-2xl border border-border/60 bg-card/80 p-5 shadow-sm">
            <Skeleton className="h-5 w-36 mb-4" />
            <Skeleton className="h-56 rounded-xl" />
          </div>
        ))}
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Activity Trend - Line Chart */}
      <ChartCard
        icon={TrendingUp}
        title="نشاط آخر 7 أيام"
        gradient="from-orange-500 to-amber-600"
      >
        {data.activityTrend.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={data.activityTrend}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
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
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number) => [value, 'إجراء']}
                labelFormatter={(label: string) => `يوم: ${label}`}
              />
              <Line
                type="monotone"
                dataKey="count"
                stroke={CHART_PRIMARY}
                strokeWidth={2.5}
                dot={{ r: 4, fill: CHART_PRIMARY }}
                activeDot={{ r: 6, fill: CHART_PRIMARY }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="لا توجد بيانات"
            className="py-8"
          />
        )}
      </ChartCard>

      {/* Project Status - Bar Chart */}
      <ChartCard
        icon={BarChart3}
        title="حالات المشاريع"
        gradient="from-blue-500 to-indigo-600"
      >
        {data.projectStatus.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.projectStatus} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" horizontal={false} />
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
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number) => [value, 'مشروع']}
              />
              <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                {data.projectStatus.map((entry) => (
                  <Cell
                    key={entry.status}
                    fill={PROJECT_COLORS[entry.status] || CHART_STATUS_COLORS.draft}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={BarChart3}
            title="لا توجد مشاريع"
            className="py-8"
          />
        )}
      </ChartCard>

      {/* Storage by Type - Pie Chart */}
      <ChartCard
        icon={PieChartIcon}
        title="التخزين حسب النوع"
        gradient="from-violet-500 to-purple-600"
      >
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
                    fill={CHART_COLORS[index % CHART_COLORS.length]}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number, name: string) => [formatFileSize(value), name]}
              />
              <Legend
                formatter={(value: string) => <span className="text-xs">{value}</span>}
                iconSize={8}
              />
            </PieChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={PieChartIcon}
            title="لا توجد ملفات"
            className="py-8"
          />
        )}
      </ChartCard>
    </div>
  );
}
