'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

interface Stage {
  id: string;
  name_ar: string;
  color: string;
}

interface LeadCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const SOURCES = [
  { value: 'manual', label: 'يدوي' },
  { value: 'whatsapp', label: 'واتساب' },
  { value: 'website', label: 'موقع إلكتروني' },
  { value: 'referral', label: 'إحالة' },
  { value: 'ad', label: 'إعلان' },
  { value: 'social', label: 'سوشيال ميديا' },
];

const PRIORITIES = [
  { value: 'low', label: 'منخفضة' },
  { value: 'medium', label: 'متوسطة' },
  { value: 'high', label: 'عالية' },
  { value: 'urgent', label: 'عاجلة' },
];

export function LeadCreateDialog({ open, onOpenChange, onCreated }: LeadCreateDialogProps) {
  const [loading, setLoading] = useState(false);
  const [stages, setStages] = useState<Stage[]>([]);
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    source: 'manual',
    stage_id: '',
    priority: 'medium',
    notes: '',
  });

  useEffect(() => {
    if (open) {
      fetch('/api/dashboard/sales/pipeline-stages')
        .then(r => r.json())
        .then(d => {
          const stagesData = d.data || [];
          setStages(stagesData);
          const defaultStage = stagesData.find((s: Stage) => s.id && stagesData.indexOf(s) === 0);
          if (defaultStage) setForm(f => ({ ...f, stage_id: defaultStage.id }));
        })
        .catch(() => {});
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error('اسم العميل المحتمل مطلوب');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/dashboard/sales/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'فشل الإنشاء');

      toast.success('تم إنشاء العميل المحتمل بنجاح');
      setForm({ name: '', phone: '', email: '', company: '', source: 'manual', stage_id: stages[0]?.id || '', priority: 'medium', notes: '' });
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'حدث خطأ');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>عميل محتمل جديد</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Label>الاسم *</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم العميل المحتمل" />
            </div>
            <div>
              <Label>الهاتف</Label>
              <Input value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="+971..." dir="ltr" />
            </div>
            <div>
              <Label>البريد الإلكتروني</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@example.com" dir="ltr" type="email" />
            </div>
            <div>
              <Label>الشركة</Label>
              <Input value={form.company} onChange={e => setForm(f => ({ ...f, company: e.target.value }))} placeholder="اسم الشركة" />
            </div>
            <div>
              <Label>المصدر</Label>
              <Select value={form.source} onValueChange={v => setForm(f => ({ ...f, source: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SOURCES.map(s => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>المرحلة</Label>
              <Select value={form.stage_id} onValueChange={v => setForm(f => ({ ...f, stage_id: v }))}>
                <SelectTrigger><SelectValue placeholder="اختر المرحلة" /></SelectTrigger>
                <SelectContent>
                  {stages.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.name_ar}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>الأولوية</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map(p => (
                    <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2">
              <Label>ملاحظات</Label>
              <Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="أي ملاحظات إضافية..." rows={3} />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>إلغاء</Button>
            <Button type="submit" disabled={loading} className="bg-orange-500 hover:bg-orange-600 text-white">
              {loading && <Loader2 className="h-4 w-4 animate-spin me-1" />}
              إنشاء
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
