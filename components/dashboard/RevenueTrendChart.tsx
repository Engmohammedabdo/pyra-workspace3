'use client';

import { useEffect, useState, useCallback } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { CHART_COLORS, CHART_PRIMARY, CHART_TOOLTIP_STYLE } from '@/lib/constants/chart-colors';

interface TrendPoint {
  month: string;
  revenue: number;
  invoiced: number;
}

export function RevenueTrendChart() {
  const [data, setData] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const result = await fetchAPI<TrendPoint[]>('/api/dashboard/kpis/revenue-trend');
      setData(result);
    } catch (err) {
      console.error('RevenueTrendChart fetch error:', err);
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

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-md shadow-emerald-500/15">
          <TrendingUp className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-bold text-sm">اتجاه الإيرادات (12 شهر)</h3>
      </div>
      <div className="p-5">
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_COLORS[2]} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_COLORS[2]} stopOpacity={0} />
                </linearGradient>
                <linearGradient id="invoicedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={CHART_PRIMARY} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={CHART_PRIMARY} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
              <XAxis
                dataKey="month"
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) => {
                  if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                  if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                  return String(v);
                }}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number, name: string) => [
                  formatCurrency(value),
                  name === 'revenue' ? 'الإيرادات' : 'المفوتر',
                ]}
              />
              <Legend
                formatter={(value: string) => (
                  <span className="text-xs">
                    {value === 'revenue' ? 'الإيرادات' : 'المفوتر'}
                  </span>
                )}
                iconSize={8}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke={CHART_COLORS[2]}
                strokeWidth={2.5}
                fill="url(#revenueGradient)"
              />
              <Area
                type="monotone"
                dataKey="invoiced"
                stroke={CHART_PRIMARY}
                strokeWidth={2.5}
                fill="url(#invoicedGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState
            icon={TrendingUp}
            title="لا توجد بيانات"
            className="py-12"
          />
        )}
      </div>
    </div>
  );
}
