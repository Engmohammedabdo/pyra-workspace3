'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Save, RefreshCcw } from 'lucide-react';

export function ContractForm({ form, setForm, clients, projects, onSubmit, saving }) {
  const isRetainer = form.contract_type === 'retainer';
  const filteredProjects = form.client_id
    ? projects.filter(p => p.client_id === form.client_id)
    : projects;

  const u = (k, v) => {
    if (k === 'client_id') {
      setForm(p => ({ ...p, client_id: v, project_id: '' }));
    } else {
      setForm(p => ({ ...p, [k]: v }));
    }
  };

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardHeader><CardTitle className="text-base">بيانات العقد</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2 md:col-span-2">
              <Label>عنوان العقد *</Label>
              <Input value={form.title} onChange={e => u('title', e.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>العميل</Label>
              <Select value={form.client_id} onValueChange={v => u('client_id', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="اختر العميل" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون عميل</SelectItem>
                  {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.company || c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>المشروع</Label>
              <Select value={form.project_id} onValueChange={v => u('project_id', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder={form.client_id ? 'اختر المشروع' : 'اختر العميل أولاً'} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">بدون مشروع</SelectItem>
                  {filteredProjects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>نوع العقد</Label>
              <Select value={form.contract_type} onValueChange={v => u('contract_type', v === 'none' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="اختر النوع" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">غير محدد</SelectItem>
                  <SelectItem value="retainer">ثابت شهري (Retainer)</SelectItem>
                  <SelectItem value="milestone">مراحل (Milestone)</SelectItem>
                  <SelectItem value="upfront_delivery">دفعة مقدمة + تسليم</SelectItem>
                  <SelectItem value="fixed">سعر ثابت (Fixed)</SelectItem>
                  <SelectItem value="hourly">بالساعة (Hourly)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الحالة</Label>
              <Select value={form.status} onValueChange={v => u('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">مسودة</SelectItem>
                  <SelectItem value="active">نشط</SelectItem>
                  <SelectItem value="in_progress">قيد التنفيذ</SelectItem>
                  <SelectItem value="completed">مكتمل</SelectItem>
                  <SelectItem value="cancelled">ملغي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>القيمة الإجمالية</Label>
              <Input type="number" step="0.01" min="0" value={form.total_value} onChange={e => u('total_value', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>العملة</Label>
              <Select value={form.currency} onValueChange={v => u('currency', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="AED">AED</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="SAR">SAR</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>نسبة الضريبة (%)</Label>
              <Input type="number" step="0.01" min="0" max="100" value={form.vat_rate} onChange={e => u('vat_rate', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>المبلغ المفوتر</Label>
              <Input type="number" step="0.01" min="0" value={form.amount_billed} onChange={e => u('amount_billed', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>المبلغ المحصل</Label>
              <Input type="number" step="0.01" min="0" value={form.amount_collected} onChange={e => u('amount_collected', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>تاريخ البداية</Label>
              <Input type="date" value={form.start_date} onChange={e => u('start_date', e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>تاريخ النهاية</Label>
              <Input type="date" value={form.end_date} onChange={e => u('end_date', e.target.value)} />
            </div>
          </div>

          {isRetainer && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-lg border border-orange-200 bg-orange-50/50 dark:border-orange-900/50 dark:bg-orange-950/20">
              <div className="md:col-span-3">
                <p className="text-sm font-medium text-orange-700 dark:text-orange-400 flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4" />
                  إعدادات الدفع الشهري
                </p>
              </div>
              <div className="space-y-2">
                <Label>المبلغ الشهري</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  value={form.retainer_amount}
                  onChange={e => u('retainer_amount', e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <div className="space-y-2">
                <Label>دورة الفوترة</Label>
                <Select value={form.retainer_cycle} onValueChange={v => u('retainer_cycle', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">شهري</SelectItem>
                    <SelectItem value="quarterly">ربع سنوي</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>يوم الفوترة</Label>
                <Select value={form.billing_day} onValueChange={v => u('billing_day', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 28 }, (_, i) => i + 1).map(d => (
                      <SelectItem key={d} value={String(d)}>{d}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>الوصف</Label>
            <Textarea value={form.description} onChange={e => u('description', e.target.value)} rows={3} />
          </div>
          <div className="space-y-2">
            <Label>ملاحظات</Label>
            <Textarea value={form.notes} onChange={e => u('notes', e.target.value)} rows={2} />
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={saving}>
              <Save className="h-4 w-4 me-2" />
              {saving ? 'جاري الحفظ...' : 'حفظ التعديلات'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}
