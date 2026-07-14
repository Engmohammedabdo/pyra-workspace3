'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { generateInvoicePDF } from '@/lib/pdf/invoice-pdf';
import { InvoiceHeader } from '@/components/dashboard/invoice-detail/InvoiceHeader';
import { ClientInfo } from '@/components/dashboard/invoice-detail/ClientInfo';
import { EditItems } from '@/components/dashboard/invoice-detail/EditItems';
import { PaymentHistory } from '@/components/dashboard/invoice-detail/PaymentHistory';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { FileText, Loader2 } from 'lucide-react';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { PAYMENT_METHOD } from '@/lib/constants/statuses';
import Link from 'next/link';

// ... (Invoice interface + constants remain in original or separate file)

export default function InvoiceDetailPage() {
  const t = useTranslations('finance.invoices.detail');
  const paymentMethodLabelFor = useStatusLabels('paymentMethod');
  const statusLabelFor = useStatusLabels('invoice');
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  const [invoice, setInvoice] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<any[]>([]);
  const [editProjectName, setEditProjectName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editVatRate, setEditVatRate] = useState(0);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editDiscountType, setEditDiscountType] = useState<string | null>(null);
  const [editDiscountValue, setEditDiscountValue] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [sending, setSending] = useState(false);
  const [generatingLink, setGeneratingLink] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState('bank_transfer');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const fetchInvoice = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices/${id}`);
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || t('toasts.loadFailed'));
        return;
      }
      setInvoice(json.data);
    } catch {
      setError(t('toasts.connectionError'));
    } finally {
      setLoading(false);
    }
  }, [id, t]);

  useEffect(() => { fetchInvoice(); }, [fetchInvoice]);

  const startEditing = () => {
    if (!invoice) return;
    setEditItems(invoice.items.map((i: any) => ({ ...i })));
    setEditProjectName(invoice.project_name || '');
    setEditNotes(invoice.notes || '');
    setEditDueDate(invoice.due_date);
    setEditVatRate(invoice.tax_rate);
    setEditDisplayName(invoice.display_client_name || '');
    setEditDiscountType(invoice.discount_type || null);
    setEditDiscountValue(invoice.discount_value ?? 0);
    setEditing(true);
  };

  const updateEditItem = (index: number, field: string, value: any) => {
    setEditItems(prev => prev.map((item, i) => {
      if (i !== index) return item;
      const updated = { ...item, [field]: value };
      if (field === 'quantity' || field === 'rate') {
        updated.amount = (field === 'quantity' ? (value as number) : updated.quantity) *
                         (field === 'rate' ? (value as number) : updated.rate);
      }
      return updated;
    }));
  };

  const addEditItem = () => {
    setEditItems(prev => [...prev, { id: `new-${Date.now()}`, description: '', quantity: 1, rate: 0, amount: 0, sort_order: prev.length + 1 }]);
  };

  const removeEditItem = (index: number) => {
    if (editItems.length <= 1) return;
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    setSavingEdit(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: editProjectName || null,
          notes: editNotes || null,
          due_date: editDueDate,
          tax_rate: editVatRate,
          display_client_name: editDisplayName.trim() || null,
          discount_type: editDiscountType,
          discount_value: editDiscountValue,
          items: editItems.filter(i => i.description.trim()).map(i => ({ description: i.description.trim(), quantity: i.quantity, rate: i.rate })),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.error) {
        toast.error(json.error || t('toasts.saveFailed'));
        return;
      }
      toast.success(t('toasts.saveSuccess'));
      setEditing(false);
      fetchInvoice();
    } catch {
      toast.error(t('toasts.unexpectedError'));
    } finally {
      setSavingEdit(false);
    }
  };

  const handleSend = async () => {
    if (!invoice) return;
    setSending(true);
    try {
      const res = await fetch(`/api/invoices/${id}/send`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || t('toasts.sendFailed'));
        return;
      }
      toast.success(t('toasts.sendSuccess'));
      fetchInvoice();
    } catch {
      toast.error(t('toasts.unexpectedError'));
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!invoice) return;
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || t('toasts.deleteFailed'));
        return;
      }
      toast.success(t('toasts.deleteSuccess'));
      router.push('/dashboard/invoices');
    } catch {
      toast.error(t('toasts.unexpectedError'));
    }
  };

  const handleGeneratePaymentLink = async () => {
    if (!invoice) return;
    setGeneratingLink(true);
    try {
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invoice_id: id }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || t('toasts.paymentLinkFailed'));
        return;
      }
      if (json.data?.url) {
        navigator.clipboard.writeText(json.data.url);
        toast.success(t('toasts.paymentLinkCopied'));
      }
    } catch {
      toast.error(t('toasts.unexpectedError'));
    } finally {
      setGeneratingLink(false);
    }
  };

  const resetPaymentForm = () => {
    setPayAmount('');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayMethod('bank_transfer');
    setPayReference('');
    setPayNotes('');
  };

  const handleRecordPayment = async () => {
    if (!invoice) return;
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      toast.error(t('toasts.amountMustBePositive'));
      return;
    }
    if (amount > invoice.amount_due) {
      toast.error(t('toasts.amountExceedsDue', { amount: invoice.amount_due, currency: invoice.currency }));
      return;
    }

    setRecordingPayment(true);
    try {
      const res = await fetch(`/api/invoices/${id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount,
          payment_date: payDate,
          method: payMethod,
          reference: payReference || null,
          notes: payNotes || null,
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || t('toasts.paymentFailed'));
        return;
      }
      toast.success(t('toasts.paymentSuccess'));
      setShowPayment(false);
      resetPaymentForm();
      fetchInvoice();
    } catch {
      toast.error(t('toasts.paymentError'));
    } finally {
      setRecordingPayment(false);
    }
  };

  if (loading) return <Skeleton className="h-[400px]" />;
  if (error) return <div>{error}</div>;

  return (
    <div className="space-y-6 max-w-5xl">
      <InvoiceHeader
        invoiceNumber={invoice.invoice_number}
        status={{ label: statusLabelFor(invoice.status) || invoice.status, color: '' }}
        statusKey={invoice.status}
        issueDate={invoice.issue_date}
        dueDate={invoice.due_date}
        isDraft={invoice.status === 'draft'}
        canEdit={['draft', 'sent', 'overdue'].includes(invoice.status)}
        canRecordPayment={['sent', 'partially_paid', 'overdue'].includes(invoice.status)}
        editing={editing}
        sending={sending}
        generatingLink={generatingLink}
        onEdit={startEditing}
        onSend={handleSend}
        onDownload={() => generateInvoicePDF(invoice)}
        onDelete={() => setShowDeleteDialog(true)}
        onRecordPayment={() => setShowPayment(true)}
        onGeneratePaymentLink={handleGeneratePaymentLink}
      />
      <ClientInfo
        name={invoice.client_name}
        company={invoice.client_company}
        email={invoice.client_email}
        phone={invoice.client_phone}
        projectName={invoice.project_name}
        editing={editing}
      />
      {editing ? (
        <EditItems
          items={editItems}
          projectName={editProjectName} setProjectName={setEditProjectName}
          notes={editNotes} setNotes={setEditNotes}
          dueDate={editDueDate} setDueDate={setEditDueDate}
          vatRate={editVatRate} setVatRate={setEditVatRate}
          displayName={editDisplayName} setDisplayName={setEditDisplayName}
          discountType={editDiscountType} setDiscountType={setEditDiscountType}
          discountValue={editDiscountValue} setDiscountValue={setEditDiscountValue}
          currency={invoice.currency} defaultClientName={invoice.client_name}
          updateItem={updateEditItem} addItem={addEditItem} removeItem={removeEditItem}
          onSave={handleSaveEdit} onCancel={() => setEditing(false)} saving={savingEdit}
        />
      ) : (
        <PaymentHistory payments={invoice.payments} currency={invoice.currency} />
      )}
      {/* Payment Recording Dialog */}
      <Dialog open={showPayment} onOpenChange={open => { if (!open) { setShowPayment(false); resetPaymentForm(); } }}>
        <DialogContent className="sm:max-w-[480px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('paymentDialog.title')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="pay-amount">{t('paymentDialog.amountLabel')} <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  id="pay-amount"
                  type="number"
                  dir="ltr"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder={t('paymentDialog.amountPlaceholder', { amount: invoice?.amount_due || 0 })}
                  min={0}
                  max={invoice?.amount_due}
                  step={0.01}
                />
                <span className="absolute end-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  {invoice?.currency || 'AED'}
                </span>
              </div>
              {invoice?.amount_due > 0 && (
                <button
                  type="button"
                  onClick={() => setPayAmount(String(invoice.amount_due))}
                  className="text-xs text-orange-600 hover:underline"
                >
                  {t('paymentDialog.payFullAmount', { amount: invoice.amount_due, currency: invoice.currency })}
                </button>
              )}
            </div>

            {/* Payment Date */}
            <div className="space-y-2">
              <Label htmlFor="pay-date">{t('paymentDialog.dateLabel')} <span className="text-red-500">*</span></Label>
              <Input
                id="pay-date"
                type="date"
                dir="ltr"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
              />
            </div>

            {/* Payment Method */}
            <div className="space-y-2">
              <Label>{t('paymentDialog.methodLabel')}</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(PAYMENT_METHOD).map((value) => (
                    <SelectItem key={value} value={value}>{paymentMethodLabelFor(value)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reference */}
            <div className="space-y-2">
              <Label htmlFor="pay-ref">{t('paymentDialog.referenceLabel')}</Label>
              <Input
                id="pay-ref"
                dir="ltr"
                value={payReference}
                onChange={e => setPayReference(e.target.value)}
                placeholder={t('paymentDialog.referencePlaceholder')}
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="pay-notes">{t('paymentDialog.notesLabel')}</Label>
              <Textarea
                id="pay-notes"
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                placeholder={t('paymentDialog.notesPlaceholder')}
                rows={2}
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowPayment(false); resetPaymentForm(); }}>
                {t('paymentDialog.cancel')}
              </Button>
              <Button
                onClick={handleRecordPayment}
                disabled={recordingPayment || !payAmount || parseFloat(payAmount) <= 0}
                className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
              >
                {recordingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
                {t('paymentDialog.submit')}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

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
