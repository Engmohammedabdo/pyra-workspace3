'use client';

import Link from 'next/link';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowDownCircle } from 'lucide-react';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { EmptyState } from '@/components/ui/empty-state';

export function LinkedExpenses({ expenses, total }: { expenses: any[], total: number }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <ArrowDownCircle className="h-5 w-5" />
          المصروفات المرتبطة
          {expenses.length > 0 && <Badge variant="secondary" className="ms-2">{expenses.length}</Badge>}
        </CardTitle>
        {total > 0 && <span className="text-sm font-bold font-mono text-red-600">{formatCurrency(total)}</span>}
      </CardHeader>
      <CardContent>
        {expenses.length === 0 ? (
          <EmptyState icon={ArrowDownCircle} title="لا توجد مصروفات" description="لم يتم ربط أي مصروفات بهذا المورد بعد" />
        ) : (
          <div className="space-y-2">
            {expenses.map(exp => (
              <Link key={exp.id} href={`/dashboard/finance/expenses/${exp.id}`}>
                <div className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 transition-colors cursor-pointer">
                  <div>
                    <p className="text-sm font-medium">{exp.description || exp.vendor || '—'}</p>
                    <p className="text-xs text-muted-foreground">{exp.expense_date ? formatDate(exp.expense_date) : '—'}</p>
                  </div>
                  <span className="font-mono text-sm font-bold text-red-600">{formatCurrency(exp.amount, exp.currency)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
