import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { toAED } from '@/lib/utils/currency';
import { MONTH_NAMES_AR } from '@/lib/constants/dates';

/* ── Helpers ────────────────────────────────────────── */

/** Returns the start of the current quarter as YYYY-MM-DD */
function startOfCurrentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  return `${d.getFullYear()}-${String(q * 3 + 1).padStart(2, '0')}-01`;
}

/** Returns the end of the current quarter as YYYY-MM-DD */
function endOfCurrentQuarter(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3);
  const endMonth = q * 3 + 3; // 1-based month after quarter end
  const lastDay = new Date(d.getFullYear(), endMonth, 0).getDate();
  return `${d.getFullYear()}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

/** Build monthly buckets between from and to */
function buildMonths(from: string, to: string) {
  const months: { label: string; start: string; end: string }[] = [];
  const endDate = new Date(to + 'T00:00:00');
  let cursor = new Date(from + 'T00:00:00');
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  while (cursor <= endDate) {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const monthStart = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const monthEnd = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    months.push({
      label: `${MONTH_NAMES_AR[month]} ${year}`,
      start: monthStart,
      end: monthEnd,
    });

    cursor = new Date(year, month + 1, 1);
  }

  return months;
}

/* ── GET /api/finance/reports/vat ──────────────────── */

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();
  const params = req.nextUrl.searchParams;

  const from = params.get('from') || startOfCurrentQuarter();
  const to = params.get('to') || endOfCurrentQuarter();

  try {
    // VAT Collected: from payments (cash-basis — VAT recognized when paid)
    // We get payments in range, then look up the invoice tax_rate to calculate VAT per payment
    const { data: paymentsRaw, error: payErr } = await supabase
      .from('pyra_payments')
      .select('amount, payment_date, invoice_id')
      .gte('payment_date', from)
      .lte('payment_date', to);

    if (payErr) throw payErr;

    // Get tax_rate for each unique invoice
    const invoiceIds = [...new Set((paymentsRaw || []).map((p: { invoice_id: string }) => p.invoice_id).filter(Boolean))];
    const taxRateMap: Record<string, number> = {};
    if (invoiceIds.length > 0) {
      const { data: invTaxes } = await supabase
        .from('pyra_invoices')
        .select('id, tax_rate')
        .in('id', invoiceIds);
      for (const inv of invTaxes || []) {
        taxRateMap[inv.id] = Number(inv.tax_rate || 0);
      }
    }

    // Build virtual invoice-like records for backward compatibility with period logic
    // VAT = payment_amount * rate / (100 + rate) — extract VAT from gross payment
    const invoices = (paymentsRaw || []).map((p: { amount: number; payment_date: string; invoice_id: string }) => {
      const rate = taxRateMap[p.invoice_id] || 0;
      const vatAmount = Math.round(Math.abs(Number(p.amount || 0)) * rate / (100 + rate) * 100) / 100;
      return {
        tax_amount: vatAmount,
        currency: 'AED' as const,
        issue_date: p.payment_date, // Use payment_date for period bucketing
      };
    });

    // VAT Paid: vat_amount from expenses
    const { data: expenses, error: expErr } = await supabase
      .from('pyra_expenses')
      .select('vat_amount, currency, expense_date')
      .gte('expense_date', from)
      .lte('expense_date', to);

    if (expErr) throw expErr;

    // Build monthly breakdown
    const months = buildMonths(from, to);

    let totalCollected = 0;
    let totalPaid = 0;

    const monthly = months.map((m) => {
      const collected = (invoices || [])
        .filter((inv: { issue_date: string }) => inv.issue_date >= m.start && inv.issue_date <= m.end)
        .reduce((sum: number, inv: { tax_amount: number; currency: string }) => sum + toAED(Number(inv.tax_amount || 0), inv.currency), 0);

      const paid = (expenses || [])
        .filter((exp: { expense_date: string }) => exp.expense_date >= m.start && exp.expense_date <= m.end)
        .reduce((sum: number, exp: { vat_amount: number; currency: string }) => sum + toAED(Number(exp.vat_amount || 0), exp.currency), 0);

      totalCollected += collected;
      totalPaid += paid;

      return {
        month: m.label,
        collected: Math.round(collected * 100) / 100,
        paid: Math.round(paid * 100) / 100,
        net: Math.round((collected - paid) * 100) / 100,
      };
    });

    return apiSuccess({
      summary: {
        vat_collected: Math.round(totalCollected * 100) / 100,
        vat_paid: Math.round(totalPaid * 100) / 100,
        net_vat: Math.round((totalCollected - totalPaid) * 100) / 100,
      },
      monthly,
    });
  } catch (err) {
    console.error('VAT report error:', err);
    return apiServerError();
  }
}
