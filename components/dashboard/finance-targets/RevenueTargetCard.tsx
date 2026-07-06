'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Pencil, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';

interface TargetCardProps {
  target: any;
  onEdit: () => void;
  onDelete: () => void;
}

function getProgressColor(pct: number): string {
  if (pct >= 100) return 'text-green-600 dark:text-green-400';
  if (pct >= 70) return 'text-yellow-600 dark:text-yellow-400';
  return 'text-red-600 dark:text-red-400';
}

function getProgressBarClass(pct: number): string {
  if (pct >= 100) return '[&>div]:bg-green-500';
  if (pct >= 70) return '[&>div]:bg-yellow-500';
  return '[&>div]:bg-red-500';
}

export function RevenueTargetCard({ target, onEdit, onDelete }: TargetCardProps) {
  const t = useTranslations('finance.targets.card');
  const locale = useLocale() as Locale;
  const periodTypeLabelFor = useStatusLabels('periodCycle');
  const pct = target.progress_percentage;
  const colorClass = getProgressColor(pct);
  const barClass = getProgressBarClass(pct);

  return (
    <Card className="relative overflow-hidden">
      <CardContent className="p-6">
        <div className="absolute top-3 start-3 flex gap-1">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit} aria-label={t('editAria')}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 dark:text-red-400" onClick={onDelete} aria-label={t('deleteAria')}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground">{periodTypeLabelFor(target.period_type) || target.period_type}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDate(target.period_start, undefined, locale)} — {formatDate(target.period_end, undefined, locale)}
          </p>
        </div>

        <div className="mb-2">
          <p className="text-sm text-muted-foreground">{t('targetLabel')}</p>
          <p className="text-xl font-bold">{formatCurrency(target.target_amount, target.currency)}</p>
        </div>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground">{t('actualRevenueLabel')}</p>
          {/* actual_revenue is ALWAYS AED-converted server-side (Batch 4) —
              labeling it with the target's currency would be wrong */}
          <p className={cn('text-xl font-bold', colorClass)}>
            {formatCurrency(target.actual_revenue)}
          </p>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('progressLabel')}</span>
            <span className={cn('font-bold', colorClass)}>{pct}%</span>
          </div>
          <Progress value={Math.min(pct, 100)} className={cn('h-2', barClass)} />
        </div>

        {target.notes && (
          <p className="mt-3 text-xs text-muted-foreground border-t pt-3">{target.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}
