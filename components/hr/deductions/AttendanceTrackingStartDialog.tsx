'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CalendarCheck, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/hooks/api-helpers';
import { useSetAttendanceTrackingStart } from '@/hooks/useDeductions';
import type { MonthlyEmployeeDeductionReport } from '@/lib/hr/deductions-report';

export function AttendanceTrackingStartDialog({
  employee,
  month,
  asOfDate,
  open,
  onOpenChange,
}: {
  employee: MonthlyEmployeeDeductionReport | null;
  month: string;
  asOfDate: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations('hr.deductions.admin.attendanceTracking');
  const [startedOn, setStartedOn] = useState(asOfDate);
  const mutation = useSetAttendanceTrackingStart(month);

  useEffect(() => {
    if (open) setStartedOn(asOfDate);
  }, [asOfDate, open]);

  const invalid = !employee
    || !/^\d{4}-\d{2}-\d{2}$/.test(startedOn)
    || startedOn > asOfDate
    || Boolean(employee.hire_date && startedOn < employee.hire_date.slice(0, 10));

  const submit = () => {
    if (!employee || invalid || mutation.isPending) return;
    mutation.mutate(
      { username: employee.username, started_on: startedOn },
      {
        onSuccess: () => {
          toast.success(t('success'));
          onOpenChange(false);
        },
        onError: (error) => {
          toast.error(error instanceof ApiError ? error.message : t('error'));
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarCheck className="h-5 w-5 text-orange-600 dark:text-orange-400" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>
            {employee ? t('description', { name: employee.display_name }) : t('descriptionEmpty')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label htmlFor="attendance-tracking-start">{t('dateLabel')}</Label>
          <Input
            id="attendance-tracking-start"
            type="date"
            dir="ltr"
            value={startedOn}
            min={employee?.hire_date?.slice(0, 10)}
            max={asOfDate}
            onChange={(event) => setStartedOn(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">{t('guard')}</p>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            type="button"
            onClick={submit}
            disabled={invalid || mutation.isPending}
            className="bg-orange-500 text-white hover:bg-orange-600"
          >
            {mutation.isPending && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
            {t('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
