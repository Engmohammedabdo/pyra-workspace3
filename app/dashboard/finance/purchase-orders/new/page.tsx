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
import { ArrowRight, Plus, Trash2, Save, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';

interface Supplier { id: string; name: string; company: string | null; }
interface Project { id: string; name: string; }
interface POItem { description: string; quantity: number; rate: number; }

export default function NewPurchaseOrderPage() {
  const router = useRouter();

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [vatRate, setVatRate] = useState(5);
  const [items, setItems] = useState<POItem[]>([{ description: '', quantity: 1, rate: 0 }]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch('/api/dashboard/suppliers?limit=100&active=true')
      .then(r => r.json())
      .then(j => { if (j.data) setSuppliers(j.data); })
      .catch(() => {});
    fetch('/api/projects?pageSize=100')
      .then(r => r.json())
      .then(j => { if (j.data) setProjects(j.data.map((p: Project) => ({ id: p.id, name: p.name }))); })
      .catch(() => {});
    fetch('/api/settings')
      .then(r => r.json())
      .then(j => {
        if (!j.data) return;
        const rate = parseFloat(j.data.vat_rate);
        if (!isNaN(rate)) setVatRate(rate);
      })
      .catch(() => {});
  }, []);

  const updateItem = (index: number, field: keyof POItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };
  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, rate: 0 }]);
  const removeItem = (index: number) => { if (items.length > 1) setItems(prev => prev.filter((_, i) => i !== index)); };

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  const handleSubmit = async () => {
    const validItems = items.filter(item => item.description.trim());
    if (validItems.length === 0) { toast.error('يجب إضافة بند واحد على الأقل'); return; }

    setSaving(true);
    try {
      const res = await fetch('/api/dashboard/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          supplier_id: supplierId || null,
          project_id: projectId || null,
          issue_date: issueDate,
          expected_delivery_date: deliveryDate || null,
          notes: notes || null,
          vat_rate: vatRate,
          items: validItems.map(it => ({ description: it.description.trim(), quantity: it.quantity, rate: it.rate })),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.error) { toast.error(json.error || 'حدث خطأ'); return; }
      toast.success('تم إنشاء أمر الشراء');
      router.push(`/dashboard/finance/purchase-orders/${json.data?.id}`);
    } catch {
      toast.error('حدث خطأ');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/purchase-orders">
          <Button variant="ghost" size="icon" aria-label="رجوع"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">أمر شراء جديد</h1>
          <p className="text-muted-foreground">إنشاء أمر شراء للمورد</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>بيانات أمر الشراء</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>المورد</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder="اختر المورد" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.company ? ` — ${s.company}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المشروع (اختياري)</Label>
              <Select value={projectId} onValueChange={v => setProjectId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="اختر المشروع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مشروع</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>تاريخ الإصدار</Label>
              <Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>تاريخ التسليم المتوقع</Label>
              <Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} placeholder="ملاحظات إضافية..." rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>بنود أمر الشراء</CardTitle>
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
        <Link href="/dashboard/finance/purchase-orders"><Button variant="outline">إلغاء</Button></Link>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
          حفظ
        </Button>
      </div>
    </div>
  );
}
