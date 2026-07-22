'use client';

import { useMyProductivity } from '@/hooks/useProductivity';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, BarChart3, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="text-center">
      <p className={cn('text-lg font-bold', danger && 'text-red-500')}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

/** Compact current-month stats strip for the my-tasks page. */
export function MyProductivityCard() {
  const t = useTranslations('mywork.tasks.productivity');
  const { data, isLoading, isError, refetch } = useMyProductivity();
  if (isLoading) return <Skeleton className="h-20 w-full" />;
  if (isError) {
    return (
      <Card className="flex items-center justify-between gap-3 border-red-200 bg-red-50/60 p-3 dark:border-red-800/40 dark:bg-red-950/30">
        <div className="flex min-w-0 items-center gap-2 text-red-700 dark:text-red-300">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <p className="text-sm font-medium">{t('error.title')}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refetch()}>
          <RefreshCcw className="size-3.5" aria-hidden />
          {t('error.retry')}
        </Button>
      </Card>
    );
  }

  const me = data?.employees[0];
  if (!me || (me.tasks.length === 0)) return null; // not a production employee — render nothing

  const m = me.metrics;
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2 mb-2">
        <BarChart3 className="size-4 text-orange-500" aria-hidden />
        <h3 className="text-sm font-semibold">{t('title')}</h3>
      </div>
      <div className="grid grid-cols-5 gap-2">
        <Stat label={t('stats.deliveries')} value={String(m.deliveries)} />
        <Stat label={t('stats.onTime')} value={m.on_time_pct === null ? '—' : `${m.on_time_pct}%`} />
        <Stat label={t('stats.reviewRounds')} value={m.avg_rounds === null ? '—' : String(m.avg_rounds)} />
        <Stat
          label={t('stats.firstDraftSpeed')}
          value={m.avg_days_to_first_submission === null
            ? '—'
            : t('daysShort', { days: m.avg_days_to_first_submission })}
        />
        <Stat label={t('stats.openOverdue')} value={String(m.open_overdue)} danger={m.open_overdue > 0} />
      </div>
    </Card>
  );
}
