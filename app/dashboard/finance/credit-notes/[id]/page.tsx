'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { ArrowRight, FileCheck, Send, Trash2, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { CREDIT_NOTE_STATUS_LABELS } from '@/lib/constants/statuses';
import { getStatusBadgeClass } from '@/lib/constants/badge-colors';

interface CreditNoteItem { id: string; description: string; quantity: number; rate: number; amount: number; }

interface CreditNote {
  id: string;
  credit_note_number: string;
  invoice_id: string | null;
  client_id: string | null;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
  client_phone: string | null;
  reason: string;
  status: string;
  issue_date: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  applied_amount: number;
  notes: string | null;
  company_name: string | null;
  created_by: string | null;
  created_at: string;
  items: CreditNoteItem[];
}

const STATUS_MAP: Record<string, { label: string }> = {
  draft:     { label: CREDIT_NOTE_STATUS_LABELS.draft },
  issued:    { label: CREDIT_NOTE_STATUS_LABELS.issued },
  applied:   { label: CREDIT_NOTE_STATUS_LABELS.applied },
  cancelled: { label: CREDIT_NOTE_STATUS_LABELS.cancelled },
};

export default function CreditNoteDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [cn, setCn] = useState<CreditNote | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  useEffect(() => {
    fetch(`/api/dashboard/credit-notes/${id}`)
      .then(r => r.json())
      .then(json => { if (json.data) setCn(json.data); })
      .catch(() => toast.error('فشل في تحميل الإشعار الدائن'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleStatusChange = async (status: string) => {
    setActionLoading(status);
    try {
      const res = await fetch(`/api/dashboard/credit-notes/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'حدث خطأ'); return; }
      setCn(prev => prev ? { ...prev, status } : prev);
      toast.success(status === 'issued' ? 'تم إصدار الإشعار' : 'تم إلغاء الإشعار');
    } catch { toast.error('حدث خطأ'); }
    finally { setActionLoading(''); }
  };

  const handleApply = async () => {
    setActionLoading('apply');
    try {
      const res = await fetch(`/api/dashboard/credit-notes/${id}/apply`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'حدث خطأ'); return; }
      setCn(prev => prev ? { ...prev, status: 'applied', applied_amount: json.data?.applied_amount || prev.total } : prev);
      toast.success(`تم تطبيق الإشعار الدائن — ${formatCurrency(json.data?.applied_amount || 0)}`);
    } catch { toast.error('حدث خطأ'); }
    finally { setActionLoading(''); }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/dashboard/credit-notes/${id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error('فشل في الحذف'); return; }
      toast.success('تم حذف الإشعار الدائن');
      router.push('/dashboard/finance/credit-notes');
    } catch { toast.error('حدث خطأ'); }
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );

  if (!cn) return <p className="text-center text-muted-foreground mt-20">الإشعار الدائن غير موجود</p>;

  const st = STATUS_MAP[cn.status] || STATUS_MAP.draft;

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance/credit-notes">
            <Button variant="ghost" size="icon" aria-label="رجوع"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold" dir="ltr">{cn.credit_note_number}</h1>
              <Badge className={getStatusBadgeClass(cn.status)}>{st.label}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{cn.reason}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {cn.status === 'draft' && (
            <>
              <Button variant="outline" onClick={() => handleStatusChange('issued')} disabled={!!actionLoading}>
                {actionLoading === 'issued' ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Send className="h-4 w-4 me-2" />}
                إصدار
              </Button>
              <Button variant="destructive" size="icon" aria-label="حذف إشعار الدائن" onClick={() => setShowDeleteDialog(true)}><Trash2 className="h-4 w-4" /></Button>
            </>
          )}
          {cn.status === 'issued' && cn.invoice_id && (
            <Button className="bg-green-600 hover:bg-green-700" onClick={handleApply} disabled={!!actionLoading}>
              {actionLoading === 'apply' ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <CheckCircle className="h-4 w-4 me-2" />}
              تطبيق على الفاتورة
            </Button>
          )}
          {cn.status === 'issued' && (
            <Button variant="outline" className="text-red-600 dark:text-red-400" onClick={() => handleStatusChange('cancelled')} disabled={!!actionLoading}>
              <XCircle className="h-4 w-4 me-2" /> إلغاء
            </Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">العميل</p>
          <p className="font-bold mt-1">{cn.client_name || '—'}</p>
          {cn.client_company && <p className="text-xs text-muted-foreground">{cn.client_company}</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">تاريخ الإصدار</p>
          <p className="font-bold mt-1">{formatDate(cn.issue_date)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">الفاتورة المرتبطة</p>
          {cn.invoice_id ? (
            <Link href={`/dashboard/invoices/${cn.invoice_id}`} className="font-bold mt-1 text-orange-600 hover:underline block">
              عرض الفاتورة
            </Link>
          ) : <p className="font-bold mt-1 text-muted-foreground">—</p>}
        </CardContent></Card>
      </div>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle>بنود الإشعار الدائن</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-start py-2 pe-4">#</th>
                  <th className="text-start py-2 pe-4">الوصف</th>
                  <th className="text-start py-2 pe-4">الكمية</th>
                  <th className="text-start py-2 pe-4">السعر</th>
                  <th className="text-end py-2">المبلغ</th>
                </tr>
              </thead>
              <tbody>
                {cn.items.map((item, i) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 pe-4 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pe-4 font-medium">{item.description}</td>
                    <td className="py-2 pe-4">{item.quantity}</td>
                    <td className="py-2 pe-4 font-mono">{formatCurrency(item.rate, cn.currency)}</td>
                    <td className="py-2 text-end font-mono">{formatCurrency(item.amount, cn.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t mt-2 pt-4 space-y-2 max-w-xs ms-auto">
            <div className="flex justify-between text-sm">
              <span>المجموع الفرعي</span>
              <span className="font-mono">{formatCurrency(cn.subtotal, cn.currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>ضريبة ({cn.tax_rate}%)</span>
              <span className="font-mono">{formatCurrency(cn.tax_amount, cn.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>الإجمالي</span>
              <span className="font-mono">{formatCurrency(cn.total, cn.currency)}</span>
            </div>
            {cn.applied_amount > 0 && (
              <div className="flex justify-between text-sm text-green-600 dark:text-green-400">
                <span>المبلغ المطبق</span>
                <span className="font-mono">{formatCurrency(cn.applied_amount, cn.currency)}</span>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {cn.notes && (
        <Card>
          <CardHeader><CardTitle>ملاحظات</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{cn.notes}</p></CardContent>
        </Card>
      )}

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذا الإشعار الدائن؟ لا يمكن التراجع عن هذا الإجراء.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
