'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { mutateAPI } from '@/hooks/api-helpers';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useClients } from '@/hooks/useClients';
import { useProjects } from '@/hooks/useProjects';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowRight, Save, RefreshCcw, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const CONTRACT_TYPES = [
  { value: 'retainer', label: 'ثابت شهري (Retainer)' },
  { value: 'milestone', label: 'مراحل (Milestone)' },
  { value: 'upfront_delivery', label: 'دفعة مقدمة + تسليم' },
  { value: 'fixed', label: 'سعر ثابت (Fixed)' },
  { value: 'hourly', label: 'بالساعة (Hourly)' },
];

export default function NewContractPage() {
  const router = useRouter();
  const { data: clients = [] } = useClients({ pageSize: '100' });
  const { data: allProjects = [] } = useProjects({ pageSize: '100' });
  const [form, setForm] = useState({
    title: '', description: '', client_id: '', project_id: '',
    contract_type: '', total_value: '', currency: 'AED', vat_rate: '0',
    start_date: '', end_date: '', notes: '',
    retainer_amount: '', retainer_cycle: 'monthly', billing_day: '1',
  });

  const filteredProjects = form.client_id
    ? allProjects.filter((p: any) => p.client_id === form.client_id)
    : allProjects;

  const createMutation = useMutation({
    mutationFn: (data: object) => mutateAPI<{ id?: string }>('/api/finance/contracts', 'POST', data),
    onSuccess: (data) => {
      toast.success('تم إنشاء العقد — يمكنك الآن إضافة بنود نطاق العمل');
      router.push(`/dashboard/finance/contracts/${(data as any).id || ''}`);
    },
    onError: () => toast.error('فشل في الحفظ'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) { toast.error('عنوان العقد مطلوب'); return; }
    createMutation.mutate({
      ...form,
      total_value: Number(form.total_value) || 0,
      vat_rate: Number(form.vat_rate) || 0,
      client_id: form.client_id || null,
      project_id: form.project_id || null,
      contract_type: form.contract_type || null,
      retainer_amount: Number(form.retainer_amount) || 0,
      retainer_cycle: form.retainer_cycle,
      billing_day: Number(form.billing_day) || 1,
    });
  };

  const u = (k: string, v: string) => {
    if (k === 'client_id') {
      setForm(p => ({ ...p, client_id: v, project_id: '' }));
    } else {
      setForm(p => ({ ...p, [k]: v }));
    }
  };

  const saving = createMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/contracts">
          <Button variant="ghost" size="icon" aria-label="رجوع"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <h1 className="text-2xl font-bold">إنشاء عقد جديد</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader><CardTitle className="text-base">بيانات العقد</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2 md:col-span-2">
                <Label>عنوان العقد *</Label>
                <Input value={form.title} onChange={e => u('title', e.target.value)} placeholder="عنوان العقد" required />
              </div>
              <div className="space-y-2">
                <Label>العميل</Label>
                <Select value={form.client_id} onValueChange={v => u('client_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون عميل</SelectItem>
                    {(clients as any[]).map((c: any) => (
                      <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المشروع</Label>
                <Select value={form.project_id} onValueChange={v => u('project_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder={form.client_id ? 'اختر المشروع' : 'اختر العميل أولاً'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون مشروع</SelectItem>
                    {(filteredProjects as any[]).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نوع العقد</Label>
                <Select value={form.contract_type} onValueChange={v => u('contract_type', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">غير محدد</SelectItem>
                    {CONTRACT_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>القيمة الإجمالية</Label>
                <Input type="number" step="0.01" min="0" value={form.total_value} onChange={e => u('total_value', e.target.value)} placeholder="0.00" dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>العملة</Label>
                <Select value={form.currency} onValueChange={v => u('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="EUR">EUR</SelectItem>
                    <SelectItem value="SAR">SAR</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>نسبة الضريبة (%)</Label>
                <Input type="number" step="0.01" min="0" max="100" value={form.vat_rate} onChange={e => u('vat_rate', e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-2">
                <Label>تاريخ البداية</Label>
                <Input type="date" value={form.start_date} onChange={e => u('start_date', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>تاريخ النهاية</Label>
                <Input type="date" value={form.end_date} onChange={e => u('end_date', e.target.value)} />
              </div>
            </div>

            {form.contract_type === 'retainer' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg border border-orange-200 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-950/20">
                <div className="md:col-span-3">
                  <p className="text-sm font-medium text-orange-700 dark:text-orange-400 flex items-center gap-2">
                    <RefreshCcw className="h-4 w-4" />
                    إعدادات الدفع الشهري
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>المبلغ الشهري</Label>
                  <Input type="number" step="0.01" min="0" value={form.retainer_amount} onChange={e => u('retainer_amount', e.target.value)} placeholder="0.00" dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>دورة الفوترة</Label>
                  <Select value={form.retainer_cycle} onValueChange={v => u('retainer_cycle', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="monthly">شهري</SelectItem>
                      <SelectItem value="quarterly">ربع سنوي</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>يوم الفوترة</Label>
                  <Select value={form.billing_day} onValueChange={v => u('billing_day', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                        <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>الوصف</Label>
              <Textarea value={form.description} onChange={e => u('description', e.target.value)} rows={3} placeholder="وصف العقد..." />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea value={form.notes} onChange={e => u('notes', e.target.value)} rows={2} placeholder="ملاحظات إضافية..." />
            </div>
            <div className="flex justify-end">
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
                {saving ? 'جاري الحفظ...' : 'إنشاء العقد'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
