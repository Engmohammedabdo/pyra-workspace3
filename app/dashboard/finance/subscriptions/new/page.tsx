'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowRight, Save } from 'lucide-react';
import { toast } from 'sonner';

interface CardItem { id: string; card_name: string; last_four: string; }

export default function NewSubscriptionPage() {
  const router = useRouter();
  const [cards, setCards] = useState<CardItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '', provider: '', cost: '', currency: 'AED',
    billing_cycle: 'monthly', next_renewal_date: '', card_id: '',
    category: '', url: '', notes: '', auto_renew: true,
  });

  useEffect(() => {
    fetch('/api/finance/cards').then(r => r.json()).then(j => { if (j.data) setCards(j.data); }).catch(() => {});
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name) { toast.error('اسم الاشتراك مطلوب'); return; }
    if (!form.cost || Number(form.cost) <= 0) { toast.error('التكلفة مطلوبة'); return; }
    setSaving(true);
    try {
      const res = await fetch('/api/finance/subscriptions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, cost: Number(form.cost), card_id: form.card_id || null }),
      });
      if (res.ok) { toast.success('تم إضافة الاشتراك'); router.push('/dashboard/finance/subscriptions'); }
      else { const j = await res.json(); toast.error(j.error || 'فشل'); }
    } catch { toast.error('فشل'); } finally { setSaving(false); }
  };

  const u = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/subscriptions"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
        <h1 className="text-2xl font-bold">إضافة اشتراك جديد</h1>
      </div>
      <form onSubmit={handleSubmit}>
        <Card><CardHeader><CardTitle className="text-base">بيانات الاشتراك</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2"><Label>اسم الاشتراك *</Label><Input value={form.name} onChange={e => u('name', e.target.value)} required /></div>
              <div className="space-y-2"><Label>المزود</Label><Input value={form.provider} onChange={e => u('provider', e.target.value)} /></div>
              <div className="space-y-2"><Label>التكلفة *</Label><Input type="number" step="0.01" min="0" value={form.cost} onChange={e => u('cost', e.target.value)} required /></div>
              <div className="space-y-2"><Label>العملة</Label>
                <Select value={form.currency} onValueChange={v => u('currency', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="AED">AED</SelectItem><SelectItem value="USD">USD</SelectItem><SelectItem value="EUR">EUR</SelectItem><SelectItem value="SAR">SAR</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>دورة الفوترة</Label>
                <Select value={form.billing_cycle} onValueChange={v => u('billing_cycle', v)}><SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="monthly">شهري</SelectItem><SelectItem value="quarterly">ربع سنوي</SelectItem><SelectItem value="yearly">سنوي</SelectItem></SelectContent></Select></div>
              <div className="space-y-2"><Label>تاريخ التجديد</Label><Input type="date" value={form.next_renewal_date} onChange={e => u('next_renewal_date', e.target.value)} /></div>
              <div className="space-y-2"><Label>البطاقة</Label>
                <Select value={form.card_id} onValueChange={v => u('card_id', v === 'none' ? '' : v)}><SelectTrigger><SelectValue placeholder="اختر البطاقة" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">بدون بطاقة</SelectItem>{cards.map(c => <SelectItem key={c.id} value={c.id}>{c.card_name} ({c.last_four})</SelectItem>)}</SelectContent></Select></div>
              <div className="space-y-2"><Label>التصنيف</Label><Input value={form.category} onChange={e => u('category', e.target.value)} placeholder="مثال: أدوات، استضافة" /></div>
              <div className="space-y-2 md:col-span-2"><Label>الرابط</Label><Input value={form.url} onChange={e => u('url', e.target.value)} placeholder="https://" /></div>
            </div>
            <div className="flex items-center gap-2">
              <div className={`h-5 w-5 rounded border cursor-pointer flex items-center justify-center ${form.auto_renew ? 'bg-primary border-primary text-primary-foreground' : 'border-input'}`}
                onClick={() => u('auto_renew', !form.auto_renew)}>
                {form.auto_renew && <span className="text-xs">✓</span>}
              </div>
              <Label className="cursor-pointer" onClick={() => u('auto_renew', !form.auto_renew)}>تجديد تلقائي</Label>
            </div>
            <div className="space-y-2"><Label>ملاحظات</Label><Textarea value={form.notes} onChange={e => u('notes', e.target.value)} rows={3} /></div>
            <div className="flex justify-end"><Button type="submit" disabled={saving}><Save className="h-4 w-4 ml-2" />{saving ? 'جاري الحفظ...' : 'حفظ'}</Button></div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
