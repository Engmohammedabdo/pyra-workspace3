'use client';

import { useTranslations } from 'next-intl';
import { Card } from '@/components/ui/card';
import { formatCurrency } from '@/lib/utils/format';
import type { FinalSettlement } from '@/lib/hr/final-settlement';

function Row({ label, value, tone }: { label: string; value: string; tone?: 'muted' | 'destructive' }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          tone === 'destructive'
            ? 'font-medium text-red-600 dark:text-red-400'
            : tone === 'muted'
            ? 'text-muted-foreground'
            : 'font-medium'
        }
      >
        {value}
      </span>
    </div>
  );
}

export function ExitStepConfirm({ settlement }: { settlement: FinalSettlement }) {
  const t = useTranslations('hr.offboarding');
  const c = settlement.currency;

  return (
    <div className="space-y-4">
      <Card className="space-y-3 p-4">
        <h3 className="text-sm font-semibold">{t('confirm.heading')}</h3>
        <Row label={t('confirm.dailyRate')} value={formatCurrency(settlement.daily_rate, c)} />
        <Row label={t('confirm.daysEmployed')} value={t('confirm.daysValue', { days: settlement.days_employed })} />
        <Row label={t('confirm.gross')} value={formatCurrency(settlement.gross, c)} />
        {settlement.absence_deduction > 0 && (
          <Row
            label={t('confirm.absenceDeduction')}
            value={`- ${formatCurrency(settlement.absence_deduction, c)}`}
            tone="destructive"
          />
        )}
        <div className="flex items-center justify-between gap-3 border-t pt-3">
          <span className="text-sm font-semibold">{t('confirm.net')}</span>
          <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCurrency(settlement.net, c)}
          </span>
        </div>
      </Card>

      <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-700 dark:border-amber-800/40 dark:bg-amber-950/30 dark:text-amber-300">
        {t('confirm.settlementAdminNote')}
      </p>
    </div>
  );
}
