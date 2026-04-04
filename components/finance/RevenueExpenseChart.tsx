'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { TrendingUp } from 'lucide-react';
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
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '@/lib/constants/chart-colors';

interface MonthlyData {
  month: string;
  revenue: number;
  expenses: number;
}

interface RevenueExpenseChartProps {
  data: MonthlyData[];
}

export function RevenueExpenseChart({ data }: RevenueExpenseChartProps) {
  if (!data || data.length === 0) {
    return <EmptyState icon={TrendingUp} title="لا توجد بيانات" className="py-8" />;
  }

  return (
    <ResponsiveContainer width="100%" height={350}>
      <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 30 }}>
        <defs>
          <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS[2]} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS[2]} stopOpacity={0} />
          </linearGradient>
          <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={CHART_COLORS[7]} stopOpacity={0.3} />
            <stop offset="95%" stopColor={CHART_COLORS[7]} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="month"
          tick={{ fontSize: 9 }}
          angle={-45}
          textAnchor="end"
          height={70}
          interval={data.length > 6 ? 1 : 0}
          className="text-muted-foreground"
        />
        <YAxis
          tick={{ fontSize: 11 }}
          className="text-muted-foreground"
          tickFormatter={(v) => `${(v / 1000).toFixed(0)}k`}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number, name: string) => [
            `${value.toLocaleString('en-AE')} AED`,
            name === 'revenue' ? 'الإيرادات' : 'المصاريف',
          ]}
        />
        <Legend
          formatter={(value: string) =>
            value === 'revenue' ? 'الإيرادات' : 'المصاريف'
          }
        />
        <Area
          type="monotone"
          dataKey="revenue"
          stroke={CHART_COLORS[2]}
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorRevenue)"
        />
        <Area
          type="monotone"
          dataKey="expenses"
          stroke={CHART_COLORS[7]}
          strokeWidth={2}
          fillOpacity={1}
          fill="url(#colorExpenses)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
