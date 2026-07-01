'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Calculator,
  CheckCircle,
  Banknote,
  Download,
  Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatCurrency } from '@/lib/utils/format';
import { PAYROLL_STATUS_LABELS } from '@/lib/constants/statuses';
import {
  usePayrollRun,
  useCalculatePayroll,
  useUpdatePayroll,
  type PayrollRun,
  type PayrollItem,
} from '@/hooks/usePayroll';
import { fetchAPI } from '@/hooks/api-helpers';
import { generatePayslipPDF } from '@/lib/pdf/payslip-pdf';

// PayrollItem from the hook predates multi-currency; extend locally
// so we can safely access the currency column the API already returns.
type PayrollItemWithCurrency = PayrollItem & { currency?: string };

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

interface Props {
  run: PayrollRun;
  isExpanded: boolean;
  onToggle: (id: string) => void;
}

export function PayrollRunRow({ run, isExpanded, onToggle }: Props) {
  const detailId = `payroll-detail-${run.id}`;

  // Per-row action tracking for spinners
  const [calculatingId, setCalculatingId] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [payingId, setPayingId] = useState<string | null>(null);
  const [downloadingPayslip, setDownloadingPayslip] = useState<string | null>(null);

  // Fetch expanded items only when this row is expanded
  const { data: expandedRunData, isLoading: expandedLoading } = usePayrollRun(
    isExpanded ? run.id : undefined,
  );

  const calculatePayroll = useCalculatePayroll();
  const updatePayroll = useUpdatePayroll();

  const handleCalculate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setCalculatingId(run.id);
    calculatePayroll.mutate(run.id, {
      onSuccess: () => toast.success('تم حساب الرواتب بنجاح'),
      onError: () => toast.error('فشل في حساب الرواتب'),
      onSettled: () => setCalculatingId(null),
    });
  };

  const handleApprove = (e: React.MouseEvent) => {
    e.stopPropagation();
    setApprovingId(run.id);
    updatePayroll.mutate(
      { runId: run.id, action: 'approve' },
      {
        onSuccess: () => toast.success('تم اعتماد مسير الرواتب'),
        onError: () => toast.error('فشل في اعتماد المسير'),
        onSettled: () => setApprovingId(null),
      },
    );
  };

  const handlePay = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPayingId(run.id);
    updatePayroll.mutate(
      { runId: run.id, action: 'pay' },
      {
        onSuccess: () => toast.success('تم تأكيد صرف الرواتب'),
        onError: () => toast.error('فشل في تأكيد الدفع'),
        onSettled: () => setPayingId(null),
      },
    );
  };

  const handleDownloadPayslip = async (e: React.MouseEvent, username: string) => {
    e.stopPropagation();
    const key = `${run.id}-${username}`;
    try {
      setDownloadingPayslip(key);
      const d = await fetchAPI<{
        company_name: string;
        employee: { display_name: string; department: string };
        payroll: { month: number; year: number; currency?: string };
        item: {
          base_salary: number; task_payments: number; overtime_amount: number;
          bonus: number; commission: number; deductions: number;
          deduction_details: Array<{ type: string; amount: number }>; net_pay: number;
        };
      }>(`/api/dashboard/payroll/${run.id}/payslip?username=${username}`);

      await generatePayslipPDF({
        company_name: d.company_name,
        employee_name: d.employee.display_name,
        department: d.employee.department,
        month: d.payroll.month,
        year: d.payroll.year,
        currency: d.payroll.currency || 'AED',
        base_salary: Number(d.item.base_salary),
        task_payments: Number(d.item.task_payments),
        overtime_amount: Number(d.item.overtime_amount),
        bonus: Number(d.item.bonus),
        commission: Number(d.item.commission),
        deductions: Number(d.item.deductions),
        deduction_details: d.item.deduction_details || [],
        net_pay: Number(d.item.net_pay),
      });

      toast.success('تم تحميل كشف الراتب');
    } catch {
      toast.error('حدث خطأ أثناء إنشاء كشف الراتب');
    } finally {
      setDownloadingPayslip(null);
    }
  };

  return (
    <Card className="border-0 shadow-sm overflow-hidden">
      {/* Run header — toggle button for expand/collapse */}
      <CardContent className="pt-5 pb-4">
        <button
          type="button"
          className="w-full text-start cursor-pointer hover:bg-muted/30 transition-colors rounded-sm -mx-1 px-1"
          onClick={() => onToggle(run.id)}
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
                  onClick={handleCalculate}
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
                  onClick={handleApprove}
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
                  onClick={handlePay}
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
                      <th scope="col" className="text-end pb-3 pe-3 font-medium">عمولة</th>
                      <th scope="col" className="text-end pb-3 pe-3 font-medium">خصومات</th>
                      <th scope="col" className="text-end pb-3 pe-3 font-medium">الصافي</th>
                      <th scope="col" className="text-center pb-3 font-medium">كشف</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(expandedRunData.items as PayrollItemWithCurrency[]).map((item) => (
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
                          {formatCurrency(item.base_salary, item.currency)}
                        </td>
                        <td className="py-3 pe-3 text-end font-mono text-foreground">
                          {item.task_payments > 0 ? formatCurrency(item.task_payments, item.currency) : '—'}
                        </td>
                        <td className="py-3 pe-3 text-end font-mono text-foreground">
                          {item.overtime_amount > 0 ? formatCurrency(item.overtime_amount, item.currency) : '—'}
                        </td>
                        <td className="py-3 pe-3 text-end font-mono text-foreground">
                          {item.bonus > 0 ? formatCurrency(item.bonus, item.currency) : '—'}
                        </td>
                        <td className="py-3 pe-3 text-end font-mono text-foreground">
                          {item.commission > 0 ? formatCurrency(item.commission, item.currency) : '—'}
                        </td>
                        <td className="py-3 pe-3 text-end font-mono text-red-600 dark:text-red-400">
                          {item.deductions > 0 ? `- ${formatCurrency(item.deductions, item.currency)}` : '—'}
                        </td>
                        <td className="py-3 pe-3 text-end font-mono font-bold text-foreground">
                          {formatCurrency(item.net_pay, item.currency)}
                        </td>
                        <td className="py-3 text-center">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={(e) => handleDownloadPayslip(e, item.username)}
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
}
