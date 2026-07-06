'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowRight, Truck, Edit2, Save, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { SupplierInfo } from '@/components/dashboard/supplier-detail/SupplierInfo';
import { LinkedExpenses } from '@/components/dashboard/supplier-detail/LinkedExpenses';
import { SupplierEditForm } from '@/components/dashboard/supplier-detail/SupplierEditForm';

export default function SupplierDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('finance.suppliers.detail');
  const [supplier, setSupplier] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<any>({});
  const [expenses, setExpenses] = useState<any[]>([]);
  const [expensesTotal, setExpensesTotal] = useState(0);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

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
    if (!form.name?.trim()) { toast.error(t('toasts.nameRequired')); return; }
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
      toast.success(t('toasts.updateSuccess'));
    } else { toast.error(t('toasts.updateFailed')); }
    setSaving(false);
  };

  const handleDelete = async () => {
    const res = await fetch(`/api/dashboard/suppliers/${id}`, { method: 'DELETE' });
    if (res.ok) { router.push('/dashboard/finance/suppliers'); toast.success(t('toasts.deleteSuccess')); }
    else { toast.error(t('toasts.deleteFailed')); }
  };

  if (loading) return <div className="space-y-6"><Skeleton className="h-10 w-64" /><Skeleton className="h-64 rounded-xl" /></div>;
  if (!supplier) return <p className="text-center text-muted-foreground mt-20">{t('notFound')}</p>;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance/suppliers" aria-label={t('backAria')}><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-5 w-5" />
              <h1 className="text-2xl font-bold">{supplier.name}</h1>
              <Badge className={supplier.is_active ? 'bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-300' : 'bg-gray-100 dark:bg-gray-800'}>{supplier.is_active ? t('status.active') : t('status.inactive')}</Badge>
            </div>
            {supplier.company && <p className="text-sm text-muted-foreground">{supplier.company}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!editing ? (
            <>
              <Button variant="outline" onClick={() => setEditing(true)}><Edit2 className="h-4 w-4 me-2" /> {t('edit')}</Button>
              <Button variant="destructive" size="icon" aria-label={t('deleteAria')} onClick={() => setShowDeleteDialog(true)}><Trash2 className="h-4 w-4" /></Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => { setEditing(false); setForm(supplier); }}>{t('cancel')}</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save className="h-4 w-4 me-2" />} {t('save')}</Button>
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

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('deleteDialog.title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('deleteDialog.description')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('deleteDialog.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('deleteDialog.confirmButton')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
