'use client';

import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';

interface PieData {
  name: string;
  value: number;
  color: string;
}

interface ExpenseCategoryPieChartProps {
  data: PieData[];
}

const DEFAULT_COLORS = [
  '#6366f1', '#f59e0b', '#3b82f6', '#ec4899',
  '#8b5cf6', '#14b8a6', '#f97316', '#6b7280',
];

export function ExpenseCategoryPieChart({ data }: ExpenseCategoryPieChartProps) {
  if (!data || data.length === 0) {
    return (
      <div className="h-[300px] flex items-center justify-center text-muted-foreground">
        لا توجد مصاريف هذا الشهر
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={60}
          outerRadius={100}
          paddingAngle={2}
          dataKey="value"
          nameKey="name"
        >
          {data.map((entry, index) => (
            <Cell
              key={entry.name}
              fill={entry.color || DEFAULT_COLORS[index % DEFAULT_COLORS.length]}
            />
          ))}
        </Pie>
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
        <Legend
          layout="vertical"
          align="left"
          verticalAlign="middle"
          iconType="circle"
          iconSize={8}
          wrapperStyle={{ fontSize: '12px' }}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
