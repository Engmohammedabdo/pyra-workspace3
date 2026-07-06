'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';

interface Summary {
  total_invoiced: number;
  total_paid: number;
  total_outstanding: number;
  total_overdue: number;
  contract_value: number;
}

// Summary figures are AED-CONVERTED server-side (statement API sums via
// toAED per invoice currency — never mixed-currency raw sums), so the
// explicit 'AED' below is the true unit, not an assumption.
export function SummaryCards({ summary, loading }: { summary: Summary; loading: boolean }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {loading ? Array.from({ length: 4 }).map((_, i) => (
        <Card key={i}><CardContent className="p-4"><Skeleton className="h-4 w-20 mb-2" /><Skeleton className="h-8 w-28" /></CardContent></Card>
      )) : (
        <>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">إجمالي الفواتير</p>
              <p className="text-2xl font-bold mt-1">{formatCurrency(summary.total_invoiced, 'AED')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">إجمالي المدفوع</p>
              <p className="text-2xl font-bold mt-1 text-green-600 dark:text-green-400">{formatCurrency(summary.total_paid, 'AED')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">المستحق</p>
              <p className="text-2xl font-bold mt-1 text-orange-600 dark:text-orange-400">{formatCurrency(summary.total_outstanding, 'AED')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-1">
                {summary.total_overdue > 0 && <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />}
                المتأخر
              </p>
              <p className={`text-2xl font-bold mt-1 ${summary.total_overdue > 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                {formatCurrency(summary.total_overdue, 'AED')}
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
