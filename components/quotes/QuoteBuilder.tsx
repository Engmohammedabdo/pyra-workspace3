'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Plus, Trash2, Save, Send, FileDown, X } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import { generateQuotePdf } from '@/lib/pdf/generateQuotePdf';

interface Client {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string;
}

interface ServiceRow {
  description: string;
  quantity: number;
  rate: number;
}

interface QuoteItem {
  id?: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  sort_order: number;
}

export interface QuoteData {
  id: string;
  quote_number: string;
  client_id: string | null;
  project_name: string | null;
  status: string;
  estimate_date: string;
  expiry_date: string | null;
  currency: string;
  subtotal: number;
  tax_rate: number;
  tax_amount: number;
  total: number;
  notes: string | null;
  terms_conditions: { text: string }[];
  bank_details: { bank: string; account_name: string; account_no: string; iban: string };
  company_name: string | null;
  client_name: string | null;
  client_email: string | null;
  client_company: string | null;
  client_phone: string | null;
  client_address: string | null;
  signature_data: string | null;
  signed_by: string | null;
  signed_at: string | null;
  items: QuoteItem[];
}

interface QuoteBuilderProps {
  quote?: QuoteData;
  onSaved?: (id: string) => void;
  onClose?: () => void;
}

export default function QuoteBuilder({ quote, onSaved, onClose }: QuoteBuilderProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState(quote?.client_id || '');
  const [clientName, setClientName] = useState(quote?.client_name || '');
  const [clientEmail, setClientEmail] = useState(quote?.client_email || '');
  const [clientPhone, setClientPhone] = useState(quote?.client_phone || '');
  const [clientCompany, setClientCompany] = useState(quote?.client_company || '');
  const [clientAddress, setClientAddress] = useState(quote?.client_address || '');
  const [projectName, setProjectName] = useState(quote?.project_name || '');
  const [estimateDate, setEstimateDate] = useState(
    quote?.estimate_date || new Date().toISOString().split('T')[0]
  );
  const [expiryDate, setExpiryDate] = useState(quote?.expiry_date || '');
  const [notes, setNotes] = useState(quote?.notes || '');
  const [services, setServices] = useState<ServiceRow[]>(
    quote?.items?.map(i => ({
      description: i.description,
      quantity: i.quantity,
      rate: i.rate,
    })) || [{ description: '', quantity: 1, rate: 0 }]
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/clients?active=true')
      .then(r => r.json())
      .then(json => { if (json.data) setClients(json.data); })
      .catch(console.error);
  }, []);

  // Set default expiry date
  useEffect(() => {
    if (!expiryDate && estimateDate) {
      const d = new Date(estimateDate);
      d.setDate(d.getDate() + 30);
      setExpiryDate(d.toISOString().split('T')[0]);
    }
  }, [estimateDate, expiryDate]);

  const handleClientSelect = (id: string) => {
    setClientId(id);
    const c = clients.find(cl => cl.id === id);
    if (c) {
      setClientName(c.name);
      setClientEmail(c.email);
      setClientPhone(c.phone || '');
      setClientCompany(c.company);
    }
  };

  const addRow = () => setServices(prev => [...prev, { description: '', quantity: 1, rate: 0 }]);

  const removeRow = (idx: number) => {
    if (services.length <= 1) return;
    setServices(prev => prev.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: keyof ServiceRow, value: string | number) => {
    setServices(prev => prev.map((row, i) => i === idx ? { ...row, [field]: value } : row));
  };

  const subtotal = services.reduce((sum, s) => sum + s.quantity * s.rate, 0);
  const taxRate = quote?.tax_rate ?? 5;
  const taxAmount = subtotal * (taxRate / 100);
  const total = subtotal + taxAmount;

  const fmtNum = (n: number) =>
    new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  const buildPayload = () => ({
    client_id: clientId || null,
    project_name: projectName || null,
    estimate_date: estimateDate,
    expiry_date: expiryDate || null,
    notes: notes || null,
    items: services.map(s => ({
      description: s.description,
      quantity: s.quantity,
      rate: s.rate,
    })),
  });

  const handleSave = async (send = false) => {
    if (services.some(s => !s.description.trim())) {
      toast.error('يرجى تعبئة وصف جميع العناصر');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      let res: Response;

      if (quote?.id) {
        res = await fetch(`/api/quotes/${quote.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      } else {
        res = await fetch('/api/quotes', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (json.error) {
        toast.error(json.error);
        return;
      }

      const savedId = json.data?.id || quote?.id;

      if (send && savedId) {
        await fetch(`/api/quotes/${savedId}/send`, { method: 'POST' });
      }

      onSaved?.(savedId);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handlePdf = () => {
    generateQuotePdf({
      clientName,
      clientEmail,
      clientAddress,
      contactPerson: clientName,
      clientPhone,
      quoteNumber: quote?.quote_number || 'DRAFT',
      estimateDate: formatDate(estimateDate, 'dd-MM-yyyy'),
      expiryDate: expiryDate ? formatDate(expiryDate, 'dd-MM-yyyy') : '',
      projectName,
      services: services.map(s => ({ description: s.description, qty: s.quantity, rate: s.rate })),
      notes,
      currency: 'AED',
      taxRate,
      bankDetails: quote?.bank_details || { bank: '', account_name: '', account_no: '', iban: '' },
      companyName: quote?.company_name || 'PYRAMEDIA X',
      signatureDataUrl: quote?.signature_data || null,
      signedBy: quote?.signed_by || null,
      signedAt: quote?.signed_at ? formatDate(quote.signed_at, 'dd-MM-yyyy') : null,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="max-w-[900px] mx-auto shadow-lg">
        <CardContent className="p-8 space-y-8">
          {/* Company Header */}
          <div className="text-center border-b pb-6">
            <h2 className="text-2xl font-bold text-orange-600">
              {quote?.company_name || 'PYRAMEDIA X'}
            </h2>
            <p className="text-sm text-muted-foreground">FOR AI SOLUTIONS</p>
          </div>

          {/* Client Info */}
          <div>
            <h3 className="text-sm font-semibold mb-3">معلومات العميل</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">العميل</Label>
                <Select value={clientId} onValueChange={handleClientSelect}>
                  <SelectTrigger><SelectValue placeholder="اختر عميل..." /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.name} — {c.company}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">البريد الإلكتروني</Label>
                <Input value={clientEmail} onChange={e => setClientEmail(e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">العنوان</Label>
                <Input value={clientAddress} onChange={e => setClientAddress(e.target.value)} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-3">
              <div className="space-y-1">
                <Label className="text-xs">جهة الاتصال</Label>
                <Input value={clientName} onChange={e => setClientName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">الهاتف</Label>
                <Input value={clientPhone} onChange={e => setClientPhone(e.target.value)} dir="ltr" />
              </div>
              <div />
            </div>
          </div>

          <Separator />

          {/* Quote Details */}
          <div>
            <h3 className="text-sm font-semibold mb-3">تفاصيل العرض</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">رقم العرض</Label>
                <Input value={quote?.quote_number || 'تلقائي'} disabled className="font-mono" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">تاريخ العرض</Label>
                <Input type="date" value={estimateDate} onChange={e => setEstimateDate(e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">تاريخ الانتهاء</Label>
                <Input type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} dir="ltr" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">اسم المشروع</Label>
                <Input value={projectName} onChange={e => setProjectName(e.target.value)} />
              </div>
            </div>
          </div>

          <Separator />

          {/* Services Table */}
          <div>
            <h3 className="text-sm font-semibold mb-3">الخدمات</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-orange-500 text-white">
                    <th className="p-2 text-start w-10">#</th>
                    <th className="p-2 text-start">الوصف</th>
                    <th className="p-2 text-start w-20">الكمية</th>
                    <th className="p-2 text-start w-28">السعر</th>
                    <th className="p-2 text-start w-28">المجموع</th>
                    <th className="p-2 w-10" />
                  </tr>
                </thead>
                <tbody>
                  {services.map((row, idx) => (
                    <tr key={idx} className="border-b">
                      <td className="p-2 text-muted-foreground">{idx + 1}</td>
                      <td className="p-2">
                        <Input
                          value={row.description}
                          onChange={e => updateRow(idx, 'description', e.target.value)}
                          placeholder="وصف الخدمة"
                          className="h-8"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min={1}
                          value={row.quantity}
                          onChange={e => updateRow(idx, 'quantity', parseInt(e.target.value) || 0)}
                          className="h-8"
                          dir="ltr"
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          type="number"
                          min={0}
                          step={0.01}
                          value={row.rate}
                          onChange={e => updateRow(idx, 'rate', parseFloat(e.target.value) || 0)}
                          className="h-8"
                          dir="ltr"
                        />
                      </td>
                      <td className="p-2 font-mono text-end" dir="ltr">
                        {fmtNum(row.quantity * row.rate)}
                      </td>
                      <td className="p-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => removeRow(idx)}
                          disabled={services.length <= 1}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Button variant="outline" size="sm" className="mt-3" onClick={addRow}>
              <Plus className="h-3.5 w-3.5 me-1" /> إضافة عنصر
            </Button>

            {/* Totals */}
            <div className="flex justify-end mt-4">
              <div className="w-64 space-y-2 border rounded-lg p-4">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">المجموع الفرعي</span>
                  <span className="font-mono" dir="ltr">{fmtNum(subtotal)} AED</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">ضريبة القيمة المضافة ({taxRate}%)</span>
                  <span className="font-mono" dir="ltr">{fmtNum(taxAmount)} AED</span>
                </div>
                <Separator />
                <div className="flex justify-between font-bold">
                  <span>الإجمالي</span>
                  <span className="font-mono text-orange-600" dir="ltr">{fmtNum(total)} AED</span>
                </div>
              </div>
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-1">
            <Label className="text-xs">ملاحظات</Label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm resize-none"
              rows={3}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="ملاحظات إضافية أو تعليمات الدفع..."
            />
          </div>

          {/* Signature (read-only if signed) */}
          {quote?.signature_data && (
            <div className="border rounded-lg p-4 bg-muted/30">
              <h3 className="text-sm font-semibold mb-2">التوقيع الإلكتروني</h3>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={quote.signature_data} alt="Signature" className="border bg-white rounded max-w-[300px] h-auto" />
              {quote.signed_by && (
                <p className="text-xs text-muted-foreground mt-2">
                  تم التوقيع بواسطة: {quote.signed_by}
                  {quote.signed_at && ` — ${formatDate(quote.signed_at, 'dd-MM-yyyy')}`}
                </p>
              )}
            </div>
          )}

          {/* Bank Details */}
          {quote?.bank_details?.bank && (
            <div className="bg-muted/50 rounded-lg p-4">
              <h3 className="text-xs font-semibold text-muted-foreground mb-2">البيانات البنكية</h3>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <span>البنك: {quote.bank_details.bank}</span>
                <span>اسم الحساب: {quote.bank_details.account_name}</span>
                <span>رقم الحساب: {quote.bank_details.account_no}</span>
                <span>IBAN: {quote.bank_details.iban}</span>
              </div>
            </div>
          )}

          {/* Terms */}
          <div className="text-[10px] text-muted-foreground">
            <p className="font-semibold mb-1">الشروط والأحكام</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <p>1. Quotation valid for 30 days from the date of issue.</p>
              <p>2. 50% advance payment required to commence work.</p>
              <p>3. Balance payment due upon project completion.</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Toolbar */}
      <div className="max-w-[900px] mx-auto flex items-center justify-between bg-background border rounded-lg p-3 sticky bottom-4 shadow-lg">
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onClose?.()}>
            <X className="h-4 w-4 me-1" /> إغلاق
          </Button>
        </div>
        <div className="flex gap-2">
          {quote?.id && (
            <Button variant="outline" onClick={handlePdf}>
              <FileDown className="h-4 w-4 me-1" /> تحميل PDF
            </Button>
          )}
          <Button variant="outline" onClick={() => handleSave(false)} disabled={saving}>
            <Save className="h-4 w-4 me-1" />
            {saving ? 'جارٍ الحفظ...' : 'حفظ كمسودة'}
          </Button>
          <Button onClick={() => handleSave(true)} disabled={saving} className="bg-orange-500 hover:bg-orange-600">
            <Send className="h-4 w-4 me-1" />
            {saving ? 'جارٍ الإرسال...' : 'حفظ وإرسال'}
          </Button>
        </div>
      </div>
    </div>
  );
}
