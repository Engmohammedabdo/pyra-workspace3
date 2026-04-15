'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2 } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';

interface TableProps {
  items: any[];
  onDelete: (id: string) => void;
}

const CYCLE_LABELS: Record<string, string> = { monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' };
const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'نشط', variant: 'default' },
  paused: { label: 'متوقف', variant: 'secondary' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

function calcTotal(items: Array<{ quantity: number; rate: number }>): number {
  return items.reduce((sum, item) => sum + (item.quantity || 1) * (item.rate || 0), 0);
}

export function RecurringTable({ items, onDelete }: TableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            <th className="text-start p-3 font-medium">العنوان</th>
            <th className="text-start p-3 font-medium">العميل</th>
            <th className="text-start p-3 font-medium">الدورة</th>
            <th className="text-start p-3 font-medium">التكلفة</th>
            <th className="text-start p-3 font-medium">التوليد القادم</th>
            <th className="text-start p-3 font-medium">آخر توليد</th>
            <th className="text-start p-3 font-medium">الحالة</th>
            <th className="text-start p-3 font-medium">الإجراءات</th>
          </tr>
        </thead>
        <tbody>
          {items.map(ri => {
            const cost = calcTotal(ri.items || []);
            const isDue = ri.status === 'active' && new Date(ri.next_generation_date) <= new Date();
            return (
              <tr key={ri.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="p-3">
                  <div className="font-medium">{ri.title}</div>
                  {ri.auto_send && <Badge variant="outline" className="text-xs">إرسال تلقائي</Badge>}
                  {ri.contract_title && <p className="text-xs text-muted-foreground">{ri.contract_title}</p>}
                </td>
                <td className="p-3 text-muted-foreground">{ri.client_company || ri.client_name || '—'}</td>
                <td className="p-3">{CYCLE_LABELS[ri.billing_cycle] || ri.billing_cycle}</td>
                <td className="p-3 font-mono">{formatCurrency(cost, ri.currency)}</td>
                <td className="p-3">
                  <span className={isDue ? 'text-orange-600 dark:text-orange-400 font-medium' : 'text-muted-foreground'}>{formatDate(ri.next_generation_date)}</span>
                  {isDue && <Badge variant="destructive" className="ms-2 text-xs">مستحق</Badge>}
                </td>
                <td className="p-3 text-muted-foreground">{ri.last_generated_at ? formatDate(ri.last_generated_at) : '—'}</td>
                <td className="p-3">
                  <Badge variant={STATUS_MAP[ri.status]?.variant || 'outline'}>{STATUS_MAP[ri.status]?.label || ri.status}</Badge>
                </td>
                <td className="p-3">
                  <div className="flex items-center gap-1">
                    <Link href={`/dashboard/finance/recurring/${ri.id}`}>
                      <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="تعديل"><Pencil className="h-3.5 w-3.5" /></Button>
                    </Link>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600 dark:text-red-400" onClick={() => onDelete(ri.id)} aria-label="حذف"><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
