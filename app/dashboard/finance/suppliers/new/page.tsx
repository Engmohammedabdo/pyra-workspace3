'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mutateAPI } from '@/hooks/api-helpers';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { ArrowRight, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function NewSupplierPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const t = useTranslations('finance.suppliers');

  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [taxNumber, setTaxNumber] = useState('');
  const [paymentTerms, setPaymentTerms] = useState(30);
  const [currency, setCurrency] = useState('AED');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIban, setBankIban] = useState('');
  const [notes, setNotes] = useState('');

  const createMutation = useMutation({
    mutationFn: (data: object) => mutateAPI<{ id?: string }>('/api/dashboard/suppliers', 'POST', data),
    onSuccess: (data) => {
      // Supplier dropdown caches (expenses/new, expenses/[id], purchase-orders/new) use ['suppliers']
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      toast.success(t('new.toasts.createSuccess'));
      router.push(`/dashboard/finance/suppliers/${(data as any).id}`);
    },
    onError: () => toast.error(t('new.toasts.createFailed')),
  });

  const handleSubmit = () => {
    if (!name.trim()) { toast.error(t('new.toasts.nameRequired')); return; }
    createMutation.mutate({
      name: name.trim(), company: company || null, email: email || null,
      phone: phone || null, address: address || null, tax_number: taxNumber || null,
      payment_terms_days: paymentTerms, currency,
      bank_name: bankName || null, bank_account: bankAccount || null,
      bank_iban: bankIban || null, notes: notes || null,
    });
  };

  const saving = createMutation.isPending;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/suppliers">
          <Button variant="ghost" size="icon" aria-label={t('list.back')}><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('new.title')}</h1>
          <p className="text-muted-foreground">{t('new.subtitle')}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>{t('new.cardTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('form.nameLabel')}</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder={t('form.namePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('form.companyLabel')}</Label>
              <Input value={company} onChange={e => setCompany(e.target.value)} placeholder={t('form.companyPlaceholder')} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('form.emailLabel')}</Label>
              <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="email@example.com" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>{t('form.phoneLabel')}</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+971..." dir="ltr" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('form.addressLabel')}</Label>
            <Textarea value={address} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAddress(e.target.value)} placeholder={t('form.addressPlaceholder')} rows={2} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label>{t('form.taxNumberLabel')}</Label>
              <Input value={taxNumber} onChange={e => setTaxNumber(e.target.value)} placeholder="TRN" dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>{t('form.paymentTermsLabel')}</Label>
              <Input type="number" min={0} value={paymentTerms} onChange={e => setPaymentTerms(parseInt(e.target.value) || 0)} dir="ltr" />
            </div>
            <div className="space-y-2">
              <Label>{t('form.currencyLabel')}</Label>
              <Input value={currency} onChange={e => setCurrency(e.target.value)} dir="ltr" />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('form.bankDetailsTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('form.bankNameLabel')}</Label>
              <Input value={bankName} onChange={e => setBankName(e.target.value)} placeholder={t('form.bankNamePlaceholder')} />
            </div>
            <div className="space-y-2">
              <Label>{t('form.bankAccountLabel')}</Label>
              <Input value={bankAccount} onChange={e => setBankAccount(e.target.value)} placeholder={t('form.bankAccountLabel')} dir="ltr" />
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t('form.ibanLabel')}</Label>
            <Input value={bankIban} onChange={e => setBankIban(e.target.value)} placeholder="AE..." dir="ltr" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t('form.notesTitle')}</CardTitle></CardHeader>
        <CardContent>
          <Textarea value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} placeholder={t('form.notesPlaceholder')} rows={3} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 justify-end">
        <Link href="/dashboard/finance/suppliers"><Button variant="outline">{t('form.cancel')}</Button></Link>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
          {t('form.save')}
        </Button>
      </div>
    </div>
  );
}
