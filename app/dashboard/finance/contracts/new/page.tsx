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

interface Client { id: string; name: string; company: string; }
interface Project { id: string; name: string; }

const CONTRACT_TYPES = [
  { value: 'retainer', label: 'ثابت شهري (Retainer)' },
  { value: 'milestone', label: 'مراحل (Milestone)' },
  { value: 'upfront_delivery', label: 'دفعة مقدمة + تسليم' },
  { value: 'fixed', label: 'سعر ثابت (Fixed)' },
  { value: 'hourly', label: 'بالساعة (Hourly)' },
];

export default function NewContractPage() {
  const router = useRouter();
  const [clients, setClients] = useState<Client[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    title: '', description: '', client_id: '', project_id: '',
    contract_type: '', total_value: '', currency: 'AED', vat_rate: '0',
    start_date: '', end_date: '', notes: '',
  });

  useEffect(() => {
    fetch('/api/clients?pageSize=100')
      .then(r => r.json())
      .then(j => { if (j.data) setClients(j.data); })
      .catch(() => {});
    fetch('/api/projects?pageSize=100')
      .then(r => r.json())
      .then(j => { if (j.data) setProjects(j.data); })
      .catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title) { toast.error('عنوان العقد مطلوب'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/finance/contracts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          total_value: Number(form.total_value) || 0,
          vat_rate: Number(form.vat_rate) || 0,
          client_id: form.client_id || null,
          project_id: form.project_id || null,
          contract_type: form.contract_type || null,
        }),
      });
      if (res.ok) {
        toast.success('تم إنشاء العقد');
        router.push('/dashboard/finance/contracts');
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

  const u = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/contracts">
          <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
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
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>المشروع</Label>
                <Select value={form.project_id} onValueChange={v => u('project_id', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">بدون مشروع</SelectItem>
                    {projects.map(p => (
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
                <Input type="number" step="0.01" min="0" value={form.total_value} onChange={e => u('total_value', e.target.value)} placeholder="0.00" />
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
                <Input type="number" step="0.01" min="0" max="100" value={form.vat_rate} onChange={e => u('vat_rate', e.target.value)} />
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
                <Save className="h-4 w-4 ml-2" />
                {saving ? 'جاري الحفظ...' : 'إنشاء العقد'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
