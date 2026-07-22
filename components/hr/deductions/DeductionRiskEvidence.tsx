'use client';

import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, CalendarClock, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { DELIVERY_MIN_LEAD_TIME_HOURS } from '@/lib/constants/deductions';
import { evaluateQualityEligibility } from '@/lib/hr/deductions';
import { formatDate } from '@/lib/utils/format';
import type { Locale } from '@/lib/i18n/config';
import type {
  DeliveryTaskEvidence,
  MonthlyEmployeeDeductionReport,
} from '@/lib/hr/deductions-report';

const OUTCOME_STYLES: Record<DeliveryTaskEvidence['outcome'], string> = {
  on_time: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  late: 'bg-red-100 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  pending: 'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  excluded: 'bg-slate-100 text-slate-700 dark:bg-slate-900 dark:text-slate-300',
};

function exclusionKey(reason: DeliveryTaskEvidence['exclusion_reason']) {
  switch (reason) {
    case 'lead_time_under_24h': return 'delivery.reasons.leadTimeUnderMinimum' as const;
    case 'legacy_unverified_attribution': return 'delivery.reasons.legacyUnverified' as const;
    case 'unverified_legacy_deadline': return 'delivery.reasons.unverifiedDeadline' as const;
    case 'missing_deadline': return 'delivery.reasons.missingDeadline' as const;
    case 'invalid_timestamp': return 'delivery.reasons.invalidTimestamp' as const;
    default: return null;
  }
}

function formatDubaiDateTime(value: string | null, locale: Locale): string | null {
  if (!value) return null;
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) return null;
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  }).format(instant);
}

function formatMetric(value: number | null | undefined, locale: Locale): string | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  return new Intl.NumberFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
    maximumFractionDigits: 2,
  }).format(value);
}

function safeQualityEligibility(
  months: MonthlyEmployeeDeductionReport['quality_months'],
): ReturnType<typeof evaluateQualityEligibility> {
  try {
    return evaluateQualityEligibility(months);
  } catch {
    return { current_below_band: false, consecutive_months: 0, eligible: false };
  }
}

export function DeductionRiskEvidence({
  employee,
}: {
  employee: MonthlyEmployeeDeductionReport;
}) {
  const t = useTranslations('hr.deductions.myRisk');
  const locale = useLocale() as Locale;
  const candidate = employee.candidate;
  const attendanceRows = candidate?.attendance.incidents
    ?? employee.attendance_inputs.map((row) => ({
      ...row,
      kind: row.late_minutes === null ? 'no_show' as const : 'late' as const,
    }));
  const qualitySnapshot = employee.quality_months[employee.quality_months.length - 1] ?? null;
  const qualityEligibility = candidate?.quality
    ?? safeQualityEligibility(employee.quality_months);
  const unavailable = t('notAvailable');

  return (
    <>
      <Card className="border-border/60">
        <CardContent className="space-y-3 p-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <CalendarClock className="h-4 w-4" />{t('attendance.title')}
          </h3>
          {attendanceRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('attendance.empty')}</p>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {attendanceRows.map((incident) => (
                <div key={incident.date} className="flex items-center justify-between gap-3 rounded-lg border border-border/60 p-2.5 text-xs">
                  <time>{formatDate(incident.date, 'dd MMM yyyy', locale)}</time>
                  <span className="font-medium text-amber-700 dark:text-amber-300">
                    {incident.kind === 'no_show'
                      ? t('attendance.noShow')
                      : t('attendance.lateMinutes', { minutes: incident.late_minutes ?? 0 })}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <Truck className="h-4 w-4" />{t('delivery.title')}
            </h3>
            {candidate && (
              <span className="text-xs text-muted-foreground">
                {candidate.delivery.on_time_pct === null
                  ? t('delivery.noEligibleRate')
                  : t('delivery.onTimeRate', { value: candidate.delivery.on_time_pct })}
              </span>
            )}
          </div>
          {employee.delivery_tasks.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('delivery.empty')}</p>
          ) : (
            <div className="space-y-2">
              {employee.delivery_tasks.map((task) => {
                const reason = exclusionKey(task.exclusion_reason);
                return (
                  <div key={task.task_id} className="rounded-lg border border-border/60 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 truncate text-sm font-medium">{task.title}</p>
                      <Badge className={`shrink-0 border-0 text-[10px] ${OUTCOME_STYLES[task.outcome]}`}>
                        {t(`delivery.outcomes.${task.outcome}`)}
                      </Badge>
                    </div>
                    <div className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <p data-testid={`delivery-task-${task.task_id}-id`}>
                        {t('delivery.taskId')}: <code dir="ltr">{task.task_id}</code>
                      </p>
                      <p data-testid={`delivery-task-${task.task_id}-deadline`}>
                        {task.deadline_unverified
                          ? t('delivery.deadlineDateOnly', {
                              value: task.due_date ?? unavailable,
                            })
                          : t('delivery.deadlineDubai', {
                              value: formatDubaiDateTime(task.due_at, locale) ?? unavailable,
                            })}
                      </p>
                      <p data-testid={`delivery-task-${task.task_id}-first-review`}>
                        {t('delivery.firstReviewDubai', {
                          value: formatDubaiDateTime(task.first_submitted_at, locale) ?? unavailable,
                        })}
                      </p>
                    </div>
                    {reason && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        {task.exclusion_reason === 'lead_time_under_24h'
                          ? t(reason, { hours: DELIVERY_MIN_LEAD_TIME_HOURS })
                          : t(reason)}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card
        data-testid="deduction-risk-quality-evidence"
        className={qualityEligibility.current_below_band
          ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/60 dark:bg-amber-950/20'
          : 'border-border/60'}
      >
        <CardContent className="flex items-start gap-3 p-4">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700 dark:text-amber-300" />
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-semibold">{t('quality.title')}</h3>
            {qualitySnapshot ? (
              <div className="space-y-1 text-xs text-muted-foreground">
                <p>{t('quality.averageRounds', {
                  value: formatMetric(qualitySnapshot.avg_rounds, locale) ?? unavailable,
                })}</p>
                <p>{t('quality.outrightRejections', {
                  rejected: formatMetric(qualitySnapshot.outright_rejection_count, locale) ?? unavailable,
                  reviewed: formatMetric(qualitySnapshot.reviewed_task_count, locale) ?? unavailable,
                  rate: formatMetric(qualitySnapshot.outright_rejection_rate, locale) ?? unavailable,
                })}</p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">{t('quality.empty')}</p>
            )}
            {qualityEligibility.current_below_band ? (
              <p className="text-xs text-muted-foreground">
                {t(qualityEligibility.eligible ? 'quality.eligible' : 'quality.warning', {
                  count: qualityEligibility.consecutive_months,
                })}
              </p>
            ) : qualitySnapshot ? (
              <p className="text-xs text-muted-foreground">{t('quality.withinBand')}</p>
            ) : null}
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{t('quality.guard')}</p>
          </div>
        </CardContent>
      </Card>
    </>
  );
}
