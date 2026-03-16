'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowRight, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';

interface Client { id: string; name: string; company: string | null; }
interface CreditNoteItem { description: string; quantity: number; rate: number; }

export default function NewCreditNotePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invoiceId = searchParams.get('invoice_id') || '';

  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [linkedInvoiceId, setLinkedInvoiceId] = useState(invoiceId);
  const [reason, setReason] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [notes, setNotes] = useState('');
  const [vatRate, setVatRate] = useState(5);
  const [items, setItems] = useState<CreditNoteItem[]>([{ description: '', quantity: 1, rate: 0 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/clients?limit=100')
      .then(r => r.json())
      .then(json => { if (json.data) setClients(json.data); })
      .catch(() => {});

    fetch('/api/settings')
      .then(r => r.json())
      .then(json => {
        if (!json.data) return;
        const rate = parseFloat(json.data.vat_rate);
        if (!isNaN(rate)) setVatRate(rate);
      })
      .catch(() => {});
  }, []);

  // If invoice_id is provided, load invoice details
  useEffect(() => {
    if (!invoiceId) return;
    fetch(`/api/invoices/${invoiceId}`)
      .then(r => r.json())
      .then(json => {
        if (!json.data) return;
        const inv = json.data;
        if (inv.client_id) setClientId(inv.client_id);
        setReason(`مرتجع / تعديل على الفاتورة ${inv.invoice_number}`);
        if (inv.items) {
          setItems(inv.items.map((it: { description: string; quantity: number; rate: number }) => ({
            description: it.description,
            quantity: it.quantity,
            rate: it.rate,
          })));
        }
      })
      .catch(() => {});
  }, [invoiceId]);

  const updateItem = (index: number, field: keyof CreditNoteItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };
  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, rate: 0 }]);
  const removeItem = (index: number) => { if (items.length > 1) setItems(prev => prev.filter((_, i) => i !== index)); };

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  const handleSubmit = async () => {
    if (!reason.trim()) { toast.error('سبب الإشعار الدائن مطلوب'); return; }
    const validItems = items.filter(item => item.description.trim());
    if (validItems.length === 0) { toast.error('يجب إضافة بند واحد على الأقل'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/credit-notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoice_id: linkedInvoiceId || null,
          client_id: clientId || null,
          reason,
          issue_date: issueDate,
          notes: notes || null,
          vat_rate: vatRate,
          items: validItems.map(it => ({ description: it.description.trim(), quantity: it.quantity, rate: it.rate })),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { toast.error(json.error || 'حدث خطأ'); return; }
      toast.success('تم إنشاء الإشعار الدائن');
      router.push(`/dashboard/finance/credit-notes/${json.data?.id}`);
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/credit-notes">
          <Button variant="ghost" size="icon" aria-label="رجوع"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">إشعار دائن جديد</h1>
          <p className="text-muted-foreground">إنشاء إشعار دائن (مرتجع / تعديل)</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>بيانات الإشعار الدائن</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>العميل</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                <SelectContent>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>تاريخ الإصدار</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>رقم الفاتورة المرتبطة (اختياري)</Label>
            <Input
              value={linkedInvoiceId}
              onChange={e => setLinkedInvoiceId(e.target.value)}
              placeholder="معرف الفاتورة"
              dir="ltr"
            />
          </div>

          <div className="space-y-2">
            <Label>السبب <span className="text-destructive">*</span></Label>
            <Textarea value={reason} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setReason(e.target.value)} placeholder="سبب الإشعار الدائن..." rows={2} />
          </div>

          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>بنود الإشعار</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-4 w-4 me-1" /> إضافة بند</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
            <div className="col-span-5">الوصف</div>
            <div className="col-span-2">الكمية</div>
            <div className="col-span-2">السعر</div>
            <div className="col-span-2">المبلغ</div>
            <div className="col-span-1" />
          </div>
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <div className="sm:col-span-5">
                <Input value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} placeholder="وصف البند" />
              </div>
              <div className="sm:col-span-2">
                <Input type="number" min={1} value={item.quantity} onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="sm:col-span-2">
                <Input type="number" min={0} step={0.01} value={item.rate} onChange={e => updateItem(index, 'rate', parseFloat(e.target.value) || 0)} />
              </div>
              <div className="sm:col-span-2 text-sm font-mono px-2">{formatCurrency(item.quantity * item.rate)}</div>
              <div className="sm:col-span-1 flex justify-end">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={items.length <= 1} onClick={() => removeItem(index)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          <div className="border-t pt-4 mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>المجموع الفرعي</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span>ضريبة القيمة المضافة</span>
                <Input type="number" min={0} max={100} step={0.5} value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value) || 0)} className="w-20 h-7 text-xs" />
                <span className="text-muted-foreground">%</span>
              </div>
              <span className="font-mono">{formatCurrency(vatAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t pt-2">
              <span>الإجمالي</span>
              <span className="font-mono">{formatCurrency(total)}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 justify-end">
        <Link href="/dashboard/finance/credit-notes"><Button variant="outline">إلغاء</Button></Link>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
          حفظ
        </Button>
      </div>
    </div>
  );
}
