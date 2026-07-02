import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { toAED } from '@/lib/utils/currency';
import { getInvoiceCurrencyMap, sumPaymentsAED } from '@/lib/finance/payment-currency';
import { resolveUserScope } from '@/lib/auth/scope';
import { INVOICE_STATUS, INVOICE_OUTSTANDING_STATUSES, CONTRACT_STATUS, EXPENSE_STATUS } from '@/lib/constants/statuses';

export async function GET() {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const scope = await resolveUserScope(auth);

  const supabase = createServiceRoleClient();

  try {
    // Non-admin with no scope at all — return empty dashboard
    if (!scope.isAdmin && scope.clientIds.length === 0 && scope.projectIds.length === 0) {
      return apiSuccess({
        summary: {
          revenue_mtd: 0, revenue_ytd: 0,
          expenses_mtd: 0, expenses_ytd: 0,
          profit_mtd: 0, profit_ytd: 0,
          outstanding: 0, overdue: 0,
          active_contracts: 0,
        },
        monthly_chart: [],
        expense_pie: [],
      });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];

    // Auto-mark overdue invoices (fire-and-forget — don't block dashboard load)
    void supabase
      .from('pyra_invoices')
      .update({ status: INVOICE_STATUS.OVERDUE, updated_at: now.toISOString() })
      .in('status', [INVOICE_STATUS.SENT, INVOICE_STATUS.PARTIALLY_PAID])
      .lt('due_date', today)
      .then(() => {});

    // Revenue YTD — from actual payments (MTD is a subset of YTD, so one
    // fetch covers both; Batch 4: sums are AED-converted per invoice
    // currency via the shared payment-currency helper)
    const { data: paymentsYtd } = await supabase
      .from('pyra_payments')
      .select('amount, payment_date, invoice_id')
      .gte('payment_date', startOfYear)
      .lte('payment_date', today);

    const ytdCurrencyMap = await getInvoiceCurrencyMap(
      supabase,
      (paymentsYtd || []).map((p: { invoice_id: string | null }) => p.invoice_id)
    );

    // If non-admin, filter payments by their invoice's client_id
    let scopedPaymentsYtd = paymentsYtd || [];
    if (!scope.isAdmin) {
      const paymentInvoiceIds = [...new Set(scopedPaymentsYtd.map((p: { invoice_id: string }) => p.invoice_id).filter(Boolean))];
      if (paymentInvoiceIds.length > 0) {
        const { data: invClients } = await supabase
          .from('pyra_invoices')
          .select('id, client_id')
          .in('id', paymentInvoiceIds)
          .in('client_id', scope.clientIds);
        const allowedIds = new Set((invClients || []).map((i: { id: string }) => i.id));
        scopedPaymentsYtd = scopedPaymentsYtd.filter(
          (p: { invoice_id: string }) => allowedIds.has(p.invoice_id)
        );
      } else {
        scopedPaymentsYtd = [];
      }
    }

    const totalRevenueYtd = sumPaymentsAED(scopedPaymentsYtd, ytdCurrencyMap);
    const totalRevenueMtd = sumPaymentsAED(
      scopedPaymentsYtd.filter(
        (p: { payment_date: string }) => p.payment_date >= startOfMonth && p.payment_date <= today
      ),
      ytdCurrencyMap
    );

    // Expenses MTD (approved only)
    let expensesMtdQuery = supabase
      .from('pyra_expenses')
      .select('amount, vat_amount, currency')
      .eq('status', EXPENSE_STATUS.APPROVED)
      .gte('expense_date', startOfMonth)
      .lte('expense_date', today);
    if (!scope.isAdmin) expensesMtdQuery = expensesMtdQuery.in('project_id', scope.projectIds);
    const { data: expensesMtd } = await expensesMtdQuery;

    const totalExpensesMtd = (expensesMtd || []).reduce(
      (sum: number, e: { amount: number; vat_amount: number; currency: string }) => sum + toAED(Number(e.amount) + Number(e.vat_amount || 0), e.currency), 0
    );

    // Expenses YTD (approved only)
    let expensesYtdQuery = supabase
      .from('pyra_expenses')
      .select('amount, vat_amount, currency')
      .eq('status', EXPENSE_STATUS.APPROVED)
      .gte('expense_date', startOfYear)
      .lte('expense_date', today);
    if (!scope.isAdmin) expensesYtdQuery = expensesYtdQuery.in('project_id', scope.projectIds);
    const { data: expensesYtd } = await expensesYtdQuery;

    const totalExpensesYtd = (expensesYtd || []).reduce(
      (sum: number, e: { amount: number; vat_amount: number; currency: string }) => sum + toAED(Number(e.amount) + Number(e.vat_amount || 0), e.currency), 0
    );

    // Outstanding invoices (amount + count) — AED-converted per currency
    let outstandingQuery = supabase
      .from('pyra_invoices')
      .select('amount_due, currency')
      .in('status', INVOICE_OUTSTANDING_STATUSES);
    if (!scope.isAdmin) outstandingQuery = outstandingQuery.in('client_id', scope.clientIds);
    const { data: outstanding } = await outstandingQuery;

    const totalOutstanding = (outstanding || []).reduce(
      (sum: number, inv: { amount_due: number; currency: string | null }) =>
        sum + toAED(Number(inv.amount_due || 0), inv.currency || 'AED'), 0
    );
    const outstandingCount = (outstanding || []).length;

    // Overdue invoices (amount + count) — AED-converted per currency
    let overdueQuery = supabase
      .from('pyra_invoices')
      .select('amount_due, currency')
      .eq('status', INVOICE_STATUS.OVERDUE);
    if (!scope.isAdmin) overdueQuery = overdueQuery.in('client_id', scope.clientIds);
    const { data: overdue } = await overdueQuery;

    const totalOverdue = (overdue || []).reduce(
      (sum: number, inv: { amount_due: number; currency: string | null }) =>
        sum + toAED(Number(inv.amount_due || 0), inv.currency || 'AED'), 0
    );
    const overdueCount = (overdue || []).length;

    // Monthly revenue vs expenses (last 12 months)
    const monthlyData: Array<{ month: string; revenue: number; expenses: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthLabel = d.toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' });

      monthlyData.push({ month: monthLabel, revenue: 0, expenses: 0 });
    }

    // Get all payments for last 12 months (revenue by actual payment_date)
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0];
    const { data: payments12m } = await supabase
      .from('pyra_payments')
      .select('amount, payment_date, invoice_id')
      .gte('payment_date', twelveMonthsAgo)
      .lte('payment_date', today);

    // For non-admin, filter by client scope
    let filteredPayments12m = payments12m || [];
    if (!scope.isAdmin && filteredPayments12m.length > 0) {
      const pInvIds = [...new Set(filteredPayments12m.map((p: { invoice_id: string }) => p.invoice_id).filter(Boolean))];
      if (pInvIds.length > 0) {
        const { data: pInvClients } = await supabase
          .from('pyra_invoices').select('id, client_id').in('id', pInvIds).in('client_id', scope.clientIds);
        const allowedSet = new Set((pInvClients || []).map((i: { id: string }) => i.id));
        filteredPayments12m = filteredPayments12m.filter((p: { invoice_id: string }) => allowedSet.has(p.invoice_id));
      } else {
        filteredPayments12m = [];
      }
    }

    const chartCurrencyMap = await getInvoiceCurrencyMap(
      supabase,
      filteredPayments12m.map((p: { invoice_id: string | null }) => p.invoice_id)
    );
    filteredPayments12m.forEach((p: { amount: number; payment_date: string; invoice_id: string | null }) => {
      const pDate = new Date(p.payment_date);
      const monthIndex = 11 - ((now.getFullYear() - pDate.getFullYear()) * 12 + now.getMonth() - pDate.getMonth());
      if (monthIndex >= 0 && monthIndex < 12) {
        monthlyData[monthIndex].revenue += toAED(
          Number(p.amount || 0),
          (p.invoice_id && chartCurrencyMap.get(p.invoice_id)) || 'AED'
        );
      }
    });

    // Get all expenses for last 12 months (approved only)
    let expenses12mQuery = supabase
      .from('pyra_expenses')
      .select('amount, vat_amount, currency, expense_date')
      .eq('status', EXPENSE_STATUS.APPROVED)
      .gte('expense_date', twelveMonthsAgo)
      .lte('expense_date', today);
    if (!scope.isAdmin) expenses12mQuery = expenses12mQuery.in('project_id', scope.projectIds);
    const { data: expenses12m } = await expenses12mQuery;

    (expenses12m || []).forEach((e: { amount: number; vat_amount: number; currency: string; expense_date: string }) => {
      const eDate = new Date(e.expense_date);
      const monthIndex = 11 - ((now.getFullYear() - eDate.getFullYear()) * 12 + now.getMonth() - eDate.getMonth());
      if (monthIndex >= 0 && monthIndex < 12) {
        monthlyData[monthIndex].expenses += toAED(Number(e.amount) + Number(e.vat_amount || 0), e.currency);
      }
    });

    // Expense breakdown by category (current month, approved only)
    let expenseByCatQuery = supabase
      .from('pyra_expenses')
      .select('category_id, amount, currency')
      .eq('status', EXPENSE_STATUS.APPROVED)
      .gte('expense_date', startOfMonth)
      .lte('expense_date', today);
    if (!scope.isAdmin) expenseByCatQuery = expenseByCatQuery.in('project_id', scope.projectIds);
    const { data: expensesByCategory } = await expenseByCatQuery;

    const categoryTotals: Record<string, number> = {};
    (expensesByCategory || []).forEach((e: { category_id: string | null; amount: number; currency: string }) => {
      const key = e.category_id || 'uncategorized';
      categoryTotals[key] = (categoryTotals[key] || 0) + toAED(Number(e.amount), e.currency);
    });

    // Get category names
    const categoryIds = Object.keys(categoryTotals).filter(k => k !== 'uncategorized');
    let categoryNames: Record<string, { name_ar: string; color: string }> = {};
    if (categoryIds.length > 0) {
      const { data: cats } = await supabase
        .from('pyra_expense_categories')
        .select('id, name_ar, color')
        .in('id', categoryIds);
      if (cats) {
        categoryNames = Object.fromEntries(
          cats.map((c: { id: string; name_ar: string; color: string }) => [c.id, c])
        );
      }
    }

    const expensePieData = Object.entries(categoryTotals).map(([id, amount]) => ({
      name: id === 'uncategorized' ? 'غير مصنف' : (categoryNames[id]?.name_ar || id),
      value: Math.round(amount * 100) / 100,
      color: id === 'uncategorized' ? '#9ca3af' : (categoryNames[id]?.color || '#6b7280'),
    }));

    // Active contracts count
    let activeContractsQuery = supabase
      .from('pyra_contracts')
      .select('id', { count: 'exact', head: true })
      .in('status', [CONTRACT_STATUS.ACTIVE, 'in_progress']);
    if (!scope.isAdmin) activeContractsQuery = activeContractsQuery.in('client_id', scope.clientIds);
    const { count: activeContracts } = await activeContractsQuery;

    return apiSuccess({
      summary: {
        revenue_mtd: Math.round(totalRevenueMtd * 100) / 100,
        revenue_ytd: Math.round(totalRevenueYtd * 100) / 100,
        expenses_mtd: Math.round(totalExpensesMtd * 100) / 100,
        expenses_ytd: Math.round(totalExpensesYtd * 100) / 100,
        profit_mtd: Math.round((totalRevenueMtd - totalExpensesMtd) * 100) / 100,
        profit_ytd: Math.round((totalRevenueYtd - totalExpensesYtd) * 100) / 100,
        outstanding: Math.round(totalOutstanding * 100) / 100,
        outstanding_count: outstandingCount,
        overdue: Math.round(totalOverdue * 100) / 100,
        overdue_count: overdueCount,
        active_contracts: activeContracts ?? 0,
      },
      monthly_chart: monthlyData,
      expense_pie: expensePieData,
    });
  } catch {
    return apiServerError();
  }
}
