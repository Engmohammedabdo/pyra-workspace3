'use client';

import { useMemo } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ProductivityTrends } from '@/hooks/useProductivity';
import type { Locale } from '@/lib/i18n/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CHART_COLORS,
  CHART_GRID_STYLE,
  CHART_PRIMARY,
  CHART_TOOLTIP_STYLE,
} from '@/lib/constants/chart-colors';
import { formatDate } from '@/lib/utils/format';
import { AlertCircle, RefreshCcw, TrendingUp } from 'lucide-react';

interface ProductivityTrendChartProps {
  trends?: ProductivityTrends;
  isLoading: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

function formatMonth(month: string, locale: Locale): string {
  return formatDate(`${month}-01`, 'MMM yy', locale);
}

function delta(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null) return null;
  return current - previous;
}

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

export function ProductivityTrendChart({
  trends,
  isLoading,
  isError = false,
  onRetry,
}: ProductivityTrendChartProps) {
  const t = useTranslations('hr.productivity.trends');
  const locale = useLocale() as Locale;

  const chartData = useMemo(() => {
    return (trends?.months || []).map((point) => ({
      ...point,
      label: formatMonth(point.month, locale),
      on_time_pct: point.on_time_pct ?? 0,
      avg_rounds: point.avg_rounds ?? 0,
    }));
  }, [trends, locale]);

  const latest = trends?.months.at(-1);
  const previous = trends?.months.at(-2);
  const deliveryDelta = latest && previous ? latest.deliveries - previous.deliveries : null;
  const onTimeDelta = latest && previous ? delta(latest.on_time_pct, previous.on_time_pct) : null;

  if (isLoading) {
    return <Skeleton className="h-[320px] w-full rounded-xl" />;
  }

  if (isError) {
    return (
      <EmptyState
        icon={AlertCircle}
        title={t('error.title')}
        description={t('error.description')}
        actions={onRetry ? [{ label: t('error.retry'), onClick: onRetry, icon: RefreshCcw }] : undefined}
      />
    );
  }

  if (!chartData.length) {
    return (
      <EmptyState
        icon={TrendingUp}
        title={t('empty.title')}
        description={t('empty.description')}
      />
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <TrendingUp className="size-4 text-orange-500" aria-hidden />
            {t('title')}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            {deliveryDelta !== null && (
              <Badge variant="outline">
                {t('deliveryDelta', { value: signed(deliveryDelta) })}
              </Badge>
            )}
            {onTimeDelta !== null && (
              <Badge variant="outline">
                {t('onTimeDelta', { value: signed(onTimeDelta) })}
              </Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid {...CHART_GRID_STYLE} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'currentColor' }} />
              <YAxis yAxisId="count" tick={{ fontSize: 11, fill: 'currentColor' }} allowDecimals={false} />
              <YAxis
                yAxisId="percent"
                orientation="right"
                domain={[0, 100]}
                tick={{ fontSize: 11, fill: 'currentColor' }}
                tickFormatter={(value) => `${value}%`}
              />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value: number, name: string) => {
                  if (name === 'on_time_pct') return [`${value}%`, t('series.onTime')];
                  if (name === 'avg_rounds') return [value, t('series.rounds')];
                  return [value, t('series.deliveries')];
                }}
              />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="deliveries"
                name="deliveries"
                stroke={CHART_PRIMARY}
                strokeWidth={2.5}
                dot={{ r: 4, fill: CHART_PRIMARY }}
              />
              <Line
                yAxisId="percent"
                type="monotone"
                dataKey="on_time_pct"
                name="on_time_pct"
                stroke={CHART_COLORS[2]}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS[2] }}
              />
              <Line
                yAxisId="count"
                type="monotone"
                dataKey="avg_rounds"
                name="avg_rounds"
                stroke={CHART_COLORS[1]}
                strokeWidth={2}
                dot={{ r: 3, fill: CHART_COLORS[1] }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
