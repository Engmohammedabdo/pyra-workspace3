'use client';

import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { MANUAL_DEDUCTION_BASIS } from '@/lib/constants/deductions';
import { CALENDAR_TIMEZONE_OFFSET } from '@/lib/constants/statuses';
import { parseTrustedManualDeductionEvidence } from '@/lib/hr/manual-deduction';
import { isoToDubaiDateTime } from '@/lib/production/deadlines';

function dubaiInstant(value: string): string {
  const parsed = isoToDubaiDateTime(value);
  return parsed
    ? `${parsed.date} ${parsed.time} (${CALENDAR_TIMEZONE_OFFSET})`
    : value;
}

export function ManualDeductionEvidenceSnapshot({
  evidence,
}: {
  evidence: unknown;
}) {
  const t = useTranslations('hr.deductions.manualEvidence');
  const snapshot = parseTrustedManualDeductionEvidence(evidence);

  if (!snapshot) {
    return <p className="mt-2 text-xs text-muted-foreground">{t('unavailable')}</p>;
  }

  if (snapshot.basis === MANUAL_DEDUCTION_BASIS.OWNER_ATTESTED_LEGACY_DELIVERY) {
    return (
      <div className="mt-2 space-y-2 rounded-lg border border-border/50 bg-background/60 p-2">
        <Badge variant="outline">{t('legacyBasis')}</Badge>
        <p className="text-xs text-muted-foreground">{t('legacyGuard')}</p>
        <ul className="space-y-2">
          {snapshot.legacy_delivery.tasks.map((task) => {
            const exactDeadline = task.due_at ? dubaiInstant(task.due_at) : null;
            return (
              <li key={task.task_id} className="rounded-md bg-muted/40 p-2 text-xs">
                <p className="break-words font-medium">{task.title}</p>
                <p className="break-all text-muted-foreground">{t('taskId', { id: task.task_id })}</p>
                <p className="text-muted-foreground">
                  {exactDeadline
                    ? t('dueExact', { value: exactDeadline })
                    : t('dueDateOnly', { date: task.due_date })}
                </p>
                <p className="text-muted-foreground">
                  {t('firstSubmitted', { value: dubaiInstant(task.first_submitted_at) })}
                </p>
                {task.attribution_status === 'legacy_unverified' && (
                  <p className="text-amber-700 dark:text-amber-300">
                    {t('attributionUnverified')}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded-lg border border-border/50 bg-background/60 p-2">
      <Badge variant="outline">{t('qualityBasis')}</Badge>
      <p className="text-xs text-muted-foreground">
        {t('qualityGuard', {
          count: snapshot.quality.eligibility.consecutive_months,
        })}
      </p>
      <ul className="space-y-1 text-xs text-muted-foreground">
        {snapshot.quality.months.map((month) => (
          <li key={month.month}>
            {t('qualityMonth', {
              month: month.month,
              rounds: month.avg_rounds ?? t('notAvailable'),
              rejected: month.outright_rejection_count ?? 0,
              reviewed: month.reviewed_task_count ?? 0,
              rate: month.outright_rejection_rate ?? 0,
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
