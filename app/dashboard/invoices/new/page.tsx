'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ArrowRight, Plus, Trash2, Save, Send, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';

/* ───────────────────────── Types ───────────────────────── */

interface Client {
  id: string;
  name: string;
  company: string | null;
  email: string | null;
}

interface InvoiceItem {
  description: string;
  quantity: number;
  rate: number;
}

/* ───────────────────────── Component ──────────────────── */

export default function NewInvoicePage() {
  const router = useRouter();

  /* ── clients ── */
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  /* ── form fields ── */
  const [clientId, setClientId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [milestoneType, setMilestoneType] = useState('');
  const [notes, setNotes] = useState('');
  const [vatRate, setVatRate] = useState(5);

  /* ── items ── */
  const [items, setItems] = useState<InvoiceItem[]>([
    { description: '', quantity: 1, rate: 0 },
  ]);

  /* ── submission state ── */
  const [saving, setSaving] = useState(false);
  const [sendAfterSave, setSendAfterSave] = useState(false);

  /* ── fetch clients ── */
  useEffect(() => {
    fetch('/api/clients?limit=100')
      .then(r => r.json())
      .then(json => { if (json.data) setClients(json.data); })
      .catch(() => {})
      .finally(() => setLoadingClients(false));
  }, []);

  /* ── item helpers ── */
  const updateItem = (index: number, field: keyof InvoiceItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };

  const addItem = () => {
    setItems(prev => [...prev, { description: '', quantity: 1, rate: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  /* ── calculations ── */
  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  /* ── submit ── */
  const handleSubmit = async (shouldSend: boolean) => {
    // Validation
    if (!dueDate) {
      toast.error('تاريخ الاستحقاق مطلوب');
      return;
    }

    const validItems = items.filter(item => item.description.trim());
    if (validItems.length === 0) {
      toast.error('يجب إضافة بند واحد على الأقل مع وصف');
      return;
    }

    setSaving(true);
    setSendAfterSave(shouldSend);

    try {
      const body: Record<string, unknown> = {
        due_date: dueDate,
        issue_date: issueDate,
        project_name: projectName || null,
        notes: notes || null,
        items: validItems.map(item => ({
          description: item.description.trim(),
          quantity: item.quantity,
          rate: item.rate,
        })),
      };

      if (clientId) body.client_id = clientId;
      if (milestoneType) body.milestone_type = milestoneType;

      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const json = await res.json();

      if (!res.ok || json.error) {
        toast.error(json.error || 'حدث خطأ في إنشاء الفاتورة');
        return;
      }

      const invoiceId = json.data?.id;
      toast.success('تم إنشاء الفاتورة بنجاح');

      // Send if requested
      if (shouldSend && invoiceId) {
        try {
          const sendRes = await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST' });
          const sendJson = await sendRes.json();
          if (sendRes.ok && !sendJson.error) {
            toast.success('تم إرسال الفاتورة');
          } else {
            toast.error(sendJson.error || 'تم الحفظ لكن فشل الإرسال');
          }
        } catch {
          toast.error('تم الحفظ لكن فشل الإرسال');
        }
      }

      router.push(invoiceId ? `/dashboard/invoices/${invoiceId}` : '/dashboard/invoices');
    } catch {
      toast.error('حدث خطأ في إنشاء الفاتورة');
    } finally {
      setSaving(false);
      setSendAfterSave(false);
    }
  };

  /* ──────────────────────── Render ─────────────────────── */
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/invoices">
          <Button variant="ghost" size="icon">
            <ArrowRight className="h-5 w-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">فاتورة جديدة</h1>
          <p className="text-muted-foreground">إنشاء فاتورة جديدة</p>
        </div>
      </div>

      {/* Form */}
      <Card>
        <CardHeader>
          <CardTitle>بيانات الفاتورة</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Client */}
          <div className="space-y-2">
            <Label>العميل</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger>
                <SelectValue placeholder={loadingClients ? 'جارٍ التحميل...' : 'اختر العميل'} />
              </SelectTrigger>
              <SelectContent>
                {clients.map(client => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}{client.company ? ` — ${client.company}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Project Name */}
          <div className="space-y-2">
            <Label>اسم المشروع</Label>
            <Input
              value={projectName}
              onChange={e => setProjectName(e.target.value)}
              placeholder="اسم المشروع"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>تاريخ الإصدار</Label>
              <Input
                type="date"
                value={issueDate}
                onChange={e => setIssueDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>تاريخ الاستحقاق <span className="text-destructive">*</span></Label>
              <Input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Milestone Type */}
          <div className="space-y-2">
            <Label>نوع الدفعة (اختياري)</Label>
            <Select value={milestoneType} onValueChange={setMilestoneType}>
              <SelectTrigger>
                <SelectValue placeholder="اختر نوع الدفعة" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="booking">دفعة حجز</SelectItem>
                <SelectItem value="initial_delivery">تسليم أولي</SelectItem>
                <SelectItem value="final_delivery">تسليم نهائي</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea
              value={notes}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)}
              placeholder="ملاحظات إضافية..."
              rows={3}
            />
          </div>
        </CardContent>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>بنود الفاتورة</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 me-1" /> إضافة بند
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Items Header */}
          <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
            <div className="col-span-5">الوصف</div>
            <div className="col-span-2">الكمية</div>
            <div className="col-span-2">السعر</div>
            <div className="col-span-2">المبلغ</div>
            <div className="col-span-1" />
          </div>

          {/* Item Rows */}
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <div className="sm:col-span-5">
                <Input
                  value={item.description}
                  onChange={e => updateItem(index, 'description', e.target.value)}
                  placeholder="وصف البند"
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  type="number"
                  min={1}
                  value={item.quantity}
                  onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                  placeholder="الكمية"
                />
              </div>
              <div className="sm:col-span-2">
                <Input
                  type="number"
                  min={0}
                  step={0.01}
                  value={item.rate}
                  onChange={e => updateItem(index, 'rate', parseFloat(e.target.value) || 0)}
                  placeholder="السعر"
                />
              </div>
              <div className="sm:col-span-2 text-sm font-mono px-2">
                {formatCurrency(item.quantity * item.rate)}
              </div>
              <div className="sm:col-span-1 flex justify-end">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive"
                  disabled={items.length <= 1}
                  onClick={() => removeItem(index)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}

          {/* Totals */}
          <div className="border-t pt-4 mt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>المجموع الفرعي</span>
              <span className="font-mono">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span>ضريبة القيمة المضافة</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  step={0.5}
                  value={vatRate}
                  onChange={e => setVatRate(parseFloat(e.target.value) || 0)}
                  className="w-20 h-7 text-xs"
                />
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

      {/* Actions */}
      <div className="flex items-center gap-3 justify-end">
        <Link href="/dashboard/invoices">
          <Button variant="outline">إلغاء</Button>
        </Link>
        <Button
          variant="outline"
          onClick={() => handleSubmit(false)}
          disabled={saving}
        >
          {saving && !sendAfterSave ? (
            <Loader2 className="h-4 w-4 me-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 me-2" />
          )}
          حفظ كمسودة
        </Button>
        <Button
          className="bg-orange-500 hover:bg-orange-600"
          onClick={() => handleSubmit(true)}
          disabled={saving}
        >
          {saving && sendAfterSave ? (
            <Loader2 className="h-4 w-4 me-2 animate-spin" />
          ) : (
            <Send className="h-4 w-4 me-2" />
          )}
          حفظ وإرسال
        </Button>
      </div>
    </div>
  );
}
