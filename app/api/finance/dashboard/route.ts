import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

export async function GET() {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const supabase = createServiceRoleClient();

  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
    const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().split('T')[0];
    const today = now.toISOString().split('T')[0];
    const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];

    // Revenue MTD — from paid invoices
    const { data: revenueMtd } = await supabase
      .from('pyra_invoices')
      .select('amount_paid')
      .gte('issue_date', startOfMonth)
      .lte('issue_date', today)
      .in('status', ['paid', 'partially_paid']);

    const totalRevenueMtd = (revenueMtd || []).reduce(
      (sum: number, inv: { amount_paid: number }) => sum + Number(inv.amount_paid || 0), 0
    );

    // Revenue YTD
    const { data: revenueYtd } = await supabase
      .from('pyra_invoices')
      .select('amount_paid')
      .gte('issue_date', startOfYear)
      .lte('issue_date', today)
      .in('status', ['paid', 'partially_paid']);

    const totalRevenueYtd = (revenueYtd || []).reduce(
      (sum: number, inv: { amount_paid: number }) => sum + Number(inv.amount_paid || 0), 0
    );

    // Expenses MTD
    const { data: expensesMtd } = await supabase
      .from('pyra_expenses')
      .select('amount, vat_amount')
      .gte('expense_date', startOfMonth)
      .lte('expense_date', today);

    const totalExpensesMtd = (expensesMtd || []).reduce(
      (sum: number, e: { amount: number; vat_amount: number }) => sum + Number(e.amount) + Number(e.vat_amount || 0), 0
    );

    // Expenses YTD
    const { data: expensesYtd } = await supabase
      .from('pyra_expenses')
      .select('amount, vat_amount')
      .gte('expense_date', startOfYear)
      .lte('expense_date', today);

    const totalExpensesYtd = (expensesYtd || []).reduce(
      (sum: number, e: { amount: number; vat_amount: number }) => sum + Number(e.amount) + Number(e.vat_amount || 0), 0
    );

    // Outstanding invoices
    const { data: outstanding } = await supabase
      .from('pyra_invoices')
      .select('amount_due')
      .in('status', ['sent', 'partially_paid', 'overdue']);

    const totalOutstanding = (outstanding || []).reduce(
      (sum: number, inv: { amount_due: number }) => sum + Number(inv.amount_due || 0), 0
    );

    // Overdue invoices
    const { data: overdue } = await supabase
      .from('pyra_invoices')
      .select('amount_due')
      .eq('status', 'overdue');

    const totalOverdue = (overdue || []).reduce(
      (sum: number, inv: { amount_due: number }) => sum + Number(inv.amount_due || 0), 0
    );

    // Upcoming renewals (next 7 days)
    const { data: renewals } = await supabase
      .from('pyra_subscriptions')
      .select('id, name, provider, cost, currency, next_renewal_date')
      .eq('status', 'active')
      .gte('next_renewal_date', today)
      .lte('next_renewal_date', in7Days)
      .order('next_renewal_date', { ascending: true });

    // Monthly revenue vs expenses (last 12 months)
    const monthlyData: Array<{ month: string; revenue: number; expenses: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const monthStart = d.toISOString().split('T')[0];
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().split('T')[0];
      const monthLabel = d.toLocaleDateString('ar-EG', { month: 'short', year: 'numeric' });

      monthlyData.push({ month: monthLabel, revenue: 0, expenses: 0 });
    }

    // Get all invoices for last 12 months
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1).toISOString().split('T')[0];
    const { data: invoices12m } = await supabase
      .from('pyra_invoices')
      .select('amount_paid, issue_date')
      .gte('issue_date', twelveMonthsAgo)
      .lte('issue_date', today)
      .in('status', ['paid', 'partially_paid']);

    (invoices12m || []).forEach((inv: { amount_paid: number; issue_date: string }) => {
      const invDate = new Date(inv.issue_date);
      const monthIndex = 11 - ((now.getFullYear() - invDate.getFullYear()) * 12 + now.getMonth() - invDate.getMonth());
      if (monthIndex >= 0 && monthIndex < 12) {
        monthlyData[monthIndex].revenue += Number(inv.amount_paid || 0);
      }
    });

    // Get all expenses for last 12 months
    const { data: expenses12m } = await supabase
      .from('pyra_expenses')
      .select('amount, vat_amount, expense_date')
      .gte('expense_date', twelveMonthsAgo)
      .lte('expense_date', today);

    (expenses12m || []).forEach((e: { amount: number; vat_amount: number; expense_date: string }) => {
      const eDate = new Date(e.expense_date);
      const monthIndex = 11 - ((now.getFullYear() - eDate.getFullYear()) * 12 + now.getMonth() - eDate.getMonth());
      if (monthIndex >= 0 && monthIndex < 12) {
        monthlyData[monthIndex].expenses += Number(e.amount) + Number(e.vat_amount || 0);
      }
    });

    // Expense breakdown by category (current month)
    const { data: expensesByCategory } = await supabase
      .from('pyra_expenses')
      .select('category_id, amount')
      .gte('expense_date', startOfMonth)
      .lte('expense_date', today);

    const categoryTotals: Record<string, number> = {};
    (expensesByCategory || []).forEach((e: { category_id: string | null; amount: number }) => {
      const key = e.category_id || 'uncategorized';
      categoryTotals[key] = (categoryTotals[key] || 0) + Number(e.amount);
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

    // Active subscriptions monthly cost
    const { data: activeSubs } = await supabase
      .from('pyra_subscriptions')
      .select('cost, billing_cycle')
      .eq('status', 'active');

    const monthlySubsCost = (activeSubs || []).reduce(
      (sum: number, s: { cost: number; billing_cycle: string }) => {
        const cost = Number(s.cost);
        if (s.billing_cycle === 'yearly') return sum + cost / 12;
        if (s.billing_cycle === 'quarterly') return sum + cost / 3;
        return sum + cost;
      }, 0
    );

    // Active contracts count
    const { count: activeContracts } = await supabase
      .from('pyra_contracts')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'in_progress']);

    return apiSuccess({
      summary: {
        revenue_mtd: Math.round(totalRevenueMtd * 100) / 100,
        revenue_ytd: Math.round(totalRevenueYtd * 100) / 100,
        expenses_mtd: Math.round(totalExpensesMtd * 100) / 100,
        expenses_ytd: Math.round(totalExpensesYtd * 100) / 100,
        profit_mtd: Math.round((totalRevenueMtd - totalExpensesMtd) * 100) / 100,
        profit_ytd: Math.round((totalRevenueYtd - totalExpensesYtd) * 100) / 100,
        outstanding: Math.round(totalOutstanding * 100) / 100,
        overdue: Math.round(totalOverdue * 100) / 100,
        monthly_subs_cost: Math.round(monthlySubsCost * 100) / 100,
        active_contracts: activeContracts ?? 0,
      },
      monthly_chart: monthlyData,
      expense_pie: expensePieData,
      upcoming_renewals: renewals || [],
    });
  } catch {
    return apiServerError();
  }
}
