'use client';

import { motion } from 'framer-motion';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Wallet, CreditCard, CheckCircle, CircleDollarSign, ChevronLeft } from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { useRouter } from 'next/navigation';

interface Props {
  financial: {
    totalInvoiced: number;
    totalPaid: number;
    totalRemaining: number;
    invoiceCount: number;
    pendingCount: number;
  };
}

export function FinancialSummary({ financial }: Props) {
  const router = useRouter();

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
      <Card className="border-portal/10">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="h-4 w-4 text-portal" />
            الملخص المالي
          </CardTitle>
          <button
            onClick={() => router.push('/portal/invoices')}
            className="text-xs text-portal hover:text-portal-secondary flex items-center gap-1 transition-colors"
          >
            عرض الفواتير
            <ChevronLeft className="h-3 w-3" />
          </button>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-xl border bg-muted/30 p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <CreditCard className="h-4 w-4 text-blue-500" />
                </div>
                <span className="text-xs text-muted-foreground">إجمالي الفواتير</span>
              </div>
              <p className="text-xl font-bold tabular-nums">
                {formatCurrency(financial.totalInvoiced)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {financial.invoiceCount} فاتورة
              </p>
            </div>

            <div className="rounded-xl border bg-emerald-500/5 p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                </div>
                <span className="text-xs text-muted-foreground">المبلغ المدفوع</span>
              </div>
              <p className="text-xl font-bold tabular-nums text-emerald-600 dark:text-emerald-400">
                {formatCurrency(financial.totalPaid)}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {financial.totalInvoiced > 0
                  ? Math.round((financial.totalPaid / financial.totalInvoiced) * 100)
                  : 0}% من الإجمالي
              </p>
            </div>

            <div className="rounded-xl border bg-orange-500/5 p-4 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
                  <CircleDollarSign className="h-4 w-4 text-orange-500" />
                </div>
                <span className="text-xs text-muted-foreground">المبلغ المتبقي</span>
              </div>
              <p className="text-xl font-bold tabular-nums text-orange-600 dark:text-orange-400">
                {formatCurrency(financial.totalRemaining)}
              </p>
              {financial.pendingCount > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {financial.pendingCount} فاتورة معلقة
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
