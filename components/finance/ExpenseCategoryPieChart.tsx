'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { Receipt } from 'lucide-react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
} from 'recharts';
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '@/lib/constants/chart-colors';

interface PieData {
  name: string;
  value: number;
  color: string;
}

interface ExpenseCategoryPieChartProps {
  data: PieData[];
}


export function ExpenseCategoryPieChart({ data }: ExpenseCategoryPieChartProps) {
  if (!data || data.length === 0) {
    return <EmptyState icon={Receipt} title="لا توجد مصاريف هذا الشهر" className="py-8" />;
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
              fill={entry.color || CHART_COLORS[index % CHART_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={CHART_TOOLTIP_STYLE}
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
