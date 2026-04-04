'use client';

import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Receipt, Briefcase } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';

const METHOD_MAP: Record<string, string> = {
  bank_transfer: 'تحويل بنكي',
  cash: 'نقدي',
  cheque: 'شيك',
  credit_card: 'بطاقة ائتمان',
  online: 'دفع إلكتروني',
  other: 'أخرى',
};

const CONTRACT_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  draft: { label: 'مسودة', variant: 'secondary' },
  active: { label: 'نشط', variant: 'default' },
  completed: { label: 'مكتمل', variant: 'default' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
  paused: { label: 'متوقف', variant: 'outline' },
};

export function PaymentsTable({ payments, loading, invoiceNumberMap }: { payments: any[]; loading: boolean; invoiceNumberMap: Record<string, string> }) {
  return (
    <Card>
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Receipt className="h-5 w-5" /> المدفوعات
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-start p-3 font-medium">التاريخ</th>
              <th className="text-start p-3 font-medium">المبلغ</th>
              <th className="text-start p-3 font-medium">طريقة الدفع</th>
              <th className="text-start p-3 font-medium">مرجع الفاتورة</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 3 }).map((_, i) => (
              <tr key={i} className="border-b">{Array.from({ length: 4 }).map((_, j) => (
                <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
              ))}</tr>
            )) : payments.length === 0 ? (
              <tr><td colSpan={4}><EmptyState icon={Receipt} title="لا توجد مدفوعات" className="py-8" /></td></tr>
            ) : payments.map(p => (
              <tr key={p.id} className="border-b hover:bg-muted/30 transition-colors">
                <td className="p-3 text-muted-foreground">{formatDate(p.payment_date)}</td>
                <td className="p-3 font-mono text-green-600">{formatCurrency(p.amount)}</td>
                <td className="p-3">{METHOD_MAP[p.method] || p.method}</td>
                <td className="p-3 text-muted-foreground">{invoiceNumberMap[p.invoice_id] || p.invoice_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function ContractsTable({ contracts, loading }: { contracts: any[]; loading: boolean }) {
  return (
    <Card>
      <div className="p-4 border-b">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Briefcase className="h-5 w-5" /> العقود
        </h2>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-start p-3 font-medium">العنوان</th>
              <th className="text-start p-3 font-medium">القيمة</th>
              <th className="text-start p-3 font-medium">الحالة</th>
              <th className="text-start p-3 font-medium">المفوتر</th>
              <th className="text-start p-3 font-medium">المحصّل</th>
            </tr>
          </thead>
          <tbody>
            {loading ? Array.from({ length: 2 }).map((_, i) => (
              <tr key={i} className="border-b">{Array.from({ length: 5 }).map((_, j) => (
                <td key={j} className="p-3"><Skeleton className="h-5 w-20" /></td>
              ))}</tr>
            )) : contracts.length === 0 ? (
              <tr><td colSpan={5}><EmptyState icon={Briefcase} title="لا توجد عقود" className="py-8" /></td></tr>
            ) : contracts.map(c => {
              const st = CONTRACT_STATUS_MAP[c.status] || { label: c.status, variant: 'secondary' as const };
              return (
                <tr key={c.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3 font-medium">{c.title || '—'}</td>
                  <td className="p-3 font-mono">{formatCurrency(c.total_value)}</td>
                  <td className="p-3"><Badge variant={st.variant}>{st.label}</Badge></td>
                  <td className="p-3 font-mono">{formatCurrency(c.amount_billed)}</td>
                  <td className="p-3 font-mono text-green-600">{formatCurrency(c.amount_collected)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
