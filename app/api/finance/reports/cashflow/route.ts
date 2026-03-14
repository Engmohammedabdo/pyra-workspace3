import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { toAED } from '@/lib/utils/currency';

/* ── Arabic month names ────────────────────────────── */
const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

/* ── Helpers ────────────────────────────────────────── */

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function endOfYear(): string {
  return `${new Date().getFullYear()}-12-31`;
}

function buildMonthlyPeriods(from: string, to: string) {
  const periods: { label: string; start: string; end: string }[] = [];
  const endDate = new Date(to + 'T00:00:00');
  let cursor = new Date(from + 'T00:00:00');
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  while (cursor <= endDate) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    periods.push({
      label: `${ARABIC_MONTHS[month]} ${year}`,
      start: monthStart,
      end: monthEnd,
    });

    cursor = new Date(year, month + 1, 1);
  }

  return periods;
}

/**
 * GET /api/finance/reports/cashflow
 * Cash Flow report — tracks actual cash in (payments received) vs cash out (expenses paid).
 * Unlike P&L which uses invoice issue dates, this uses actual payment dates.
 * Params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 * Also includes forecast based on outstanding invoices and upcoming recurring charges.
 */
export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();
  const params = req.nextUrl.searchParams;

  const from = params.get('from') || startOfYear();
  const to = params.get('to') || endOfYear();

  try {
    const periods = buildMonthlyPeriods(from, to);

    // ── Cash Inflows: actual payments received (by payment_date) ──
    const { data: payments, error: payErr } = await supabase
      .from('pyra_payments')
      .select('amount, payment_date, method')
      .gte('payment_date', from)
      .lte('payment_date', to)
      .gt('amount', 0); // Exclude refunds (negative amounts)

    if (payErr) throw payErr;

    // ── Cash Outflows: expenses (by expense_date) ──
    const { data: expenses, error: expErr } = await supabase
      .from('pyra_expenses')
      .select('amount, vat_amount, currency, expense_date, category')
      .gte('expense_date', from)
      .lte('expense_date', to);

    if (expErr) throw expErr;

    // ── Refunds (negative payments) ──
    const { data: refunds } = await supabase
      .from('pyra_payments')
      .select('amount, payment_date')
      .gte('payment_date', from)
      .lte('payment_date', to)
      .lt('amount', 0);

    // ── Aggregate per period ──
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalRefunds = 0;
    let runningBalance = 0;

    const periodResults = periods.map((p) => {
      // Cash in
      const periodInflow = (payments || [])
        .filter((pay: { payment_date: string }) => pay.payment_date >= p.start && pay.payment_date <= p.end)
        .reduce((sum: number, pay: { amount: number }) => sum + Number(pay.amount), 0);

      // Cash out
      const periodOutflow = (expenses || [])
        .filter((exp: { expense_date: string }) => exp.expense_date >= p.start && exp.expense_date <= p.end)
        .reduce((sum: number, exp: { amount: number; vat_amount: number; currency: string }) =>
          sum + toAED(Number(exp.amount) + Number(exp.vat_amount || 0), exp.currency), 0);

      // Refunds
      const periodRefunds = (refunds || [])
        .filter((r: { payment_date: string }) => r.payment_date >= p.start && r.payment_date <= p.end)
        .reduce((sum: number, r: { amount: number }) => sum + Math.abs(Number(r.amount)), 0);

      totalInflow += periodInflow;
      totalOutflow += periodOutflow;
      totalRefunds += periodRefunds;

      const netCashFlow = periodInflow - periodOutflow - periodRefunds;
      runningBalance += netCashFlow;

      return {
        label: p.label,
        start: p.start,
        end: p.end,
        inflow: Math.round(periodInflow * 100) / 100,
        outflow: Math.round(periodOutflow * 100) / 100,
        refunds: Math.round(periodRefunds * 100) / 100,
        net: Math.round(netCashFlow * 100) / 100,
        running_balance: Math.round(runningBalance * 100) / 100,
      };
    });

    // ── Payment method breakdown ──
    const methodBreakdown: Record<string, number> = {};
    for (const pay of payments || []) {
      const method = (pay as { method: string }).method || 'other';
      methodBreakdown[method] = (methodBreakdown[method] || 0) + Number(pay.amount);
    }
    const byMethod = Object.entries(methodBreakdown)
      .map(([method, total]) => ({ method, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    // ── Expense category breakdown ──
    const categoryBreakdown: Record<string, number> = {};
    for (const exp of expenses || []) {
      const cat = (exp as { category: string }).category || 'أخرى';
      categoryBreakdown[cat] = (categoryBreakdown[cat] || 0) +
        toAED(Number(exp.amount) + Number(exp.vat_amount || 0), exp.currency);
    }
    const byCategory = Object.entries(categoryBreakdown)
      .map(([category, total]) => ({ category, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    // ── Forecast: outstanding invoices expected to come in ──
    const { data: outstanding } = await supabase
      .from('pyra_invoices')
      .select('amount_due, currency, due_date')
      .in('status', ['sent', 'partially_paid', 'overdue'])
      .gt('amount_due', 0);

    const forecastInflow = (outstanding || []).reduce(
      (sum: number, inv: { amount_due: number; currency: string }) =>
        sum + toAED(Number(inv.amount_due), inv.currency), 0
    );

    // Upcoming recurring expenses (subscriptions)
    const { data: activeSubs } = await supabase
      .from('pyra_subscriptions')
      .select('cost, currency, billing_cycle')
      .eq('status', 'active');

    const monthlySubCost = (activeSubs || []).reduce(
      (sum: number, s: { cost: number; currency: string; billing_cycle: string }) => {
        const cost = toAED(Number(s.cost), s.currency);
        if (s.billing_cycle === 'yearly') return sum + cost / 12;
        if (s.billing_cycle === 'quarterly') return sum + cost / 3;
        return sum + cost;
      }, 0
    );

    const totalNet = totalInflow - totalOutflow - totalRefunds;

    return apiSuccess({
      periods: periodResults,
      totals: {
        inflow: Math.round(totalInflow * 100) / 100,
        outflow: Math.round(totalOutflow * 100) / 100,
        refunds: Math.round(totalRefunds * 100) / 100,
        net: Math.round(totalNet * 100) / 100,
      },
      by_method: byMethod,
      by_category: byCategory,
      forecast: {
        expected_inflow: Math.round(forecastInflow * 100) / 100,
        monthly_subscription_cost: Math.round(monthlySubCost * 100) / 100,
      },
    });
  } catch (err) {
    console.error('Cash flow report error:', err);
    return apiServerError();
  }
}
