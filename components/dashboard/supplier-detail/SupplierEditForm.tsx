'use client';

import { useTranslations } from 'next-intl';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface EditFormProps {
  form: any;
  setForm: (f: any) => void;
}

export function SupplierEditForm({ form, setForm }: EditFormProps) {
  const t = useTranslations('finance.suppliers.form');
  const u = (k: string, v: any) => setForm({ ...form, [k]: v });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('nameLabel')}</Label>
          <Input value={form.name || ''} onChange={e => u('name', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('companyLabel')}</Label>
          <Input value={form.company || ''} onChange={e => u('company', e.target.value)} />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('emailLabel')}</Label>
          <Input type="email" value={form.email || ''} onChange={e => u('email', e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-2">
          <Label>{t('phoneLabel')}</Label>
          <Input value={form.phone || ''} onChange={e => u('phone', e.target.value)} dir="ltr" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('addressLabel')}</Label>
        <Textarea value={form.address || ''} onChange={e => u('address', e.target.value)} rows={2} />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label>{t('taxNumberLabel')}</Label>
          <Input value={form.tax_number || ''} onChange={e => u('tax_number', e.target.value)} dir="ltr" />
        </div>
        <div className="space-y-2">
          <Label>{t('paymentTermsLabel')}</Label>
          <Input type="number" min={0} value={form.payment_terms_days || 0} onChange={e => u('payment_terms_days', parseInt(e.target.value) || 0)} dir="ltr" />
        </div>
        <div className="space-y-2">
          <Label>{t('currencyLabel')}</Label>
          <Input value={form.currency || 'AED'} onChange={e => u('currency', e.target.value)} dir="ltr" />
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t('bankNameLabel')}</Label>
          <Input value={form.bank_name || ''} onChange={e => u('bank_name', e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>{t('bankAccountLabel')}</Label>
          <Input value={form.bank_account || ''} onChange={e => u('bank_account', e.target.value)} dir="ltr" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t('ibanLabel')}</Label>
        <Input value={form.bank_iban || ''} onChange={e => u('bank_iban', e.target.value)} dir="ltr" />
      </div>
      <div className="space-y-2">
        <Label>{t('notesLabel')}</Label>
        <Textarea value={form.notes || ''} onChange={e => u('notes', e.target.value)} rows={3} />
      </div>
    </div>
  );
}
