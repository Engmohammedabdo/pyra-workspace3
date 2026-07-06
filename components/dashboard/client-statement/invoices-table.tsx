'use client';

import { useTranslations, useLocale } from 'next-intl';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { FileText } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';

interface Invoice {
  id: string;
  invoice_number: string;
  issue_date: string;
  total: number;
  amount_paid: number;
  amount_due: number;
  status: string;
  currency: string | null;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  draft: 'secondary',
  sent: 'outline',
  paid: 'default',
  partially_paid: 'outline',
  overdue: 'destructive',
  cancelled: 'secondary',
};

export function InvoicesTable({ invoices, loading }: { invoices: Invoice[]; loading: boolean }) {
  const t = useTranslations('finance.statement.invoicesTable');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('invoice');

  return (
    <Card>
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-5 w-5" aria-hidden="true" /> {t('title')}
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-start p-3 font-medium">{t('columns.index')}</th>
              <th className="text-start p-3 font-medium">{t('columns.invoiceNumber')}</th>
              <th className="text-start p-3 font-medium">{t('columns.date')}</th>
              <th className="text-start p-3 font-medium">{t('columns.total')}</th>
              <th className="text-start p-3 font-medium">{t('columns.paid')}</th>
              <th className="text-start p-3 font-medium">{t('columns.due')}</th>
              <th className="text-start p-3 font-medium">{t('columns.status')}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-b">{Array.from({ length: 7 }).map((_, j) => (
                <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
              ))}</tr>
            )) : invoices.length === 0 ? (
              <tr><td colSpan={7}><EmptyState icon={FileText} title={t('emptyState.title')} className="py-8" /></td></tr>
            ) : invoices.map((inv, idx) => {
              const variant = STATUS_VARIANT[inv.status] || 'secondary';
              return (
                <tr key={inv.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-muted-foreground">{idx + 1}</td>
                  <td className="p-3 font-medium">
                    <Link href={`/dashboard/invoices/${inv.id}`} className="text-primary hover:underline">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="p-3 text-muted-foreground">{formatDate(inv.issue_date, undefined, locale)}</td>
                  <td className="p-3 font-mono">{formatCurrency(inv.total, inv.currency ?? 'AED')}</td>
                  <td className="p-3 font-mono text-green-600 dark:text-green-400">{formatCurrency(inv.amount_paid, inv.currency ?? 'AED')}</td>
                  <td className="p-3 font-mono text-orange-600 dark:text-orange-400">{formatCurrency(inv.amount_due, inv.currency ?? 'AED')}</td>
                  <td className="p-3"><Badge variant={variant}>{statusLabelFor(inv.status) || inv.status}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
