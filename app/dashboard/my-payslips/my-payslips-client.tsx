'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { fetchAPI } from '@/hooks/api-helpers';
import { useMyPayslips } from '@/hooks/usePayroll';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { MyDeductionRiskPanel } from '@/components/hr/deductions/MyDeductionRiskPanel';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  FileText,
  Download,
  Wallet,
  Banknote,
  CalendarDays,
  TrendingUp,
  Loader2,
} from 'lucide-react';
import { generatePayslipPDF } from '@/lib/pdf/payslip-pdf';
import { monthNamesFor } from '@/lib/constants/dates';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';
import { EMPLOYEE_PAYMENT_SOURCE_TYPE } from '@/lib/constants/payroll';
import { EMPLOYEE_PAYMENT_STATUS } from '@/lib/constants/statuses';

// ============================================================
// Types
// ============================================================

interface Payslip {
  id: string;
  payroll_id: string;
  username: string;
  base_salary: number;
  task_payments: number;
  overtime_amount: number;
  bonus: number;
  commission: number;
  deductions: number;
  deduction_details: Array<{ type: string; amount: number }>;
  net_pay: number;
  status: string;
  month: number;
  year: number;
  run_status: string;
  currency: string;
  paid_at: string | null;
}

// ============================================================
// Constants
// ============================================================

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  calculated: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
};

// Status labels for BOTH entities used in this file (payroll run_status +
// employeePayment status) are resolved via useStatusLabels() inside the
// component — see H3: this single map previously served two different
// status vocabularies at two call sites (payslip.run_status vs p.status).

function formatCurrency(amount: number, currency: string = 'AED'): string {
  return `\u200E${Number(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

// ============================================================
// Component
// ============================================================

interface Payment {
  id: string;
  source_type: string;
  description: string | null;
  amount: number;
  currency: string;
  status: string;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
  created_at: string;
}

export default function MyPayslipsClient() {
  const t = useTranslations('hr.payslips');
  const locale = useLocale() as Locale;
  const payrollStatusLabelFor = useStatusLabels('payroll');
  const paymentStatusLabelFor = useStatusLabels('employeePayment');
  const sourceTypeLabelFor = useStatusLabels('paymentSourceType');
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const { data: payslipsData, isLoading: loading } = useMyPayslips();

  const payslips: Payslip[] = payslipsData?.payslips || [];
  const payments: Payment[] = payslipsData?.payments || [];

  // Download payslip
  const handleDownload = async (payslip: Payslip) => {
    try {
      setDownloadingId(payslip.id);

      const data = await fetchAPI<{
        company_name: string;
        employee: { display_name: string; department: string | null };
        payroll: { month: number; year: number; currency?: string };
        item: {
          base_salary: number; task_payments: number; overtime_amount: number;
          bonus: number; commission: number; deductions: number;
          deduction_details: Array<{ type: string; amount: number }>; net_pay: number;
        };
      }>(`/api/dashboard/payroll/${payslip.payroll_id}/payslip?username=${payslip.username}`);

      await generatePayslipPDF({
        company_name: data.company_name,
        employee_name: data.employee.display_name,
        department: data.employee.department,
        month: data.payroll.month,
        year: data.payroll.year,
        currency: data.payroll.currency || 'AED',
        base_salary: Number(data.item.base_salary),
        task_payments: Number(data.item.task_payments),
        overtime_amount: Number(data.item.overtime_amount),
        bonus: Number(data.item.bonus),
        commission: Number(data.item.commission),
        deductions: Number(data.item.deductions),
        deduction_details: data.item.deduction_details || [],
        net_pay: Number(data.item.net_pay),
      });

      toast.success(t('toasts.downloadSuccess'));
    } catch {
      toast.error(t('toasts.downloadError'));
    } finally {
      setDownloadingId(null);
    }
  };

  // Summary stats — grouped by currency to avoid summing across currencies
  // Each map: currency → amount
  const totalEarningsByCurrency: Record<string, number> = {};
  for (const p of payslips.filter(s => s.run_status === 'paid')) {
    const cur = p.currency || 'AED';
    totalEarningsByCurrency[cur] = (totalEarningsByCurrency[cur] ?? 0) + Number(p.net_pay);
  }

  const totalPaymentsByCurrency: Record<string, number> = {};
  for (const p of payments.filter(s => s.status === 'paid')) {
    const cur = p.currency || 'AED';
    const delta = p.source_type === 'deduction' ? -Number(p.amount) : Number(p.amount);
    totalPaymentsByCurrency[cur] = (totalPaymentsByCurrency[cur] ?? 0) + delta;
  }

  const pendingPaymentsByCurrency: Record<string, number> = {};
  for (const p of payments.filter(s => s.status === 'pending' || s.status === 'approved')) {
    const cur = p.currency || 'AED';
    pendingPaymentsByCurrency[cur] = (pendingPaymentsByCurrency[cur] ?? 0) + Number(p.amount);
  }

  // Grand total per currency = payslip earnings + paid payments
  const grandTotalByCurrency: Record<string, number> = { ...totalEarningsByCurrency };
  for (const [cur, amt] of Object.entries(totalPaymentsByCurrency)) {
    grandTotalByCurrency[cur] = (grandTotalByCurrency[cur] ?? 0) + amt;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t('title')}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t('subtitle')}</p>
      </div>

      <MyDeductionRiskPanel />

      {/* Stats cards */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="pt-4 pb-4">
                <Skeleton className="h-4 w-24 mb-2" />
                <Skeleton className="h-7 w-32" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (payslips.length > 0 || payments.length > 0) ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4 text-center">
              <Wallet className="h-5 w-5 mx-auto mb-1 text-emerald-500" />
              <p className="text-[10px] text-muted-foreground">{t('stats.totalReceived')}</p>
              {Object.entries(grandTotalByCurrency).length === 0 ? (
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(0)}</p>
              ) : (
                Object.entries(grandTotalByCurrency).map(([cur, amt]) => (
                  <p key={cur} className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono leading-tight">{formatCurrency(amt, cur)}</p>
                ))
              )}
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4 text-center">
              <TrendingUp className="h-5 w-5 mx-auto mb-1 text-orange-500" />
              <p className="text-[10px] text-muted-foreground">{t('stats.commissionsAndTasks')}</p>
              {Object.entries(totalPaymentsByCurrency).length === 0 ? (
                <p className="text-xl font-bold text-orange-600 dark:text-orange-400 font-mono">{formatCurrency(0)}</p>
              ) : (
                Object.entries(totalPaymentsByCurrency).map(([cur, amt]) => (
                  <p key={cur} className="text-xl font-bold text-orange-600 dark:text-orange-400 font-mono leading-tight">{formatCurrency(amt, cur)}</p>
                ))
              )}
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4 text-center">
              <CalendarDays className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
              <p className="text-[10px] text-muted-foreground">{t('stats.pending')}</p>
              {Object.entries(pendingPaymentsByCurrency).length === 0 ? (
                <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400 font-mono">{formatCurrency(0)}</p>
              ) : (
                Object.entries(pendingPaymentsByCurrency).map(([cur, amt]) => (
                  <p key={cur} className="text-xl font-bold text-yellow-600 dark:text-yellow-400 font-mono leading-tight">{formatCurrency(amt, cur)}</p>
                ))
              )}
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4 text-center">
              <FileText className="h-5 w-5 mx-auto mb-1 text-blue-500" />
              <p className="text-[10px] text-muted-foreground">{t('stats.paymentsCount')}</p>
              <p className="text-xl font-bold">{payslips.length + payments.length}</p>
            </CardContent>
          </Card>
        </div>
      ) : null}

      {/* Payslips list */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3, 4].map(i => (
            <Card key={i} className="border-0 shadow-sm">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <div className="space-y-2">
                    <Skeleton className="h-5 w-36" />
                    <Skeleton className="h-4 w-24" />
                  </div>
                  <Skeleton className="h-9 w-28" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : payslips.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      ) : (
        <div className="space-y-3">
          {payslips.map((payslip) => (
            <Card key={payslip.id} className="border-0 shadow-sm">
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                      <CalendarDays className="h-5 w-5 text-orange-500" />
                    </div>
                    <div>
                      <p className="font-semibold text-foreground">
                        {monthNamesFor(locale)[(payslip.month || 1) - 1]} {payslip.year}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant="outline"
                          className={`text-[11px] border-0 ${STATUS_STYLES[payslip.run_status] || ''}`}
                        >
                          {payrollStatusLabelFor(payslip.run_status)}
                        </Badge>
                        {payslip.paid_at && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(payslip.paid_at).toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    {/* Pay breakdown mini-view */}
                    <div className="hidden sm:flex flex-col items-end gap-0.5">
                      <p className="font-bold text-foreground">
                        {formatCurrency(payslip.net_pay, payslip.currency)}
                      </p>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        <span>{t('breakdown.base', { amount: formatCurrency(payslip.base_salary, payslip.currency) })}</span>
                        {payslip.bonus > 0 && (
                          <span className="text-green-600 dark:text-green-400">
                            {t('breakdown.bonus', { amount: formatCurrency(payslip.bonus, payslip.currency) })}
                          </span>
                        )}
                        {payslip.deductions > 0 && (
                          <span className="text-red-600 dark:text-red-400">
                            {t('breakdown.deduction', { amount: formatCurrency(payslip.deductions, payslip.currency) })}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Mobile: just show net pay */}
                    <div className="sm:hidden text-end">
                      <p className="font-bold text-foreground">
                        {formatCurrency(payslip.net_pay, payslip.currency)}
                      </p>
                    </div>

                    {/* Download button */}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      onClick={() => handleDownload(payslip)}
                      disabled={downloadingId === payslip.id}
                    >
                      {downloadingId === payslip.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Download className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">{t('downloadButton')}</span>
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* ═══════════ Employee Payments Section ═══════════ */}
      {!loading && payments.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Wallet className="h-5 w-5 text-orange-500" aria-hidden="true" />
            {t('paymentsSectionTitle')}
          </h2>
          {payments.map(p => {
            const cancelledDeduction = p.source_type === EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION
              && p.status === EMPLOYEE_PAYMENT_STATUS.REJECTED;
            return (
            <Card
              key={p.id}
              data-testid={cancelledDeduction ? `cancelled-payment-${p.id}` : undefined}
              className="border-0 shadow-sm transition-shadow hover:shadow-md"
            >
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      cancelledDeduction ? 'bg-slate-500/10 text-slate-500 dark:text-slate-400' :
                      p.source_type === 'commission' ? 'bg-purple-500/10 text-purple-500' :
                      p.source_type === 'bonus' ? 'bg-green-500/10 text-green-500' :
                      p.source_type === 'deduction' ? 'bg-red-500/10 text-red-500' :
                      p.source_type === 'task' ? 'bg-blue-500/10 text-blue-500' :
                      'bg-orange-500/10 text-orange-500'
                    }`}>
                      <Banknote className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge variant="outline" className="text-[10px]">
                          {sourceTypeLabelFor(p.source_type)}
                        </Badge>
                        <Badge className={`text-[10px] border-0 ${
                          cancelledDeduction ? 'bg-slate-500/10 text-slate-600 dark:text-slate-400' :
                          p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                          p.status === 'approved' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                          'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                        }`}>
                          {cancelledDeduction
                            ? t('cancelledPayment.title')
                            : paymentStatusLabelFor(p.status)}
                        </Badge>
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{p.description}</p>
                      )}
                      {cancelledDeduction && p.cancellation_reason && (
                        <p className="mt-1 break-words text-xs text-slate-600 dark:text-slate-400">
                          {t('cancelledPayment.reason', { reason: p.cancellation_reason })}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                        {new Date(cancelledDeduction && p.cancelled_at ? p.cancelled_at : p.created_at)
                          .toLocaleDateString(locale === 'ar' ? 'ar-AE' : 'en-GB', {
                            year: 'numeric', month: 'long', day: 'numeric',
                          })}
                      </p>
                    </div>
                  </div>
                  <p className={`font-bold font-mono text-lg shrink-0 ${
                    cancelledDeduction
                      ? 'text-slate-600 line-through dark:text-slate-400'
                      : p.source_type === EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION
                        ? 'text-red-600 dark:text-red-400'
                        : 'text-foreground'
                  }`}>
                    {p.source_type === EMPLOYEE_PAYMENT_SOURCE_TYPE.DEDUCTION && !cancelledDeduction
                      ? '-'
                      : ''}
                    {formatCurrency(p.amount, p.currency || 'AED')}
                  </p>
                </div>
              </CardContent>
            </Card>
            );
          })}
        </div>
      )}

      {/* Empty state when nothing at all */}
      {!loading && payslips.length === 0 && payments.length === 0 && (
        <EmptyState
          icon={Wallet}
          title={t('emptyAll.title')}
          description={t('emptyAll.description')}
        />
      )}
    </motion.div>
  );
}
