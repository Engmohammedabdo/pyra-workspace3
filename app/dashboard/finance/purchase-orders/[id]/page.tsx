'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { getStatusBadgeClass } from '@/lib/constants/badge-colors';
import {
  ArrowRight, ShoppingCart, Send, PackageCheck, Truck as TruckIcon,
  FileText, XCircle, Trash2, Loader2,
} from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';

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

export default function PurchaseOrderDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('finance.purchaseOrders.detail');
  const locale = useLocale() as Locale;
  const statusLabelFor = useStatusLabels('po');
  const [po, setPo] = useState<PurchaseOrder | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const STATUS_ACTIONS: Record<string, { nextStatus: string; label: string; icon: React.ElementType; className?: string }[]> = {
    draft: [
      { nextStatus: 'sent', label: t('actions.sendToSupplier'), icon: Send },
      { nextStatus: 'cancelled', label: t('actions.cancel'), icon: XCircle, className: 'text-red-600 dark:text-red-400' },
    ],
    sent: [
      { nextStatus: 'acknowledged', label: t('actions.confirmReceipt'), icon: PackageCheck },
      { nextStatus: 'cancelled', label: t('actions.cancel'), icon: XCircle, className: 'text-red-600 dark:text-red-400' },
    ],
    acknowledged: [
      { nextStatus: 'received', label: t('actions.received'), icon: TruckIcon, className: 'bg-green-600 hover:bg-green-700 text-white' },
      { nextStatus: 'cancelled', label: t('actions.cancel'), icon: XCircle, className: 'text-red-600 dark:text-red-400' },
    ],
    received: [
      { nextStatus: 'invoiced', label: t('actions.invoiced'), icon: FileText, className: 'bg-emerald-600 hover:bg-emerald-700 text-white' },
    ],
  };

  useEffect(() => {
    fetch(`/api/dashboard/purchase-orders/${id}`)
      .then(r => r.json())
      .then(json => { if (json.data) setPo(json.data); })
      .catch(() => toast.error(t('toasts.loadFailed')))
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      if (!res.ok) { toast.error(json.error || t('toasts.unexpectedError')); return; }
      setPo(prev => prev ? { ...prev, status } : prev);
      toast.success(t('toasts.statusUpdateSuccess'));
    } catch { toast.error(t('toasts.unexpectedError')); }
    finally { setActionLoading(''); }
  };

  const handleDelete = async () => {
    try {
      const res = await fetch(`/api/dashboard/purchase-orders/${id}`, { method: 'DELETE' });
      if (!res.ok) { toast.error(t('toasts.deleteFailed')); return; }
      toast.success(t('toasts.deleteSuccess'));
      router.push('/dashboard/finance/purchase-orders');
    } catch { toast.error(t('toasts.unexpectedError')); }
  };

  if (loading) return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-64 rounded-xl" />
    </div>
  );

  if (!po) return <p className="text-center text-muted-foreground mt-20">{t('notFound')}</p>;

  const actions = STATUS_ACTIONS[po.status] || [];

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/finance/purchase-orders">
            <Button variant="ghost" size="icon" aria-label={t('back')}><ArrowRight className="h-5 w-5" /></Button>
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold" dir="ltr">{po.po_number}</h1>
              <Badge className={getStatusBadgeClass(po.status)}>{statusLabelFor(po.status) || po.status}</Badge>
            </div>
            {po.supplier_name && <p className="text-sm text-muted-foreground">{po.supplier_name}{po.supplier_company ? t('supplierSuffix', { company: po.supplier_company }) : ''}</p>}
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
            <Button variant="destructive" size="icon" aria-label={t('deleteAria')} onClick={() => setShowDeleteDialog(true)}><Trash2 className="h-4 w-4" /></Button>
          )}
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{t('infoCards.supplier')}</p>
          {po.supplier_id ? (
            <Link href={`/dashboard/finance/suppliers/${po.supplier_id}`} className="font-bold mt-1 text-orange-600 hover:underline block">
              {po.supplier_name || t('infoCards.viewSupplier')}
            </Link>
          ) : <p className="font-bold mt-1 text-muted-foreground">—</p>}
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{t('infoCards.issueDate')}</p>
          <p className="font-bold mt-1">{formatDate(po.issue_date, undefined, locale)}</p>
        </CardContent></Card>
        <Card><CardContent className="p-4">
          <p className="text-sm text-muted-foreground">{t('infoCards.expectedDeliveryDate')}</p>
          <p className="font-bold mt-1">{po.expected_delivery_date ? formatDate(po.expected_delivery_date, undefined, locale) : '—'}</p>
        </CardContent></Card>
      </div>

      {/* Items */}
      <Card>
        <CardHeader><CardTitle>{t('itemsCardTitle')}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground">
                  <th className="text-start py-2 pe-4">{t('columns.index')}</th>
                  <th className="text-start py-2 pe-4">{t('columns.description')}</th>
                  <th className="text-start py-2 pe-4">{t('columns.quantity')}</th>
                  <th className="text-start py-2 pe-4">{t('columns.rate')}</th>
                  <th className="text-end py-2">{t('columns.amount')}</th>
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
              <span>{t('subtotal')}</span>
              <span className="font-mono">{formatCurrency(po.subtotal, po.currency)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>{t('taxLine', { rate: po.tax_rate })}</span>
              <span className="font-mono">{formatCurrency(po.tax_amount, po.currency)}</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t pt-2">
              <span>{t('total')}</span>
              <span className="font-mono">{formatCurrency(po.total, po.currency)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Notes */}
      {po.notes && (
        <Card>
          <CardHeader><CardTitle>{t('notesTitle')}</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-muted-foreground whitespace-pre-wrap">{po.notes}</p></CardContent>
        </Card>
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
