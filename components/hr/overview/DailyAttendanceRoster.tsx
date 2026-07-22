'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Clock, ArrowUpRight, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePermission } from '@/hooks/usePermission';
import { formatCurrency } from '@/lib/utils/format';
import type { HROverview } from '@/hooks/useHROverview';

interface DailyAttendanceRosterProps {
  roster: HROverview['attendance_today']['roster'];
}

// Status → badge palette only (label is resolved inline with the scoped `t`,
// so we never pass next-intl's `t` across a function boundary — typing it as
// ReturnType<typeof useTranslations> forces TS to instantiate the full
// message-key template-literal union and crashes tsc).
const STATUS_CLS: Record<string, string> = {
  present: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400',
  late: 'bg-red-500/10 text-red-700 dark:text-red-400',
  absent: 'bg-red-500/10 text-red-700 dark:text-red-400',
  on_leave: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  excused: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  holiday: 'bg-blue-500/10 text-blue-700 dark:text-blue-400',
  not_clocked_in: 'bg-muted text-muted-foreground',
};

export function DailyAttendanceRoster({ roster }: DailyAttendanceRosterProps) {
  const t = useTranslations('hr.overview.dailyRoster');
  const canManageDeductions = usePermission('hr.manage');
  const totalDeductibleUnits = roster.reduce((sum, row) => sum + row.deduction_units, 0);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/80 shadow-sm backdrop-blur-sm">
      {/* Header — whole header links to the attendance page (section-header-as-link) */}
      <Link
        href="/dashboard/attendance"
        aria-label={t('openAria')}
        className={cn(
          'group flex items-center justify-between border-b border-border/40 px-5 py-4',
          'cursor-pointer transition-colors hover:bg-muted/50',
        )}
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500 to-blue-600 shadow-md shadow-sky-500/15">
            <Clock className="h-4 w-4 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold">{t('title')}</h3>
            <p className="text-xs text-muted-foreground">{t('subtitle')}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {totalDeductibleUnits > 0 && (
            <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
              {t('totalDeduction', { units: totalDeductibleUnits })}
            </span>
          )}
          <ArrowUpRight
            className="h-3.5 w-3.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 rtl:rotate-90"
            aria-hidden
          />
        </div>
      </Link>

      {/* Body */}
      <div className="divide-y divide-border/40">
        {roster.length > 0 ? (
          roster.map((row) => {
            // Resolve the badge label inline with the namespace-scoped `t`.
            let label: string;
            if (row.status === 'present') label = t('status.present');
            else if (row.status === 'late') label = t('status.late', { minutes: row.late_minutes });
            else if (row.status === 'on_leave') label = t('status.onLeave');
            else if (row.status === 'excused' || row.status === 'holiday') label = t('status.excused');
            else if (row.status === 'absent') label = t('status.absent');
            else label = t('status.notClockedIn');
            const cls = STATUS_CLS[row.status] ?? STATUS_CLS.not_clocked_in;

            return (
              <div
                key={row.username}
                className="flex items-center justify-between gap-3 px-5 py-3 transition-colors hover:bg-muted/30"
              >
                <div className="min-w-0">
                  <span className="block truncate text-sm font-medium">{row.display_name}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t('shiftFrom', { time: row.expected_start })}
                    {row.clock_out_time ? ` · ${t('clockOut', { time: row.clock_out_time })}` : ''}
                  </span>
                  {row.deduction_units > 0 && (
                    <span className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="size-3 shrink-0" aria-hidden />
                      {row.estimated_deduction !== null && row.currency
                        ? t('deduction', {
                            incidents: row.deductible_absences,
                            units: row.deduction_units,
                            amount: formatCurrency(row.estimated_deduction, row.currency),
                          })
                        : t('deductionAmountUnavailable')}
                    </span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  {row.total_hours > 0 && (
                    <span className="hidden text-xs tabular-nums text-muted-foreground sm:inline">
                      {t('hours', { hours: row.total_hours })}
                    </span>
                  )}
                  <span className="w-12 text-end text-base font-bold tabular-nums">
                    {row.clock_in_time ?? '—'}
                  </span>
                  <Badge className={cn('w-24 shrink-0 justify-center border-0', cls)}>
                    {label}
                  </Badge>
                </div>
              </div>
            );
          })
        ) : (
          <div className="px-5 py-6">
            <p className="text-sm text-muted-foreground">{t('empty')}</p>
          </div>
        )}
      </div>
      {canManageDeductions && (
        <div className="flex justify-end border-t border-border/40 px-4 py-2">
          <Button asChild variant="ghost" size="sm">
            <Link href="/dashboard/hr/deductions">
              {t('reviewDeductions')}
              <ArrowUpRight className="ms-2 h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
            </Link>
          </Button>
        </div>
      )}
    </div>
  );
}
