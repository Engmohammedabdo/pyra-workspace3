'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Trash2, Plus, Save, X, Loader2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

interface InvoiceItem {
  id: string;
  description: string;
  quantity: number;
  rate: number;
  amount: number;
  sort_order: number;
}

interface EditItemsProps {
  items: InvoiceItem[];
  projectName: string;
  setProjectName: (val: string) => void;
  notes: string;
  setNotes: (val: string) => void;
  dueDate: string;
  setDueDate: (val: string) => void;
  vatRate: number;
  setVatRate: (val: number) => void;
  displayName: string;
  setDisplayName: (val: string) => void;
  currency: string;
  defaultClientName: string | null;
  updateItem: (index: number, field: keyof InvoiceItem, val: string | number) => void;
  addItem: () => void;
  removeItem: (index: number) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}

export function EditItems({
  items, projectName, setProjectName, notes, setNotes, dueDate, setDueDate,
  vatRate, setVatRate, displayName, setDisplayName, currency, defaultClientName,
  updateItem, addItem, removeItem, onSave, onCancel, saving
}: EditItemsProps) {
  const subtotal = items.reduce((sum, i) => sum + (i.quantity * i.rate), 0);
  const vatAmount = subtotal * (vatRate / 100);
  const total = subtotal + vatAmount;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">بنود الفاتورة</CardTitle>
        <Button variant="outline" size="sm" onClick={addItem}>
          <Plus className="h-4 w-4 me-1" /> إضافة بند
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label>اسم المشروع</Label>
          <Input value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="اسم المشروع" />
        </div>
        <div className="space-y-2">
          <Label>اسم العميل في الـ PDF (اختياري)</Label>
          <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder={defaultClientName || 'اسم مختلف'} />
        </div>
        <div className="space-y-2">
          <Label>تاريخ الاستحقاق</Label>
          <Input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </div>
        {items.map((item, index) => (
          <div key={item.id} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
            <div className="sm:col-span-5">
              <Input value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} placeholder="وصف البند" />
            </div>
            <div className="sm:col-span-2">
              <Input type="number" value={item.quantity} onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="sm:col-span-2">
              <Input type="number" step={0.01} value={item.rate} onChange={e => updateItem(index, 'rate', parseFloat(e.target.value) || 0)} />
            </div>
            <div className="sm:col-span-2 text-sm font-mono px-2">{formatCurrency(item.amount, currency)}</div>
            <div className="sm:col-span-1 flex justify-end">
              <Button variant="ghost" size="icon" onClick={() => removeItem(index)} disabled={items.length <= 1} aria-label="حذف"><Trash2 className="h-4 w-4" /></Button>
            </div>
          </div>
        ))}
        <div className="space-y-2">
          <Label>ملاحظات</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} />
        </div>
        <div className="border-t pt-4">
          <div className="flex justify-between font-bold"><span>الإجمالي</span><span>{formatCurrency(total, currency)}</span></div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onCancel}><X className="h-4 w-4 me-1" /> إلغاء</Button>
          <Button onClick={onSave} disabled={saving}>{saving ? <Loader2 className="animate-spin" /> : <Save className="h-4 w-4 me-1" />} حفظ</Button>
        </div>
      </CardContent>
    </Card>
  );
}
