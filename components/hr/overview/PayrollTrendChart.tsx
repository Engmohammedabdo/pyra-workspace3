'use client';

import { useId } from 'react';
import { Banknote, TrendingUp } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '@/lib/constants/chart-colors';
import type { HROverview } from '@/hooks/useHROverview';

type TrendItem = HROverview['payroll']['trend'][number];

interface PayrollTrendChartProps {
  trend: HROverview['payroll']['trend'];
}

const PAYROLL_COLOR = CHART_COLORS[4]; // purple-500

export function PayrollTrendChart({ trend }: PayrollTrendChartProps) {
  const gradientId = useId();
  const hasTrend = trend && trend.length > 0;
  const latestItem: TrendItem | undefined = hasTrend ? trend[trend.length - 1] : undefined;
  const latestTotal = latestItem?.total ?? 0;
  const latestCurrency = latestItem?.currency ?? 'AED';

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-md shadow-purple-500/15">
          <Banknote className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-bold text-sm">اتجاه تكلفة الرواتب</h3>
        {hasTrend && (
          <span className="ms-auto text-xs text-muted-foreground">
            آخر: {formatCurrency(latestTotal, latestCurrency)}
          </span>
        )}
      </div>

      <div className="p-5">
        {hasTrend ? (
          <div
            aria-label={`اتجاه تكلفة الرواتب عبر ${trend.length} فترة. آخر قيمة ${formatCurrency(latestTotal, latestCurrency)}`}
          >
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trend}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PAYROLL_COLOR} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={PAYROLL_COLOR} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: number) => {
                    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
                    if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
                    return String(v);
                  }}
                />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value: number, _name: string, props: { payload?: TrendItem }) => {
                    const currency = props?.payload?.currency ?? 'AED';
                    return [formatCurrency(value, currency), 'إجمالي الرواتب'];
                  }}
                  labelFormatter={(label: string) => label}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke={PAYROLL_COLOR}
                  strokeWidth={2.5}
                  fill={`url(#${gradientId})`}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          /* compact inline stub */
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <TrendingUp className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">لا توجد بيانات رواتب</p>
          </div>
        )}
      </div>
    </div>
  );
}
