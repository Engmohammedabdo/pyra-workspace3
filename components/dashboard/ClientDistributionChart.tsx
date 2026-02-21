'use client';

import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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

interface ClientItem {
  name: string;
  company: string;
  revenue: number;
}

const BAR_COLORS = [
  '#f97316', '#3b82f6', '#22c55e', '#8b5cf6',
  '#ef4444', '#06b6d4', '#f59e0b', '#ec4899',
];

export function ClientDistributionChart() {
  const [data, setData] = useState<ClientItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/kpis/client-distribution');
      const json = await res.json();
      if (json.data) setData(json.data);
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

  // Prepare data with display labels
  const chartData = data.map((item, idx) => ({
    ...item,
    displayName: item.company || item.name,
    fill: BAR_COLORS[idx % BAR_COLORS.length],
  }));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Users className="h-4 w-4" />
          أعلى العملاء بالإيرادات
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} layout="vertical">
              <CartesianGrid
                strokeDasharray="3 3"
                className="opacity-30"
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
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid hsl(var(--border))',
                  backgroundColor: 'hsl(var(--card))',
                  color: 'hsl(var(--foreground))',
                  fontSize: '12px',
                }}
                formatter={(value: number) => [formatCurrency(value), 'الإيرادات']}
                labelFormatter={(label: string) => label}
              />
              <Bar
                dataKey="revenue"
                radius={[0, 4, 4, 0]}
                fill="#f97316"
              />
            </BarChart>
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
