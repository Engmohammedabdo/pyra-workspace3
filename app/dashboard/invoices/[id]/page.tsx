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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileText } from 'lucide-react';
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
        onSend={() => {}}
        onDownload={() => generateInvoicePDF(invoice)}
        onDelete={() => {}}
        onRecordPayment={() => setShowPayment(true)}
        onGeneratePaymentLink={() => {}}
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
          currency={invoice.currency} defaultClientName={invoice.client_name}
          updateItem={updateEditItem} addItem={addEditItem} removeItem={removeEditItem}
          onSave={handleSaveEdit} onCancel={() => setEditing(false)} saving={savingEdit}
        />
      ) : (
        <PaymentHistory payments={invoice.payments} currency={invoice.currency} />
      )}
      {/* Add dialogs etc */}
    </div>
  );
}
