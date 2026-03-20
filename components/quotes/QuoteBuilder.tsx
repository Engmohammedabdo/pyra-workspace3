'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Plus, Trash2, Save, Send, FileDown, X, Eye, BookTemplate } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import { generateQuotePDF } from '@/lib/pdf/quote-pdf';

interface QuoteTemplate {
  id: string;
  name: string;
  name_ar: string | null;
  items: { description: string; quantity: number; rate: number }[];
  notes: string | null;
  terms_conditions: { text: string }[];
  currency: string;
  tax_rate: number;
  discount_type: string | null;
  discount_value: number;
}

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
  discount_type?: 'percentage' | 'fixed' | null;
  discount_value?: number;
  discount_amount?: number;
  notes: string | null;
  terms_conditions: { text: string }[];
  bank_details: { bank: string; account_name: string; account_no: string; iban: string };
  company_name: string | null;
  company_logo: string | null;
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
  leadId?: string;
  onSaved?: (id: string) => void;
  onClose?: () => void;
}

const CURRENCIES = [
  { value: 'AED', label: 'AED — درهم إماراتي' },
  { value: 'USD', label: 'USD — دولار أمريكي' },
  { value: 'EUR', label: 'EUR — يورو' },
  { value: 'SAR', label: 'SAR — ريال سعودي' },
  { value: 'GBP', label: 'GBP — جنيه إسترليني' },
];

const DEFAULT_TERMS = [
  { text: 'Quotation valid for 30 days from the date of issue.' },
  { text: '50% advance payment required to commence work.' },
  { text: 'Balance payment due upon project completion.' },
];

export default function QuoteBuilder({ quote, leadId, onSaved, onClose }: QuoteBuilderProps) {
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
  const [vatRate, setVatRate] = useState(quote?.tax_rate ?? 0);
  const [currency, setCurrency] = useState(quote?.currency || 'AED');
  const [discountType, setDiscountType] = useState<string>(quote?.discount_type || '');
  const [discountValue, setDiscountValue] = useState(quote?.discount_value || 0);
  const [terms, setTerms] = useState<{ text: string }[]>(
    quote?.terms_conditions?.length ? quote.terms_conditions : DEFAULT_TERMS
  );
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [templates, setTemplates] = useState<QuoteTemplate[]>([]);
  const [savingTemplate, setSavingTemplate] = useState(false);

  useEffect(() => {
    // Fetch templates
    fetch('/api/quotes/templates')
      .then(r => r.json())
      .then(json => { if (json.data) setTemplates(json.data); })
      .catch(() => {});

    fetch('/api/clients?active=true')
      .then(r => r.json())
      .then(json => { if (json.data) setClients(json.data); })
      .catch(console.error);

    // Fetch default VAT rate from settings (only for new quotes)
    if (!quote) {
      fetch('/api/settings')
        .then(r => r.json())
        .then(json => {
          const rate = parseFloat(json.data?.vat_rate);
          if (!isNaN(rate)) setVatRate(rate);
        })
        .catch(() => {});
    }
  }, [quote]);

  // Set default expiry date
  useEffect(() => {
    if (!expiryDate && estimateDate) {
      const d = new Date(estimateDate);
      d.setDate(d.getDate() + 30);
      setExpiryDate(d.toISOString().split('T')[0]);
    }
  }, [estimateDate, expiryDate]);

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => { if (previewUrl) URL.revokeObjectURL(previewUrl); };
  }, [previewUrl]);

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

  // ── Calculations ──
  const subtotal = services.reduce((sum, s) => sum + s.quantity * s.rate, 0);
  let discountAmount = 0;
  if (discountType === 'percentage' && discountValue > 0) {
    discountAmount = Math.round(subtotal * (discountValue / 100) * 100) / 100;
  } else if (discountType === 'fixed' && discountValue > 0) {
    discountAmount = Math.min(discountValue, subtotal);
  }
  const taxableAmount = subtotal - discountAmount;
  const taxAmount = taxableAmount * (vatRate / 100);
  const total = taxableAmount + taxAmount;

  const fmtNum = (n: number) =>
    new Intl.NumberFormat('en-AE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  // ── Terms helpers ──
  const addTerm = () => setTerms(prev => [...prev, { text: '' }]);
  const removeTerm = (idx: number) => setTerms(prev => prev.filter((_, i) => i !== idx));
  const updateTerm = (idx: number, text: string) =>
    setTerms(prev => prev.map((t, i) => i === idx ? { text } : t));

  const buildPayload = () => ({
    client_id: clientId || null,
    lead_id: leadId || null,
    client_address: clientAddress || null,
    project_name: projectName || null,
    estimate_date: estimateDate,
    expiry_date: expiryDate || null,
    notes: notes || null,
    vat_rate: vatRate,
    currency,
    discount_type: discountType || null,
    discount_value: discountValue,
    terms_conditions: terms.filter(t => t.text.trim()),
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

  const buildPdfData = useCallback(() => {
    const items = services.map(s => ({
      description: s.description,
      quantity: s.quantity,
      rate: s.rate,
      amount: s.quantity * s.rate,
    }));
    const sub = items.reduce((sum, i) => sum + i.amount, 0);
    let dAmt = 0;
    if (discountType === 'percentage' && discountValue > 0) {
      dAmt = Math.round(sub * (discountValue / 100) * 100) / 100;
    } else if (discountType === 'fixed' && discountValue > 0) {
      dAmt = Math.min(discountValue, sub);
    }
    const taxable = sub - dAmt;
    const tax = taxable * (vatRate / 100);

    return {
      quote_number: quote?.quote_number || 'DRAFT',
      estimate_date: estimateDate,
      expiry_date: expiryDate || null,
      status: quote?.status || 'draft',
      currency,
      subtotal: sub,
      tax_rate: vatRate,
      tax_amount: tax,
      total: taxable + tax,
      discount_type: (discountType || null) as 'percentage' | 'fixed' | null,
      discount_value: discountValue,
      discount_amount: dAmt,
      notes: notes || null,
      terms_conditions: terms.filter(t => t.text.trim()),
      bank_details: quote?.bank_details || { bank: '', account_name: '', account_no: '', iban: '' },
      company_name: quote?.company_name || 'PYRAMEDIA X',
      company_logo: quote?.company_logo || null,
      client_name: clientName || null,
      client_company: clientCompany || null,
      client_email: clientEmail || null,
      client_phone: clientPhone || null,
      client_address: clientAddress || null,
      project_name: projectName || null,
      signature_data: quote?.signature_data || null,
      signed_by: quote?.signed_by || null,
      signed_at: quote?.signed_at || null,
      items,
    };
  }, [services, discountType, discountValue, vatRate, quote, estimateDate, expiryDate, currency, notes, terms, clientName, clientCompany, clientEmail, clientPhone, clientAddress, projectName]);

  const handlePdf = async () => {
    await generateQuotePDF(buildPdfData());
  };

  const handlePreview = async () => {
    try {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const blob = await generateQuotePDF(buildPdfData(), { returnBlob: true });
      if (blob) {
        const url = URL.createObjectURL(blob);
        setPreviewUrl(url);
        setPreviewOpen(true);
      }
    } catch (err) {
      console.error(err);
      toast.error('فشل في إنشاء المعاينة');
    }
  };

  const loadTemplate = (templateId: string) => {
    const tpl = templates.find(t => t.id === templateId);
    if (!tpl) return;
    setServices(tpl.items.length > 0 ? tpl.items.map(i => ({ description: i.description, quantity: i.quantity, rate: i.rate })) : [{ description: '', quantity: 1, rate: 0 }]);
    if (tpl.notes) setNotes(tpl.notes);
    if (tpl.terms_conditions?.length) setTerms(tpl.terms_conditions);
    setCurrency(tpl.currency || 'AED');
    setVatRate(tpl.tax_rate ?? 5);
    setDiscountType(tpl.discount_type || '');
    setDiscountValue(tpl.discount_value || 0);
    toast.success(`تم تحميل القالب: ${tpl.name}`);
  };

  const saveAsTemplate = async () => {
    const name = prompt('اسم القالب:');
    if (!name?.trim()) return;
    setSavingTemplate(true);
    try {
      const res = await fetch('/api/quotes/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          items: services.map(s => ({ description: s.description, quantity: s.quantity, rate: s.rate })),
          notes: notes || null,
          terms_conditions: terms.filter(t => t.text.trim()),
          currency,
          tax_rate: vatRate,
          discount_type: discountType || null,
          discount_value: discountValue,
        }),
      });
      const json = await res.json();
      if (json.data) {
        setTemplates(prev => [...prev, json.data]);
        toast.success('تم حفظ القالب بنجاح');
      } else {
        toast.error(json.error || 'فشل حفظ القالب');
      }
    } catch {
      toast.error('فشل حفظ القالب');
    } finally {
      setSavingTemplate(false);
    }
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

          {/* Template Selector */}
          {templates.length > 0 && (
            <div className="flex items-center gap-3">
              <BookTemplate className="h-4 w-4 text-muted-foreground" />
              <Select onValueChange={loadTemplate}>
                <SelectTrigger className="w-64 h-8">
                  <SelectValue placeholder="تحميل من قالب..." />
                </SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name_ar || t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Quote Details */}
          <div>
            <h3 className="text-sm font-semibold mb-3">تفاصيل العرض</h3>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
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
              <div className="space-y-1">
                <Label className="text-xs">العملة</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CURRENCIES.map(c => (
                      <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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

            {/* Discount + VAT + Totals */}
            <div className="flex justify-end mt-4">
              <div className="w-80 space-y-3 border rounded-lg p-4">
                {/* Discount selector */}
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">الخصم</Label>
                  <div className="flex gap-2">
                    <Select value={discountType || 'none'} onValueChange={v => setDiscountType(v === 'none' ? '' : v)}>
                      <SelectTrigger className="w-32 h-8">
                        <SelectValue placeholder="بدون خصم" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">بدون خصم</SelectItem>
                        <SelectItem value="percentage">نسبة %</SelectItem>
                        <SelectItem value="fixed">مبلغ ثابت</SelectItem>
                      </SelectContent>
                    </Select>
                    {discountType && (
                      <Input
                        type="number"
                        min={0}
                        step={discountType === 'percentage' ? 1 : 0.01}
                        max={discountType === 'percentage' ? 100 : undefined}
                        value={discountValue}
                        onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
                        className="h-8 w-24"
                        dir="ltr"
                        placeholder={discountType === 'percentage' ? '%' : currency}
                      />
                    )}
                  </div>
                </div>

                <Separator />

                {/* Subtotal */}
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">المجموع الفرعي</span>
                  <span className="font-mono" dir="ltr">{fmtNum(subtotal)} {currency}</span>
                </div>

                {/* Discount line */}
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      الخصم {discountType === 'percentage' ? `(${discountValue}%)` : ''}
                    </span>
                    <span className="font-mono text-red-500" dir="ltr">-{fmtNum(discountAmount)} {currency}</span>
                  </div>
                )}

                {/* Editable VAT rate */}
                <div className="flex justify-between text-sm items-center">
                  <div className="flex items-center gap-1">
                    <span className="text-muted-foreground">ضريبة القيمة المضافة</span>
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={vatRate}
                      onChange={e => setVatRate(parseFloat(e.target.value) || 0)}
                      className="h-6 w-14 text-xs text-center"
                      dir="ltr"
                    />
                    <span className="text-muted-foreground text-xs">%</span>
                  </div>
                  <span className="font-mono" dir="ltr">{fmtNum(taxAmount)} {currency}</span>
                </div>

                <Separator />

                {/* Total */}
                <div className="flex justify-between font-bold">
                  <span>الإجمالي</span>
                  <span className="font-mono text-orange-600" dir="ltr">{fmtNum(total)} {currency}</span>
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

          {/* Editable Terms & Conditions */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">الشروط والأحكام</Label>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={addTerm}>
                <Plus className="h-3 w-3 me-1" /> إضافة شرط
              </Button>
            </div>
            <div className="space-y-2">
              {terms.map((term, idx) => (
                <div key={idx} className="flex gap-2 items-start">
                  <span className="text-xs text-muted-foreground mt-2 min-w-[20px]">{idx + 1}.</span>
                  <Input
                    value={term.text}
                    onChange={e => updateTerm(idx, e.target.value)}
                    className="h-8 text-xs"
                    placeholder="نص الشرط..."
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive shrink-0"
                    onClick={() => removeTerm(idx)}
                    disabled={terms.length <= 1}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
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
          <Button variant="outline" onClick={saveAsTemplate} disabled={savingTemplate}>
            <BookTemplate className="h-4 w-4 me-1" /> حفظ كقالب
          </Button>
          <Button variant="outline" onClick={handlePreview}>
            <Eye className="h-4 w-4 me-1" /> معاينة
          </Button>
          <Button variant="outline" onClick={handlePdf}>
            <FileDown className="h-4 w-4 me-1" /> تحميل PDF
          </Button>
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

      {/* Live Preview Dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-4xl h-[90vh] p-0">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle>معاينة عرض السعر</DialogTitle>
          </DialogHeader>
          {previewUrl && (
            <iframe
              src={previewUrl}
              className="w-full flex-1 border-0 rounded-b-lg"
              style={{ height: 'calc(90vh - 60px)' }}
              title="Quote Preview"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
