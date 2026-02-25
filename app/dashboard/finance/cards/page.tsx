'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowRight, CreditCard, Plus, Pencil, Trash2, Star } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils/cn';

interface CardItem {
  id: string;
  card_name: string | null;
  bank_name: string | null;
  last_four: string | null;
  card_type: string | null;
  expiry_month: number | null;
  expiry_year: number | null;
  is_default: boolean;
  notes: string | null;
  subscription_count: number;
}

const CARD_TYPES = [
  { value: 'visa', label: 'Visa' },
  { value: 'mastercard', label: 'Mastercard' },
  { value: 'amex', label: 'American Express' },
  { value: 'other', label: 'أخرى' },
];

export default function CardsPage() {
  const [cards, setCards] = useState<CardItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [form, setForm] = useState({
    card_name: '', bank_name: '', last_four: '', card_type: '',
    expiry_month: '', expiry_year: '', is_default: false, notes: '',
  });

  const fetchCards = useCallback(async () => {
    try {
      const res = await fetch('/api/finance/cards');
      const json = await res.json();
      if (json.data) setCards(json.data);
    } catch {
      toast.error('فشل في تحميل البطاقات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCards(); }, [fetchCards]);

  const openNew = () => {
    setEditingId(null);
    setForm({ card_name: '', bank_name: '', last_four: '', card_type: '', expiry_month: '', expiry_year: '', is_default: false, notes: '' });
    setDialogOpen(true);
  };

  const openEdit = (c: CardItem) => {
    setEditingId(c.id);
    setForm({
      card_name: c.card_name || '', bank_name: c.bank_name || '',
      last_four: c.last_four || '', card_type: c.card_type || '',
      expiry_month: c.expiry_month ? String(c.expiry_month) : '',
      expiry_year: c.expiry_year ? String(c.expiry_year) : '',
      is_default: c.is_default, notes: c.notes || '',
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.card_name) { toast.error('اسم البطاقة مطلوب'); return; }
    setSaving(true);
    try {
      const url = editingId ? `/api/finance/cards/${editingId}` : '/api/finance/cards';
      const method = editingId ? 'PATCH' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          expiry_month: form.expiry_month ? Number(form.expiry_month) : null,
          expiry_year: form.expiry_year ? Number(form.expiry_year) : null,
          card_type: form.card_type || null,
        }),
      });
      if (res.ok) {
        toast.success(editingId ? 'تم التحديث' : 'تم إضافة البطاقة');
        setDialogOpen(false);
        fetchCards();
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
      const res = await fetch(`/api/finance/cards/${deleteId}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('تم حذف البطاقة');
        setDeleteId(null);
        fetchCards();
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

  const u = (k: string, v: string | boolean) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="h-6 w-6" /> البطاقات
          </h1>
        </div>
        <Button onClick={openNew}><Plus className="h-4 w-4 ml-2" /> إضافة بطاقة</Button>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : cards.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <CreditCard className="h-12 w-12 mx-auto mb-4 opacity-30" />
            <p>لا توجد بطاقات</p>
            <p className="text-sm mt-1">أضف بطاقة لربطها بالاشتراكات</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cards.map(c => (
            <Card key={c.id} className={cn('relative overflow-hidden', c.is_default && 'ring-2 ring-primary')}>
              <CardContent className="p-6">
                {c.is_default && (
                  <div className="absolute top-3 left-3">
                    <Badge variant="default" className="text-xs"><Star className="h-3 w-3 ml-1" /> افتراضية</Badge>
                  </div>
                )}
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-lg">{c.card_name || 'بطاقة'}</p>
                    <p className="text-sm text-muted-foreground">{c.bank_name || ''}</p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(c)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => setDeleteId(c.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <div className="mt-6 flex items-center justify-between">
                  <p className="font-mono text-xl tracking-wider">
                    •••• •••• •••• {c.last_four || '****'}
                  </p>
                </div>

                <div className="mt-4 flex items-center justify-between text-sm text-muted-foreground">
                  <span>{c.card_type ? c.card_type.toUpperCase() : ''}</span>
                  <span>
                    {c.expiry_month && c.expiry_year
                      ? `${String(c.expiry_month).padStart(2, '0')}/${c.expiry_year}`
                      : ''}
                  </span>
                </div>

                {c.subscription_count > 0 && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground">
                      {c.subscription_count} اشتراك مرتبط
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? 'تعديل البطاقة' : 'إضافة بطاقة'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>اسم البطاقة *</Label>
              <Input value={form.card_name} onChange={e => u('card_name', e.target.value)} placeholder="مثال: بطاقة الشركة" />
            </div>
            <div className="space-y-2">
              <Label>البنك</Label>
              <Input value={form.bank_name} onChange={e => u('bank_name', e.target.value)} placeholder="اسم البنك" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>آخر 4 أرقام</Label>
                <Input value={form.last_four} onChange={e => u('last_four', e.target.value.slice(0, 4))} placeholder="1234" maxLength={4} />
              </div>
              <div className="space-y-2">
                <Label>نوع البطاقة</Label>
                <Select value={form.card_type} onValueChange={v => u('card_type', v === 'none' ? '' : v)}>
                  <SelectTrigger><SelectValue placeholder="اختر" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">غير محدد</SelectItem>
                    {CARD_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>شهر الانتهاء</Label>
                <Input type="number" min="1" max="12" value={form.expiry_month} onChange={e => u('expiry_month', e.target.value)} placeholder="MM" />
              </div>
              <div className="space-y-2">
                <Label>سنة الانتهاء</Label>
                <Input type="number" min="2024" max="2040" value={form.expiry_year} onChange={e => u('expiry_year', e.target.value)} placeholder="YYYY" />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'h-5 w-5 rounded border cursor-pointer flex items-center justify-center',
                  form.is_default ? 'bg-primary border-primary text-primary-foreground' : 'border-input'
                )}
                onClick={() => u('is_default', !form.is_default)}
              >
                {form.is_default && <span className="text-xs">✓</span>}
              </div>
              <Label className="cursor-pointer" onClick={() => u('is_default', !form.is_default)}>بطاقة افتراضية</Label>
            </div>
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
          <DialogHeader><DialogTitle>حذف البطاقة</DialogTitle></DialogHeader>
          <p className="text-muted-foreground">هل أنت متأكد من حذف هذه البطاقة؟</p>
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
