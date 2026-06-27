'use client';

import { useState } from 'react';
import { fetchAPI } from '@/hooks/api-helpers';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { motion } from 'framer-motion';
import {
  Wallet,
  Plus,
  Calculator,
  CheckCircle,
  Banknote,
  CalendarDays,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Download,
  Loader2,
  Receipt,
} from 'lucide-react';
import { generatePayslipPDF } from '@/lib/pdf/payslip-pdf';
import { PAYROLL_STATUS_LABELS } from '@/lib/constants/statuses';
import { formatCurrency } from '@/lib/utils/format';
import {
  usePayrollRuns,
  usePayrollRun,
  useCreatePayroll,
  useCalculatePayroll,
  useUpdatePayroll,
} from '@/hooks/usePayroll';
import { useEmployeePayments, useCreateEmployeePayment } from '@/hooks/useEmployeePayments';
import { useUsers } from '@/hooks/useUsers';

// ============================================================
// Types
// ============================================================

interface PayrollRun {
  id: string;
  month: number;
  year: number;
  status: string;
  total_amount: number;
  currency: string;
  employee_count: number;
  calculated_at: string | null;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  items?: PayrollItem[];
}

interface PayrollItem {
  id: string;
  payroll_id: string;
  username: string;
  display_name: string;
  department: string | null;
  base_salary: number;
  task_payments: number;
  overtime_amount: number;
  bonus: number;
  deductions: number;
  deduction_details: Array<{ type: string; amount: number }>;
  net_pay: number;
  status: string;
}

interface EmployeePayment {
  id: string;
  username: string;
  display_name?: string;
  source_type: string;
  amount: number;
  status: string;
  payroll_id: string | null;
  description: string | null;
  created_at: string;
}

// ============================================================
// Constants
// ============================================================

const MONTH_NAMES_AR = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/20',
  calculated: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/20',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
};

const STATUS_LABELS: Record<string, string> = PAYROLL_STATUS_LABELS;

const SOURCE_TYPE_LABELS: Record<string, string> = {
  task: 'مهمة',
  bonus: 'مكافأة',
  deduction: 'خصم',
  salary: 'راتب',
  advance: 'سلفة',
  commission: 'عمولة',
  overtime: 'إضافي',
};

const PAYMENT_STATUS_STYLES: Record<string, string> = {
  pending: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400',
  approved: 'bg-green-500/10 text-green-600 dark:text-green-400',
  rejected: 'bg-red-500/10 text-red-600 dark:text-red-400',
  paid: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'معلق',
  approved: 'معتمد',
  rejected: 'مرفوض',
  paid: 'مدفوع',
};

// ============================================================
// Component
// ============================================================

export default function PayrollClient() {
  // ── Expanded run (for items detail) ──
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);

  // Create dialog state
  const [createOpen, setCreateOpen] = useState(false);
  const [newMonth, setNewMonth] = useState<string>(String(new Date().getMonth() + 1));
  const [newYear, setNewYear] = useState<string>(String(new Date().getFullYear()));

  // Add Payment dialog
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [payForm, setPayForm] = useState({ username: '', source_type: 'commission', description: '', amount: '', currency: 'AED' });

  // Per-row action tracking (only needed for UI spinner — mutations track isPending globally)
  const [calculatingId, setCalculatingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [downloadingPayslip, setDownloadingPayslip] = useState<string | null>(null);

  // Year filter
  const currentYear = new Date().getFullYear();
  const [filterYear, setFilterYear] = useState<string>(String(currentYear));

  // ── React Query: list data ──
  const { data: runs = [], isLoading: loading } = usePayrollRuns(filterYear);
  const { data: payments = [], isLoading: paymentsLoading } = useEmployeePayments();
  const { data: allUsersRaw = [] } = useUsers();
  const allUsers = allUsersRaw
    .filter((u) => u.username && u.display_name)
    .map((u) => ({ username: u.username as string, display_name: u.display_name as string }));

  // ── React Query: expanded run detail ──
  const { data: expandedRunData, isLoading: expandedLoading } = usePayrollRun(
    expandedRunId ?? undefined,
  );

  // ── React Query: mutations ──
  const createPayroll = useCreatePayroll();
  const calculatePayroll = useCalculatePayroll();
  const updatePayroll = useUpdatePayroll();
  const createEmployeePayment = useCreateEmployeePayment();

  // ── Toggle expanded run ──
  const toggleExpandRun = (runId: string) => {
    if (expandedRunId === runId) {
      setExpandedRunId(null);
    } else {
      setExpandedRunId(runId);
    }
  };

  // ── Create new payroll run ──
  const handleCreate = () => {
    createPayroll.mutate(
      { month: parseInt(newMonth, 10), year: parseInt(newYear, 10) },
      {
        onSuccess: () => {
          toast.success('تم إنشاء مسير الرواتب بنجاح');
          setCreateOpen(false);
        },
        onError: () => toast.error('فشل في إنشاء مسير الرواتب'),
      },
    );
  };

  // ── Calculate payroll ──
  const handleCalculate = (runId: string) => {
    setCalculatingId(runId);
    calculatePayroll.mutate(runId, {
      onSuccess: () => {
        toast.success('تم حساب الرواتب بنجاح');
      },
      onError: () => toast.error('فشل في حساب الرواتب'),
      onSettled: () => setCalculatingId(null),
    });
  };

  // ── Approve payroll ──
  const handleApprove = (runId: string) => {
    setApprovingId(runId);
    updatePayroll.mutate(
      { runId, action: 'approve' },
      {
        onSuccess: () => toast.success('تم اعتماد مسير الرواتب'),
        onError: () => toast.error('فشل في اعتماد المسير'),
        onSettled: () => setApprovingId(null),
      },
    );
  };

  // ── Mark as paid ──
  const handlePay = (runId: string) => {
    setPayingId(runId);
    updatePayroll.mutate(
      { runId, action: 'pay' },
      {
        onSuccess: () => toast.success('تم تأكيد صرف الرواتب'),
        onError: () => toast.error('فشل في تأكيد الدفع'),
        onSettled: () => setPayingId(null),
      },
    );
  };

  // ── Save new payment ──
  const handleSavePayment = () => {
    if (!payForm.username || !payForm.amount || !payForm.source_type) {
      toast.error('اختر الموظف والنوع والمبلغ');
      return;
    }
    createEmployeePayment.mutate(
      {
        username: payForm.username,
        source_type: payForm.source_type,
        description: payForm.description || '',
        amount: Number(payForm.amount),
        currency: payForm.currency,
      },
      {
        onSuccess: () => {
          toast.success('تم تسجيل الدفعة');
          setPaymentOpen(false);
          setPayForm({ username: '', source_type: 'commission', description: '', amount: '', currency: 'AED' });
        },
        onError: () => toast.error('فشل في تسجيل الدفعة'),
      },
    );
  };

  // ── Download payslip (PDF generation — keep as-is) ──
  const handleDownloadPayslip = async (runId: string, username: string) => {
    try {
      setDownloadingPayslip(`${runId}-${username}`);
      const resp = await fetchAPI<{ data: any }>(`/api/dashboard/payroll/${runId}/payslip?username=${username}`);
      const data = (resp as any).data ?? resp;

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
      setDownloadingPayslip(null);
    }
  };

  // ── Render ──
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">مسير الرواتب</h1>
          <p className="text-sm text-muted-foreground mt-1">إدارة وصرف رواتب الموظفين</p>
        </div>
        <Button
          onClick={() => setCreateOpen(true)}
          className="gap-2 bg-orange-500 hover:bg-orange-600 text-white"
        >
          <Plus className="h-4 w-4" />
          إنشاء مسير رواتب
        </Button>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="runs" className="space-y-4">
        <TabsList>
          <TabsTrigger value="runs" className="gap-1.5">
            <Wallet className="h-4 w-4" />
            مسيرات الرواتب
          </TabsTrigger>
          <TabsTrigger value="payments" className="gap-1.5">
            <Receipt className="h-4 w-4" />
            المدفوعات
          </TabsTrigger>
        </TabsList>

        {/* ═══════════ Payroll Runs Tab ═══════════ */}
        <TabsContent value="runs" className="space-y-4">
          {/* Year filter */}
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">السنة:</span>
            <Select value={filterYear} onValueChange={(val) => setFilterYear(val)}>
              <SelectTrigger className="w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 5 }, (_, i) => currentYear - i).map(yr => (
                  <SelectItem key={yr} value={String(yr)}>{yr}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Loading */}
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="pt-6">
                    <div className="flex items-center justify-between">
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-40" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <Skeleton className="h-8 w-20" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : runs.length === 0 ? (
            <EmptyState
              icon={Wallet}
              title="لا توجد مسيرات رواتب"
              description="أنشئ مسير رواتب جديد لبدء حساب وصرف الرواتب"
              actionLabel="إنشاء مسير رواتب"
              onAction={() => setCreateOpen(true)}
            />
          ) : (
            <div className="space-y-3">
              {(runs as PayrollRun[]).map((run) => {
                const isExpanded = expandedRunId === run.id;
                const detailId = `payroll-detail-${run.id}`;
                return (
                <Card key={run.id} className="border-0 shadow-sm overflow-hidden">
                  {/* Run header — toggle button for expand/collapse */}
                  <CardContent className="pt-5 pb-4">
                    <button
                      type="button"
                      className="w-full text-start cursor-pointer hover:bg-muted/30 transition-colors rounded-sm -mx-1 px-1"
                      onClick={() => toggleExpandRun(run.id)}
                      aria-expanded={isExpanded}
                      aria-controls={detailId}
                      aria-label={`تفاصيل مسير ${run.month}/${run.year}`}
                    >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-4">
                        {/* Month/Year */}
                        <div className="flex items-center gap-2">
                          <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                            <CalendarDays className="h-5 w-5 text-orange-500" />
                          </div>
                          <div>
                            <p className="font-semibold text-foreground">
                              {MONTH_NAMES_AR[run.month - 1]} {run.year}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {run.employee_count} موظف
                            </p>
                          </div>
                        </div>

                        {/* Status badge */}
                        <Badge
                          variant="outline"
                          className={`text-xs border ${STATUS_STYLES[run.status] || ''}`}
                        >
                          {STATUS_LABELS[run.status] || run.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4">
                        {/* Total amount */}
                        <div className="text-end">
                          <p className="font-bold text-foreground">
                            {formatCurrency(run.total_amount, run.currency)}
                          </p>
                          <p className="text-xs text-muted-foreground">الإجمالي</p>
                        </div>

                        {/* Expand icon */}
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5 text-muted-foreground" />
                        ) : (
                          <ChevronDown className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                    </div>
                    </button>
                  </CardContent>

                  {/* Expanded details */}
                  <div id={detailId} hidden={!isExpanded} className="border-t border-border">
                  {isExpanded && (
                      <CardContent className="pt-4 pb-5">
                        {/* Action buttons */}
                        <div className="flex flex-wrap gap-2 mb-4">
                          {(run.status === 'draft' || run.status === 'calculated') && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              onClick={(e) => { e.stopPropagation(); handleCalculate(run.id); }}
                              disabled={calculatingId === run.id}
                            >
                              {calculatingId === run.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Calculator className="h-4 w-4" />
                              )}
                              {run.status === 'calculated' ? 'إعادة الحساب' : 'حساب الرواتب'}
                            </Button>
                          )}

                          {run.status === 'calculated' && (
                            <Button
                              size="sm"
                              className="gap-1.5 bg-green-600 hover:bg-green-700 text-white"
                              onClick={(e) => { e.stopPropagation(); handleApprove(run.id); }}
                              disabled={approvingId === run.id}
                            >
                              {approvingId === run.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <CheckCircle className="h-4 w-4" />
                              )}
                              اعتماد المسير
                            </Button>
                          )}

                          {run.status === 'approved' && (
                            <Button
                              size="sm"
                              className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={(e) => { e.stopPropagation(); handlePay(run.id); }}
                              disabled={payingId === run.id}
                            >
                              {payingId === run.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <Banknote className="h-4 w-4" />
                              )}
                              تأكيد الصرف
                            </Button>
                          )}
                        </div>

                        {/* Items table */}
                        {expandedLoading ? (
                          <div className="space-y-3">
                            {[1, 2, 3].map(i => (
                              <Skeleton key={i} className="h-10 w-full rounded" />
                            ))}
                          </div>
                        ) : expandedRunData?.items && expandedRunData.items.length > 0 ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b border-border text-muted-foreground">
                                  <th scope="col" className="text-start pb-3 pe-3 font-medium">الموظف</th>
                                  <th scope="col" className="text-start pb-3 pe-3 font-medium">القسم</th>
                                  <th scope="col" className="text-end pb-3 pe-3 font-medium">الراتب</th>
                                  <th scope="col" className="text-end pb-3 pe-3 font-medium">المهام</th>
                                  <th scope="col" className="text-end pb-3 pe-3 font-medium">إضافي</th>
                                  <th scope="col" className="text-end pb-3 pe-3 font-medium">مكافأة</th>
                                  <th scope="col" className="text-end pb-3 pe-3 font-medium">خصومات</th>
                                  <th scope="col" className="text-end pb-3 pe-3 font-medium">الصافي</th>
                                  <th scope="col" className="text-center pb-3 font-medium">كشف</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(expandedRunData.items as PayrollItem[]).map((item) => (
                                  <tr
                                    key={item.id}
                                    className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                                  >
                                    <td className="py-3 pe-3">
                                      <span className="font-medium text-foreground">
                                        {item.display_name}
                                      </span>
                                    </td>
                                    <td className="py-3 pe-3 text-muted-foreground">
                                      {item.department || '—'}
                                    </td>
                                    <td className="py-3 pe-3 text-end font-mono text-foreground">
                                      {formatCurrency(item.base_salary)}
                                    </td>
                                    <td className="py-3 pe-3 text-end font-mono text-foreground">
                                      {item.task_payments > 0 ? formatCurrency(item.task_payments) : '—'}
                                    </td>
                                    <td className="py-3 pe-3 text-end font-mono text-foreground">
                                      {item.overtime_amount > 0 ? formatCurrency(item.overtime_amount) : '—'}
                                    </td>
                                    <td className="py-3 pe-3 text-end font-mono text-foreground">
                                      {item.bonus > 0 ? formatCurrency(item.bonus) : '—'}
                                    </td>
                                    <td className="py-3 pe-3 text-end font-mono text-red-600 dark:text-red-400">
                                      {item.deductions > 0 ? `- ${formatCurrency(item.deductions)}` : '—'}
                                    </td>
                                    <td className="py-3 pe-3 text-end font-mono font-bold text-foreground">
                                      {formatCurrency(item.net_pay)}
                                    </td>
                                    <td className="py-3 text-center">
                                      <Button
                                        size="icon"
                                        variant="ghost"
                                        className="h-8 w-8"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleDownloadPayslip(run.id, item.username);
                                        }}
                                        disabled={downloadingPayslip === `${run.id}-${item.username}`}
                                        aria-label="تحميل"
                                      >
                                        {downloadingPayslip === `${run.id}-${item.username}` ? (
                                          <Loader2 className="h-4 w-4 animate-spin" />
                                        ) : (
                                          <Download className="h-4 w-4" />
                                        )}
                                      </Button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <div className="text-center py-8 text-muted-foreground text-sm">
                            {run.status === 'draft'
                              ? 'اضغط على "حساب الرواتب" لحساب بنود المسير'
                              : 'لا توجد بنود في هذا المسير'}
                          </div>
                        )}

                        {/* Run metadata */}
                        <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-border text-xs text-muted-foreground">
                          {run.created_by && (
                            <span>أنشئ بواسطة: {run.created_by}</span>
                          )}
                          {run.approved_by && (
                            <span>اعتمد بواسطة: {run.approved_by}</span>
                          )}
                          {run.paid_at && (
                            <span>
                              تاريخ الصرف: {new Date(run.paid_at).toLocaleDateString('ar-AE')}
                            </span>
                          )}
                        </div>
                      </CardContent>
                  )}
                  </div>
                </Card>
              );
              })}
            </div>
          )}
        </TabsContent>

        {/* ═══════════ Employee Payments Tab ═══════════ */}
        <TabsContent value="payments" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">سجل جميع المدفوعات والعمولات للموظفين</p>
            <Button size="sm" className="bg-orange-500 hover:bg-orange-600 text-white" onClick={() => setPaymentOpen(true)}>
              <Plus className="h-4 w-4 me-1" />
              إضافة دفعة
            </Button>
          </div>
          {paymentsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <Card key={i} className="border-0 shadow-sm">
                  <CardContent className="pt-4 pb-4">
                    <div className="flex items-center justify-between">
                      <Skeleton className="h-5 w-40" />
                      <Skeleton className="h-5 w-24" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : payments.length === 0 ? (
            <EmptyState
              icon={DollarSign}
              title="لا توجد مدفوعات"
              description="لم يتم تسجيل أي مدفوعات للموظفين بعد"
            />
          ) : (
            <div className="overflow-x-auto">
              <Card className="border-0 shadow-sm">
                <CardContent className="pt-5">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th scope="col" className="text-start pb-3 pe-3 font-medium">الموظف</th>
                        <th scope="col" className="text-start pb-3 pe-3 font-medium">النوع</th>
                        <th scope="col" className="text-start pb-3 pe-3 font-medium">الوصف</th>
                        <th scope="col" className="text-end pb-3 pe-3 font-medium">المبلغ</th>
                        <th scope="col" className="text-start pb-3 pe-3 font-medium">الحالة</th>
                        <th scope="col" className="text-start pb-3 font-medium">التاريخ</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(payments as EmployeePayment[]).map((p) => (
                        <tr
                          key={p.id}
                          className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                        >
                          <td className="py-3 pe-3 font-medium text-foreground">
                            {p.display_name || p.username}
                          </td>
                          <td className="py-3 pe-3 text-muted-foreground">
                            {SOURCE_TYPE_LABELS[p.source_type] || p.source_type}
                          </td>
                          <td className="py-3 pe-3 text-muted-foreground text-xs max-w-[200px] truncate">
                            {p.description || '—'}
                          </td>
                          <td className="py-3 pe-3 text-end font-mono text-foreground">
                            {formatCurrency(p.amount)}
                          </td>
                          <td className="py-3 pe-3">
                            <Badge
                              variant="outline"
                              className={`text-[11px] border-0 ${PAYMENT_STATUS_STYLES[p.status] || ''}`}
                            >
                              {PAYMENT_STATUS_LABELS[p.status] || p.status}
                            </Badge>
                          </td>
                          <td className="py-3 text-muted-foreground text-xs">
                            {new Date(p.created_at).toLocaleDateString('ar-AE')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ═══════════ Create Dialog ═══════════ */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إنشاء مسير رواتب جديد</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Month */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">الشهر</label>
              <Select value={newMonth} onValueChange={setNewMonth}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MONTH_NAMES_AR.map((name, idx) => (
                    <SelectItem key={idx} value={String(idx + 1)}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Year */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">السنة</label>
              <Select value={newYear} onValueChange={setNewYear}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 5 }, (_, i) => currentYear - 2 + i).map(yr => (
                    <SelectItem key={yr} value={String(yr)}>{yr}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              إلغاء
            </Button>
            <Button
              onClick={handleCreate}
              disabled={createPayroll.isPending}
              className="gap-1.5 bg-orange-500 hover:bg-orange-600 text-white"
            >
              {createPayroll.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              إنشاء
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ═══════════ Add Payment Dialog ═══════════ */}
      <Dialog open={paymentOpen} onOpenChange={setPaymentOpen}>
        <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>إضافة دفعة جديدة</DialogTitle>
            <DialogDescription>تسجيل عمولة أو مكافأة أو خصم لموظف</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>الموظف *</Label>
              <Select value={payForm.username} onValueChange={v => setPayForm(p => ({ ...p, username: v }))}>
                <SelectTrigger><SelectValue placeholder="اختر الموظف" /></SelectTrigger>
                <SelectContent>
                  {allUsers.map(u => (
                    <SelectItem key={u.username} value={u.username}>{u.display_name || u.username}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>النوع *</Label>
              <Select value={payForm.source_type} onValueChange={v => setPayForm(p => ({ ...p, source_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="commission">عمولة</SelectItem>
                  <SelectItem value="task">مهمة</SelectItem>
                  <SelectItem value="bonus">مكافأة</SelectItem>
                  <SelectItem value="deduction">خصم</SelectItem>
                  <SelectItem value="overtime">إضافي</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>الوصف</Label>
              <Input
                value={payForm.description}
                onChange={e => setPayForm(p => ({ ...p, description: e.target.value }))}
                placeholder="مثال: عمولة مشروع Etmam Brand Identity"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>المبلغ *</Label>
                <Input
                  type="number" step="0.01" min="0"
                  value={payForm.amount}
                  onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))}
                  placeholder="0.00"
                  dir="ltr"
                />
              </div>
              <div className="space-y-2">
                <Label>العملة</Label>
                <Select value={payForm.currency} onValueChange={v => setPayForm(p => ({ ...p, currency: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AED">AED</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                    <SelectItem value="SAR">SAR</SelectItem>
                    <SelectItem value="EGP">EGP</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setPaymentOpen(false)}>إلغاء</Button>
            <Button
              onClick={handleSavePayment}
              disabled={createEmployeePayment.isPending}
              className="bg-orange-500 hover:bg-orange-600 text-white"
            >
              {createEmployeePayment.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin me-1" />
              ) : (
                <Plus className="h-4 w-4 me-1" />
              )}
              تسجيل
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
