'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  ArrowRight, Send, Download, Trash2, Plus, Save,
  CreditCard, Loader2, FileText, Pencil, X, Activity,
} from 'lucide-react';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { generateInvoicePDF } from '@/lib/pdf/invoice-pdf';

/* ───────────────────────── Types ───────────────────────── */

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  sort_order: number;
}

interface Payment {
  id: string;
  amount: number;
  payment_date: string;
  method: string;
  reference: string | null;
  notes: string | null;
  recorded_by: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  quote_id: string | null;
  client_id: string | null;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
  client_phone: string | null;
  client_address: string | null;
  project_name: string | null;
  status: string;
  issue_date: string;
  due_date: string;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  amount_paid: number;
  amount_due: number;
  notes: string | null;
  terms_conditions: Array<{ text: string }> | null;
  bank_details: { bank: string; account_name: string; account_no: string; iban: string } | null;
  milestone_type: string | null;
  company_name: string | null;
  company_logo: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  items: InvoiceItem[];
  payments: Payment[];
}

/* ───────────────────────── Constants ───────────────────── */

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft:          { label: 'مسودة',        color: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300' },
  sent:           { label: 'مرسلة',        color: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' },
  paid:           { label: 'مدفوعة',       color: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' },
  partially_paid: { label: 'مدفوعة جزئياً', color: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300' },
  overdue:        { label: 'متأخرة',       color: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300' },
  cancelled:      { label: 'ملغية',        color: 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400' },
};

const PAYMENT_METHODS: Record<string, string> = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقدي',
  cheque: 'شيك',
  credit_card: 'بطاقة ائتمان',
  online: 'دفع إلكتروني',
  other: 'أخرى',
};

const MILESTONE_LABELS: Record<string, string> = {
  booking: 'دفعة حجز',
  initial_delivery: 'تسليم أولي',
  final_delivery: 'تسليم نهائي',
};

/* ───────────────────────── Component ──────────────────── */

export default function InvoiceDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;

  /* ── data state ── */
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  /* ── editing state ── */
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<InvoiceItem[]>([]);
  const [editProjectName, setEditProjectName] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  /* ── action states ── */
  const [sending, setSending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  /* ── payment dialog ── */
  const [showPayment, setShowPayment] = useState(false);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [payMethod, setPayMethod] = useState('bank_transfer');
  const [payReference, setPayReference] = useState('');
  const [payNotes, setPayNotes] = useState('');
  const [recordingPayment, setRecordingPayment] = useState(false);

  /* ── fetch invoice ── */
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

  /* ── enter edit mode ── */
  const startEditing = () => {
    if (!invoice) return;
    setEditItems(invoice.items.map(i => ({ ...i })));
    setEditProjectName(invoice.project_name || '');
    setEditNotes(invoice.notes || '');
    setEditDueDate(invoice.due_date);
    setEditing(true);
  };

  /* ── edit item helpers ── */
  const updateEditItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
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
    setEditItems(prev => [...prev, {
      id: `new-${Date.now()}`,
      description: '',
      quantity: 1,
      rate: 0,
      amount: 0,
      sort_order: prev.length + 1,
    }]);
  };

  const removeEditItem = (index: number) => {
    if (editItems.length <= 1) return;
    setEditItems(prev => prev.filter((_, i) => i !== index));
  };

  /* ── save edit ── */
  const handleSaveEdit = async () => {
    const validItems = editItems.filter(i => i.description.trim());
    if (validItems.length === 0) {
      toast.error('يجب إضافة بند واحد على الأقل');
      return;
    }
    if (!editDueDate) {
      toast.error('تاريخ الاستحقاق مطلوب');
      return;
    }

    setSavingEdit(true);
    try {
      const res = await fetch(`/api/invoices/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_name: editProjectName || null,
          notes: editNotes || null,
          due_date: editDueDate,
          items: validItems.map(i => ({
            description: i.description.trim(),
            quantity: i.quantity,
            rate: i.rate,
          })),
        }),
      });

      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || 'فشل في حفظ التعديلات');
        return;
      }

      toast.success('تم حفظ التعديلات');
      setEditing(false);
      fetchInvoice();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setSavingEdit(false);
    }
  };

  /* ── send invoice ── */
  const handleSend = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/invoices/${id}/send`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || json.error) {
        toast.error(json.error || 'فشل في إرسال الفاتورة');
        return;
      }
      toast.success('تم إرسال الفاتورة');
      fetchInvoice();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setSending(false);
    }
  };

  /* ── record payment ── */
  const handleRecordPayment = async () => {
    const amount = parseFloat(payAmount);
    if (!amount || amount <= 0) {
      toast.error('المبلغ يجب أن يكون أكبر من صفر');
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

      toast.success('تم تسجيل الدفعة');
      setShowPayment(false);
      resetPaymentForm();
      fetchInvoice();
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setRecordingPayment(false);
    }
  };

  const resetPaymentForm = () => {
    setPayAmount('');
    setPayDate(new Date().toISOString().split('T')[0]);
    setPayMethod('bank_transfer');
    setPayReference('');
    setPayNotes('');
  };

  /* ── download PDF ── */
  const handleDownloadPDF = async () => {
    if (!invoice) return;
    generateInvoicePDF(invoice);
    toast.success('تم تحميل ملف PDF');
  };

  /* ── delete ── */
  const handleDelete = async () => {
    setDeleting(true);
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
    } finally {
      setDeleting(false);
    }
  };

  /* ──────────────────── Loading State ─────────────────── */
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded" />
          <div className="space-y-2">
            <Skeleton className="h-7 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <Skeleton className="h-[400px]" />
        <Skeleton className="h-[200px]" />
      </div>
    );
  }

  /* ──────────────────── Error State ───────────────────── */
  if (error || !invoice) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/invoices">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <h1 className="text-2xl font-bold">خطأ</h1>
        </div>
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <FileText className="h-12 w-12 mx-auto mb-3 text-muted-foreground/50" />
            <p>{error || 'الفاتورة غير موجودة'}</p>
            <Link href="/dashboard/invoices">
              <Button variant="outline" className="mt-4">العودة للفواتير</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const status = STATUS_MAP[invoice.status] || { label: invoice.status, color: 'bg-gray-100 text-gray-700' };
  const isDraft = invoice.status === 'draft';
  const canRecordPayment = ['sent', 'partially_paid', 'overdue'].includes(invoice.status);

  /* ──────────────────── Edit totals ──────────────────── */
  const editSubtotal = editItems.reduce((sum, i) => sum + (i.quantity * i.rate), 0);
  const editVatAmount = editSubtotal * (invoice.tax_rate / 100);
  const editTotal = editSubtotal + editVatAmount;

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/invoices">
            <Button variant="ghost" size="icon">
              <ArrowRight className="h-5 w-5" />
            </Button>
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold font-mono">{invoice.invoice_number}</h1>
              <Badge variant="outline" className={status.color}>{status.label}</Badge>
              {invoice.milestone_type && (
                <Badge variant="secondary">{MILESTONE_LABELS[invoice.milestone_type] || invoice.milestone_type}</Badge>
              )}
            </div>
            <p className="text-muted-foreground text-sm">
              تاريخ الإصدار: {formatDate(invoice.issue_date)} — الاستحقاق: {formatDate(invoice.due_date)}
            </p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {isDraft && !editing && (
            <Button variant="outline" size="sm" onClick={startEditing}>
              <Pencil className="h-4 w-4 me-1" /> تعديل
            </Button>
          )}
          {isDraft && (
            <Button
              variant="outline"
              size="sm"
              className="text-blue-600"
              onClick={handleSend}
              disabled={sending}
            >
              {sending ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <Send className="h-4 w-4 me-1" />}
              إرسال
            </Button>
          )}
          {canRecordPayment && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700"
              onClick={() => setShowPayment(true)}
            >
              <CreditCard className="h-4 w-4 me-1" /> تسجيل دفعة
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={handleDownloadPDF}>
            <Download className="h-4 w-4 me-1" /> PDF
          </Button>
          {isDraft && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive"
              onClick={() => setShowDelete(true)}
            >
              <Trash2 className="h-4 w-4 me-1" /> حذف
            </Button>
          )}
        </div>
      </div>

      {/* Client Info */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">بيانات العميل</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">الاسم</span>
              <p className="font-medium">{invoice.client_name || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">الشركة</span>
              <p className="font-medium">{invoice.client_company || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">البريد الإلكتروني</span>
              <p className="font-medium">{invoice.client_email || '—'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">الهاتف</span>
              <p className="font-medium">{invoice.client_phone || '—'}</p>
            </div>
          </div>
          {invoice.project_name && !editing && (
            <div className="mt-3 pt-3 border-t text-sm">
              <span className="text-muted-foreground">المشروع: </span>
              <span className="font-medium">{invoice.project_name}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Items — view or edit mode */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">بنود الفاتورة</CardTitle>
          {editing && (
            <Button variant="outline" size="sm" onClick={addEditItem}>
              <Plus className="h-4 w-4 me-1" /> إضافة بند
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {editing ? (
            /* ── Edit Mode ── */
            <div className="space-y-4">
              {/* Project Name */}
              <div className="space-y-2">
                <Label>اسم المشروع</Label>
                <Input
                  value={editProjectName}
                  onChange={e => setEditProjectName(e.target.value)}
                  placeholder="اسم المشروع"
                />
              </div>

              {/* Due Date */}
              <div className="space-y-2">
                <Label>تاريخ الاستحقاق</Label>
                <Input
                  type="date"
                  value={editDueDate}
                  onChange={e => setEditDueDate(e.target.value)}
                />
              </div>

              {/* Items */}
              <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
                <div className="col-span-5">الوصف</div>
                <div className="col-span-2">الكمية</div>
                <div className="col-span-2">السعر</div>
                <div className="col-span-2">المبلغ</div>
                <div className="col-span-1" />
              </div>

              {editItems.map((item, index) => (
                <div key={item.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                  <div className="sm:col-span-5">
                    <Input
                      value={item.description}
                      onChange={e => updateEditItem(index, 'description', e.target.value)}
                      placeholder="وصف البند"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={e => updateEditItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.rate}
                      onChange={e => updateEditItem(index, 'rate', parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  <div className="sm:col-span-2 text-sm font-mono px-2">
                    {formatCurrency(item.quantity * item.rate, invoice.currency)}
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive"
                      disabled={editItems.length <= 1}
                      onClick={() => removeEditItem(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}

              {/* Notes */}
              <div className="space-y-2 pt-2">
                <Label>ملاحظات</Label>
                <Textarea
                  value={editNotes}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setEditNotes(e.target.value)}
                  placeholder="ملاحظات..."
                  rows={3}
                />
              </div>

              {/* Edit Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>المجموع الفرعي</span>
                  <span className="font-mono">{formatCurrency(editSubtotal, invoice.currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>ضريبة القيمة المضافة ({invoice.tax_rate}%)</span>
                  <span className="font-mono">{formatCurrency(editVatAmount, invoice.currency)}</span>
                </div>
                <div className="flex justify-between font-bold border-t pt-2">
                  <span>الإجمالي</span>
                  <span className="font-mono">{formatCurrency(editTotal, invoice.currency)}</span>
                </div>
              </div>

              {/* Edit Actions */}
              <div className="flex items-center gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => setEditing(false)} disabled={savingEdit}>
                  <X className="h-4 w-4 me-1" /> إلغاء
                </Button>
                <Button
                  className="bg-orange-500 hover:bg-orange-600"
                  onClick={handleSaveEdit}
                  disabled={savingEdit}
                >
                  {savingEdit ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <Save className="h-4 w-4 me-1" />}
                  حفظ التعديلات
                </Button>
              </div>
            </div>
          ) : (
            /* ── View Mode ── */
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-start p-3 font-medium">#</th>
                      <th className="text-start p-3 font-medium">الوصف</th>
                      <th className="text-start p-3 font-medium">الكمية</th>
                      <th className="text-start p-3 font-medium">السعر</th>
                      <th className="text-start p-3 font-medium">المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoice.items.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-6 text-center text-muted-foreground">
                          لا توجد بنود
                        </td>
                      </tr>
                    ) : (
                      invoice.items.map((item, index) => (
                        <tr key={item.id} className="border-b">
                          <td className="p-3 text-muted-foreground">{index + 1}</td>
                          <td className="p-3">{item.description}</td>
                          <td className="p-3 font-mono">{item.quantity}</td>
                          <td className="p-3 font-mono">{formatCurrency(item.rate, invoice.currency)}</td>
                          <td className="p-3 font-mono">{formatCurrency(item.amount, invoice.currency)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Totals */}
              <div className="border-t mt-2 pt-4 space-y-2 max-w-xs ms-auto">
                <div className="flex justify-between text-sm">
                  <span>المجموع الفرعي</span>
                  <span className="font-mono">{formatCurrency(invoice.subtotal, invoice.currency)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>ضريبة القيمة المضافة ({invoice.tax_rate}%)</span>
                  <span className="font-mono">{formatCurrency(invoice.tax_amount, invoice.currency)}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t pt-2">
                  <span>الإجمالي</span>
                  <span className="font-mono">{formatCurrency(invoice.total, invoice.currency)}</span>
                </div>
                {invoice.amount_paid > 0 && (
                  <>
                    <div className="flex justify-between text-sm text-green-600">
                      <span>المدفوع</span>
                      <span className="font-mono">{formatCurrency(invoice.amount_paid, invoice.currency)}</span>
                    </div>
                    <div className="flex justify-between text-sm text-orange-600 font-bold">
                      <span>المتبقي</span>
                      <span className="font-mono">{formatCurrency(invoice.amount_due, invoice.currency)}</span>
                    </div>
                  </>
                )}
              </div>

              {/* Notes */}
              {invoice.notes && (
                <div className="border-t mt-4 pt-4 text-sm">
                  <span className="text-muted-foreground">ملاحظات: </span>
                  <p className="mt-1 whitespace-pre-wrap">{invoice.notes}</p>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Payment History */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> سجل المدفوعات
          </CardTitle>
        </CardHeader>
        <CardContent>
          {invoice.payments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد مدفوعات مسجلة</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-start p-3 font-medium">التاريخ</th>
                    <th className="text-start p-3 font-medium">المبلغ</th>
                    <th className="text-start p-3 font-medium">طريقة الدفع</th>
                    <th className="text-start p-3 font-medium">المرجع</th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.payments.map(payment => (
                    <tr key={payment.id} className="border-b">
                      <td className="p-3 text-muted-foreground">{formatDate(payment.payment_date)}</td>
                      <td className="p-3 font-mono text-green-600">{formatCurrency(payment.amount, invoice.currency)}</td>
                      <td className="p-3">{PAYMENT_METHODS[payment.method] || payment.method}</td>
                      <td className="p-3 text-muted-foreground">{payment.reference || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Activity className="h-3.5 w-3.5" />
        <span>أنشئت بواسطة {invoice.created_by || '—'} في {formatDate(invoice.created_at)}</span>
        {invoice.updated_at !== invoice.created_at && (
          <span>— آخر تحديث: {formatDate(invoice.updated_at)}</span>
        )}
      </div>

      {/* Payment Recording Dialog */}
      <Dialog open={showPayment} onOpenChange={open => { if (!open) { setShowPayment(false); resetPaymentForm(); } else { setShowPayment(true); } }}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>تسجيل دفعة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>المبلغ <span className="text-destructive">*</span></Label>
              <Input
                type="number"
                min={0.01}
                step={0.01}
                value={payAmount}
                onChange={e => setPayAmount(e.target.value)}
                placeholder={`الحد الأقصى: ${formatCurrency(invoice.amount_due, invoice.currency)}`}
              />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الدفع</Label>
              <Input
                type="date"
                value={payDate}
                onChange={e => setPayDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>طريقة الدفع</Label>
              <Select value={payMethod} onValueChange={setPayMethod}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PAYMENT_METHODS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>رقم المرجع</Label>
              <Input
                value={payReference}
                onChange={e => setPayReference(e.target.value)}
                placeholder="رقم التحويل أو المرجع"
              />
            </div>
            <div className="space-y-2">
              <Label>ملاحظات</Label>
              <Textarea
                value={payNotes}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setPayNotes(e.target.value)}
                placeholder="ملاحظات إضافية..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowPayment(false); resetPaymentForm(); }}>
              إلغاء
            </Button>
            <Button
              className="bg-green-600 hover:bg-green-700"
              onClick={handleRecordPayment}
              disabled={recordingPayment}
            >
              {recordingPayment ? <Loader2 className="h-4 w-4 me-1 animate-spin" /> : <CreditCard className="h-4 w-4 me-1" />}
              تسجيل الدفعة
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>حذف الفاتورة</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-4">
            هل أنت متأكد من حذف الفاتورة <strong>{invoice.invoice_number}</strong>؟ لا يمكن التراجع عن هذا الإجراء.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>إلغاء</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'جارٍ الحذف...' : 'حذف'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
