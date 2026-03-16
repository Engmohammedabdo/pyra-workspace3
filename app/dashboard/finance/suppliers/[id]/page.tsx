'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  ArrowRight, Truck, Edit2, Save, Loader2, Trash2,
  Mail, Phone, MapPin, Building2, Banknote, ArrowDownCircle,
} from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { EmptyState } from '@/components/ui/empty-state';
import { toast } from 'sonner';

interface Supplier {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_number: string | null;
  payment_terms_days: number;
  currency: string;
  bank_name: string | null;
  bank_account: string | null;
  bank_iban: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface LinkedExpense {
  id: string;
  description: string | null;
  amount: number;
  currency: string;
  expense_date: string | null;
  vendor: string | null;
}

export default function SupplierDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Partial<Supplier>>({});
  const [expenses, setExpenses] = useState<LinkedExpense[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);

  useEffect(() => {
    fetch(`/api/dashboard/suppliers/${id}`)
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          setSupplier(json.data);
          setForm(json.data);
        }
      })
      .catch(() => toast.error('فشل في تحميل بيانات المورد'))
      .finally(() => setLoading(false));

    // Fetch linked expenses
    fetch(`/api/dashboard/suppliers/${id}/expenses`)
      .then(r => r.json())
      .then(json => {
        if (json.data) {
          setExpenses(json.data);
          setExpensesTotal(json.meta?.total_amount ?? 0);
        }
      })
      .catch(() => {});
  }, [id]);

  const handleSave = async () => {
    if (!form.name?.trim()) { toast.error('اسم المورد مطلوب'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/suppliers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'حدث خطأ'); return; }
      setSupplier(json.data);
      setForm(json.data);
      setEditing(false);
      toast.success('تم تحديث بيانات المورد');
    } catch { toast.error('حدث خطأ'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!confirm('هل أنت متأكد من حذف هذا المورد؟')) return;
    try {
      const res = await fetch(`/api/dashboard/suppliers/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'فشل في الحذف'); return; }
      toast.success(json.data?.message || 'تم حذف المورد');
      router.push('/dashboard/finance/suppliers');
    } catch { toast.error('حدث خطأ'); }
  };

  const handleToggleActive = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/dashboard/suppliers/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !supplier?.is_active }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'حدث خطأ'); return; }
      setSupplier(json.data);
      setForm(json.data);
      toast.success(json.data.is_active ? 'تم تفعيل المورد' : 'تم إلغاء تفعيل المورد');
    } catch { toast.error('حدث خطأ'); }
    finally { setSaving(false); }
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );

  if (!supplier) return <p className="text-center text-muted-foreground mt-20">المورد غير موجود</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance/suppliers">
            <Button variant="ghost" size="icon" aria-label="رجوع"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              <h1 className="text-2xl font-bold">{supplier.name}</h1>
              <Badge className={supplier.is_active
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
              }>
                {supplier.is_active ? 'نشط' : 'غير نشط'}
              </Badge>
            </div>
            {supplier.company && <p className="text-sm text-muted-foreground">{supplier.company}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Edit2 className="h-4 w-4 me-2" /> تعديل
              </Button>
              <Button variant="outline" onClick={handleToggleActive} disabled={saving}>
                {supplier.is_active ? 'إلغاء التفعيل' : 'تفعيل'}
              </Button>
              <Button variant="destructive" size="icon" onClick={handleDelete}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setForm(supplier); }}>إلغاء</Button>
              <Button onClick={handleSave} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
                حفظ التغييرات
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Info */}
      {!editing ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card><CardContent className="p-4 space-y-2">
              <p className="text-sm text-muted-foreground">معلومات التواصل</p>
              {supplier.email && <p className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" />{supplier.email}</p>}
              {supplier.phone && <p className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" />{supplier.phone}</p>}
              {supplier.address && <p className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" />{supplier.address}</p>}
              {!supplier.email && !supplier.phone && !supplier.address && <p className="text-sm text-muted-foreground">—</p>}
            </CardContent></Card>
            <Card><CardContent className="p-4 space-y-2">
              <p className="text-sm text-muted-foreground">معلومات مالية</p>
              <p className="text-sm flex items-center gap-2"><Building2 className="h-4 w-4 text-muted-foreground" /> الرقم الضريبي: {supplier.tax_number || '—'}</p>
              <p className="text-sm">شروط الدفع: {supplier.payment_terms_days} يوم</p>
              <p className="text-sm">العملة: {supplier.currency}</p>
            </CardContent></Card>
          </div>

          {(supplier.bank_name || supplier.bank_account || supplier.bank_iban) && (
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Banknote className="h-5 w-5" /> البيانات البنكية</CardTitle></CardHeader>
              <CardContent className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
                <div><p className="text-muted-foreground">البنك</p><p className="font-medium">{supplier.bank_name || '—'}</p></div>
                <div><p className="text-muted-foreground">رقم الحساب</p><p className="font-medium font-mono" dir="ltr">{supplier.bank_account || '—'}</p></div>
                <div><p className="text-muted-foreground">IBAN</p><p className="font-medium font-mono" dir="ltr">{supplier.bank_iban || '—'}</p></div>
              </CardContent>
            </Card>
          )}

          {supplier.notes && (
            <Card>
              <CardHeader><CardTitle>ملاحظات</CardTitle></CardHeader>
              <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{supplier.notes}</p></CardContent>
            </Card>
          )}

          {/* Linked Expenses */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <ArrowDownCircle className="h-5 w-5" />
                المصروفات المرتبطة
                {expenses.length > 0 && (
                  <Badge variant="secondary" className="ms-2">{expenses.length}</Badge>
                )}
              </CardTitle>
              {expensesTotal > 0 && (
                <span className="text-sm font-bold font-mono text-red-600">{formatCurrency(expensesTotal)}</span>
              )}
            </CardHeader>
            <CardContent>
              {expenses.length === 0 ? (
                <EmptyState
                  icon={ArrowDownCircle}
                  title="لا توجد مصروفات"
                  description="لم يتم ربط أي مصروفات بهذا المورد بعد"
                />
              ) : (
                <div className="space-y-2">
                  {expenses.map(exp => (
                    <Link key={exp.id} href={`/dashboard/finance/expenses/${exp.id}`}>
                      <div className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                        <div>
                          <p className="text-sm font-medium">{exp.description || exp.vendor || '—'}</p>
                          <p className="text-xs text-muted-foreground">{exp.expense_date ? formatDate(exp.expense_date) : '—'}</p>
                        </div>
                        <span className="font-mono text-sm font-bold text-red-600">{formatCurrency(exp.amount, exp.currency)}</span>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        /* Edit Mode */
        <>
          <Card>
            <CardHeader><CardTitle>بيانات المورد</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>الاسم <span className="text-destructive">*</span></Label>
                  <Input value={form.name || ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>الشركة</Label>
                  <Input value={form.company || ''} onChange={e => setForm(p => ({ ...p, company: e.target.value }))} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>البريد الإلكتروني</Label>
                  <Input type="email" value={form.email || ''} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>الهاتف</Label>
                  <Input value={form.phone || ''} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} dir="ltr" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>العنوان</Label>
                <Textarea value={form.address || ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(p => ({ ...p, address: e.target.value }))} rows={2} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>الرقم الضريبي</Label>
                  <Input value={form.tax_number || ''} onChange={e => setForm(p => ({ ...p, tax_number: e.target.value }))} dir="ltr" />
                </div>
                <div className="space-y-2">
                  <Label>شروط الدفع (أيام)</Label>
                  <Input type="number" min={0} value={form.payment_terms_days || 0} onChange={e => setForm(p => ({ ...p, payment_terms_days: parseInt(e.target.value) || 0 }))} />
                </div>
                <div className="space-y-2">
                  <Label>العملة</Label>
                  <Input value={form.currency || 'AED'} onChange={e => setForm(p => ({ ...p, currency: e.target.value }))} dir="ltr" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>البيانات البنكية</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>اسم البنك</Label>
                  <Input value={form.bank_name || ''} onChange={e => setForm(p => ({ ...p, bank_name: e.target.value }))} />
                </div>
                <div className="space-y-2">
                  <Label>رقم الحساب</Label>
                  <Input value={form.bank_account || ''} onChange={e => setForm(p => ({ ...p, bank_account: e.target.value }))} dir="ltr" />
                </div>
              </div>
              <div className="space-y-2">
                <Label>IBAN</Label>
                <Input value={form.bank_iban || ''} onChange={e => setForm(p => ({ ...p, bank_iban: e.target.value }))} dir="ltr" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>ملاحظات</CardTitle></CardHeader>
            <CardContent>
              <Textarea value={form.notes || ''} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setForm(p => ({ ...p, notes: e.target.value }))} rows={3} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
