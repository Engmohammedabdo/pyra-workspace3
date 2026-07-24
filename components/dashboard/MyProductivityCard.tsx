'use client';

import { useState } from 'react';
import { useMyProductivity } from '@/hooks/useProductivity';
import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertCircle, BarChart3, ChevronDown, RefreshCcw } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { CALENDAR_TIMEZONE_OFFSET } from '@/lib/constants/statuses';
import { dubaiDayKey } from '@/lib/utils/format';
import { isoToDubaiDateTime } from '@/lib/production/deadlines';
import type { TaskJourney } from '@/lib/production/metrics';

function Stat({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="text-center">
      <p className={cn('text-lg font-bold', danger && 'text-red-500')}>{value}</p>
      <p className="text-[10px] text-muted-foreground">{label}</p>
    </div>
  );
}

function dubaiDateTime(instant: string | null): string | null {
  if (!instant) return null;
  const value = isoToDubaiDateTime(instant);
  return value ? `${value.date} ${value.time} (${CALENDAR_TIMEZONE_OFFSET})` : null;
}

function tasksForMonth(tasks: readonly TaskJourney[], month: string): TaskJourney[] {
  const monthOf = (instant: string) => dubaiDayKey(new Date(instant)).slice(0, 7);
  return tasks.filter((task) => {
    if (task.delivered_at && monthOf(task.delivered_at) === month) return true;
    if (task.first_submitted_at && monthOf(task.first_submitted_at) === month) return true;
    return !task.first_submitted_at && !task.delivered_at && !task.is_archived;
  });
}

/** Compact current-month stats strip for the my-tasks page. */
export function MyProductivityCard() {
  const t = useTranslations('mywork.tasks.productivity');
  const { data, isLoading, isError, refetch } = useMyProductivity();
  const [detailsOpen, setDetailsOpen] = useState(false);
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
  const visibleTasks = tasksForMonth(me.tasks, data.month);
  return (
    <Card className="space-y-3 p-3">
      <div className="flex items-center gap-2">
        <BarChart3 className="size-4 text-orange-500" aria-hidden />
        <h3 className="text-sm font-semibold">{t('title')}</h3>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
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

      <button
        type="button"
        onClick={() => setDetailsOpen((current) => !current)}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={detailsOpen}
      >
        <ChevronDown
          className={cn('size-3.5 transition-transform', detailsOpen && 'rotate-180')}
          aria-hidden
        />
        {t('details.toggle', { count: visibleTasks.length })}
      </button>

      {detailsOpen && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[720px] text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-muted-foreground">
                <th scope="col" className="p-2 text-start">{t('details.table.task')}</th>
                <th scope="col" className="p-2 text-start">{t('details.table.deadline')}</th>
                <th scope="col" className="p-2 text-start">{t('details.table.firstSubmission')}</th>
                <th scope="col" className="p-2 text-start">{t('details.table.commitment')}</th>
                <th scope="col" className="p-2 text-start">{t('details.table.rounds')}</th>
                <th scope="col" className="p-2 text-start">{t('details.table.finalDelivery')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((task) => (
                <tr key={task.task_id} className="border-b last:border-b-0">
                  <td className="p-2 font-medium">{task.title}</td>
                  <td className="p-2">
                    {dubaiDateTime(task.effective_due_at) ?? task.due_date ?? '—'}
                  </td>
                  <td className="p-2">{dubaiDateTime(task.first_submitted_at) ?? '—'}</td>
                  <td className="p-2">
                    {task.delivery_exclusion === 'lead_time_under_24h' ? (
                      <Badge className="border-0 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        {t('details.exclusions.shortLead')}
                      </Badge>
                    ) : task.delivery_exclusion === 'unverified_legacy_deadline' ? (
                      <Badge className="border-0 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        {t('details.exclusions.unverifiedLegacy')}
                      </Badge>
                    ) : task.delivery_exclusion === 'legacy_unverified_attribution' ? (
                      <Badge className="border-0 bg-amber-500/10 text-amber-700 dark:text-amber-300">
                        {t('details.exclusions.unverifiedAttribution')}
                      </Badge>
                    ) : task.on_time === true ? (
                      <Badge className="border-0 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300">
                        {t('details.onTime')}
                      </Badge>
                    ) : task.on_time === false ? (
                      <Badge className="border-0 bg-red-500/10 text-red-700 dark:text-red-300">
                        {task.delay_days === 0
                          ? t('details.lateSameDay')
                          : t('details.late', { days: task.delay_days ?? 0 })}
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground">{t('details.notScored')}</span>
                    )}
                  </td>
                  <td className="p-2">{task.review_rounds}</td>
                  <td className="p-2">
                    {dubaiDateTime(task.delivered_at) ?? t('details.notDelivered')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
