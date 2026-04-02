'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { FileText, CalendarClock, Loader2, Receipt } from 'lucide-react';
import Link from 'next/link';
import { formatCurrency } from '@/lib/utils/format';

const INVOICE_STATUS_MAP: any = {
  draft: { label: 'مسودة', variant: 'outline' },
  sent: { label: 'مرسلة', variant: 'default' },
  viewed: { label: 'مشاهدة', variant: 'default' },
  paid: { label: 'مدفوعة', variant: 'secondary' },
  partially_paid: { label: 'مدفوعة جزئياً', variant: 'outline' },
  overdue: { label: 'متأخرة', variant: 'destructive' },
  cancelled: { label: 'ملغاة', variant: 'destructive' },
};

export function RetainerBillingSection({ 
  loading, data, currency, status, onGenerateInvoice, generating 
}: { loading: boolean, data: any, currency: string, status: string, onGenerateInvoice: () => void, generating: boolean }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            سجل الفوترة الشهرية
          </CardTitle>
          <div className="flex items-center gap-2">
            {data?.recurring_invoice && (
              <Badge variant={data.recurring_invoice.status === 'active' ? 'default' : 'secondary'}>
                {data.recurring_invoice.status === 'active' ? 'فوترة نشطة' : 'فوترة متوقفة'}
              </Badge>
            )}
            {status === 'active' && (
              <Button
                size="sm"
                className="h-8 text-xs bg-orange-500 hover:bg-orange-600 text-white"
                onClick={onGenerateInvoice}
                disabled={generating}
              >
                {generating ? <Loader2 className="h-3.5 w-3.5 me-1 animate-spin" /> : <FileText className="h-3.5 w-3.5 me-1" />}
                إصدار فاتورة
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
          </div>
        ) : !data || data.invoices.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="لا توجد فواتير بعد"
            description={
              status === 'active'
                ? 'ستُولّد الفواتير تلقائياً حسب الجدول الزمني'
                : 'فعّل العقد لبدء الفوترة التلقائية'
            }
          />
        ) : (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">إجمالي المفوتر</p>
                <p className="text-lg font-bold font-mono">{formatCurrency(data.summary.total_billed, currency)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">المدفوع</p>
                <p className="text-lg font-bold font-mono text-green-600 dark:text-green-400">{formatCurrency(data.summary.total_paid, currency)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">المتبقي</p>
                <p className="text-lg font-bold font-mono text-orange-600 dark:text-orange-400">{formatCurrency(data.summary.total_remaining, currency)}</p>
              </div>
              <div className="rounded-lg border p-3 text-center">
                <p className="text-xs text-muted-foreground">عدد الأشهر</p>
                <p className="text-lg font-bold">{data.summary.months_active}</p>
              </div>
            </div>

            {data.recurring_invoice?.next_generation_date && data.recurring_invoice.status === 'active' && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                <CalendarClock className="h-4 w-4" />
                <span>الفاتورة القادمة: {data.recurring_invoice.next_generation_date}</span>
              </div>
            )}

            <div className="space-y-2">
              {data.invoices.map((inv: any) => {
                const statusInfo = INVOICE_STATUS_MAP[inv.status] || INVOICE_STATUS_MAP.draft;
                return (
                  <div key={inv.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium">{inv.invoice_number}</span>
                        <Badge variant={statusInfo.variant as any}>{statusInfo.label}</Badge>
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        {inv.issue_date && <span>{inv.issue_date}</span>}
                        <span className="font-mono">{formatCurrency(inv.total, inv.currency)}</span>
                        {inv.amount_paid > 0 && <span className="text-green-600 dark:text-green-400">مدفوع: {formatCurrency(inv.amount_paid, inv.currency)}</span>}
                      </div>
                    </div>
                    <Link href={`/dashboard/invoices/${inv.id}`}>
                      <Button variant="ghost" size="sm" className="h-8 text-xs">
                        <FileText className="h-3.5 w-3.5 me-1" />
                        عرض
                      </Button>
                    </Link>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
