'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Users } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS, CHART_PRIMARY, CHART_TOOLTIP_STYLE } from '@/lib/constants/chart-colors';

interface ClientItem {
  name: string;
  company: string;
  revenue: number;
}


export function ClientDistributionChart() {
  const [data, setData] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const result = await fetchAPI<ClientItem[]>('/api/dashboard/kpis/client-distribution');
      setData(result);
    } catch (err) {
      console.error('ClientDistributionChart fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm p-5 shadow-sm">
        <Skeleton className="h-5 w-48 mb-4" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  // Prepare data with display labels
  const chartData = data.map((item, idx) => ({
    ...item,
    displayName: item.company || item.name,
    fill: CHART_COLORS[idx % CHART_COLORS.length],
  }));

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/15">
          <Users className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-bold text-sm">أعلى العملاء بالإيرادات</h3>
      </div>
      <div className="p-5">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid
                strokeDasharray="3 3"
                className="opacity-20"
                horizontal={false}
              />
              <XAxis
                type="number"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => {
                  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                  return String(v);
                }}
              />
              <YAxis
                dataKey="displayName"
                type="category"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={100}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number) => [formatCurrency(value), 'الإيرادات']}
                labelFormatter={(label: string) => label}
              />
              <Bar
                dataKey="revenue"
                radius={[0, 6, 6, 0]}
                fill={CHART_PRIMARY}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={Users}
            title="لا توجد بيانات"
            className="py-12"
          />
        )}
      </div>
    </div>
  );
}
