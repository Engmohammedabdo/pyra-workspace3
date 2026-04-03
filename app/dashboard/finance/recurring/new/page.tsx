'use client';

import { useState, useEffect } from 'react';
import { useClients } from '@/hooks/useClients';
import { useQuery, useMutation } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowRight, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { BasicInfo } from '@/components/dashboard/recurring-new/BasicInfo';
import { LineItems } from '@/components/dashboard/recurring-new/LineItems';

interface Contract { id: string; title: string; }
interface LineItem { description: string; quantity: number; rate: number; amount: number; }

export default function CreateRecurringInvoicePage() {
  const router = useRouter();
  const [form, setForm] = useState({ title: '', client_id: '', contract_id: '', billing_cycle: 'monthly', next_generation_date: '', currency: 'AED', auto_send: false });
  const [items, setItems] = useState<LineItem[]>([{ description: '', quantity: 1, rate: 0, amount: 0 }]);
  const { data: clients = [] } = useClients({ pageSize: '100' });

  const { data: contractsData } = useQuery<Contract[]>({
    queryKey: ['contracts-list'],
    queryFn: () => fetchAPI('/api/finance/contracts?pageSize=100'),
  });
  const contracts = contractsData || [];

  const updateForm = (field: string, value: any) => setForm((prev) => ({ ...prev, [field]: value }));
  const updateItem = (index: number, field: keyof LineItem, value: any) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      updated[index].amount = updated[index].quantity * updated[index].rate;
      return updated;
    });
  };
  const addItem = () => setItems((prev) => [...prev, { description: '', quantity: 1, rate: 0, amount: 0 }]);
  const removeItem = (index: number) => { if (items.length > 1) setItems((prev) => prev.filter((_, i) => i !== index)); };

  const createMutation = useMutation({
    mutationFn: (data: object) => mutateAPI('/api/finance/recurring-invoices', 'POST', data),
    onSuccess: () => {
      toast.success('تم إنشاء الفاتورة المتكررة بنجاح');
      router.push('/dashboard/finance/recurring');
    },
    onError: () => toast.error('حدث خطأ أثناء إنشاء الفاتورة'),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) { toast.error('يرجى إدخال عنوان الفاتورة المتكررة'); return; }
    createMutation.mutate({ ...form, items });
  };

  const saving = createMutation.isPending;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard/finance/recurring')}><ArrowRight className="h-5 w-5" /></Button>
        <h1 className="text-2xl font-bold">إنشاء فاتورة متكررة جديدة</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <BasicInfo form={form} clients={clients as any[]} contracts={contracts} updateForm={updateForm} />
        <LineItems items={items} currency={form.currency} updateItem={updateItem} addItem={addItem} removeItem={removeItem} />
        <div className="flex justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => router.push('/dashboard/finance/recurring')}>إلغاء</Button>
          <Button type="submit" disabled={saving}>{saving ? <Loader2 className="h-4 w-4 me-2 animate-spin" /> : <Save className="h-4 w-4 me-2" />} حفظ الفاتورة المتكررة</Button>
        </div>
      </form>
    </div>
  );
}
