'use client';

import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface EditFormProps {
  form: any;
  setForm: (f: any) => void;
}

export function SupplierEditForm({ form, setForm }: EditFormProps) {
  const u = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>الاسم *</Label>
          <Input value={form.name || ''} onChange={e => u('name', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>الشركة</Label>
          <Input value={form.company || ''} onChange={e => u('company', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>البريد الإلكتروني</Label>
          <Input type="email" value={form.email || ''} onChange={e => u('email', e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-2">
          <Label>الهاتف</Label>
          <Input value={form.phone || ''} onChange={e => u('phone', e.target.value)} dir="ltr" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>العنوان</Label>
        <Textarea value={form.address || ''} onChange={e => u('address', e.target.value)} rows={2} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>الرقم الضريبي</Label>
          <Input value={form.tax_number || ''} onChange={e => u('tax_number', e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-2">
          <Label>شروط الدفع (أيام)</Label>
          <Input type="number" min={0} value={form.payment_terms_days || 0} onChange={e => u('payment_terms_days', parseInt(e.target.value) || 0)} dir="ltr" />
        </div>
        <div className="space-y-2">
          <Label>العملة</Label>
          <Input value={form.currency || 'AED'} onChange={e => u('currency', e.target.value)} dir="ltr" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>اسم البنك</Label>
          <Input value={form.bank_name || ''} onChange={e => u('bank_name', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>رقم الحساب</Label>
          <Input value={form.bank_account || ''} onChange={e => u('bank_account', e.target.value)} dir="ltr" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>IBAN</Label>
        <Input value={form.bank_iban || ''} onChange={e => u('bank_iban', e.target.value)} dir="ltr" />
      </div>
      <div className="space-y-2">
        <Label>ملاحظات</Label>
        <Textarea value={form.notes || ''} onChange={e => u('notes', e.target.value)} rows={3} />
      </div>
    </div>
  );
}
