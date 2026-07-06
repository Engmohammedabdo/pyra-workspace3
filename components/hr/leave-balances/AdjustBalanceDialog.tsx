'use client';

import { useEffect, useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAdjustLeaveBalance,
  type EmployeeLeaveBalances,
} from '@/hooks/useLeaveBalancesAdmin';

interface RowState {
  leave_type_id: string;
  name_ar: string;
  total_days: number;
  used_days: number;
  carried_over: number;
}

interface AdjustBalanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: EmployeeLeaveBalances | null;
  year: number;
}

export function AdjustBalanceDialog({
  open,
  onOpenChange,
  employee,
  year,
}: AdjustBalanceDialogProps) {
  const t = useTranslations('hr.leaveBalances.adjustDialog');
  const locale = useLocale();
  const [rows, setRows] = useState<RowState[]>([]);
  const adjustMut = useAdjustLeaveBalance();

  useEffect(() => {
    if (employee) {
      setRows(employee.balances.map((b) => ({ ...b })));
    }
  }, [employee]);

  const updateRow = (
    leave_type_id: string,
    field: 'total_days' | 'used_days' | 'carried_over',
    value: number,
  ) => {
    setRows((prev) =>
      prev.map((r) => (r.leave_type_id === leave_type_id ? { ...r, [field]: value } : r)),
    );
  };

  const handleSave = async () => {
    if (!employee) return;
    // allSettled so one failing leave-type row doesn't hide which others saved;
    // only close the dialog when every row persisted.
    const results = await Promise.allSettled(
      rows.map((r) =>
        adjustMut.mutateAsync({
          username: employee.username,
          year,
          leave_type_id: r.leave_type_id,
          total_days: r.total_days,
          used_days: r.used_days,
          carried_over: r.carried_over,
        }),
      ),
    );
    const failed = rows.filter((_, i) => results[i].status === 'rejected');
    if (failed.length === 0) {
      toast.success(t('toasts.saveSuccess'));
      onOpenChange(false);
    } else {
      const separator = locale === 'ar' ? '، ' : ', ';
      toast.error(`${t('toasts.saveFailedPrefix')}${failed.map((r) => r.name_ar).join(separator)}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title', { name: employee?.display_name ?? '' })}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {rows.map((r) => (
            <div key={r.leave_type_id} className="space-y-2 border rounded-lg p-3 dark:border-gray-800">
              <p className="text-sm font-medium">{r.name_ar}</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('totalDaysLabel')}</label>
                  <Input
                    type="number"
                    min={0}
                    value={r.total_days}
                    onChange={(e) =>
                      updateRow(r.leave_type_id, 'total_days', Number(e.target.value))
                    }
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('usedDaysLabel')}</label>
                  <Input
                    type="number"
                    min={0}
                    value={r.used_days}
                    onChange={(e) =>
                      updateRow(r.leave_type_id, 'used_days', Number(e.target.value))
                    }
                    dir="ltr"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t('carriedOverLabel')}</label>
                  <Input
                    type="number"
                    min={0}
                    value={r.carried_over}
                    onChange={(e) =>
                      updateRow(r.leave_type_id, 'carried_over', Number(e.target.value))
                    }
                    dir="ltr"
                  />
                </div>
              </div>
            </div>
          ))}
          <Button
            onClick={handleSave}
            disabled={adjustMut.isPending || rows.length === 0}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white"
          >
            {adjustMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 me-2 animate-spin" />
                {t('saving')}
              </>
            ) : (
              t('save')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
