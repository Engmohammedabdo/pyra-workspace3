'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { useCreatePayroll } from '@/hooks/usePayroll';
import { SALARY_CURRENCIES } from '@/lib/constants/auth';
import { monthNamesFor } from '@/lib/constants/dates';
import type { Locale } from '@/lib/i18n/config';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CreatePayrollDialog({ open, onOpenChange }: Props) {
  const t = useTranslations('hr.payroll.createDialog');
  const locale = useLocale() as Locale;
  const currentYear = new Date().getFullYear();
  const [newMonth, setNewMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [newYear, setNewYear] = useState<string>(String(currentYear));
  const [newCurrency, setNewCurrency] = useState<string>('AED');

  const createPayroll = useCreatePayroll();

  const handleCreate = () => {
    createPayroll.mutate(
      { month: parseInt(newMonth, 10), year: parseInt(newYear, 10), currency: newCurrency },
      {
        onSuccess: () => {
          toast.success(t('toasts.createSuccess'));
          // Reset to defaults on success
          setNewMonth(String(new Date().getMonth() + 1));
          setNewYear(String(currentYear));
          setNewCurrency('AED');
          onOpenChange(false);
        },
        onError: () => toast.error(t('toasts.createError')),
      },
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      // Reset form to defaults when dialog closes
      setNewMonth(String(new Date().getMonth() + 1));
      setNewYear(String(currentYear));
      setNewCurrency('AED');
    }
    onOpenChange(open);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Month */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t('monthLabel')}</label>
            <Select value={newMonth} onValueChange={setNewMonth}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {monthNamesFor(locale).map((name, idx) => (
                  <SelectItem key={idx} value={String(idx + 1)}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Year */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t('yearLabel')}</label>
            <Select value={newYear} onValueChange={setNewYear}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(yr => (
                  <SelectItem key={yr} value={String(yr)}>{yr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Currency */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-foreground">{t('currencyLabel')}</label>
            <Select value={newCurrency} onValueChange={setNewCurrency}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SALARY_CURRENCIES.map(cur => (
                  <SelectItem key={cur} value={cur}>{cur}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('currencyHint', { currency: newCurrency })}
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            {t('cancel')}
          </Button>
          <Button
            onClick={handleCreate}
            disabled={createPayroll.isPending}
            className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
          >
            {createPayroll.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
