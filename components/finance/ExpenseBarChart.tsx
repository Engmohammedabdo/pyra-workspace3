'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { Receipt } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '@/lib/constants/chart-colors';

interface BarData {
  name: string;
  value: number;
  color: string;
}

interface ExpenseBarChartProps {
  data: BarData[];
}


export function ExpenseBarChart({ data }: ExpenseBarChartProps) {
  if (!data || data.length === 0) {
    return <EmptyState icon={Receipt} title="لا توجد مصاريف هذا الشهر" className="py-8" />;
  }

  // Sort descending by value
  const sorted = [...data].sort((a, b) => b.value - a.value);

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, sorted.length * 50)}>
      <BarChart
        data={sorted}
        layout="vertical"
        margin={{ top: 0, right: 80, left: 0, bottom: 0 }}
      >
        <XAxis type="number" hide />
        <YAxis
          dataKey="name"
          type="category"
          width={120}
          tick={{ fontSize: 13 }}
          className="text-foreground"
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
          formatter={(value: number) => [
            `${value.toLocaleString('en-AE')} AED`,
            'المبلغ',
          ]}
        />
        <Bar
          dataKey="value"
          radius={[0, 6, 6, 0]}
          barSize={28}
          label={{
            position: 'right',
            formatter: (v: number) => `${v.toLocaleString('en-AE')} AED`,
            fontSize: 12,
            fill: 'hsl(var(--muted-foreground))',
          }}
        >
          {sorted.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
