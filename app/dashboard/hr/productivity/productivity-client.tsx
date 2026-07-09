'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { useProductivityReport, useProductivityTrends } from '@/hooks/useProductivity';
import type { EmployeeReport } from '@/lib/production/report';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { ProductivityTrendChart } from '@/components/hr/productivity/ProductivityTrendChart';
import { formatDate, dubaiDayKey } from '@/lib/utils/format';
import {
  AlertCircle, AlertTriangle, BarChart3, CheckCircle2, ChevronDown, Clock,
  FileSpreadsheet, FileText, Minus, PackageCheck, RefreshCcw, Repeat, Target, Timer,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Locale } from '@/lib/i18n/config';

type Tone = 'default' | 'good' | 'warn' | 'bad';

// --- Status: never color-alone. Each tone ships an icon + a word. ---
const STATE_STYLE: Record<Tone, { Icon: typeof CheckCircle2; chip: string }> = {
  good: { Icon: CheckCircle2, chip: 'text-emerald-700 bg-emerald-500/10 dark:text-emerald-400' },
  warn: { Icon: AlertTriangle, chip: 'text-amber-700 bg-amber-500/10 dark:text-amber-400' },
  bad: { Icon: AlertCircle, chip: 'text-red-700 bg-red-500/10 dark:text-red-400' },
  default: { Icon: Minus, chip: 'text-muted-foreground bg-muted' },
};

function StateChip({ tone, word }: { tone: Tone; word: string }) {
  const { Icon, chip } = STATE_STYLE[tone];
  return (
    <span className={cn('inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', chip)}>
      <Icon className="size-3" aria-hidden />
      {word}
    </span>
  );
}

// A headline stat: big value in ink + a status chip (icon+word) + plain explainer.
function HeadlineStat({ icon: Icon, label, value, plain, tone, stateWord }: {
  icon: typeof Target; label: string; value: string; plain: string;
  tone?: Tone; stateWord?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 rounded-xl border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-4 text-orange-500" aria-hidden />
        {label}
      </div>
      <div className="text-3xl font-bold leading-none">{value}</div>
      {tone && stateWord ? <StateChip tone={tone} word={stateWord} /> : <span className="h-[18px]" aria-hidden />}
      <p className="text-[11px] leading-snug text-muted-foreground">{plain}</p>
    </div>
  );
}

// A secondary stat (shown inside the collapsible details region).
function MiniStat({ label, value, plain, tone = 'default' }: {
  label: string; value: string; plain: string; tone?: Tone;
}) {
  return (
    <div className={cn(
      'rounded-lg border p-2.5',
      tone === 'bad' && 'border-red-200 bg-red-50 dark:border-red-800/40 dark:bg-red-950/30',
    )}>
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-base font-semibold">{value}</p>
      <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">{plain}</p>
    </div>
  );
}

function onTimeTone(pct: number | null): Tone {
  if (pct === null) return 'default';
  if (pct >= 80) return 'good';
  if (pct >= 50) return 'warn';
  return 'bad';
}

// Fewer rework rounds = higher quality. 1 round ≈ approved first submission.
function qualityTone(rounds: number | null): Tone {
  if (rounds === null) return 'default';
  if (rounds <= 1.3) return 'good';
  if (rounds <= 2.2) return 'warn';
  return 'bad';
}

const stateKey = (tone: Tone) => (tone === 'default' ? 'none' : tone);

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

  const otTone = onTimeTone(m.on_time_pct);
  const qTone = qualityTone(m.avg_rounds);
  const noActivity = m.deliveries === 0 && m.open_overdue === 0;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">{emp.display_name}</h3>
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Clock className="size-3.5" aria-hidden />
          {t('attendanceLine', {
            present: emp.attendance.present_days,
            late: emp.attendance.late_days,
            absent: emp.attendance.absent_days,
            hours: emp.attendance.total_hours,
          })}
        </div>
      </div>

      {/* Overdue alert — impossible to miss, only shown when there's a problem */}
      {m.open_overdue > 0 && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-700 dark:border-red-800/40 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          {t('overdueBanner', { count: m.open_overdue })}
        </div>
      )}

      {/* The 3 headline numbers a manager judges by */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <HeadlineStat
          icon={Target}
          label={t('kpis.onTimePct.label')}
          value={m.on_time_pct === null ? '—' : `${m.on_time_pct}%`}
          plain={t('kpis.onTimePct.plain')}
          tone={otTone}
          stateWord={t(`kpis.onTimePct.states.${stateKey(otTone)}`)}
        />
        <HeadlineStat
          icon={Repeat}
          label={t('kpis.quality.label')}
          value={m.avg_rounds === null ? '—' : t('kpis.quality.value', { rounds: m.avg_rounds })}
          plain={t('kpis.quality.plain')}
          tone={qTone}
          stateWord={t(`kpis.quality.states.${stateKey(qTone)}`)}
        />
        <HeadlineStat
          icon={PackageCheck}
          label={t('kpis.deliveries.label')}
          value={String(m.deliveries)}
          plain={t('kpis.deliveries.plain')}
        />
      </div>

      {noActivity && (
        <p className="text-xs text-muted-foreground">{t('noActivityYet')}</p>
      )}

      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
        aria-expanded={open}
      >
        <ChevronDown className={cn('size-3.5 transition-transform', open && 'rotate-180')} aria-hidden />
        {t('taskDetailsToggle', { count: visibleTasks.length })}
      </button>

      {open && (
        <div className="space-y-3">
          {/* Secondary numbers — the depth, kept out of the at-a-glance view */}
          <div>
            <p className="mb-1.5 text-[11px] font-medium text-muted-foreground">{t('secondaryTitle')}</p>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              <MiniStat
                label={t('kpis.avgDelay.label')}
                value={m.avg_delay_days === null ? '—' : t('kpis.avgDelay.value', { days: m.avg_delay_days })}
                plain={t('kpis.avgDelay.plain')}
                tone={m.avg_delay_days ? 'warn' : 'default'}
              />
              <MiniStat
                label={t('kpis.avgFirstSubmission.label')}
                value={m.avg_days_to_first_submission === null ? '—' : t('kpis.avgFirstSubmission.value', { days: m.avg_days_to_first_submission })}
                plain={t('kpis.avgFirstSubmission.plain')}
              />
              <MiniStat
                label={t('kpis.avgReviewWait.label')}
                value={m.avg_review_wait_hours === null ? '—' : t('kpis.avgReviewWait.value', { hours: m.avg_review_wait_hours })}
                plain={t('kpis.avgReviewWait.plain')}
              />
              <MiniStat
                label={t('kpis.openOverdue.label')}
                value={String(m.open_overdue)}
                plain={t('kpis.openOverdue.plain')}
                tone={m.open_overdue > 0 ? 'bad' : 'default'}
              />
            </div>
          </div>

          {/* Per-task drill-down */}
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
                  <tr key={task.task_id} className="border-b transition-colors last:border-b-0 hover:bg-muted/30">
                    <td className="p-2 font-medium">{task.title}</td>
                    <td className="p-2">{task.due_date ? formatDate(task.due_date, undefined, locale) : '—'}</td>
                    <td className="p-2">{task.first_submitted_at ? formatDate(task.first_submitted_at, undefined, locale) : '—'}</td>
                    <td className="p-2">
                      {task.on_time === null ? <span className="text-muted-foreground">—</span>
                        : task.on_time ? <Badge className="border-0 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">{t('table.onTime')}</Badge>
                        : <Badge className="border-0 bg-red-500/10 text-red-600 dark:text-red-400">{t('table.late', { days: task.delay_days ?? 0 })}</Badge>}
                    </td>
                    <td className="p-2">{task.review_rounds}</td>
                    <td className="p-2">{task.delivered_at ? formatDate(task.delivered_at, undefined, locale) : <span className="text-muted-foreground">{t('table.notDelivered')}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

export function ProductivityClient() {
  const t = useTranslations('hr.productivity');
  const [month, setMonth] = useState(dubaiDayKey().slice(0, 7));
  const { data, isLoading } = useProductivityReport(month);
  const { data: trends, isLoading: isTrendsLoading } = useProductivityTrends(6);
  const exportBase = `/api/hr/productivity/export?month=${encodeURIComponent(month)}`;

  return (
    <div className="space-y-4 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold">
            <BarChart3 className="size-5 text-orange-500" aria-hidden />
            {t('page.title')}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {t('page.subtitle')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild>
            <a href={`${exportBase}&format=pdf`}>
              <FileText className="size-4" aria-hidden />
              {t('export.pdf')}
            </a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={`${exportBase}&format=xlsx`}>
              <FileSpreadsheet className="size-4" aria-hidden />
              {t('export.excel')}
            </a>
          </Button>
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="h-9 rounded-md border bg-background px-3 text-sm"
            aria-label={t('page.monthPickerAria')}
          />
        </div>
      </div>

      <ProductivityTrendChart trends={trends} isLoading={isTrendsLoading} />

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

      <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Timer className="size-3" aria-hidden />
        {t('footer.onTimeDisclaimer')}
        <RefreshCcw className="ms-2 size-3" aria-hidden />
        {t('footer.derivedDisclaimer')}
      </p>
    </div>
  );
}
