'use client';

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate, formatCurrency } from '@/lib/utils/format';
import { Receipt, ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { useRouter } from 'next/navigation';

interface StatementEntry {
  date: string;
  type: 'invoice' | 'payment' | 'refund';
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  invoice_id?: string;
  currency: string;
}

interface StatementTableProps {
  entries: StatementEntry[];
}

export function StatementTable({ entries }: StatementTableProps) {
  const router = useRouter();

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="لا توجد حركات"
        description="لم يتم تسجيل أي حركات مالية في الفترة المحددة"
      />
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Receipt className="h-4 w-4 text-portal" />
          كشف الحساب التفصيلي
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-start p-3 font-medium text-muted-foreground">التاريخ</th>
                <th className="text-start p-3 font-medium text-muted-foreground">الوصف</th>
                <th className="text-start p-3 font-medium text-muted-foreground">المرجع</th>
                <th className="text-start p-3 font-medium text-muted-foreground">مدين</th>
                <th className="text-start p-3 font-medium text-muted-foreground">دائن</th>
                <th className="text-start p-3 font-medium text-muted-foreground">الرصيد</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr key={idx} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="p-3 text-muted-foreground">
                    {entry.date ? formatDate(entry.date, 'dd/MM/yyyy') : '—'}
                  </td>
                  <td className="p-3">
                    <div className="flex items-center gap-2">
                      {entry.type === 'invoice' ? (
                        <ArrowUpCircle className="h-4 w-4 text-red-500 shrink-0" />
                      ) : entry.type === 'refund' ? (
                        <ArrowUpCircle className="h-4 w-4 text-amber-500 shrink-0" />
                      ) : (
                        <ArrowDownCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                      )}
                      <span className="truncate max-w-[300px]">{entry.description}</span>
                    </div>
                  </td>
                  <td className="p-3">
                    {entry.invoice_id ? (
                      <button
                        onClick={() => router.push(`/portal/invoices/${entry.invoice_id}`)}
                        className="text-portal hover:underline font-mono text-xs"
                      >
                        {entry.reference}
                      </button>
                    ) : (
                      <span className="font-mono text-xs">{entry.reference}</span>
                    )}
                  </td>
                  <td className="p-3 font-mono tabular-nums text-red-600 dark:text-red-400">
                    {entry.debit > 0 ? formatCurrency(entry.debit) : '—'}
                  </td>
                  <td className="p-3 font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                    {entry.credit > 0 ? formatCurrency(entry.credit) : '—'}
                  </td>
                  <td className="p-3 font-mono tabular-nums font-medium">
                    {formatCurrency(entry.balance)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
