'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';

interface BasicInfoProps {
  form: any;
  clients: any[];
  contracts: any[];
  updateForm: (field: string, value: any) => void;
}

export function BasicInfo({ form, clients, contracts, updateForm }: BasicInfoProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>المعلومات الأساسية</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="title">عنوان الفاتورة المتكررة *</Label>
          <Input id="title" value={form.title} onChange={(e) => updateForm('title', e.target.value)} placeholder="أدخل عنوان الفاتورة المتكررة" required />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="client_id">العميل</Label>
            <Select value={form.client_id} onValueChange={(value) => updateForm('client_id', value)}>
              <SelectTrigger>
                <SelectValue placeholder="اختر العميل" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>{client.name} {client.company ? `- ${client.company}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="contract_id">العقد</Label>
            <Select value={form.contract_id} onValueChange={(value) => updateForm('contract_id', value)}>
              <SelectTrigger>
                <SelectValue placeholder="اختر العقد" />
              </SelectTrigger>
              <SelectContent>
                {contracts.map((contract) => (
                  <SelectItem key={contract.id} value={contract.id}>{contract.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="billing_cycle">دورة الفوترة</Label>
            <Select value={form.billing_cycle} onValueChange={(value) => updateForm('billing_cycle', value)}>
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
          <div className="space-y-2">
            <Label htmlFor="next_generation_date">تاريخ التوليد القادم</Label>
            <Input id="next_generation_date" type="date" value={form.next_generation_date} onChange={(e) => updateForm('next_generation_date', e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="currency">العملة</Label>
            <Select value={form.currency} onValueChange={(value) => updateForm('currency', value)}>
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
          <div className="space-y-2">
            <Label htmlFor="auto_send">إرسال تلقائي</Label>
            <div className="flex items-center gap-3 pt-1">
              <Switch id="auto_send" checked={form.auto_send} onCheckedChange={(checked) => updateForm('auto_send', checked)} />
              <span className="text-sm text-muted-foreground">إرسال الفاتورة تلقائياً عند التوليد</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
