'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowDownCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { EmptyState } from '@/components/ui/empty-state';
import type { Locale } from '@/lib/i18n/config';

export function LinkedExpenses({ expenses, total }: { expenses: any[], total: number }) {
  const t = useTranslations('finance.suppliers.detail.linkedExpenses');
  const locale = useLocale() as Locale;
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ArrowDownCircle className="h-5 w-5" />
          {t('title')}
          {expenses.length > 0 && <Badge variant="secondary" className="ms-2">{expenses.length}</Badge>}
        </CardTitle>
        {total > 0 && <span className="text-sm font-bold font-mono text-red-600 dark:text-red-400">{formatCurrency(total)}</span>}
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <EmptyState icon={ArrowDownCircle} title={t('emptyState.title')} description={t('emptyState.description')} />
        ) : (
          <div className="space-y-2">
            {expenses.map(exp => (
              <Link key={exp.id} href={`/dashboard/finance/expenses/${exp.id}`}>
                <div className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div>
                    <p className="text-sm font-medium">{exp.description || exp.vendor || '—'}</p>
                    <p className="text-xs text-muted-foreground">{exp.expense_date ? formatDate(exp.expense_date, undefined, locale) : '—'}</p>
                  </div>
                  <span className="font-mono text-sm font-bold text-red-600 dark:text-red-400">{formatCurrency(exp.amount, exp.currency)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
