'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Star, TrendingUp, Users } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { CsatStars, CSAT_RATING_LABELS } from './csat-badge';
import { useCsatStats } from '@/hooks/useWhatsApp';

interface CsatStatsCardProps {
  params?: Record<string, string | undefined>;
  className?: string;
}

const RATING_COLORS: Record<number, string> = {
  1: 'bg-red-500',
  2: 'bg-orange-500',
  3: 'bg-yellow-500',
  4: 'bg-lime-500',
  5: 'bg-emerald-500',
};

/**
 * Dashboard card showing CSAT overview:
 * - Average rating (big number + stars)
 * - Distribution bar chart (1-5)
 * - Per-agent table
 */
export function CsatStatsCard({ params, className }: CsatStatsCardProps) {
  const { data: stats, isLoading } = useCsatStats(params);

  if (isLoading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Star className="h-5 w-5 text-amber-500" />
            <Skeleton className="h-5 w-40" />
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-32 w-full" />
        </CardContent>
      </Card>
    );
  }

  const data = stats || {
    average: 0,
    total: 0,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    byAgent: [],
    trend: [],
  };

  const maxDistCount = Math.max(...Object.values(data.distribution), 1);

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Star className="h-5 w-5 text-amber-500 fill-amber-500" />
          {'رضا العملاء (CSAT)'}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Average Rating */}
        <div className="flex items-center gap-6">
          <div className="text-center">
            <p className="text-4xl font-bold tabular-nums text-foreground">
              {data.average > 0 ? data.average.toFixed(1) : '-'}
            </p>
            <CsatStars rating={Math.round(data.average)} size="md" />
            <p className="text-xs text-muted-foreground/60 mt-1">
              {data.total} {'تقييم'}
            </p>
          </div>

          {/* Distribution Bars */}
          <div className="flex-1 space-y-1.5">
            {[5, 4, 3, 2, 1].map(r => {
              const count = data.distribution[r] || 0;
              const pct = data.total > 0 ? (count / data.total) * 100 : 0;
              return (
                <div key={r} className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground/60 w-4 text-center tabular-nums">
                    {r}
                  </span>
                  <Star className="h-3 w-3 text-amber-400 fill-amber-400 shrink-0" />
                  <div className="flex-1 h-2.5 bg-muted/30 rounded-full overflow-hidden">
                    <div
                      className={cn('h-full rounded-full transition-all duration-500', RATING_COLORS[r])}
                      style={{ width: `${maxDistCount > 0 ? (count / maxDistCount) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-muted-foreground/50 w-8 text-end tabular-nums">
                    {pct > 0 ? `${Math.round(pct)}%` : '-'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Per-Agent Breakdown */}
        {data.byAgent.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-muted-foreground/60" />
              <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
                {'تقييم الوكلاء'}
              </h4>
            </div>
            <div className="space-y-2">
              {data.byAgent.map(agent => (
                <div
                  key={agent.agent}
                  className="flex items-center justify-between p-2 rounded-lg bg-muted/20 hover:bg-muted/30 transition-colors"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-400 to-indigo-600 flex items-center justify-center text-white text-[10px] font-bold shrink-0">
                      {agent.agent.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm truncate">
                      {agent.agent === 'unassigned' ? 'غير معيّن' : agent.agent}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <CsatStars rating={Math.round(agent.average)} size="sm" />
                    <span className="text-xs font-semibold tabular-nums min-w-[2rem] text-end">
                      {agent.average.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                      ({agent.count})
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Trend */}
        {data.trend.length > 0 && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <TrendingUp className="h-4 w-4 text-muted-foreground/60" />
              <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider">
                {'الاتجاه'}
              </h4>
            </div>
            <div className="flex items-end gap-1 h-16">
              {data.trend.slice(-14).map(point => {
                const heightPct = (point.average / 5) * 100;
                const color = point.average >= 4 ? 'bg-emerald-500' : point.average >= 3 ? 'bg-yellow-500' : 'bg-red-500';
                return (
                  <div
                    key={point.date}
                    className="flex-1 flex flex-col items-center gap-0.5"
                    title={`${point.date}: ${point.average.toFixed(1)} (${point.count})`}
                  >
                    <div
                      className={cn('w-full rounded-t-sm transition-all', color)}
                      style={{ height: `${heightPct}%`, minHeight: '2px' }}
                    />
                    <span className="text-[7px] text-muted-foreground/40 tabular-nums">
                      {point.date.slice(8)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Empty State */}
        {data.total === 0 && (
          <div className="text-center py-6">
            <Star className="h-8 w-8 text-muted-foreground/20 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground/50">
              {'لا توجد تقييمات بعد'}
            </p>
            <p className="text-xs text-muted-foreground/30 mt-1">
              {'ستظهر التقييمات عند حل المحادثات'}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
