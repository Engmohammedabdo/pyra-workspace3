'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ArrowRight, Plus, Save, Send, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';
import { BusinessEntitySelector } from '@/components/dashboard/invoice-new/BusinessEntitySelector';
import { ClientSelector } from '@/components/dashboard/invoice-new/ClientSelector';
import { InvoiceMeta } from '@/components/dashboard/invoice-new/InvoiceMeta';
import { InvoiceItemsTable } from '@/components/dashboard/invoice-new/InvoiceItemsTable';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';

export default function NewInvoicePage() {
  const router = useRouter();
  const [clients, setClients] = useState<any[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);
  const [entities, setEntities] = useState<any[]>([]);
  const [entityId, setEntityId] = useState('');
  const [clientId, setClientId] = useState('');
  const [displayClientName, setDisplayClientName] = useState('');
  const [projectName, setProjectName] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState('');
  const [milestoneType, setMilestoneType] = useState('');
  const [notes, setNotes] = useState('');
  const [vatRate, setVatRate] = useState(0);
  const [discountType, setDiscountType] = useState('');
  const [discountValue, setDiscountValue] = useState(0);
  const [items, setItems] = useState<any[]>([{ description: '', quantity: 1, rate: 0 }]);
  const [saving, setSaving] = useState(false);
  const [sendAfterSave, setSendAfterSave] = useState(false);

  useEffect(() => {
    fetch('/api/clients?limit=100').then(r => r.json()).then(j => { if(j.data) setClients(j.data); }).finally(() => setLoadingClients(false));
    fetch('/api/settings/business-entities').then(r => r.json()).then(j => {
      if(j.data) {
        setEntities(j.data);
        const def = j.data.find((e: any) => e.is_default);
        if (def) setEntityId(def.id);
      }
    });
    fetch('/api/settings').then(r => r.json()).then(j => {
      if(j.data) {
        setVatRate(parseFloat(j.data.vat_rate));
        const terms = parseInt(j.data.payment_terms_days);
        if(!isNaN(terms)) {
            const due = new Date(); due.setDate(due.getDate() + terms);
            setDueDate(due.toISOString().split('T')[0]);
        }
      }
    });
  }, []);

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  const discountAmount = discountType === 'percentage' ? Math.round(subtotal * (discountValue / 100) * 100) / 100 : discountType === 'fixed' ? Math.min(discountValue, subtotal) : 0;
  const vatAmount = (subtotal - discountAmount) * (vatRate / 100);
  const total = subtotal - discountAmount + vatAmount;

  const handleSubmit = async (shouldSend: boolean) => {
    setSaving(true);
    setSendAfterSave(shouldSend);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ due_date: dueDate, issue_date: issueDate, project_name: projectName || null, notes: notes || null, vat_rate: vatRate, items: items.filter(i => i.description.trim()), client_id: clientId, display_client_name: displayClientName.trim() || null, entity_id: entityId, milestone_type: milestoneType, discount_type: discountType, discount_value: discountValue }),
      });
      const json = await res.json();
      if(!res.ok) throw new Error(json.error);
      const invoiceId = json.data.id;
      if(shouldSend) await fetch(`/api/invoices/${invoiceId}/send`, { method: 'POST' });
      router.push(`/dashboard/invoices/${invoiceId}`);
    } catch(e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/invoices"><Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button></Link>
        <div><h1 className="text-2xl font-bold">فاتورة جديدة</h1></div>
      </div>
      <Card><CardContent className="space-y-4 pt-6">
        <BusinessEntitySelector entities={entities} entityId={entityId} onEntityChange={setEntityId} />
        <ClientSelector clients={clients} clientId={clientId} onClientChange={setClientId} loading={loadingClients} displayClientName={displayClientName} onDisplayClientNameChange={setDisplayClientName} />
        <InvoiceMeta projectName={projectName} setProjectName={setProjectName} issueDate={issueDate} setIssueDate={setIssueDate} dueDate={dueDate} setDueDate={setDueDate} milestoneType={milestoneType} setMilestoneType={setMilestoneType} notes={notes} setNotes={setNotes} />
      </CardContent></Card>
      <Card><CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>بنود الفاتورة</CardTitle>
        <Button variant="outline" size="sm" onClick={() => setItems([...items, { description: '', quantity: 1, rate: 0 }])}><Plus className="h-4 w-4 me-1" /> إضافة بند</Button>
      </CardHeader><CardContent className="space-y-3">
        <InvoiceItemsTable items={items} updateItem={(idx, field, val) => setItems(prev => prev.map((item, i) => i === idx ? {...item, [field]: val} : item))} removeItem={idx => setItems(prev => prev.filter((_, i) => i !== idx))} />
        <div className="border-t pt-4 mt-4 space-y-2">
            <div className="flex justify-between text-sm"><span>المجموع الفرعي</span><span className="font-mono">{formatCurrency(subtotal)}</span></div>
            <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2"><span>خصم</span>
                    <Select value={discountType} onValueChange={v => setDiscountType(v === 'none' ? '' : v)}><SelectTrigger className="w-28 h-7 text-xs"><SelectValue placeholder="بدون" /></SelectTrigger><SelectContent><SelectItem value="none">بدون</SelectItem><SelectItem value="percentage">نسبة %</SelectItem><SelectItem value="fixed">مبلغ ثابت</SelectItem></SelectContent></Select>
                    {discountType && <Input type="number" value={discountValue} onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)} className="w-20 h-7 text-xs" />}
                </div>
                <span className="font-mono text-red-500">{discountAmount > 0 ? `- ${formatCurrency(discountAmount)}` : '—'}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t pt-2"><span>الإجمالي</span><span className="font-mono">{formatCurrency(total)}</span></div>
        </div>
      </CardContent></Card>
      <div className="flex items-center gap-3 justify-end">
        <Button variant="outline" onClick={() => handleSubmit(false)} disabled={saving}>{saving && !sendAfterSave ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />} حفظ</Button>
        <Button className="bg-orange-500 hover:bg-orange-600" onClick={() => handleSubmit(true)} disabled={saving}>{saving && sendAfterSave ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Send className="h-4 w-4 me-2" />} حفظ وإرسال</Button>
      </div>
    </div>
  );
}
