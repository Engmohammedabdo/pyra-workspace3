'use client';

import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';

interface FormProps {
  form: any;
  setForm: (f: any) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  editing: boolean;
}

const CURRENCIES = [
  { value: 'AED', label: 'درهم (AED)' },
  { value: 'USD', label: 'دولار (USD)' },
  { value: 'EUR', label: 'يورو (EUR)' },
  { value: 'SAR', label: 'ريال (SAR)' },
];

export function RevenueTargetForm({ form, setForm, onSave, onCancel, saving, editing }: FormProps) {
  const u = (k: string, v: string) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label>نوع الفترة *</Label>
        <Select value={form.period_type} onValueChange={v => u('period_type', v)}>
          <SelectTrigger><SelectValue placeholder="اختر نوع الفترة" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly">شهري</SelectItem>
            <SelectItem value="quarterly">ربع سنوي</SelectItem>
            <SelectItem value="yearly">سنوي</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>تاريخ البداية *</Label>
          <Input type="date" value={form.period_start} onChange={e => u('period_start', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>تاريخ النهاية *</Label>
          <Input type="date" value={form.period_end} onChange={e => u('period_end', e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>المبلغ المستهدف *</Label>
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
          <Label>العملة</Label>
          <Select value={form.currency} onValueChange={v => u('currency', v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CURRENCIES.map(c => (
                <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>ملاحظات</Label>
        <Textarea
          value={form.notes}
          onChange={e => u('notes', e.target.value)}
          placeholder="ملاحظات إضافية..."
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>إلغاء</Button>
        <Button onClick={onSave} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 animate-spin" /> جاري الحفظ...</> : 'حفظ'}
        </Button>
      </div>
    </div>
  );
}
