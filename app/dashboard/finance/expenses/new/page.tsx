'use client';

import { useState, useEffect } from 'react';
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
import { ArrowRight, Save } from 'lucide-react';
import { toast } from 'sonner';

interface Category { id: string; name: string; name_ar: string; }

const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقداً' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'credit_card', label: 'بطاقة ائتمان' },
  { value: 'cheque', label: 'شيك' },
  { value: 'online', label: 'دفع إلكتروني' },
];

export default function NewExpensePage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    description: '', amount: '', currency: 'AED', vat_rate: '0',
    expense_date: new Date().toISOString().split('T')[0],
    vendor: '', payment_method: '', category_id: '', notes: '',
    is_recurring: false, recurring_period: '',
  });

  useEffect(() => {
    fetch('/api/finance/expenses/categories')
      .then(r => r.json())
      .then(j => { if (j.data) setCategories(j.data); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) {
      toast.error('المبلغ مطلوب');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/finance/expenses', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          amount: Number(form.amount),
          vat_rate: Number(form.vat_rate),
          category_id: form.category_id || null,
          payment_method: form.payment_method || null,
        }),
      });
      if (res.ok) {
        toast.success('تم إضافة المصروف');
        router.push('/dashboard/finance/expenses');
      } else {
        const json = await res.json();
        toast.error(json.error || 'فشل في الحفظ');
      }
    } catch {
      toast.error('فشل في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/expenses">
          <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">إضافة مصروف جديد</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><CardTitle className="text-base">بيانات المصروف</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Input value={form.description} onChange={e => update('description', e.target.value)} placeholder="وصف المصروف" />
              </div>
              <div className="space-y-2">
                <Label>المورد</Label>
                <Input value={form.vendor} onChange={e => update('vendor', e.target.value)} placeholder="اسم المورد" />
              </div>
              <div className="space-y-2">
                <Label>المبلغ *</Label>
                <Input type="number" step="0.01" min="0" value={form.amount} onChange={e => update('amount', e.target.value)} placeholder="0.00" required />
              </div>
              <div className="space-y-2">
                <Label>نسبة الضريبة (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" value={form.vat_rate} onChange={e => update('vat_rate', e.target.value)} />
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
                  <SelectTrigger><SelectValue placeholder="اختر طريقة الدفع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">غير محدد</SelectItem>
                    {PAYMENT_METHODS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
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
              <Textarea value={form.notes} onChange={e => update('notes', e.target.value)} placeholder="ملاحظات إضافية..." rows={3} />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                <Save className="h-4 w-4 ml-2" />
                {saving ? 'جاري الحفظ...' : 'حفظ المصروف'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
