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
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Build an array of { label, start, end } periods between two dates */
function buildMonthlyPeriods(from: string, to: string) {
  const periods: { label: string; start: string; end: string }[] = [];
  const startDate = new Date(from + 'T00:00:00');
  const endDate = new Date(to + 'T00:00:00');

  let cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);

  while (cursor <= endDate) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth(); // 0-based
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

function buildQuarterlyPeriods(from: string, to: string) {
  const periods: { label: string; start: string; end: string }[] = [];
  const startDate = new Date(from + 'T00:00:00');
  const endDate = new Date(to + 'T00:00:00');

  // Find the quarter that contains startDate
  let year = startDate.getFullYear();
  let q = Math.floor(startDate.getMonth() / 3); // 0-based quarter index

  while (true) {
    const qStart = new Date(year, q * 3, 1);
    if (qStart > endDate) break;

    const qEndMonth = q * 3 + 2; // last month of quarter (0-based)
    const lastDay = new Date(year, qEndMonth + 1, 0).getDate();
    const qStartStr = `${year}-${String(q * 3 + 1).padStart(2, '0')}-01`;
    const qEndStr = `${year}-${String(qEndMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    const arabicQ = ['الربع الأول', 'الربع الثاني', 'الربع الثالث', 'الربع الرابع'];
    periods.push({
      label: `${arabicQ[q]} ${year}`,
      start: qStartStr,
      end: qEndStr,
    });

    q++;
    if (q > 3) {
      q = 0;
      year++;
    }
  }

  return periods;
}

/* ── GET /api/finance/reports/pnl ──────────────────── */

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();
  const params = req.nextUrl.searchParams;

  const from = params.get('from') || startOfYear();
  const to = params.get('to') || today();
  const groupBy = params.get('group_by') || 'month';

  try {
    const periods =
      groupBy === 'quarter'
        ? buildQuarterlyPeriods(from, to)
        : buildMonthlyPeriods(from, to);

    // Fetch all payments in the full range (cash-basis: revenue by payment_date)
    const { data: payments, error: payErr } = await supabase
      .from('pyra_payments')
      .select('amount, payment_date, invoice_id')
      .gte('payment_date', from)
      .lte('payment_date', to);

    if (payErr) throw payErr;

    // Get currency for each invoice to convert payments to AED
    const invoiceIds = [...new Set((payments || []).map(p => p.invoice_id).filter(Boolean))];
    const currencyMap: Record<string, string> = {};
    if (invoiceIds.length > 0) {
      const { data: invCurrencies } = await supabase
        .from('pyra_invoices')
        .select('id, currency')
        .in('id', invoiceIds);
      for (const inv of invCurrencies || []) {
        currencyMap[inv.id] = inv.currency || 'AED';
      }
    }

    // Fetch all expenses in the full range at once (include category_id for breakdown)
    const { data: expenses, error: expErr } = await supabase
      .from('pyra_expenses')
      .select('amount, vat_amount, currency, expense_date, category_id')
      .gte('expense_date', from)
      .lte('expense_date', to);

    if (expErr) throw expErr;

    // Aggregate per period with expense breakdown
    let totalRevenue = 0;
    let totalExpenses = 0;
    let totalSalaries = 0;
    let totalSubscriptions = 0;
    let totalOperational = 0;

    const periodResults = periods.map((p) => {
      const periodRevenue = (payments || [])
        .filter((pay: { payment_date: string }) => pay.payment_date >= p.start && pay.payment_date <= p.end)
        .reduce((sum: number, pay: { amount: number; invoice_id: string }) => sum + toAED(Number(pay.amount || 0), currencyMap[pay.invoice_id] || 'AED'), 0);

      const periodExpenseItems = (expenses || [])
        .filter((exp: { expense_date: string }) => exp.expense_date >= p.start && exp.expense_date <= p.end);

      // Calculate expense breakdown by category
      let periodSalaries = 0;
      let periodSubscriptions = 0;
      let periodOperational = 0;

      for (const exp of periodExpenseItems) {
        const typedExp = exp as { amount: number; vat_amount: number; currency: string; category_id: string | null };
        const expAmount = toAED(Number(typedExp.amount) + Number(typedExp.vat_amount || 0), typedExp.currency);

        if (typedExp.category_id === 'ec_salaries') {
          periodSalaries += expAmount;
        } else if (typedExp.category_id === 'ec_subscriptions') {
          periodSubscriptions += expAmount;
        } else {
          periodOperational += expAmount;
        }
      }

      const periodExpensesTotal = periodSalaries + periodSubscriptions + periodOperational;

      totalRevenue += periodRevenue;
      totalExpenses += periodExpensesTotal;
      totalSalaries += periodSalaries;
      totalSubscriptions += periodSubscriptions;
      totalOperational += periodOperational;

      return {
        label: p.label,
        start: p.start,
        end: p.end,
        revenue: Math.round(periodRevenue * 100) / 100,
        expenses: {
          total: Math.round(periodExpensesTotal * 100) / 100,
          salaries: Math.round(periodSalaries * 100) / 100,
          operational: Math.round(periodOperational * 100) / 100,
          subscriptions: Math.round(periodSubscriptions * 100) / 100,
        },
        profit: Math.round((periodRevenue - periodExpensesTotal) * 100) / 100,
      };
    });

    const totalProfit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0;

    return apiSuccess({
      periods: periodResults,
      totals: {
        revenue: Math.round(totalRevenue * 100) / 100,
        expenses: {
          total: Math.round(totalExpenses * 100) / 100,
          salaries: Math.round(totalSalaries * 100) / 100,
          operational: Math.round(totalOperational * 100) / 100,
          subscriptions: Math.round(totalSubscriptions * 100) / 100,
        },
        profit: Math.round(totalProfit * 100) / 100,
        margin,
      },
    });
  } catch (err) {
    console.error('P&L report error:', err);
    return apiServerError();
  }
}
