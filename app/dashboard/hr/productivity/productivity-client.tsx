'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useProductivityReport } from '@/hooks/useProductivity';
import type { EmployeeReport } from '@/lib/production/report';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, dubaiDayKey } from '@/lib/utils/format';
import { BarChart3, ChevronDown, Clock, PackageCheck, RefreshCcw, Timer } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Locale } from '@/lib/i18n/config';

function Kpi({ label, value, hint, tone = 'default' }: {
  label: string; value: string; hint?: string;
  tone?: 'default' | 'good' | 'warn' | 'bad';
}) {
  return (
    <div className={cn(
      'rounded-lg border p-3',
      tone === 'good' && 'border-emerald-200 bg-emerald-50 dark:border-emerald-800/40 dark:bg-emerald-950/30',
      tone === 'warn' && 'border-amber-200 bg-amber-50 dark:border-amber-800/40 dark:bg-amber-950/30',
      tone === 'bad' && 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/30',
    )}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      {hint && <p className="text-[10px] text-muted-foreground mt-0.5">{hint}</p>}
    </div>
  );
}

function onTimeTone(pct: number | null): 'default' | 'good' | 'warn' | 'bad' {
  if (pct === null) return 'default';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'warn';
  return 'bad';
}

function EmployeeCard({ emp, month }: { emp: EmployeeReport; month: string }) {
  const t = useTranslations('hr.productivity');
  const locale = useLocale() as Locale;
  const [open, setOpen] = useState(false);
  const m = emp.metrics;

  // Drill-down must reconcile with the month-filtered KPI cards: show only
  // journeys whose delivery OR first-submission lands in the selected month.
  // When viewing the CURRENT month, also keep not-yet-submitted open work so
  // in-flight tasks stay visible. Month key derived the same way the metrics
  // engine buckets (dubaiDayKey → YYYY-MM) so past months reconcile exactly.
  const isCurrentMonth = month === dubaiDayKey().slice(0, 7);
  const monthOf = (iso: string) => dubaiDayKey(new Date(iso)).slice(0, 7);
  const visibleTasks = emp.tasks.filter((task) => {
    if (task.delivered_at && monthOf(task.delivered_at) === month) return true;
    if (task.first_submitted_at && monthOf(task.first_submitted_at) === month) return true;
    if (isCurrentMonth && !task.first_submitted_at && !task.delivered_at) return true;
    return false;
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{emp.display_name}</h3>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          {t('attendanceLine', {
            present: emp.attendance.present_days,
            late: emp.attendance.late_days,
            absent: emp.attendance.absent_days,
            hours: emp.attendance.total_hours,
          })}
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
        <Kpi label={t('kpis.deliveries')} value={String(m.deliveries)} />
        <Kpi
          label={t('kpis.onTimePct.label')}
          value={m.on_time_pct === null ? '—' : `${m.on_time_pct}%`}
          tone={onTimeTone(m.on_time_pct)}
          hint={t('kpis.onTimePct.hint')}
        />
        <Kpi
          label={t('kpis.avgDelay.label')}
          value={m.avg_delay_days === null ? '—' : t('kpis.avgDelay.value', { days: m.avg_delay_days })}
          tone={m.avg_delay_days ? 'warn' : 'default'}
          hint={t('kpis.avgDelay.hint', { count: m.late_count })}
        />
        <Kpi label={t('kpis.avgRounds.label')} value={m.avg_rounds === null ? '—' : String(m.avg_rounds)} hint={t('kpis.avgRounds.hint')} />
        <Kpi
          label={t('kpis.avgFirstSubmission.label')}
          value={m.avg_days_to_first_submission === null ? '—' : t('kpis.avgFirstSubmission.value', { days: m.avg_days_to_first_submission })}
          hint={t('kpis.avgFirstSubmission.hint')}
        />
        <Kpi
          label={t('kpis.avgReviewWait.label')}
          value={m.avg_review_wait_hours === null ? '—' : t('kpis.avgReviewWait.value', { hours: m.avg_review_wait_hours })}
          hint={t('kpis.avgReviewWait.hint')}
        />
        <Kpi label={t('kpis.openOverdue.label')} value={String(m.open_overdue)} tone={m.open_overdue > 0 ? 'bad' : 'default'} />
      </div>

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
        aria-expanded={open}
      >
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        {t('taskDetailsToggle', { count: visibleTasks.length })}
      </button>

      {open && (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b text-muted-foreground">
                <th scope="col" className="p-2 text-start">{t('table.task')}</th>
                <th scope="col" className="p-2 text-start">{t('table.deadline')}</th>
                <th scope="col" className="p-2 text-start">{t('table.firstSubmission')}</th>
                <th scope="col" className="p-2 text-start">{t('table.commitment')}</th>
                <th scope="col" className="p-2 text-start">{t('table.rounds')}</th>
                <th scope="col" className="p-2 text-start">{t('table.finalDelivery')}</th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.map((task) => (
                <tr key={task.task_id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                  <td className="p-2 font-medium">{task.title}</td>
                  <td className="p-2">{task.due_date ? formatDate(task.due_date, undefined, locale) : '—'}</td>
                  <td className="p-2">{task.first_submitted_at ? formatDate(task.first_submitted_at, undefined, locale) : '—'}</td>
                  <td className="p-2">
                    {task.on_time === null ? <span className="text-muted-foreground">—</span>
                      : task.on_time ? <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-0">{t('table.onTime')}</Badge>
                      : <Badge className="bg-red-500/10 text-red-600 dark:text-red-400 border-0">{t('table.late', { days: task.delay_days ?? 0 })}</Badge>}
                  </td>
                  <td className="p-2">{task.review_rounds}</td>
                  <td className="p-2">{task.delivered_at ? formatDate(task.delivered_at, undefined, locale) : <span className="text-muted-foreground">{t('table.notDelivered')}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function ProductivityClient() {
  const t = useTranslations('hr.productivity');
  const [month, setMonth] = useState(dubaiDayKey().slice(0, 7));
  const { data, isLoading } = useProductivityReport(month);

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <BarChart3 className="size-5 text-orange-500" aria-hidden />
            {t('page.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t('page.subtitle')}
          </p>
        </div>
        <input
          type="month"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
          className="h-10 rounded-md border bg-background px-3 text-sm"
          aria-label={t('page.monthPickerAria')}
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : !data?.employees.length ? (
        <EmptyState
          icon={PackageCheck}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      ) : (
        data.employees.map((emp) => <EmployeeCard key={emp.username} emp={emp} month={month} />)
      )}

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <Timer className="size-3" aria-hidden />
        {t('footer.onTimeDisclaimer')}
        <RefreshCcw className="size-3 ms-2" aria-hidden />
        {t('footer.derivedDisclaimer')}
      </p>
    </div>
  );
}
