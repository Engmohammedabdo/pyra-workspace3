'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function DateRangeFilter({
  from,
  to,
  onFromChange,
  onToChange,
  onApply,
  children,
}: {
  from: string;
  to: string;
  onFromChange: (v: string) => void;
  onToChange: (v: string) => void;
  onApply: () => void;
  children?: React.ReactNode;
}) {
  const t = useTranslations('finance.reports.dateFilter');
  return (
    <div className="flex flex-wrap items-end gap-3 mb-6">
      <div className="space-y-1.5">
        <Label className="text-xs">{t('from')}</Label>
        <Input
          type="date"
          value={from}
          onChange={(e) => onFromChange(e.target.value)}
          className="w-40"
        />
      </div>
      <div className="space-y-1.5">
        <Label className="text-xs">{t('to')}</Label>
        <Input
          type="date"
          value={to}
          onChange={(e) => onToChange(e.target.value)}
          className="w-40"
        />
      </div>
      {children}
      <Button onClick={onApply} size="sm">
        {t('showReport')}
      </Button>
    </div>
  );
}
