import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
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
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

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

    // Fetch all invoices in the full range at once
    const { data: invoices, error: invErr } = await supabase
      .from('pyra_invoices')
      .select('amount_paid, issue_date')
      .in('status', ['paid', 'partially_paid'])
      .gte('issue_date', from)
      .lte('issue_date', to);

    if (invErr) throw invErr;

    // Fetch all expenses in the full range at once
    const { data: expenses, error: expErr } = await supabase
      .from('pyra_expenses')
      .select('amount, vat_amount, currency, expense_date')
      .gte('expense_date', from)
      .lte('expense_date', to);

    if (expErr) throw expErr;

    // Aggregate per period
    let totalRevenue = 0;
    let totalExpenses = 0;

    const periodResults = periods.map((p) => {
      const periodRevenue = (invoices || [])
        .filter((inv: { issue_date: string }) => inv.issue_date >= p.start && inv.issue_date <= p.end)
        .reduce((sum: number, inv: { amount_paid: number }) => sum + Number(inv.amount_paid), 0);

      const periodExpenses = (expenses || [])
        .filter((exp: { expense_date: string }) => exp.expense_date >= p.start && exp.expense_date <= p.end)
        .reduce((sum: number, exp: { amount: number; vat_amount: number; currency: string }) => sum + toAED(Number(exp.amount) + Number(exp.vat_amount), exp.currency), 0);

      totalRevenue += periodRevenue;
      totalExpenses += periodExpenses;

      return {
        label: p.label,
        start: p.start,
        end: p.end,
        revenue: Math.round(periodRevenue * 100) / 100,
        expenses: Math.round(periodExpenses * 100) / 100,
        profit: Math.round((periodRevenue - periodExpenses) * 100) / 100,
      };
    });

    const totalProfit = totalRevenue - totalExpenses;
    const margin = totalRevenue > 0 ? Math.round((totalProfit / totalRevenue) * 10000) / 100 : 0;

    return apiSuccess({
      periods: periodResults,
      totals: {
        revenue: Math.round(totalRevenue * 100) / 100,
        expenses: Math.round(totalExpenses * 100) / 100,
        profit: Math.round(totalProfit * 100) / 100,
        margin,
      },
    });
  } catch (err) {
    console.error('P&L report error:', err);
    return apiServerError();
  }
}
