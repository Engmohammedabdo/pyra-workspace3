'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Receipt, Briefcase } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';

const CONTRACT_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  active: 'default',
  completed: 'default',
  cancelled: 'destructive',
  paused: 'outline',
};

export function PaymentsTable({ payments, loading, invoiceNumberMap }: { payments: any[]; loading: boolean; invoiceNumberMap: Record<string, string> }) {
  const t = useTranslations('finance.statement.paymentsTable');
  const locale = useLocale() as Locale;
  const methodLabelFor = useStatusLabels('paymentMethod');

  return (
    <Card>
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Receipt className="h-5 w-5" aria-hidden="true" /> {t('title')}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-start p-3 font-medium">{t('columns.date')}</th>
              <th className="text-start p-3 font-medium">{t('columns.amount')}</th>
              <th className="text-start p-3 font-medium">{t('columns.method')}</th>
              <th className="text-start p-3 font-medium">{t('columns.invoiceReference')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-b">{Array.from({ length: 4 }).map((_, j) => (
                <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
              ))}</tr>
            )) : payments.length === 0 ? (
              <tr><td colSpan={4}><EmptyState icon={Receipt} title={t('emptyState.title')} className="py-8" /></td></tr>
            ) : payments.map(p => (
              <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="p-3 text-muted-foreground">{formatDate(p.payment_date, undefined, locale)}</td>
                {/* p.currency = the payment's INVOICE currency, threaded by the statement API */}
                <td className="p-3 font-mono text-green-600 dark:text-green-400">{formatCurrency(p.amount, p.currency ?? 'AED')}</td>
                <td className="p-3">{methodLabelFor(p.method) || p.method}</td>
                <td className="p-3 text-muted-foreground">{invoiceNumberMap[p.invoice_id] || p.invoice_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ContractsTable({ contracts, loading }: { contracts: any[]; loading: boolean }) {
  const t = useTranslations('finance.statement.contractsTable');
  const statusLabelFor = useStatusLabels('contract');

  return (
    <Card>
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Briefcase className="h-5 w-5" aria-hidden="true" /> {t('title')}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-start p-3 font-medium">{t('columns.title')}</th>
              <th className="text-start p-3 font-medium">{t('columns.value')}</th>
              <th className="text-start p-3 font-medium">{t('columns.status')}</th>
              <th className="text-start p-3 font-medium">{t('columns.billed')}</th>
              <th className="text-start p-3 font-medium">{t('columns.collected')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 2 }).map((_, i) => (
              <tr key={i} className="border-b">{Array.from({ length: 5 }).map((_, j) => (
                <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
              ))}</tr>
            )) : contracts.length === 0 ? (
              <tr><td colSpan={5}><EmptyState icon={Briefcase} title={t('emptyState.title')} className="py-8" /></td></tr>
            ) : contracts.map(c => {
              const variant = CONTRACT_STATUS_VARIANT[c.status] || 'secondary';
              return (
                <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{c.title || '—'}</td>
                  <td className="p-3 font-mono">{formatCurrency(c.total_value, c.currency ?? 'AED')}</td>
                  <td className="p-3"><Badge variant={variant}>{statusLabelFor(c.status) || c.status}</Badge></td>
                  <td className="p-3 font-mono">{formatCurrency(c.amount_billed, c.currency ?? 'AED')}</td>
                  <td className="p-3 font-mono text-green-600 dark:text-green-400">{formatCurrency(c.amount_collected, c.currency ?? 'AED')}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
