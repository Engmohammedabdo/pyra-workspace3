'use client';

import { useTranslations } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Plus, Save, X, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  sort_order: number;
}

interface EditItemsProps {
  items: InvoiceItem[];
  projectName: string;
  setProjectName: (val: string) => void;
  notes: string;
  setNotes: (val: string) => void;
  dueDate: string;
  setDueDate: (val: string) => void;
  vatRate: number;
  setVatRate: (val: number) => void;
  displayName: string;
  setDisplayName: (val: string) => void;
  discountType: string | null;
  setDiscountType: (v: string | null) => void;
  discountValue: number;
  setDiscountValue: (v: number) => void;
  currency: string;
  defaultClientName: string | null;
  updateItem: (index: number, field: keyof InvoiceItem, val: string | number) => void;
  addItem: () => void;
  removeItem: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

export function EditItems({
  items, projectName, setProjectName, notes, setNotes, dueDate, setDueDate,
  vatRate, setVatRate, displayName, setDisplayName,
  discountType, setDiscountType, discountValue, setDiscountValue,
  currency, defaultClientName,
  updateItem, addItem, removeItem, onSave, onCancel, saving
}: EditItemsProps) {
  const t = useTranslations('finance.invoices.detail.editItems');
  const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.rate), 0);

  let discountAmount = 0;
  if (discountType === 'percentage' && discountValue > 0) {
    discountAmount = Math.round(subtotal * (discountValue / 100) * 100) / 100;
  } else if (discountType === 'fixed' && discountValue > 0) {
    discountAmount = Math.min(discountValue, subtotal);
  }
  const taxableAmount = subtotal - discountAmount;
  const vatAmount = Math.round(taxableAmount * (vatRate / 100) * 100) / 100;
  const total = Math.round((taxableAmount + vatAmount) * 100) / 100;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 me-1" /> {t('addItem')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>{t('projectName')}</Label>
          <Input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder={t('projectNamePlaceholder')} />
        </div>
        <div className="space-y-2">
          <Label>{t('displayName')}</Label>
          <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={defaultClientName || t('displayNamePlaceholder')} />
        </div>
        <div className="space-y-2">
          <Label>{t('dueDate')}</Label>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        {items.map((item, index) => (
          <div key={item.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
            <div className="sm:col-span-5">
              <Input value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} placeholder={t('itemDescriptionPlaceholder')} />
            </div>
            <div className="sm:col-span-2">
              <Input type="number" value={item.quantity} onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)} dir="ltr" />
            </div>
            <div className="sm:col-span-2">
              <Input type="number" step={0.01} value={item.rate} onChange={e => updateItem(index, 'rate', parseFloat(e.target.value) || 0)} dir="ltr" />
            </div>
            <div className="sm:col-span-2 text-sm font-mono px-2">{formatCurrency(item.amount, currency)}</div>
            <div className="sm:col-span-1 flex justify-end">
              <Button variant="ghost" size="icon" onClick={() => removeItem(index)} disabled={items.length <= 1} aria-label={t('removeItem')}><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        <div className="space-y-2">
          <Label>{t('notes')}</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </div>
        {/* Discount */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>{t('discount')}</Label>
            <Select value={discountType || 'none'} onValueChange={v => setDiscountType(v === 'none' ? null : v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('discountNone')}</SelectItem>
                <SelectItem value="percentage">{t('discountPercentage')}</SelectItem>
                <SelectItem value="fixed">{t('discountFixed')}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {discountType && discountType !== 'none' && (
            <div className="space-y-2">
              <Label>{discountType === 'percentage' ? t('discountPercentLabel') : t('discountAmountLabel')}</Label>
              <Input type="number" dir="ltr" min={0} step={0.01} value={discountValue} onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)} />
            </div>
          )}
        </div>
        {/* VAT Rate */}
        <div className="space-y-2">
          <Label>{t('vatRate')}</Label>
          <Input type="number" dir="ltr" min={0} step={0.01} value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value) || 0)} />
        </div>
        {/* Totals */}
        <div className="border-t pt-4 space-y-2 text-sm">
          <div className="flex justify-between"><span>{t('subtotal')}</span><span>{formatCurrency(subtotal, currency)}</span></div>
          {discountAmount > 0 && (
            <div className="flex justify-between text-red-600 dark:text-red-400">
              <span>{t('discountLine', { percent: discountType === 'percentage' ? `(${discountValue}%)` : '' })}</span>
              <span>- {formatCurrency(discountAmount, currency)}</span>
            </div>
          )}
          {discountAmount > 0 && (
            <div className="flex justify-between"><span>{t('afterDiscount')}</span><span>{formatCurrency(taxableAmount, currency)}</span></div>
          )}
          <div className="flex justify-between"><span>{t('vatLine', { rate: vatRate })}</span><span>{formatCurrency(vatAmount, currency)}</span></div>
          <div className="flex justify-between font-bold text-base"><span>{t('total')}</span><span>{formatCurrency(total, currency)}</span></div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}><X className="h-4 w-4 me-1" /> {t('cancel')}</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save className="h-4 w-4 me-1" />} {t('save')}</Button>
        </div>
      </CardContent>
    </Card>
  );
}
