'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

interface InvoiceItem { description: string; quantity: number; rate: number; }

interface Props {
  items: InvoiceItem[];
  updateItem: (index: number, field: keyof InvoiceItem, value: string | number) => void;
  removeItem: (index: number) => void;
}

export function InvoiceItemsTable({ items, updateItem, removeItem }: Props) {
  const t = useTranslations('finance.invoices.new.itemsTable');
  return (
    <>
      <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
        <div className="col-span-5">{t('description')}</div>
        <div className="col-span-2">{t('quantity')}</div>
        <div className="col-span-2">{t('rate')}</div>
        <div className="col-span-2">{t('amount')}</div>
        <div className="col-span-1" />
      </div>
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
          <div className="sm:col-span-5"><Input value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} placeholder={t('descriptionPlaceholder')} /></div>
          <div className="sm:col-span-2"><Input type="number" min={1} value={item.quantity} onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)} dir="ltr" /></div>
          <div className="sm:col-span-2"><Input type="number" min={0} step={0.01} value={item.rate} onChange={e => updateItem(index, 'rate', parseFloat(e.target.value) || 0)} dir="ltr" /></div>
          {/* The new-invoice form has no currency picker — the POST falls back to
              the workspace default_currency setting (AED in production). If a
              currency picker is ever added here, thread its value instead. */}
          <div className="sm:col-span-2 text-sm font-mono px-2">{formatCurrency(item.quantity * item.rate, 'AED')}</div>
          <div className="sm:col-span-1 flex justify-end">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={items.length <= 1} onClick={() => removeItem(index)} aria-label={t('removeItem')}><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
    </>
  );
}
