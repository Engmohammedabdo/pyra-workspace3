'use client';

import { useLocale, useTranslations } from 'next-intl';
import { Phone, BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CHART_COLORS, CHART_TOOLTIP_STYLE } from '@/lib/constants/chart-colors';
import { formatDate } from '@/lib/utils/format';
import type { Locale } from '@/lib/i18n/config';

interface CallsByDayChartProps {
  perDay: Record<string, number>;
}

export function CallsByDayChart({ perDay }: CallsByDayChartProps) {
  const t = useTranslations('calls');
  const locale = useLocale() as Locale;

  // per_day keys are YYYY-MM-DD — sort chronologically, tick label = day-of-month.
  const chartData = Object.entries(perDay)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([day, count]) => ({ day, count, dayLabel: day.slice(8, 10) }));

  const byDayLabel = t('byDay');

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/15">
          <BarChart3 className="h-4 w-4 text-white" aria-hidden />
        </div>
        <h3 className="font-bold text-sm">{byDayLabel}</h3>
      </div>

      <div className="p-5">
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="opacity-20" />
              <XAxis dataKey="dayLabel" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number) => [value, byDayLabel]}
                labelFormatter={(_, payload) => {
                  const day = payload?.[0]?.payload?.day as string | undefined;
                  return day ? formatDate(day, undefined, locale) : '';
                }}
              />
              <Bar dataKey="count" radius={[6, 6, 0, 0]} fill={CHART_COLORS[0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          /* compact inline stub per Phase 13 pattern */
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Phone className="h-8 w-8 text-muted-foreground/40 mb-2" />
            <p className="text-sm text-muted-foreground">{t('emptyTitle')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
