'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';

interface TableProps {
  items: any[];
  onDelete: (id: string) => void;
}

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  paused: 'secondary',
  cancelled: 'destructive',
};

function calcTotal(items: Array<{ quantity: number; rate: number }>): number {
  return items.reduce((sum, item) => sum + (item.quantity || 1) * (item.rate || 0), 0);
}

export function RecurringTable({ items, onDelete }: TableProps) {
  const t = useTranslations('finance.recurring.list.table');
  const tFilters = useTranslations('finance.recurring.list.filters');
  const locale = useLocale() as Locale;
  const cycleLabelFor = useStatusLabels('periodCycle');

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-start p-3 font-medium">{t('columns.title')}</th>
            <th className="text-start p-3 font-medium">{t('columns.client')}</th>
            <th className="text-start p-3 font-medium">{t('columns.cycle')}</th>
            <th className="text-start p-3 font-medium">{t('columns.cost')}</th>
            <th className="text-start p-3 font-medium">{t('columns.nextGeneration')}</th>
            <th className="text-start p-3 font-medium">{t('columns.lastGeneration')}</th>
            <th className="text-start p-3 font-medium">{t('columns.status')}</th>
            <th className="text-start p-3 font-medium">{t('columns.actions')}</th>
          </tr>
        </thead>
        <tbody>
          {items.map(ri => {
            const cost = calcTotal(ri.items || []);
            const isDue = ri.status === 'active' && new Date(ri.next_generation_date) <= new Date();
            return (
              <tr key={ri.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="p-3">
                  <div className="font-medium">{ri.title}</div>
                  {ri.auto_send && <Badge variant="outline" className="text-xs">{t('autoSend')}</Badge>}
                  {ri.contract_title && <p className="text-xs text-muted-foreground">{ri.contract_title}</p>}
                </td>
                <td className="p-3 text-muted-foreground">{ri.client_company || ri.client_name || '—'}</td>
                <td className="p-3">{cycleLabelFor(ri.billing_cycle) || ri.billing_cycle}</td>
                <td className="p-3 font-mono">{formatCurrency(cost, ri.currency)}</td>
                <td className="p-3">
                  <span className={isDue ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-muted-foreground'}>{formatDate(ri.next_generation_date, undefined, locale)}</span>
                  {isDue && <Badge variant="destructive" className="ms-2 text-xs">{t('due')}</Badge>}
                </td>
                <td className="p-3 text-muted-foreground">{ri.last_generated_at ? formatDate(ri.last_generated_at, undefined, locale) : '—'}</td>
                <td className="p-3">
                  <Badge variant={STATUS_VARIANT[ri.status] || 'outline'}>
                    {ri.status === 'active' ? tFilters('active') : ri.status === 'paused' ? tFilters('paused') : ri.status === 'cancelled' ? tFilters('cancelled') : ri.status}
                  </Badge>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <Link href={`/dashboard/finance/recurring/${ri.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={t('editAria')}><Pencil className="h-3.5 w-3.5" /></Button>
                    </Link>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 dark:text-red-400" onClick={() => onDelete(ri.id)} aria-label={t('deleteAria')}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
