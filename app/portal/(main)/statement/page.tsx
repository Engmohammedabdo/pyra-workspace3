'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCurrency, formatDate } from '@/lib/utils/format';
import { toast } from 'sonner';
import {
  Receipt,
  CreditCard,
  ArrowDownCircle,
  ArrowUpCircle,
  Wallet,
  AlertTriangle,
  Filter,
  FileText,
  FileSignature,
  Clock,
} from 'lucide-react';

interface StatementEntry {
  date: string;
  type: 'invoice' | 'payment' | 'stripe_payment';
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance: number;
  invoice_id?: string;
  currency: string;
}

interface StatementSummary {
  total_invoiced: number;
  total_paid: number;
  total_remaining: number;
  overdue_amount: number;
  unbilled_amount: number;
  invoice_count: number;
  payment_count: number;
}

interface UnbilledObligation {
  contract_id: string;
  contract_title: string;
  total_value: number;
  amount_billed: number;
  unbilled_amount: number;
  currency: string;
  pending_milestones: { title: string; amount: number }[];
}

interface StatementData {
  client: { name: string; company: string; email: string };
  summary: StatementSummary;
  entries: StatementEntry[];
  unbilled_obligations: UnbilledObligation[];
}

export default function PortalStatementPage() {
  const router = useRouter();
  const [data, setData] = useState<StatementData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const fetchStatement = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (fromDate) params.set('from', fromDate);
      if (toDate) params.set('to', toDate);
      const res = await fetch(`/api/portal/statement?${params}`);
      const json = await res.json();
      if (json.data) setData(json.data);
    } catch {
      toast.error('فشل في تحميل كشف الحساب');
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <EmptyState
        icon={Receipt}
        title="لا يوجد كشف حساب"
        description="لم يتم العثور على بيانات مالية"
      />
    );
  }

  const { summary, entries, unbilled_obligations } = data;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold">كشف الحساب</h1>
        <p className="text-muted-foreground text-sm mt-1">
          ملخص شامل لحسابك المالي مع تفاصيل الفواتير والمدفوعات
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                <FileText className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">إجمالي الفواتير</p>
                <p className="text-xl font-bold font-mono tabular-nums">
                  {formatCurrency(summary.total_invoiced)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {summary.invoice_count} فاتورة
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <CreditCard className="h-5 w-5 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المبلغ المدفوع</p>
                <p className="text-xl font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                  {formatCurrency(summary.total_paid)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {summary.payment_count} دفعة
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center">
                <Wallet className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">المبلغ المتبقي</p>
                <p className="text-xl font-bold font-mono tabular-nums text-orange-600 dark:text-orange-400">
                  {formatCurrency(summary.total_remaining)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/10 flex items-center justify-center">
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">مبالغ متأخرة</p>
                <p className="text-xl font-bold font-mono tabular-nums text-red-600 dark:text-red-400">
                  {formatCurrency(summary.overdue_amount)}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {summary.unbilled_amount > 0 && (
          <Card className="border-purple-500/20 bg-purple-500/5">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 flex items-center justify-center">
                  <FileSignature className="h-5 w-5 text-purple-500" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">مبالغ غير مفوترة</p>
                  <p className="text-xl font-bold font-mono tabular-nums text-purple-600 dark:text-purple-400">
                    {formatCurrency(summary.unbilled_amount)}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    من عقود قيد التنفيذ
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">تصفية حسب الفترة:</span>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
                placeholder="من تاريخ"
              />
              <span className="text-muted-foreground">—</span>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
                placeholder="إلى تاريخ"
              />
            </div>
            {(fromDate || toDate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
              >
                مسح الفلتر
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Statement Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Receipt className="h-4 w-4 text-portal" />
            كشف الحساب التفصيلي
          </CardTitle>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="لا توجد حركات"
              description="لم يتم تسجيل أي حركات مالية في الفترة المحددة"
            />
          ) : (
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
          )}
        </CardContent>
      </Card>

      {/* Unbilled Contract Obligations */}
      {unbilled_obligations && unbilled_obligations.length > 0 && (
        <Card className="border-purple-500/20">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileSignature className="h-4 w-4 text-purple-500" />
              التزامات تعاقدية غير مفوترة
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              مبالغ من عقود قيد التنفيذ لم يتم إصدار فواتير لها بعد
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {unbilled_obligations.map((obligation) => (
                <div
                  key={obligation.contract_id}
                  className="border rounded-lg p-4 bg-muted/30"
                >
                  <div className="flex items-start justify-between gap-4 mb-3">
                    <div>
                      <button
                        onClick={() => router.push(`/portal/contracts/${obligation.contract_id}`)}
                        className="font-medium text-portal hover:underline"
                      >
                        {obligation.contract_title}
                      </button>
                      <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                        <span>قيمة العقد: {formatCurrency(obligation.total_value, obligation.currency)}</span>
                        <span>تم فوترة: {formatCurrency(obligation.amount_billed, obligation.currency)}</span>
                      </div>
                    </div>
                    <div className="text-end">
                      <p className="text-xs text-muted-foreground">المتبقي</p>
                      <p className="text-lg font-bold font-mono tabular-nums text-purple-600 dark:text-purple-400">
                        {formatCurrency(obligation.unbilled_amount, obligation.currency)}
                      </p>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-muted rounded-full h-2 mb-3">
                    <div
                      className="bg-purple-500 h-2 rounded-full transition-all"
                      style={{
                        width: `${Math.min((obligation.amount_billed / obligation.total_value) * 100, 100)}%`,
                      }}
                    />
                  </div>

                  {/* Pending milestones */}
                  {obligation.pending_milestones.length > 0 && (
                    <div className="mt-3 space-y-2">
                      <p className="text-xs font-medium text-muted-foreground">مراحل معلّقة:</p>
                      {obligation.pending_milestones.map((ms, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-sm bg-background rounded-md px-3 py-2"
                        >
                          <div className="flex items-center gap-2">
                            <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                            <span>{ms.title}</span>
                          </div>
                          <span className="font-mono tabular-nums text-muted-foreground">
                            {formatCurrency(ms.amount, obligation.currency)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
