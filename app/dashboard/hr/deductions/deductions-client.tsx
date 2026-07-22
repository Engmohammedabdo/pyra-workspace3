'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  AlertCircle,
  AlertTriangle,
  RefreshCcw,
  ShieldAlert,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { AdminDeductionEmployeeCard } from '@/components/hr/deductions/AdminDeductionEmployeeCard';
import { AttendanceTrackingStartDialog } from '@/components/hr/deductions/AttendanceTrackingStartDialog';
import { ManualDeductionDialog } from '@/components/hr/deductions/ManualDeductionDialog';
import { useAdminDeductions } from '@/hooks/useDeductions';
import { CALENDAR_TIMEZONE_OFFSET } from '@/lib/constants/statuses';
import { isoToDubaiDateTime } from '@/lib/production/deadlines';
import { dubaiDayKey } from '@/lib/utils/format';
import type { DeliveryTaskEvidence } from '@/lib/hr/deductions-report';

function exactDubaiTime(instant: string): string | null {
  const value = isoToDubaiDateTime(instant);
  return value ? `${value.date} ${value.time} (${CALENDAR_TIMEZONE_OFFSET})` : null;
}

function UnattributedTasks({ tasks }: { tasks: DeliveryTaskEvidence[] }) {
  const t = useTranslations('hr.deductions.admin.unattributed');
  if (tasks.length === 0) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/40 dark:border-amber-900/60 dark:bg-amber-950/20">
      <CardContent className="space-y-3 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700 dark:text-amber-300" />
          <div>
            <h2 className="font-semibold">{t('title', { count: tasks.length })}</h2>
            <p className="text-xs text-muted-foreground">{t('description')}</p>
          </div>
        </div>
        <div className="space-y-2">
          {tasks.map((task) => (
            <div key={task.task_id} className="rounded-lg border border-amber-200 bg-background/70 p-3 dark:border-amber-900/50 dark:bg-amber-950/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{task.title}</p>
                <Badge variant="outline">{t(`outcomes.${task.outcome}`)}</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {task.due_at && !task.deadline_unverified
                  ? t('deadline', {
                      value: exactDubaiTime(task.due_at) ?? task.due_at,
                    })
                  : task.due_date
                    ? t('deadlineDateOnly', { value: task.due_date })
                    : t('deadlineMissing')}
              </p>
              <p className="mt-1 text-xs font-medium text-amber-800 dark:text-amber-200">
                {t('notAssigned')}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function DeductionsClient() {
  const t = useTranslations('hr.deductions.admin');
  const currentMonth = dubaiDayKey().slice(0, 7);
  const [month, setMonth] = useState(currentMonth);
  const [manualUsername, setManualUsername] = useState<string | null>(null);
  const [trackingUsername, setTrackingUsername] = useState<string | null>(null);
  const deductions = useAdminDeductions(month);
  const report = deductions.data;
  const selectedEmployee = report?.employees.find(
    (employee) => employee.username === manualUsername,
  ) ?? null;
  const trackingEmployee = report?.employees.find(
    (employee) => employee.username === trackingUsername,
  ) ?? null;

  return (
    <div className="space-y-5 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 dark:bg-orange-500/20">
            <ShieldAlert className="h-5 w-5 text-orange-600 dark:text-orange-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">{t('page.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('page.subtitle')}</p>
          </div>
        </div>
        <Input
          type="month"
          value={month}
          max={currentMonth}
          onChange={(event) => setMonth(event.target.value)}
          aria-label={t('page.monthPickerAria')}
          className="h-9 w-auto"
        />
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/25 dark:text-amber-100">
        {t('page.approvalGuard')}
      </div>

      {deductions.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : deductions.isError ? (
        <EmptyState
          icon={AlertCircle}
          title={t('error.title')}
          description={t('error.description')}
          actions={[{
            label: t('error.retry'),
            onClick: () => deductions.refetch(),
            icon: RefreshCcw,
          }]}
        />
      ) : !report || (!report.employees.length && !report.unattributed_tasks.length) ? (
        <EmptyState
          icon={ShieldAlert}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
            <span>{t('page.employeeCount', { count: report.employees.length })}</span>
            <span>{t('page.generatedAt', {
              value: exactDubaiTime(report.generated_at) ?? report.generated_at,
            })}</span>
          </div>
          <div className="space-y-4">
            {report.employees.map((employee) => (
              <AdminDeductionEmployeeCard
                key={employee.username}
                employee={employee}
                month={report.month}
                currentMonth={currentMonth}
                onManualDeduction={() => setManualUsername(employee.username)}
                onAttendanceTracking={() => setTrackingUsername(employee.username)}
              />
            ))}
          </div>
          <UnattributedTasks tasks={report.unattributed_tasks} />
        </>
      )}

      <ManualDeductionDialog
        employee={selectedEmployee}
        month={report?.month ?? month}
        currentMonth={currentMonth}
        open={Boolean(manualUsername && selectedEmployee)}
        onOpenChange={(open) => {
          if (!open) setManualUsername(null);
        }}
      />
      <AttendanceTrackingStartDialog
        employee={trackingEmployee}
        month={report?.month ?? month}
        asOfDate={report?.as_of_date ?? dubaiDayKey()}
        open={Boolean(trackingUsername && trackingEmployee)}
        onOpenChange={(open) => {
          if (!open) setTrackingUsername(null);
        }}
      />
    </div>
  );
}
