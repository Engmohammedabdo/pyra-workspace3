'use client';

import { Users } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '@/lib/constants/chart-colors';
import type { HROverview } from '@/hooks/useHROverview';

interface HeadcountChartProps {
  byDepartment: HROverview['headcount']['by_department'];
}

export function HeadcountChart({ byDepartment }: HeadcountChartProps) {
  const entries = Object.entries(byDepartment ?? {});
  const total = entries.reduce((sum, [, v]) => sum + v, 0);

  const chartData = entries.map(([name, count]) => ({ name, count }));

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-md shadow-blue-500/15">
          <Users className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-bold text-sm">توزيع الموظفين بالأقسام</h3>
        <span className="ms-auto text-xs text-muted-foreground">{total} موظف</span>
      </div>

      <div className="p-5">
        {chartData.length > 0 ? (
          <div
            aria-label={`توزيع ${total} موظف على ${chartData.length} قسم: ${chartData.map(d => `${d.name} ${d.count}`).join('، ')}`}
          >
            <ResponsiveContainer width="100%" height={260}>
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
                  allowDecimals={false}
                />
                <YAxis
                  dataKey="name"
                  type="category"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={90}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number) => [value, 'موظف']}
                  labelFormatter={(label: string) => label}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                  {chartData.map((_, idx) => (
                    <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        ) : (
          /* compact inline stub per Phase 13 pattern */
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Users className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">لا توجد بيانات أقسام</p>
          </div>
        )}
      </div>
    </div>
  );
}
