'use client';

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { useProjects } from '@/hooks/useProjects';
import { useSettings } from '@/hooks/useSettings';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
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
interface POItem { description: string; quantity: number; rate: number; }

export default function NewPurchaseOrderPage() {
  const router = useRouter();
  const t = useTranslations('finance.purchaseOrders.new');

  const { data: projects = [] } = useProjects({ pageSize: '100' });
  const { data: settingsData } = useSettings();
  const { data: suppliers = [] } = useQuery<Supplier[]>({
    queryKey: ['suppliers'],
    queryFn: () => fetchAPI('/api/dashboard/suppliers?limit=100&active=true'),
  });
  const [supplierId, setSupplierId] = useState('');
  const [projectId, setProjectId] = useState('');
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [deliveryDate, setDeliveryDate] = useState('');
  const [notes, setNotes] = useState('');
  const [vatRate, setVatRate] = useState(5);
  const [items, setItems] = useState<POItem[]>([{ description: '', quantity: 1, rate: 0 }]);

  useEffect(() => {
    if ((settingsData as any)?.vat_rate !== undefined) {
      const rate = parseFloat(String((settingsData as any).vat_rate));
      if (!isNaN(rate)) setVatRate(rate);
    }
  }, [settingsData]);

  const updateItem = (index: number, field: keyof POItem, value: string | number) => {
    setItems(prev => prev.map((item, i) => i === index ? { ...item, [field]: value } : item));
  };
  const addItem = () => setItems(prev => [...prev, { description: '', quantity: 1, rate: 0 }]);
  const removeItem = (index: number) => { if (items.length > 1) setItems(prev => prev.filter((_, i) => i !== index)); };

  const subtotal = items.reduce((sum, item) => sum + (item.quantity * item.rate), 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  const createMutation = useMutation({
    mutationFn: (data: object) => mutateAPI<{ id?: string }>('/api/dashboard/purchase-orders', 'POST', data),
    onSuccess: (data) => {
      toast.success(t('toasts.createSuccess'));
      router.push(`/dashboard/finance/purchase-orders/${(data as any).id}`);
    },
    onError: () => toast.error(t('toasts.createFailed')),
  });

  const handleSubmit = () => {
    const validItems = items.filter(item => item.description.trim());
    if (validItems.length === 0) { toast.error(t('toasts.itemRequired')); return; }
    createMutation.mutate({
      supplier_id: supplierId || null, project_id: projectId || null,
      issue_date: issueDate, expected_delivery_date: deliveryDate || null,
      notes: notes || null, vat_rate: vatRate,
      items: validItems.map(it => ({ description: it.description.trim(), quantity: it.quantity, rate: it.rate })),
    });
  };

  const saving = createMutation.isPending;

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/finance/purchase-orders">
          <Button variant="ghost" size="icon" aria-label={t('back')}><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <div>
          <h1 className="text-2xl font-bold">{t('title')}</h1>
          <p className="text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>{t('cardTitle')}</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>{t('fields.supplier')}</Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger><SelectValue placeholder={t('fields.supplierPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}{s.company ? ` — ${s.company}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t('fields.project')}</Label>
              <Select value={projectId} onValueChange={v => setProjectId(v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder={t('fields.projectPlaceholder')} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('fields.noProject')}</SelectItem>
                  {(projects as any[]).map((p: any) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2"><Label>{t('fields.issueDate')}</Label><Input type="date" value={issueDate} onChange={e => setIssueDate(e.target.value)} /></div>
            <div className="space-y-2"><Label>{t('fields.deliveryDate')}</Label><Input type="date" value={deliveryDate} onChange={e => setDeliveryDate(e.target.value)} /></div>
          </div>
          <div className="space-y-2">
            <Label>{t('fields.notes')}</Label>
            <Textarea value={notes} onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNotes(e.target.value)} placeholder={t('fields.notesPlaceholder')} rows={2} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>{t('itemsCardTitle')}</CardTitle>
          <Button variant="outline" size="sm" onClick={addItem}><Plus className="h-4 w-4 me-1" /> {t('addItem')}</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
            <div className="col-span-5">{t('columns.description')}</div><div className="col-span-2">{t('columns.quantity')}</div>
            <div className="col-span-2">{t('columns.rate')}</div><div className="col-span-2">{t('columns.amount')}</div><div className="col-span-1" />
          </div>
          {items.map((item, index) => (
            <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
              <div className="sm:col-span-5"><Input value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} placeholder={t('descriptionPlaceholder')} /></div>
              <div className="sm:col-span-2"><Input type="number" min={1} value={item.quantity} onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)} dir="ltr" /></div>
              <div className="sm:col-span-2"><Input type="number" min={0} step={0.01} value={item.rate} onChange={e => updateItem(index, 'rate', parseFloat(e.target.value) || 0)} dir="ltr" /></div>
              <div className="sm:col-span-2 text-sm font-mono px-2">{formatCurrency(item.quantity * item.rate)}</div>
              <div className="sm:col-span-1 flex justify-end">
                <Button variant="ghost" size="icon" aria-label={t('removeItem')} className="h-8 w-8 text-destructive" disabled={items.length <= 1} onClick={() => removeItem(index)}><Trash2 className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
          <div className="border-t pt-4 mt-4 space-y-2">
            <div className="flex justify-between text-sm"><span>{t('subtotal')}</span><span className="font-mono">{formatCurrency(subtotal)}</span></div>
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2">
                <span>{t('vat')}</span>
                <Input type="number" min={0} max={100} step={0.5} value={vatRate} onChange={e => setVatRate(parseFloat(e.target.value) || 0)} className="w-20 h-7 text-xs" dir="ltr" />
                <span className="text-muted-foreground">%</span>
              </div>
              <span className="font-mono">{formatCurrency(vatAmount)}</span>
            </div>
            <div className="flex justify-between text-base font-bold border-t pt-2"><span>{t('total')}</span><span className="font-mono">{formatCurrency(total)}</span></div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3 justify-end">
        <Link href="/dashboard/finance/purchase-orders"><Button variant="outline">{t('cancel')}</Button></Link>
        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />}
          {t('save')}
        </Button>
      </div>
    </div>
  );
}
