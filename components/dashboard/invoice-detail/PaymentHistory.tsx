'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { EmptyState } from '@/components/ui/empty-state';
import { CreditCard } from 'lucide-react';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
  notes: string | null;
}

export function PaymentHistory({ payments, currency }: { payments: Payment[]; currency: string }) {
  const t = useTranslations('finance.invoices.detail.paymentHistory');
  const locale = useLocale() as Locale;
  const paymentMethodLabelFor = useStatusLabels('paymentMethod');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <CreditCard className="h-4 w-4" /> {t('title')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        {payments.length === 0 ? (
          <EmptyState icon={CreditCard} title={t('emptyTitle')} className="py-6" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">{t('columns.date')}</th>
                  <th className="text-start p-3 font-medium">{t('columns.amount')}</th>
                  <th className="text-start p-3 font-medium">{t('columns.method')}</th>
                  <th className="text-start p-3 font-medium">{t('columns.reference')}</th>
                </tr>
              </thead>
              <tbody>
                {payments.map(payment => (
                  <tr key={payment.id} className="border-b">
                    <td className="p-3 text-muted-foreground">{formatDate(payment.payment_date, undefined, locale)}</td>
                    <td className={`p-3 font-mono ${payment.amount < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>
                      {payment.amount < 0 ? '-' : '+'}{formatCurrency(Math.abs(payment.amount), currency)}
                    </td>
                    <td className="p-3">{paymentMethodLabelFor(payment.method) || payment.method}</td>
                    <td className="p-3 text-muted-foreground">{payment.reference || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
