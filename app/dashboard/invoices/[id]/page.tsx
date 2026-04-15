'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
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
import { PAYMENT_METHOD_LABELS } from '@/lib/constants/statuses';
import Link from 'next/link';

// ... (Invoice interface + constants remain in original or separate file)

export default function InvoiceDetailPage() {
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
        setError(json.error || 'فشل في تحميل الفاتورة');
        return;
      }
      setInvoice(json.data);
    } catch {
      setError('حدث خطأ في الاتصال');
    } finally {
      setLoading(false);
    }
  }, [id]);

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
      await fetch(`/api/invoices/${id}`, {
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
      toast.success('تم حفظ التعديلات');
      setEditing(false);
      fetchInvoice();
    } catch {
      toast.error('حدث خطأ');
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
        toast.error(json.error || 'فشل في إرسال الفاتورة');
        return;
      }
      toast.success('تم إرسال الفاتورة بنجاح');
      fetchInvoice();
    } catch {
      toast.error('حدث خطأ');
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
        toast.error(json.error || 'فشل في حذف الفاتورة');
        return;
      }
      toast.success('تم حذف الفاتورة');
      router.push('/dashboard/invoices');
    } catch {
      toast.error('حدث خطأ');
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
        toast.error(json.error || 'فشل في إنشاء رابط الدفع');
        return;
      }
      if (json.data?.url) {
        navigator.clipboard.writeText(json.data.url);
        toast.success('تم نسخ رابط الدفع');
      }
    } catch {
      toast.error('حدث خطأ');
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
      toast.error('المبلغ يجب أن يكون أكبر من صفر');
      return;
    }
    if (amount > invoice.amount_due) {
      toast.error(`المبلغ يتجاوز المستحق (${invoice.amount_due} ${invoice.currency})`);
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
        toast.error(json.error || 'فشل في تسجيل الدفعة');
        return;
      }
      toast.success('تم تسجيل الدفعة بنجاح');
      setShowPayment(false);
      resetPaymentForm();
      fetchInvoice();
    } catch {
      toast.error('حدث خطأ أثناء تسجيل الدفعة');
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
        status={{ label: invoice.status, color: '' }}
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
            <DialogTitle>تسجيل دفعة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            {/* Amount */}
            <div className="space-y-2">
              <Label htmlFor="pay-amount">المبلغ <span className="text-red-500">*</span></Label>
              <div className="relative">
                <Input
                  id="pay-amount"
                  type="number"
                  dir="ltr"
                  value={payAmount}
                  onChange={e => setPayAmount(e.target.value)}
                  placeholder={`المستحق: ${invoice?.amount_due || 0}`}
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
                  دفع كامل المبلغ ({invoice.amount_due} {invoice.currency})
                </button>
              )}
            </div>

            {/* Payment Date */}
            <div className="space-y-2">
              <Label htmlFor="pay-date">تاريخ الدفع <span className="text-red-500">*</span></Label>
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
              <Label>طريقة الدفع</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Reference */}
            <div className="space-y-2">
              <Label htmlFor="pay-ref">رقم المرجع</Label>
              <Input
                id="pay-ref"
                dir="ltr"
                value={payReference}
                onChange={e => setPayReference(e.target.value)}
                placeholder="رقم التحويل أو الشيك"
              />
            </div>

            {/* Notes */}
            <div className="space-y-2">
              <Label htmlFor="pay-notes">ملاحظات</Label>
              <Textarea
                id="pay-notes"
                value={payNotes}
                onChange={e => setPayNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                rows={2}
              />
            </div>

            {/* Submit */}
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => { setShowPayment(false); resetPaymentForm(); }}>
                إلغاء
              </Button>
              <Button
                onClick={handleRecordPayment}
                disabled={recordingPayment || !payAmount || parseFloat(payAmount) <= 0}
                className="bg-orange-500 hover:bg-orange-600 text-white gap-2"
              >
                {recordingPayment && <Loader2 className="h-4 w-4 animate-spin" />}
                تسجيل الدفعة
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.
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
