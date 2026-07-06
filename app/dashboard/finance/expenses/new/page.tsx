'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { useProjects } from '@/hooks/useProjects';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowRight, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useStatusLabels } from '@/lib/i18n/status-labels';

interface Category { id: string; name: string; name_ar: string; }
interface Supplier { id: string; name: string; company: string | null; }

const PAYMENT_METHOD_VALUES = ['cash', 'bank_transfer', 'credit_card', 'cheque', 'online'] as const;

export default function NewExpensePage() {
  const t = useTranslations('finance.expenses.form');
  const paymentMethodLabelFor = useStatusLabels('paymentMethod');
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: projects = [] } = useProjects({ pageSize: '100' });
  const [form, setForm] = useState({
    description: '', amount: '', currency: 'AED', vat_rate: '0',
    expense_date: new Date().toISOString().split('T')[0],
    vendor: '', payment_method: '', category_id: '', project_id: '', supplier_id: '', notes: '',
    is_recurring: false, recurring_period: '',
  });

  const { data: categories = [] } = useQuery<Category[]>({
    queryKey: ['expense-categories'],
    queryFn: () => fetchAPI('/api/finance/expenses/categories'),
  });
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => fetchAPI('/api/dashboard/suppliers?limit=100&active=true'),
  });

  const createMutation = useMutation({
    mutationFn: (data: object) => mutateAPI('/api/finance/expenses', 'POST', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      toast.success(t('toasts.createSuccess'));
      router.push('/dashboard/finance/expenses');
    },
    onError: () => toast.error(t('toasts.saveFailed')),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error(t('toasts.amountRequired'));
      return;
    }
    createMutation.mutate({
      ...form,
      amount: Number(form.amount),
      vat_rate: Number(form.vat_rate),
      category_id: form.category_id || null,
      project_id: form.project_id || null,
      supplier_id: form.supplier_id || null,
      payment_method: form.payment_method || null,
    });
  };

  const update = (key: string, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }));
  const saving = createMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/expenses">
          <Button variant="ghost" size="icon" aria-label={t('back')}><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">{t('newTitle')}</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><CardTitle className="text-base">{t('cardTitle')}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>{t('fields.description')}</Label>
                <Input value={form.description} onChange={e => update('description', e.target.value)} placeholder={t('fields.descriptionPlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{t('fields.supplierFromRecord')}</Label>
                <Select value={form.supplier_id} onValueChange={v => {
                  update('supplier_id', v === 'none' ? '' : v);
                  if (v !== 'none') {
                    const sup = suppliers.find(s => s.id === v);
                    if (sup) update('vendor', sup.name);
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder={t('fields.supplierPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.noSupplierLink')}</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.company ? ` — ${s.company}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('fields.vendorName')}</Label>
                <Input value={form.vendor} onChange={e => update('vendor', e.target.value)} placeholder={t('fields.vendorNamePlaceholder')} />
              </div>
              <div className="space-y-2">
                <Label>{t('fields.amount')}</Label>
                <Input type="number" step="0.01" min="0" value={form.amount} onChange={e => update('amount', e.target.value)} placeholder="0.00" required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t('fields.vatRate')}</Label>
                <Input type="number" step="0.01" min="0" max="100" value={form.vat_rate} onChange={e => update('vat_rate', e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>{t('fields.category')}</Label>
                <Select value={form.category_id} onValueChange={v => update('category_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder={t('fields.categoryPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.noCategory')}</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar || c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('fields.paymentMethod')}</Label>
                <Select value={form.payment_method} onValueChange={v => update('payment_method', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder={t('paymentMethodPlaceholder.new')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.paymentMethodNone')}</SelectItem>
                    {PAYMENT_METHOD_VALUES.map(value => <SelectItem key={value} value={value}>{paymentMethodLabelFor(value)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('fields.project')}</Label>
                <Select value={form.project_id} onValueChange={v => update('project_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder={t('fields.projectPlaceholder')} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t('fields.noProject')}</SelectItem>
                    {(projects as any[]).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{t('fields.expenseDate')}</Label>
                <Input type="date" value={form.expense_date} onChange={e => update('expense_date', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('fields.currency')}</Label>
                <Select value={form.currency} onValueChange={v => update('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="SAR">SAR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t('fields.notes')}</Label>
              <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder={t('fields.notesPlaceholder')} rows={3} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
                {saving ? t('submitting') : t('submitNew')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
