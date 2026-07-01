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

type CurrencyTrend = HROverview['payroll']['trend_by_currency'][number];

interface PayrollTrendChartProps {
  trendByCurrency: HROverview['payroll']['trend_by_currency'];
}

const PAYROLL_COLOR = CHART_COLORS[4]; // purple-500

/** One independent area chart for a single currency's payroll trend. */
function CurrencySeries({ group }: { group: CurrencyTrend }) {
  const gradientId = useId();
  const points = group.points;
  const latestTotal = points.length ? points[points.length - 1].total : 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-purple-500/10 px-2 py-0.5 text-xs font-semibold text-purple-600 dark:text-purple-400">
          {group.currency}
        </span>
        <span className="ms-auto text-xs text-muted-foreground">
          آخر: {formatCurrency(latestTotal, group.currency)}
        </span>
      </div>
      <div
        aria-label={`اتجاه تكلفة الرواتب بعملة ${group.currency}. آخر قيمة ${formatCurrency(latestTotal, group.currency)}`}
      >
        <ResponsiveContainer width="100%" height={200}>
          <AreaChart data={points}>
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
              formatter={(value: number) => [formatCurrency(value, group.currency), 'إجمالي الرواتب']}
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
    </div>
  );
}

export function PayrollTrendChart({ trendByCurrency }: PayrollTrendChartProps) {
  const hasTrend = trendByCurrency && trendByCurrency.length > 0;

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-violet-600 flex items-center justify-center shadow-md shadow-purple-500/15">
          <Banknote className="h-4 w-4 text-white" />
        </div>
        <h3 className="font-bold text-sm">اتجاه تكلفة الرواتب</h3>
        {hasTrend && trendByCurrency.length > 1 && (
          <span className="ms-auto text-xs text-muted-foreground">
            {trendByCurrency.length} عملات
          </span>
        )}
      </div>

      <div className="p-5">
        {hasTrend ? (
          <div className="space-y-6">
            {trendByCurrency.map((group) => (
              <CurrencySeries key={group.currency} group={group} />
            ))}
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
