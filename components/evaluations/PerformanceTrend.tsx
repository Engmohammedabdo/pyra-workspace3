'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import { useUsersLite } from '@/hooks/useUsers';
import type { Locale } from '@/lib/i18n/config';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { CHART_PRIMARY, CHART_TOOLTIP_STYLE, CHART_GRID_STYLE } from '@/lib/constants/chart-colors';
import { AlertTriangle, TrendingUp, Users } from 'lucide-react';

// ============================================================
// Types
// ============================================================

interface EvaluationForTrend {
  id: string;
  overall_rating: number | null;
  status: 'draft' | 'submitted' | 'acknowledged';
  created_at: string;
  period?: { id: string; name: string; name_ar: string; status: string } | null;
}

const LOW_PERFORMANCE_THRESHOLD = 3.0;

// ============================================================
// Component
// ============================================================

export function PerformanceTrend() {
  const t = useTranslations('hr.evaluations.performanceTrend');
  const locale = useLocale() as Locale;
  const [employee, setEmployee] = useState<string>('');

  const { data: usersRaw = [] } = useUsersLite();
  const employees = usersRaw.filter(
    (u) => u.status === 'active' && (u.role === 'employee' || u.role === 'sales_agent'),
  );

  const { data: evaluations = [], isLoading } = useQuery<EvaluationForTrend[]>({
    queryKey: ['evaluations', 'trend', employee],
    queryFn: () => fetchAPI(`/api/dashboard/evaluations?employee=${encodeURIComponent(employee)}`),
    enabled: !!employee,
    staleTime: 60_000,
  });

  // Only submitted/acknowledged evaluations carry a final overall_rating.
  // Sort by the period's start_date when available; the list endpoint
  // doesn't return start_date today, so created_at is the honest fallback.
  const chartData = useMemo(() => {
    return evaluations
      .filter((ev) => (ev.status === 'submitted' || ev.status === 'acknowledged') && ev.overall_rating !== null)
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .map((ev) => ({
        period: (locale === 'ar'
          ? ev.period?.name_ar
          : (ev.period?.name || ev.period?.name_ar)) || '—',
        rating: Number(ev.overall_rating),
      }));
  }, [evaluations, locale]);

  const average = useMemo(() => {
    if (chartData.length === 0) return 0;
    const sum = chartData.reduce((acc, d) => acc + d.rating, 0);
    return sum / chartData.length;
  }, [chartData]);

  const hasLowPerformance = chartData.some((d) => d.rating < LOW_PERFORMANCE_THRESHOLD);

  return (
    <div className="space-y-4 mt-4">
      <div className="max-w-xs">
        <Label className="text-sm">{t('employeeLabel')}</Label>
        <Select value={employee} onValueChange={setEmployee}>
          <SelectTrigger className="mt-1">
            <SelectValue placeholder={t('employeePlaceholder')} />
          </SelectTrigger>
          <SelectContent>
            {employees.map((u) => (
              <SelectItem key={u.username} value={u.username || ''}>
                {u.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {!employee ? (
        <EmptyState
          icon={Users}
          title={t('selectEmployeeEmpty.title')}
          description={t('selectEmployeeEmpty.description')}
        />
      ) : isLoading ? (
        <Skeleton className="h-72 w-full rounded-xl" />
      ) : chartData.length === 0 ? (
        <EmptyState
          icon={TrendingUp}
          title={t('noEvaluationsEmpty.title')}
          description={t('noEvaluationsEmpty.description')}
        />
      ) : (
        <Card>
          <CardHeader className="pb-2 flex flex-row items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm">{t('cardTitle')}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs">
                {t('average', { average: average.toFixed(1) })}
              </Badge>
              {hasLowPerformance && (
                <Badge
                  variant="secondary"
                  className="gap-1 bg-red-500/10 text-red-600 dark:text-red-400"
                >
                  <AlertTriangle className="h-3 w-3" />
                  {t('lowPerformance')}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <CartesianGrid {...CHART_GRID_STYLE} />
                  <XAxis dataKey="period" tick={{ fontSize: 11, fill: 'currentColor' }} />
                  <YAxis domain={[0, 5]} tick={{ fontSize: 11, fill: 'currentColor' }} allowDecimals={false} />
                  <Tooltip contentStyle={CHART_TOOLTIP_STYLE} />
                  <Line
                    type="monotone"
                    dataKey="rating"
                    name={t('lineChartName')}
                    stroke={CHART_PRIMARY}
                    strokeWidth={2}
                    dot={{ fill: CHART_PRIMARY, r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export default PerformanceTrend;
