import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Trash2 } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

interface InvoiceItem { description: string; quantity: number; rate: number; }

interface Props {
  items: InvoiceItem[];
  updateItem: (index: number, field: keyof InvoiceItem, value: string | number) => void;
  removeItem: (index: number) => void;
}

export function InvoiceItemsTable({ items, updateItem, removeItem }: Props) {
  return (
    <>
      <div className="hidden sm:grid sm:grid-cols-12 gap-2 text-xs font-medium text-muted-foreground pb-1 border-b">
        <div className="col-span-5">الوصف</div>
        <div className="col-span-2">الكمية</div>
        <div className="col-span-2">السعر</div>
        <div className="col-span-2">المبلغ</div>
        <div className="col-span-1" />
      </div>
      {items.map((item, index) => (
        <div key={index} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
          <div className="sm:col-span-5"><Input value={item.description} onChange={e => updateItem(index, 'description', e.target.value)} placeholder="وصف البند" /></div>
          <div className="sm:col-span-2"><Input type="number" min={1} value={item.quantity} onChange={e => updateItem(index, 'quantity', parseFloat(e.target.value) || 0)} /></div>
          <div className="sm:col-span-2"><Input type="number" min={0} step={0.01} value={item.rate} onChange={e => updateItem(index, 'rate', parseFloat(e.target.value) || 0)} /></div>
          <div className="sm:col-span-2 text-sm font-mono px-2">{formatCurrency(item.quantity * item.rate)}</div>
          <div className="sm:col-span-1 flex justify-end">
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={items.length <= 1} onClick={() => removeItem(index)} aria-label="حذف"><Trash2 className="h-4 w-4" /></Button>
          </div>
        </div>
      ))}
    </>
  );
}
