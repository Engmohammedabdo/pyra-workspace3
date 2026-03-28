'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface BarData {
  name: string;
  value: number;
  color: string;
}

interface ExpenseBarChartProps {
  data: BarData[];
}

const DEFAULT_COLORS = [
  '#f97316', '#6366f1', '#3b82f6', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f59e0b', '#6b7280',
];

export function ExpenseBarChart({ data }: ExpenseBarChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[250px] flex items-center justify-center text-muted-foreground text-sm">
        لا توجد مصاريف هذا الشهر
      </div>
    );
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
          contentStyle={{
            backgroundColor: 'hsl(var(--popover))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
          }}
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
              fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
              fillOpacity={0.85}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
