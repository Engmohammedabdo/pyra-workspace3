'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { ArrowRight, Plus, Pencil, Trash2, Tag } from 'lucide-react';
import { toast } from 'sonner';

interface Category {
  id: string;
  name: string;
  name_ar: string | null;
  icon: string | null;
  color: string | null;
  is_default: boolean;
  sort_order: number;
}

export default function ExpenseCategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', name_ar: '', icon: '', color: '#6b7280' });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/expenses/categories');
      const json = await res.json();
      if (json.data) setCategories(json.data);
    } catch {
      toast.error('فشل في تحميل التصنيفات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCategories(); }, [fetchCategories]);

  const openNew = () => {
    setEditingId(null);
    setForm({ name: '', name_ar: '', icon: '', color: '#6b7280' });
    setDialogOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditingId(cat.id);
    setForm({ name: cat.name, name_ar: cat.name_ar || '', icon: cat.icon || '', color: cat.color || '#6b7280' });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name) { toast.error('اسم التصنيف مطلوب'); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/finance/expenses/categories/${editingId}` : '/api/finance/expenses/categories';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      if (res.ok) {
        toast.success(editingId ? 'تم التحديث' : 'تم الإضافة');
        setDialogOpen(false);
        fetchCategories();
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
    try {
      const res = await fetch(`/api/finance/expenses/categories/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('تم الحذف');
        setDeleteId(null);
        fetchCategories();
      } else {
        const json = await res.json();
        toast.error(json.error || 'فشل في الحذف');
      }
    } catch {
      toast.error('فشل في الحذف');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance/expenses">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Tag className="h-6 w-6" /> تصنيفات المصاريف
          </h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 ml-2" /> إضافة تصنيف</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-start p-3 font-medium">اللون</th>
                  <th className="text-start p-3 font-medium">الاسم (EN)</th>
                  <th className="text-start p-3 font-medium">الاسم (AR)</th>
                  <th className="text-start p-3 font-medium">افتراضي</th>
                  <th className="text-start p-3 font-medium">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="border-b">{Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
                  ))}</tr>
                )) : categories.map(cat => (
                  <tr key={cat.id} className="border-b hover:bg-muted/30 transition-colors">
                    <td className="p-3">
                      <div className="h-6 w-6 rounded-full" style={{ backgroundColor: cat.color || '#6b7280' }} />
                    </td>
                    <td className="p-3 font-medium">{cat.name}</td>
                    <td className="p-3">{cat.name_ar || '—'}</td>
                    <td className="p-3">{cat.is_default ? 'نعم' : 'لا'}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(cat)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {!cat.is_default && (
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeleteId(cat.id)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingId ? 'تعديل التصنيف' : 'إضافة تصنيف'}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>الاسم (English) *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>الاسم (عربي)</Label><Input value={form.name_ar} onChange={e => setForm(f => ({ ...f, name_ar: e.target.value }))} /></div>
            <div className="space-y-2"><Label>اللون</Label><Input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="h-10 w-20" /></div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)}>إلغاء</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? 'جاري الحفظ...' : 'حفظ'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>حذف التصنيف</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">هل أنت متأكد من حذف هذا التصنيف؟</p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setDeleteId(null)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete}>حذف</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
