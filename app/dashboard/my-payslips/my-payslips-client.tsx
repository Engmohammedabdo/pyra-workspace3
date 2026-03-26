'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
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

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  calculated: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'مسودة',
  calculated: 'محسوب',
  approved: 'معتمد',
  paid: 'مدفوع',
  pending: 'معلق',
};

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
  created_at: string;
}

const SOURCE_LABELS: Record<string, string> = {
  commission: 'عمولة', task: 'مهمة', bonus: 'مكافأة', deduction: 'خصم', overtime: 'إضافي', salary: 'راتب',
};

export default function MyPayslipsClient() {
  const [payslips, setPayslips] = useState<Payslip[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Fetch payslips
  const fetchPayslips = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard/my-payslips');
      if (res.ok) {
        const { data } = await res.json();
        setPayslips(data?.payslips || data || []);
        setPayments(data?.payments || []);
      } else {
        toast.error('فشل في تحميل كشوف الرواتب');
      }
    } catch {
      toast.error('حدث خطأ أثناء تحميل البيانات');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPayslips();
  }, [fetchPayslips]);

  // Download payslip
  const handleDownload = async (payslip: Payslip) => {
    try {
      setDownloadingId(payslip.id);

      const res = await fetch(
        `/api/dashboard/payroll/${payslip.payroll_id}/payslip?username=${payslip.username}`
      );

      if (!res.ok) {
        toast.error('فشل في تحميل بيانات كشف الراتب');
        return;
      }

      const { data } = await res.json();

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
        deductions: Number(data.item.deductions),
        deduction_details: data.item.deduction_details || [],
        net_pay: Number(data.item.net_pay),
      });

      toast.success('تم تحميل كشف الراتب');
    } catch {
      toast.error('حدث خطأ أثناء إنشاء كشف الراتب');
    } finally {
      setDownloadingId(null);
    }
  };

  // Summary stats
  const totalEarnings = payslips
    .filter(p => p.run_status === 'paid')
    .reduce((sum, p) => sum + Number(p.net_pay), 0);

  const totalPayments = payments
    .filter(p => p.status === 'paid')
    .reduce((sum, p) => sum + (p.source_type === 'deduction' ? -p.amount : p.amount), 0);

  const pendingPayments = payments
    .filter(p => p.status === 'pending' || p.status === 'approved')
    .reduce((sum, p) => sum + p.amount, 0);

  const lastPaidPayslip = payslips.find(p => p.run_status === 'paid');
  const grandTotal = totalEarnings + totalPayments;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">كشف حسابي</h1>
        <p className="text-sm text-muted-foreground mt-1">كشوف الرواتب والمدفوعات والعمولات</p>
      </div>

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
              <p className="text-[10px] text-muted-foreground">إجمالي المستلم</p>
              <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 font-mono">{formatCurrency(grandTotal)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4 text-center">
              <TrendingUp className="h-5 w-5 mx-auto mb-1 text-orange-500" />
              <p className="text-[10px] text-muted-foreground">عمولات ومهام</p>
              <p className="text-xl font-bold text-orange-600 dark:text-orange-400 font-mono">{formatCurrency(totalPayments)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4 text-center">
              <CalendarDays className="h-5 w-5 mx-auto mb-1 text-yellow-500" />
              <p className="text-[10px] text-muted-foreground">قيد المعالجة</p>
              <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400 font-mono">{formatCurrency(pendingPayments)}</p>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="pt-4 pb-4 text-center">
              <FileText className="h-5 w-5 mx-auto mb-1 text-blue-500" />
              <p className="text-[10px] text-muted-foreground">عدد الدفعات</p>
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
          title="لا توجد كشوف رواتب"
          description="لم يتم إصدار أي كشوف رواتب لحسابك بعد"
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
                        {MONTH_NAMES_AR[(payslip.month || 1) - 1]} {payslip.year}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <Badge
                          variant="outline"
                          className={`text-[11px] border-0 ${STATUS_STYLES[payslip.run_status] || ''}`}
                        >
                          {STATUS_LABELS[payslip.run_status] || payslip.run_status}
                        </Badge>
                        {payslip.paid_at && (
                          <span className="text-xs text-muted-foreground">
                            {new Date(payslip.paid_at).toLocaleDateString('ar-AE')}
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
                        <span>أساسي: {formatCurrency(payslip.base_salary)}</span>
                        {payslip.bonus > 0 && (
                          <span className="text-green-600 dark:text-green-400">
                            +مكافأة: {formatCurrency(payslip.bonus)}
                          </span>
                        )}
                        {payslip.deductions > 0 && (
                          <span className="text-red-600 dark:text-red-400">
                            -خصم: {formatCurrency(payslip.deductions)}
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
                      <span className="hidden sm:inline">تحميل</span>
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
            <Wallet className="h-5 w-5 text-orange-500" />
            سجل المدفوعات والعمولات
          </h2>
          {payments.map(p => (
            <Card key={p.id} className="border-0 shadow-sm hover:shadow-md transition-shadow">
              <CardContent className="py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
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
                          {SOURCE_LABELS[p.source_type] || p.source_type}
                        </Badge>
                        <Badge className={`text-[10px] border-0 ${
                          p.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                          p.status === 'approved' ? 'bg-blue-500/10 text-blue-600 dark:text-blue-400' :
                          'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400'
                        }`}>
                          {STATUS_LABELS[p.status] || p.status}
                        </Badge>
                      </div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground mt-1 truncate">{p.description}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/50 mt-0.5">
                        {new Date(p.created_at).toLocaleDateString('ar-AE', { year: 'numeric', month: 'long', day: 'numeric' })}
                      </p>
                    </div>
                  </div>
                  <p className={`font-bold font-mono text-lg shrink-0 ${
                    p.source_type === 'deduction' ? 'text-red-600 dark:text-red-400' : 'text-foreground'
                  }`}>
                    {p.source_type === 'deduction' ? '-' : ''}{formatCurrency(p.amount, p.currency || 'AED')}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Empty state when nothing at all */}
      {!loading && payslips.length === 0 && payments.length === 0 && (
        <EmptyState
          icon={Wallet}
          title="لا توجد مدفوعات"
          description="لم يتم تسجيل أي رواتب أو مدفوعات بعد"
        />
      )}
    </motion.div>
  );
}
