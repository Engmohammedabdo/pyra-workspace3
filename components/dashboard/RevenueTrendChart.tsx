'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
      const res = await fetch('/api/dashboard/kpis/revenue-trend');
      const json = await res.json();
      if (json.data) setData(json.data);
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
      <Card>
        <CardHeader className="pb-2">
          <Skeleton className="h-5 w-48" />
        </CardHeader>
        <CardContent>
          <Skeleton className="h-72" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          اتجاه الإيرادات (12 شهر)
        </CardTitle>
      </CardHeader>
      <CardContent>
        {data.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="invoicedGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
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
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--card))',
                  color: 'hsl(var(--foreground))',
                  fontSize: '12px',
                }}
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
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#revenueGradient)"
              />
              <Area
                type="monotone"
                dataKey="invoiced"
                stroke="#f97316"
                strokeWidth={2}
                fill="url(#invoicedGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex items-center justify-center h-[300px] text-sm text-muted-foreground">
            لا توجد بيانات
          </div>
        )}
      </CardContent>
    </Card>
  );
}
