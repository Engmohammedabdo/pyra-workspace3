'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ArrowRight, Target, Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

interface RevenueTarget {
  id: string;
  period_type: 'monthly' | 'quarterly' | 'yearly';
  period_start: string;
  period_end: string;
  target_amount: number;
  currency: string;
  notes: string | null;
  actual_revenue: number;
  progress_percentage: number;
  created_at: string;
}

const PERIOD_TYPE_MAP: Record<string, string> = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  yearly: 'سنوي',
};

const CURRENCIES = [
  { value: 'AED', label: 'درهم (AED)' },
  { value: 'USD', label: 'دولار (USD)' },
  { value: 'EUR', label: 'يورو (EUR)' },
  { value: 'SAR', label: 'ريال (SAR)' },
];

function getProgressColor(pct: number): string {
  if (pct >= 100) return 'text-green-600';
  if (pct >= 70) return 'text-yellow-600';
  return 'text-red-600';
}

function getProgressBarClass(pct: number): string {
  if (pct >= 100) return '[&>div]:bg-green-500';
  if (pct >= 70) return '[&>div]:bg-yellow-500';
  return '[&>div]:bg-red-500';
}

export default function RevenueTargetsPage() {
  const [targets, setTargets] = useState<RevenueTarget[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    period_type: '' as string,
    period_start: '',
    period_end: '',
    target_amount: '',
    currency: 'AED',
    notes: '',
  });

  const fetchTargets = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/revenue-targets');
      const json = await res.json();
      if (json.data) setTargets(json.data);
    } catch {
      toast.error('فشل في تحميل الأهداف');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchTargets(); }, [fetchTargets]);

  const openNew = () => {
    setEditingId(null);
    setForm({
      period_type: '',
      period_start: '',
      period_end: '',
      target_amount: '',
      currency: 'AED',
      notes: '',
    });
    setDialogOpen(true);
  };

  const openEdit = (t: RevenueTarget) => {
    setEditingId(t.id);
    setForm({
      period_type: t.period_type,
      period_start: t.period_start,
      period_end: t.period_end,
      target_amount: String(t.target_amount),
      currency: t.currency,
      notes: t.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.period_type) { toast.error('نوع الفترة مطلوب'); return; }
    if (!form.period_start || !form.period_end) { toast.error('تواريخ الفترة مطلوبة'); return; }
    if (!form.target_amount || Number(form.target_amount) <= 0) { toast.error('المبلغ المستهدف مطلوب'); return; }
    if (form.period_start >= form.period_end) { toast.error('تاريخ البداية يجب أن يكون قبل النهاية'); return; }

    setSaving(true);
    try {
      const url = editingId ? `/api/finance/revenue-targets/${editingId}` : '/api/finance/revenue-targets';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          period_type: form.period_type,
          period_start: form.period_start,
          period_end: form.period_end,
          target_amount: Number(form.target_amount),
          currency: form.currency,
          notes: form.notes || null,
        }),
      });
      if (res.ok) {
        toast.success(editingId ? 'تم تحديث الهدف' : 'تم إضافة الهدف');
        setDialogOpen(false);
        fetchTargets();
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

  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/finance/revenue-targets/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('تم حذف الهدف');
        setDeleteId(null);
        fetchTargets();
      } else {
        const json = await res.json();
        toast.error(json.error || 'فشل في الحذف');
      }
    } catch {
      toast.error('فشل في الحذف');
    } finally {
      setDeleting(false);
    }
  };

  const u = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Target className="h-6 w-6" /> أهداف الإيرادات
          </h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 ml-2" /> إضافة هدف</Button>
      </div>

      {/* Targets Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-40 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : targets.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <Target className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>لا توجد أهداف إيرادات</p>
            <p className="text-sm mt-1">أضف هدفاً لتتبع الإيرادات</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {targets.map(t => {
            const pct = t.progress_percentage;
            const colorClass = getProgressColor(pct);
            const barClass = getProgressBarClass(pct);

            return (
              <Card key={t.id} className="relative overflow-hidden">
                <CardContent className="p-6">
                  {/* Actions */}
                  <div className="absolute top-3 start-3 flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(t)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeleteId(t.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Period Label */}
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground">{PERIOD_TYPE_MAP[t.period_type] || t.period_type}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDate(t.period_start)} — {formatDate(t.period_end)}
                    </p>
                  </div>

                  {/* Target Amount */}
                  <div className="mb-2">
                    <p className="text-sm text-muted-foreground">المستهدف</p>
                    <p className="text-xl font-bold">{formatCurrency(t.target_amount, t.currency)}</p>
                  </div>

                  {/* Actual Revenue */}
                  <div className="mb-4">
                    <p className="text-sm text-muted-foreground">الإيرادات الفعلية</p>
                    <p className={cn('text-xl font-bold', colorClass)}>
                      {formatCurrency(t.actual_revenue, t.currency)}
                    </p>
                  </div>

                  {/* Progress Bar */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-muted-foreground">التقدم</span>
                      <span className={cn('font-bold', colorClass)}>{pct}%</span>
                    </div>
                    <Progress value={Math.min(pct, 100)} className={cn('h-2', barClass)} />
                  </div>

                  {/* Notes */}
                  {t.notes && (
                    <p className="mt-3 text-xs text-muted-foreground border-t pt-3">{t.notes}</p>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'تعديل الهدف' : 'إضافة هدف جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>نوع الفترة *</Label>
              <Select value={form.period_type} onValueChange={v => u('period_type', v)}>
                <SelectTrigger><SelectValue placeholder="اختر نوع الفترة" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="monthly">شهري</SelectItem>
                  <SelectItem value="quarterly">ربع سنوي</SelectItem>
                  <SelectItem value="yearly">سنوي</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>تاريخ البداية *</Label>
                <Input type="date" value={form.period_start} onChange={e => u('period_start', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>تاريخ النهاية *</Label>
                <Input type="date" value={form.period_end} onChange={e => u('period_end', e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المبلغ المستهدف *</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.target_amount}
                  onChange={e => u('target_amount', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>العملة</Label>
                <Select value={form.currency} onValueChange={v => u('currency', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={form.notes}
                onChange={e => u('notes', e.target.value)}
                placeholder="ملاحظات إضافية..."
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? 'جاري الحفظ...' : 'حفظ'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>حذف الهدف</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">هل أنت متأكد من حذف هذا الهدف؟ لا يمكن التراجع عن هذا الإجراء.</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'جاري الحذف...' : 'حذف'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
