import { NextRequest } from 'next/server';
import { getLocale } from 'next-intl/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { toAED } from '@/lib/utils/currency';
import { getInvoiceCurrencyMap, sumPaymentsAED } from '@/lib/finance/payment-currency';
import { monthNamesFor } from '@/lib/constants/dates';
import { EXPENSE_STATUS } from '@/lib/constants/statuses';
import type { Locale } from '@/lib/i18n/config';

/* ── Helpers ────────────────────────────────────────── */

function startOfYear(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function endOfYear(): string {
  return `${new Date().getFullYear()}-12-31`;
}

function buildMonthlyPeriods(from: string, to: string, locale: Locale) {
  const monthNames = monthNamesFor(locale);
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
      label: `${monthNames[month]} ${year}`,
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

  const locale = await getLocale() as Locale;
  const supabase = createServiceRoleClient();
  const params = req.nextUrl.searchParams;

  const from = params.get('from') || startOfYear();
  const to = params.get('to') || endOfYear();

  try {
    const periods = buildMonthlyPeriods(from, to, locale);

    // ── Cash Inflows: actual payments received (by payment_date) ──
    const { data: payments, error: payErr } = await supabase
      .from('pyra_payments')
      .select('amount, payment_date, method, invoice_id')
      .gte('payment_date', from)
      .lte('payment_date', to)
      .gt('amount', 0); // Exclude refunds (negative amounts)

    if (payErr) throw payErr;

    // ── Cash Outflows: expenses (by expense_date, approved only) ──
    const { data: expenses, error: expErr } = await supabase
      .from('pyra_expenses')
      .select('amount, vat_amount, currency, expense_date, category_id')
      .eq('status', EXPENSE_STATUS.APPROVED)
      .gte('expense_date', from)
      .lte('expense_date', to);

    if (expErr) throw expErr;

    // ── Refunds (negative payments) ──
    const { data: refunds } = await supabase
      .from('pyra_payments')
      .select('amount, payment_date, invoice_id')
      .gte('payment_date', from)
      .lte('payment_date', to)
      .lt('amount', 0);

    // Payments carry no currency — resolve each payment's invoice currency
    // and convert to AED before ANY summing (Batch 4, never-mix-currencies).
    const currencyByInvoice = await getInvoiceCurrencyMap(supabase, [
      ...(payments || []).map((p: { invoice_id: string | null }) => p.invoice_id),
      ...(refunds || []).map((r: { invoice_id: string | null }) => r.invoice_id),
    ]);

    // ── Aggregate per period ──
    let totalInflow = 0;
    let totalOutflow = 0;
    let totalRefunds = 0;
    let runningBalance = 0;

    const periodResults = periods.map((p) => {
      // Cash in (AED-converted per invoice currency)
      const periodInflow = sumPaymentsAED(
        (payments || []).filter(
          (pay: { payment_date: string }) => pay.payment_date >= p.start && pay.payment_date <= p.end
        ),
        currencyByInvoice
      );

      // Cash out
      const periodOutflow = (expenses || [])
        .filter((exp: { expense_date: string }) => exp.expense_date >= p.start && exp.expense_date <= p.end)
        .reduce((sum: number, exp: { amount: number; vat_amount: number; currency: string }) =>
          sum + toAED(Number(exp.amount) + Number(exp.vat_amount || 0), exp.currency), 0);

      // Refunds (AED-converted; abs of the negative sum)
      const periodRefunds = Math.abs(
        sumPaymentsAED(
          (refunds || []).filter(
            (r: { payment_date: string }) => r.payment_date >= p.start && r.payment_date <= p.end
          ),
          currencyByInvoice
        )
      );

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

    // ── Payment method breakdown (AED-converted) ──
    const methodBreakdown: Record<string, number> = {};
    for (const pay of payments || []) {
      const method = (pay as { method: string }).method || 'other';
      const invId = (pay as { invoice_id: string | null }).invoice_id;
      const aed = toAED(Number(pay.amount), (invId && currencyByInvoice.get(invId)) || 'AED');
      methodBreakdown[method] = (methodBreakdown[method] || 0) + aed;
    }
    const byMethod = Object.entries(methodBreakdown)
      .map(([method, total]) => ({ method, total: Math.round(total * 100) / 100 }))
      .sort((a, b) => b.total - a.total);

    // ── Expense category breakdown ──
    // Resolve category names (expenses store category_id → pyra_expense_categories)
    const categoryIds = [...new Set((expenses || []).map((e: { category_id: string | null }) => e.category_id).filter(Boolean))] as string[];
    const categoryNames: Record<string, string> = {};
    if (categoryIds.length > 0) {
      const { data: cats } = await supabase
        .from('pyra_expense_categories')
        .select('id, name, name_ar')
        .in('id', categoryIds);
      for (const c of cats || []) {
        categoryNames[c.id] = c.name_ar || c.name;
      }
    }

    const categoryBreakdown: Record<string, number> = {};
    for (const exp of expenses || []) {
      const catId = (exp as { category_id: string | null }).category_id;
      // i18n-exempt: category names are DB data (pyra_expense_categories.name_ar);
      // this fallback covers unmapped/null categories and stays AR-only until
      // the categories table gains a name_en column (out of scope, Phase 4).
      const cat = (catId && categoryNames[catId]) || 'أخرى'; // i18n-exempt: DB-data category fallback (name_ar column), AR-only until name_en exists
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
      // (monthly_subscription_cost removed — subscriptions module sunset
      // 2026-07-03; recurring costs live in expenses)
      forecast: {
        expected_inflow: Math.round(forecastInflow * 100) / 100,
      },
    });
  } catch (err) {
    console.error('Cash flow report error:', err);
    return apiServerError();
  }
}
