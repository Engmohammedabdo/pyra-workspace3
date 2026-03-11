'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  ArrowRight, FileSignature, FileText, Receipt, CalendarClock,
} from 'lucide-react';
import { formatCurrency } from '@/lib/utils/format';
import { toast } from 'sonner';

interface ContractDetail {
  id: string;
  title: string | null;
  description: string | null;
  project_name: string | null;
  contract_type: string | null;
  total_value: number;
  currency: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  retainer_amount: number;
  retainer_cycle: string | null;
  billing_day: number | null;
  notes: string | null;
  billing_history: {
    recurring_invoice: {
      status: string;
      billing_cycle: string;
      next_generation_date: string | null;
    } | null;
    invoices: {
      id: string;
      invoice_number: string;
      status: string;
      issue_date: string | null;
      total: number;
      amount_paid: number;
      amount_due: number;
      currency: string;
    }[];
    summary: {
      total_billed: number;
      total_paid: number;
      total_remaining: number;
      invoice_count: number;
    };
  } | null;
}

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  active: { label: 'نشط', variant: 'default' },
  in_progress: { label: 'قيد التنفيذ', variant: 'default' },
  completed: { label: 'مكتمل', variant: 'secondary' },
  cancelled: { label: 'ملغي', variant: 'destructive' },
};

const INVOICE_STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  sent: { label: 'مرسلة', variant: 'default' },
  viewed: { label: 'مشاهدة', variant: 'default' },
  paid: { label: 'مدفوعة', variant: 'secondary' },
  partially_paid: { label: 'مدفوعة جزئياً', variant: 'outline' },
  overdue: { label: 'متأخرة', variant: 'destructive' },
};

const TYPE_MAP: Record<string, string> = {
  retainer: 'ثابت شهري',
  milestone: 'مراحل',
  upfront_delivery: 'دفعة مقدمة + تسليم',
  fixed: 'سعر ثابت',
  hourly: 'بالساعة',
};

export default function PortalContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [contract, setContract] = useState<ContractDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/portal/contracts/${id}`)
      .then(r => r.json())
      .then(j => { if (j.data) setContract(j.data); })
      .catch(() => toast.error('فشل في تحميل العقد'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (!contract) {
    return (
      <EmptyState
        icon={FileSignature}
        title="العقد غير موجود"
        description="لم يتم العثور على هذا العقد"
        actionLabel="العودة للعقود"
        onAction={() => router.push('/portal/contracts')}
      />
    );
  }

  const statusInfo = STATUS_MAP[contract.status] || { label: contract.status, variant: 'outline' as const };
  const isRetainer = contract.contract_type === 'retainer';
  const bh = contract.billing_history;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/portal/contracts">
          <Button variant="ghost" size="icon"><ArrowRight className="h-5 w-5" /></Button>
        </Link>
        <h1 className="text-2xl font-bold truncate">{contract.title || 'بدون عنوان'}</h1>
        <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
      </div>

      {/* Contract info card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <FileSignature className="h-4 w-4" />
            تفاصيل العقد
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            {contract.contract_type && (
              <div>
                <p className="text-muted-foreground text-xs">نوع العقد</p>
                <p className="font-medium">{TYPE_MAP[contract.contract_type] || contract.contract_type}</p>
              </div>
            )}
            <div>
              <p className="text-muted-foreground text-xs">القيمة الإجمالية</p>
              <p className="font-mono font-bold">{formatCurrency(contract.total_value, contract.currency)}</p>
            </div>
            {isRetainer && contract.retainer_amount > 0 && (
              <div>
                <p className="text-muted-foreground text-xs">المبلغ الشهري</p>
                <p className="font-mono">{formatCurrency(contract.retainer_amount, contract.currency)}</p>
              </div>
            )}
            {contract.project_name && (
              <div>
                <p className="text-muted-foreground text-xs">المشروع</p>
                <p>{contract.project_name}</p>
              </div>
            )}
            {contract.start_date && (
              <div>
                <p className="text-muted-foreground text-xs">تاريخ البداية</p>
                <p>{contract.start_date}</p>
              </div>
            )}
            {contract.end_date && (
              <div>
                <p className="text-muted-foreground text-xs">تاريخ النهاية</p>
                <p>{contract.end_date}</p>
              </div>
            )}
          </div>
          {contract.description && (
            <p className="mt-4 text-sm text-muted-foreground whitespace-pre-wrap">{contract.description}</p>
          )}
        </CardContent>
      </Card>

      {/* Retainer billing history */}
      {isRetainer && bh && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarClock className="h-4 w-4" />
                سجل الفوترة
              </CardTitle>
              {bh.recurring_invoice && (
                <Badge variant={bh.recurring_invoice.status === 'active' ? 'default' : 'secondary'}>
                  {bh.recurring_invoice.status === 'active' ? 'فوترة نشطة' : 'متوقفة'}
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {bh.invoices.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title="لا توجد فواتير بعد"
                description="ستصدر الفواتير تلقائياً حسب الجدول الزمني"
              />
            ) : (
              <>
                {/* Summary */}
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">المفوتر</p>
                    <p className="text-lg font-bold font-mono">
                      {formatCurrency(bh.summary.total_billed, contract.currency)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">المدفوع</p>
                    <p className="text-lg font-bold font-mono text-green-600 dark:text-green-400">
                      {formatCurrency(bh.summary.total_paid, contract.currency)}
                    </p>
                  </div>
                  <div className="rounded-lg border p-3 text-center">
                    <p className="text-xs text-muted-foreground">المتبقي</p>
                    <p className="text-lg font-bold font-mono text-orange-600 dark:text-orange-400">
                      {formatCurrency(bh.summary.total_remaining, contract.currency)}
                    </p>
                  </div>
                </div>

                {/* Next billing */}
                {bh.recurring_invoice?.next_generation_date && bh.recurring_invoice.status === 'active' && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg p-3">
                    <CalendarClock className="h-4 w-4" />
                    <span>الفاتورة القادمة: {bh.recurring_invoice.next_generation_date}</span>
                  </div>
                )}

                {/* Invoice list */}
                <div className="space-y-2">
                  {bh.invoices.map(inv => {
                    const invStatus = INVOICE_STATUS_MAP[inv.status] || { label: inv.status, variant: 'outline' as const };
                    return (
                      <Link key={inv.id} href={`/portal/invoices/${inv.id}`}>
                        <div className="flex items-center gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm">{inv.invoice_number}</span>
                              <Badge variant={invStatus.variant}>{invStatus.label}</Badge>
                            </div>
                            <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                              {inv.issue_date && <span>{inv.issue_date}</span>}
                              <span className="font-mono">{formatCurrency(inv.total, inv.currency)}</span>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
