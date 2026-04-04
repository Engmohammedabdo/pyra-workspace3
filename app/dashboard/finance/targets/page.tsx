'use client';

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ArrowRight, Target, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { EmptyState } from '@/components/ui/empty-state';
import { RevenueTargetCard } from '@/components/dashboard/finance-targets/RevenueTargetCard';
import { RevenueTargetForm } from '@/components/dashboard/finance-targets/RevenueTargetForm';

export default function RevenueTargetsPage() {
  const queryClient = useQueryClient();
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

  const { data: targets = [], isLoading: loading } = useQuery<any[]>({
    queryKey: ['revenue-targets'],
    queryFn: () => fetchAPI('/api/finance/revenue-targets'),
  });

  const openNew = () => {
    setEditingId(null);
    setForm({ period_type: '', period_start: '', period_end: '', target_amount: '', currency: 'AED', notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (t: any) => {
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
    if (!form.period_type || !form.period_start || !form.period_end || !form.target_amount) {
      toast.error('يرجى ملء الحقول المطلوبة');
      return;
    }
    setSaving(true);
    try {
      const url = editingId ? `/api/finance/revenue-targets/${editingId}` : '/api/finance/revenue-targets';
      const res = await fetch(url, {
        method: editingId ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, target_amount: Number(form.target_amount) }),
      });
      if (res.ok) {
        toast.success(editingId ? 'تم تحديث الهدف' : 'تم إضافة الهدف');
        setDialogOpen(false);
        queryClient.invalidateQueries({ queryKey: ['revenue-targets'] });
      } else {
        toast.error('فشل في الحفظ');
      }
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
        queryClient.invalidateQueries({ queryKey: ['revenue-targets'] });
      } else {
        toast.error('فشل في الحذف');
      }
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Target className="h-6 w-6" /> أهداف الإيرادات</h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 ms-2" /> إضافة هدف</Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : targets.length === 0 ? (
        <EmptyState icon={Target} title="لا توجد أهداف إيرادات" description="أضف هدفاً لتتبع الإيرادات" actionLabel="إضافة هدف" onAction={openNew} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {targets.map(t => <RevenueTargetCard key={t.id} target={t} onEdit={() => openEdit(t)} onDelete={() => setDeleteId(t.id)} />)}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'تعديل الهدف' : 'إضافة هدف جديد'}</DialogTitle></DialogHeader>
          <RevenueTargetForm form={form} setForm={setForm} onSave={handleSave} onCancel={() => setDialogOpen(false)} saving={saving} editing={!!editingId} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
