'use client';

import { EmptyState } from '@/components/ui/empty-state';
import { BarChart3 } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { CHART_COLORS, CHART_PRIMARY, CHART_TOOLTIP_STYLE } from '@/lib/constants/chart-colors';

interface Props {
  data: Array<Record<string, unknown>>;
  type: 'bar' | 'line' | 'pie';
  dataKey: string;
  nameKey?: string;
  xAxisKey?: string;
  title: string;
  color?: string;
  height?: number;
}


export function ReportChart({
  data,
  type,
  dataKey,
  nameKey = 'name',
  xAxisKey,
  title,
  color = CHART_PRIMARY,
  height = 300,
}: Props) {
  if (!data || data.length === 0) {
    return <EmptyState icon={BarChart3} title="لا توجد بيانات لعرضها" className="py-8" />;
  }

  if (type === 'bar') {
    const xKey = xAxisKey || nameKey;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            dataKey={xKey}
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
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Bar dataKey={dataKey} radius={[4, 4, 0, 0]}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    );
  }

  if (type === 'line') {
    const xKey = xAxisKey || nameKey;
    return (
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            dataKey={xKey}
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
          <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
          <Line
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2.5}
            dot={{ r: 4, fill: color }}
            activeDot={{ r: 6, fill: color }}
          />
        </LineChart>
      </ResponsiveContainer>
    );
  }

  // pie
  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={data}
          cx="50%"
          cy="50%"
          innerRadius={50}
          outerRadius={90}
          paddingAngle={3}
          dataKey={dataKey}
          nameKey={nameKey}
          label={({ name, percent }: { name: string; percent: number }) =>
            `${name} ${(percent * 100).toFixed(0)}%`
          }
          labelLine={false}
        >
          {data.map((_, index) => (
            <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
          ))}
        </Pie>
        <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
        <Legend
          formatter={(value: string) => (
            <span className="text-xs">{value}</span>
          )}
          iconSize={8}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}
