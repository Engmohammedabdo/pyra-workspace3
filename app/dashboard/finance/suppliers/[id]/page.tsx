'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ArrowRight, Truck, Edit2, Save, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SupplierInfo } from '@/components/dashboard/supplier-detail/SupplierInfo';
import { LinkedExpenses } from '@/components/dashboard/supplier-detail/LinkedExpenses';
import { SupplierEditForm } from '@/components/dashboard/supplier-detail/SupplierEditForm';

export default function SupplierDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [supplier, setSupplier] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);

  useEffect(() => {
    fetch(`/api/dashboard/suppliers/${id}`)
      .then(r => r.json())
      .then(json => { if (json.data) { setSupplier(json.data); setForm(json.data); } })
      .finally(() => setLoading(false));

    fetch(`/api/dashboard/suppliers/${id}/expenses`)
      .then(r => r.json())
      .then(json => { if (json.data) { setExpenses(json.data); setExpensesTotal(json.meta?.total_amount ?? 0); } });
  }, [id]);

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error('اسم المورد مطلوب'); return; }
    setSaving(true);
    const res = await fetch(`/api/dashboard/suppliers/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    if (res.ok) {
      const json = await res.json();
      setSupplier(json.data);
      setForm(json.data);
      setEditing(false);
      toast.success('تم تحديث البيانات');
    } else { toast.error('خطأ في الحفظ'); }
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!confirm('هل أنت متأكد؟')) return;
    const res = await fetch(`/api/dashboard/suppliers/${id}`, { method: 'DELETE' });
    if (res.ok) { router.push('/dashboard/finance/suppliers'); toast.success('تم الحذف'); }
    else { toast.error('خطأ في الحذف'); }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (!supplier) return <p className="text-center text-muted-foreground mt-20">المورد غير موجود</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance/suppliers"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              <h1 className="text-2xl font-bold">{supplier.name}</h1>
              <Badge className={supplier.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100'}>{supplier.is_active ? 'نشط' : 'غير نشط'}</Badge>
            </div>
            {supplier.company && <p className="text-sm text-muted-foreground">{supplier.company}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}><Edit2 className="h-4 w-4 me-2" /> تعديل</Button>
              <Button variant="destructive" size="icon" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setForm(supplier); }}>إلغاء</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save className="h-4 w-4 me-2" />} حفظ</Button>
            </>
          )}
        </div>
      </div>

      {editing ? <SupplierEditForm form={form} setForm={setForm} /> : (
        <>
          <SupplierInfo supplier={supplier} />
          <LinkedExpenses expenses={expenses} total={expensesTotal} />
        </>
      )}
    </div>
  );
}
