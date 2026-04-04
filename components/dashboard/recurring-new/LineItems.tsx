'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Plus, Trash2 } from 'lucide-react';

interface LineItem {
  description: string;
  quantity: number;
  rate: number;
  amount: number;
}

interface LineItemsProps {
  items: LineItem[];
  currency: string;
  updateItem: (index: number, field: keyof LineItem, value: any) => void;
  addItem: () => void;
  removeItem: (index: number) => void;
}

export function LineItems({ items, currency, updateItem, addItem, removeItem }: LineItemsProps) {
  const subtotal = items.reduce((sum, item) => sum + item.amount, 0);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>بنود الفاتورة</CardTitle>
          <Button type="button" variant="outline" size="sm" onClick={addItem}>
            <Plus className="h-4 w-4 me-2" />
            إضافة بند
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.map((item, index) => (
          <div key={index} className="grid grid-cols-1 md:grid-cols-[1fr_120px_120px_120px_40px] gap-3 items-start border-b pb-4 last:border-0 last:pb-0">
            <div className="space-y-1">
              <Label className="md:hidden text-xs text-muted-foreground">الوصف</Label>
              <Input value={item.description} onChange={(e) => updateItem(index, 'description', e.target.value)} placeholder="وصف البند" />
            </div>
            <div className="space-y-1">
              <Label className="md:hidden text-xs text-muted-foreground">الكمية</Label>
              <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)} placeholder="1" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label className="md:hidden text-xs text-muted-foreground">السعر</Label>
              <Input type="number" min={0} step="0.01" value={item.rate} onChange={(e) => updateItem(index, 'rate', parseFloat(e.target.value) || 0)} placeholder="0.00" dir="ltr" />
            </div>
            <div className="space-y-1">
              <Label className="md:hidden text-xs text-muted-foreground">المبلغ</Label>
              <Input type="number" value={item.amount.toFixed(2)} readOnly className="bg-muted" dir="ltr" />
            </div>
            <div className="flex items-end">
              <Button type="button" variant="ghost" size="icon" className="text-destructive" onClick={() => removeItem(index)} disabled={items.length <= 1} aria-label="حذف">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ))}
        <div className="flex items-center justify-between border-t pt-4 mt-4">
          <span className="text-sm font-medium">المجموع الفرعي</span>
          <span className="text-lg font-bold">{subtotal.toFixed(2)} {currency}</span>
        </div>
      </CardContent>
    </Card>
  );
}
