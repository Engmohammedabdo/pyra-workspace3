'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowRight, Plus, Trash2, Loader2, Save } from 'lucide-react';
import { toast } from 'sonner';

interface Client {
  id: string;
  name: string;
  company: string;
}

interface Contract {
  id: string;
  title: string;
}

interface LineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

export default function CreateRecurringInvoicePage() {
  const router = useRouter();


  const [form, setForm] = useState({
    title: '',
    client_id: '',
    contract_id: '',
    billing_cycle: 'monthly',
    next_generation_date: '',
    currency: 'AED',
    auto_send: false,
  });
  const [items, setItems] = useState<LineItem[]>([
    { description: '', quantity: 1, rate: 0, amount: 0 },
  ]);
  const [clients, setClients] = useState<Client[]>([]);
  const [contracts, setContracts] = useState<Contract[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchClients() {
      try {
        const res = await fetch('/api/clients?pageSize=100');
        const data = await res.json();
        setClients(data.data || data.clients || []);
      } catch {
        console.error('Failed to fetch clients');
      }
    }

    async function fetchContracts() {
      try {
        const res = await fetch('/api/finance/contracts?pageSize=100');
        const data = await res.json();
        setContracts(data.data || data.contracts || []);
      } catch {
        console.error('Failed to fetch contracts');
      }
    }

    fetchClients();
    fetchContracts();
  }, []);

  const updateForm = (field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    setItems((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      updated[index].amount = updated[index].quantity * updated[index].rate;
      return updated;
    });
  };

  const addItem = () => {
    setItems((prev) => [...prev, { description: '', quantity: 1, rate: 0, amount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length <= 1) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.title.trim()) {
      toast.error('يرجى إدخال عنوان الفاتورة المتكررة');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/finance/recurring-invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          client_id: form.client_id || null,
          contract_id: form.contract_id || null,
          billing_cycle: form.billing_cycle,
          next_generation_date: form.next_generation_date || null,
          currency: form.currency,
          auto_send: form.auto_send,
          items: items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            rate: item.rate,
            amount: item.amount,
          })),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.error || 'فشل في إنشاء الفاتورة المتكررة');
      }

      toast.success('تم إنشاء الفاتورة المتكررة بنجاح');
      router.push('/dashboard/finance/recurring');
    } catch (error: unknown) {
      toast.error((error as Error).message || 'حدث خطأ أثناء إنشاء الفاتورة المتكررة');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => router.push('/dashboard/finance/recurring')}
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
        <h1 className="text-2xl font-bold">إنشاء فاتورة متكررة جديدة</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <Card>
          <CardHeader>
            <CardTitle>المعلومات الأساسية</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Title */}
            <div className="space-y-2">
              <Label htmlFor="title">عنوان الفاتورة المتكررة *</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => updateForm('title', e.target.value)}
                placeholder="أدخل عنوان الفاتورة المتكررة"
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Client */}
              <div className="space-y-2">
                <Label htmlFor="client_id">العميل</Label>
                <Select
                  value={form.client_id}
                  onValueChange={(value) => updateForm('client_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر العميل" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name} {client.company ? `- ${client.company}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Contract */}
              <div className="space-y-2">
                <Label htmlFor="contract_id">العقد</Label>
                <Select
                  value={form.contract_id}
                  onValueChange={(value) => updateForm('contract_id', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر العقد" />
                  </SelectTrigger>
                  <SelectContent>
                    {contracts.map((contract) => (
                      <SelectItem key={contract.id} value={contract.id}>
                        {contract.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Billing Cycle */}
              <div className="space-y-2">
                <Label htmlFor="billing_cycle">دورة الفوترة</Label>
                <Select
                  value={form.billing_cycle}
                  onValueChange={(value) => updateForm('billing_cycle', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر دورة الفوترة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري</SelectItem>
                    <SelectItem value="quarterly">ربع سنوي</SelectItem>
                    <SelectItem value="yearly">سنوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Next Generation Date */}
              <div className="space-y-2">
                <Label htmlFor="next_generation_date">تاريخ التوليد القادم</Label>
                <Input
                  id="next_generation_date"
                  type="date"
                  value={form.next_generation_date}
                  onChange={(e) => updateForm('next_generation_date', e.target.value)}
                />
              </div>

              {/* Currency */}
              <div className="space-y-2">
                <Label htmlFor="currency">العملة</Label>
                <Select
                  value={form.currency}
                  onValueChange={(value) => updateForm('currency', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="اختر العملة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AED">درهم</SelectItem>
                    <SelectItem value="USD">دولار</SelectItem>
                    <SelectItem value="EUR">يورو</SelectItem>
                    <SelectItem value="SAR">ريال</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Auto Send */}
              <div className="space-y-2">
                <Label htmlFor="auto_send">إرسال تلقائي</Label>
                <div className="flex items-center gap-3 pt-1">
                  <Switch
                    id="auto_send"
                    checked={form.auto_send}
                    onCheckedChange={(checked) => updateForm('auto_send', checked)}
                  />
                  <span className="text-sm text-muted-foreground">
                    إرسال الفاتورة تلقائياً عند التوليد
                  </span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Line Items */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>بنود الفاتورة</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addItem}>
                <Plus className="h-4 w-4 ml-2" />
                إضافة بند
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Column Headers */}
            <div className="hidden md:grid md:grid-cols-[1fr_120px_120px_120px_40px] gap-3 text-sm font-medium text-muted-foreground">
              <span>الوصف</span>
              <span>الكمية</span>
              <span>السعر</span>
              <span>المبلغ</span>
              <span></span>
            </div>

            {items.map((item, index) => (
              <div
                key={index}
                className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_120px_40px] gap-3 items-start border-b pb-4 last:border-0 last:pb-0"
              >
                {/* Description */}
                <div className="space-y-1">
                  <Label className="md:hidden text-xs text-muted-foreground">الوصف</Label>
                  <Input
                    value={item.description}
                    onChange={(e) => updateItem(index, 'description', e.target.value)}
                    placeholder="وصف البند"
                  />
                </div>

                {/* Quantity */}
                <div className="space-y-1">
                  <Label className="md:hidden text-xs text-muted-foreground">الكمية</Label>
                  <Input
                    type="number"
                    min={1}
                    value={item.quantity}
                    onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)}
                    placeholder="1"
                  />
                </div>

                {/* Rate */}
                <div className="space-y-1">
                  <Label className="md:hidden text-xs text-muted-foreground">السعر</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={item.rate}
                    onChange={(e) => updateItem(index, 'rate', parseFloat(e.target.value) || 0)}
                    placeholder="0.00"
                  />
                </div>

                {/* Amount (auto-calculated) */}
                <div className="space-y-1">
                  <Label className="md:hidden text-xs text-muted-foreground">المبلغ</Label>
                  <Input
                    type="number"
                    value={item.amount.toFixed(2)}
                    readOnly
                    className="bg-muted"
                  />
                </div>

                {/* Remove */}
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => removeItem(index)}
                    disabled={items.length <= 1}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}

            {/* Subtotal */}
            <div className="flex items-center justify-between border-t pt-4 mt-4">
              <span className="text-sm font-medium">المجموع الفرعي</span>
              <span className="text-lg font-bold">
                {subtotal.toFixed(2)} {form.currency}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push('/dashboard/finance/recurring')}
          >
            إلغاء
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                جاري الحفظ...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 ml-2" />
                حفظ الفاتورة المتكررة
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
