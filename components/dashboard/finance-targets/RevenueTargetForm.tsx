'use client';

import { useTranslations } from 'next-intl';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useStatusLabels } from '@/lib/i18n/status-labels';

interface FormProps {
  form: any;
  setForm: (f: any) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  editing: boolean;
}

const CURRENCY_VALUES = ['AED', 'USD', 'EUR', 'SAR'] as const;

export function RevenueTargetForm({ form, setForm, onSave, onCancel, saving, editing }: FormProps) {
  const t = useTranslations('finance.targets.form');
  const periodTypeLabelFor = useStatusLabels('periodCycle');
  const u = (k: string, v: string) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>{t('periodTypeLabel')}</Label>
        <Select value={form.period_type} onValueChange={v => u('period_type', v)}>
          <SelectTrigger><SelectValue placeholder={t('periodTypePlaceholder')} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">{periodTypeLabelFor('monthly')}</SelectItem>
            <SelectItem value="quarterly">{periodTypeLabelFor('quarterly')}</SelectItem>
            <SelectItem value="yearly">{periodTypeLabelFor('yearly')}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('periodStartLabel')}</Label>
          <Input type="date" value={form.period_start} onChange={e => u('period_start', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('periodEndLabel')}</Label>
          <Input type="date" value={form.period_end} onChange={e => u('period_end', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('targetAmountLabel')}</Label>
          <Input
            type="number"
            min="0"
            step="0.01"
            value={form.target_amount}
            onChange={e => u('target_amount', e.target.value)}
            placeholder="0.00"
            dir="ltr"
          />
        </div>
        <div className="space-y-2">
          <Label>{t('currencyLabel')}</Label>
          <Select value={form.currency} onValueChange={v => u('currency', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCY_VALUES.map(c => (
                <SelectItem key={c} value={c}>{t(`currencies.${c}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>{t('notesLabel')}</Label>
        <Textarea
          value={form.notes}
          onChange={e => u('notes', e.target.value)}
          placeholder={t('notesPlaceholder')}
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>{t('cancel')}</Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('saving')}</> : t('save')}
        </Button>
      </div>
    </div>
  );
}
