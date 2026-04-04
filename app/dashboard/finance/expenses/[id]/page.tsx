'use client';

import { useState, useEffect, use } from 'react';
import { useQuery as useQueryRQ } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import { useProjects } from '@/hooks/useProjects';
import { useExpense } from '@/hooks/useExpenses';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowRight, Save, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface Category { id: string; name: string; name_ar: string; }
interface Supplier { id: string; name: string; company: string | null; }

const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقداً' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'credit_card', label: 'بطاقة ائتمان' },
  { value: 'cheque', label: 'شيك' },
  { value: 'online', label: 'دفع إلكتروني' },
];

export default function EditExpensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: projects = [] } = useProjects({ pageSize: '100' });
  const [saving, setSaving] = useState(false);
  const [formReady, setFormReady] = useState(false);
  const [form, setForm] = useState({
    description: '', amount: '', currency: 'AED', vat_rate: '0',
    expense_date: '', vendor: '', payment_method: '', category_id: '', project_id: '', supplier_id: '', notes: '',
  });

  const { data: expenseData, isLoading: loading } = useExpense(id);

  // Populate form once expense data arrives
  useEffect(() => {
    if (expenseData && !formReady) {
      const d = expenseData as unknown as Record<string, unknown>;
      setForm({
        description: String(d.description || ''),
        amount: String(d.amount || ''),
        currency: String(d.currency || 'AED'),
        vat_rate: String(d.vat_rate || '0'),
        expense_date: String(d.expense_date || ''),
        vendor: String(d.vendor || ''),
        payment_method: String(d.payment_method || ''),
        category_id: String(d.category_id || ''),
        project_id: String(d.project_id || ''),
        supplier_id: String(d.supplier_id || ''),
        notes: String(d.notes || ''),
      });
      setFormReady(true);
    }
  }, [expenseData, formReady]);

  const { data: _categoriesData = [] } = useQueryRQ<Category[]>({
    queryKey: ['expense-categories'],
    queryFn: () => fetchAPI('/api/finance/expenses/categories'),
  });
  const categories = _categoriesData;

  const { data: _suppliersData = [] } = useQueryRQ<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => fetchAPI('/api/dashboard/suppliers?limit=100&active=true'),
  });
  const suppliers = _suppliersData;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/finance/expenses/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          vat_rate: Number(form.vat_rate),
          category_id: form.category_id || null,
          project_id: form.project_id || null,
          supplier_id: form.supplier_id || null,
          payment_method: form.payment_method || null,
        }),
      });
      if (res.ok) {
        toast.success('تم تحديث المصروف');
        router.push('/dashboard/finance/expenses');
      } else {
        toast.error('فشل في التحديث');
      }
    } catch {
      toast.error('فشل في التحديث');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string) => setForm(prev => ({ ...prev, [key]: value }));

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-48" />
      <Card><CardContent className="p-6 space-y-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
      </CardContent></Card>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/expenses">
          <Button variant="ghost" size="icon" aria-label="رجوع"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">تعديل المصروف</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><CardTitle className="text-base">بيانات المصروف</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Input value={form.description} onChange={e => update('description', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>المورد (من السجل)</Label>
                <Select value={form.supplier_id} onValueChange={v => {
                  update('supplier_id', v === 'none' ? '' : v);
                  if (v !== 'none') {
                    const sup = suppliers.find(s => s.id === v);
                    if (sup) update('vendor', sup.name);
                  }
                }}>
                  <SelectTrigger><SelectValue placeholder="اختر مورد" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون ربط</SelectItem>
                    {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.company ? ` — ${s.company}` : ''}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>اسم المورد</Label>
                <Input value={form.vendor} onChange={e => update('vendor', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>المبلغ *</Label>
                <Input type="number" step="0.01" min="0" value={form.amount} onChange={e => update('amount', e.target.value)} required dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>نسبة الضريبة (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" value={form.vat_rate} onChange={e => update('vat_rate', e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>التصنيف</Label>
                <Select value={form.category_id} onValueChange={v => update('category_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="اختر التصنيف" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون تصنيف</SelectItem>
                    {categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name_ar || c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>طريقة الدفع</Label>
                <Select value={form.payment_method} onValueChange={v => update('payment_method', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">غير محدد</SelectItem>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المشروع</Label>
                <Select value={form.project_id} onValueChange={v => update('project_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون مشروع</SelectItem>
                    {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>تاريخ المصروف</Label>
                <Input type="date" value={form.expense_date} onChange={e => update('expense_date', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>العملة</Label>
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
              <Label>ملاحظات</Label>
              <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} rows={3} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
                {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
