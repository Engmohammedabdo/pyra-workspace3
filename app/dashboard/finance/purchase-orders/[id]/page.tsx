'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowRight, ShoppingCart, Send, PackageCheck, Truck as TruckIcon,
  FileText, XCircle, Trash2, Loader2,
} from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';

interface POItem { id: string; description: string; quantity: number; rate: number; amount: number; }

interface PurchaseOrder {
  id: string;
  po_number: string;
  supplier_id: string | null;
  supplier_name: string | null;
  supplier_company: string | null;
  supplier_email: string | null;
  project_id: string | null;
  status: string;
  issue_date: string;
  expected_delivery_date: string | null;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  created_at: string;
  items: POItem[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:        { label: 'مسودة',  color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  sent:         { label: 'مُرسل',  color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  acknowledged: { label: 'مؤكد',   color: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300' },
  received:     { label: 'مستلم',  color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  invoiced:     { label: 'مفوتر',  color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300' },
  cancelled:    { label: 'ملغي',   color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
};

const STATUS_ACTIONS: Record<string, { nextStatus: string; label: string; icon: React.ElementType; className?: string }[]> = {
  draft: [
    { nextStatus: 'sent', label: 'إرسال للمورد', icon: Send },
    { nextStatus: 'cancelled', label: 'إلغاء', icon: XCircle, className: 'text-red-600' },
  ],
  sent: [
    { nextStatus: 'acknowledged', label: 'تأكيد الاستلام', icon: PackageCheck },
    { nextStatus: 'cancelled', label: 'إلغاء', icon: XCircle, className: 'text-red-600' },
  ],
  acknowledged: [
    { nextStatus: 'received', label: 'تم الاستلام', icon: TruckIcon, className: 'bg-green-600 hover:bg-green-700 text-white' },
    { nextStatus: 'cancelled', label: 'إلغاء', icon: XCircle, className: 'text-red-600' },
  ],
  received: [
    { nextStatus: 'invoiced', label: 'تم الفوترة', icon: FileText, className: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
  ],
};

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');

  useEffect(() => {
    fetch(`/api/dashboard/purchase-orders/${id}`)
      .then(r => r.json())
      .then(json => { if (json.data) setPo(json.data); })
      .catch(() => toast.error('فشل في تحميل أمر الشراء'))
      .finally(() => setLoading(false));
  }, [id]);

  const handleStatusChange = async (status: string) => {
    setActionLoading(status);
    try {
      const res = await fetch(`/api/dashboard/purchase-orders/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const json = await res.json();
      if (!res.ok) { toast.error(json.error || 'حدث خطأ'); return; }
      setPo(prev => prev ? { ...prev, status } : prev);
      toast.success('تم تحديث الحالة');
    } catch { toast.error('حدث خطأ'); }
    finally { setActionLoading(''); }
  };

  const handleDelete = async () => {
    if (!confirm('هل أنت متأكد من حذف أمر الشراء هذا؟')) return;
    try {
      const res = await fetch(`/api/dashboard/purchase-orders/${id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error('فشل في الحذف'); return; }
      toast.success('تم حذف أمر الشراء');
      router.push('/dashboard/finance/purchase-orders');
    } catch { toast.error('حدث خطأ'); }
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );

  if (!po) return <p className="text-center text-muted-foreground mt-20">أمر الشراء غير موجود</p>;

  const st = STATUS_MAP[po.status] || STATUS_MAP.draft;
  const actions = STATUS_ACTIONS[po.status] || [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance/purchase-orders">
            <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold" dir="ltr">{po.po_number}</h1>
              <Badge className={st.color}>{st.label}</Badge>
            </div>
            {po.supplier_name && <p className="text-sm text-muted-foreground">{po.supplier_name}{po.supplier_company ? ` — ${po.supplier_company}` : ''}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {actions.map(action => {
            const Icon = action.icon;
            return (
              <Button
                key={action.nextStatus}
                variant={action.className?.includes('text-red') ? 'outline' : 'default'}
                className={action.className}
                onClick={() => handleStatusChange(action.nextStatus)}
                disabled={!!actionLoading}
              >
                {actionLoading === action.nextStatus
                  ? <Loader2 className="h-4 w-4 me-2 animate-spin" />
                  : <Icon className="h-4 w-4 me-2" />
                }
                {action.label}
              </Button>
            );
          })}
          {po.status === 'draft' && (
            <Button variant="destructive" size="icon" onClick={handleDelete}><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">المورد</p>
          {po.supplier_id ? (
            <Link href={`/dashboard/finance/suppliers/${po.supplier_id}`} className="font-bold mt-1 text-orange-600 hover:underline block">
              {po.supplier_name || 'عرض المورد'}
            </Link>
          ) : <p className="font-bold mt-1 text-muted-foreground">—</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">تاريخ الإصدار</p>
          <p className="font-bold mt-1">{formatDate(po.issue_date)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">تاريخ التسليم المتوقع</p>
          <p className="font-bold mt-1">{po.expected_delivery_date ? formatDate(po.expected_delivery_date) : '—'}</p>
        </CardContent></Card>
      </div>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle>بنود أمر الشراء</CardTitle></CardHeader>
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
                {po.items.map((item, i) => (
                  <tr key={item.id} className="border-b last:border-0">
                    <td className="py-2 pe-4 text-muted-foreground">{i + 1}</td>
                    <td className="py-2 pe-4 font-medium">{item.description}</td>
                    <td className="py-2 pe-4">{item.quantity}</td>
                    <td className="py-2 pe-4 font-mono">{formatCurrency(item.rate, po.currency)}</td>
                    <td className="py-2 text-end font-mono">{formatCurrency(item.amount, po.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="border-t mt-2 pt-4 space-y-2 max-w-xs ms-auto">
            <div className="flex justify-between text-sm">
              <span>المجموع الفرعي</span>
              <span className="font-mono">{formatCurrency(po.subtotal, po.currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>ضريبة ({po.tax_rate}%)</span>
              <span className="font-mono">{formatCurrency(po.tax_amount, po.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>الإجمالي</span>
              <span className="font-mono">{formatCurrency(po.total, po.currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {po.notes && (
        <Card>
          <CardHeader><CardTitle>ملاحظات</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{po.notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}
