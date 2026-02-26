import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/* ── Arabic month names ────────────────────────────── */
const ARABIC_MONTHS = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
];

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
      label: `${ARABIC_MONTHS[month]} ${year}`,
      start: monthStart,
      end: monthEnd,
    });

    cursor = new Date(year, month + 1, 1);
  }

  return months;
}

/* ── GET /api/finance/reports/vat ──────────────────── */

export async function GET(req: NextRequest) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const supabase = createServiceRoleClient();
  const params = req.nextUrl.searchParams;

  const from = params.get('from') || startOfCurrentQuarter();
  const to = params.get('to') || endOfCurrentQuarter();

  try {
    // VAT Collected: tax_amount from paid invoices
    const { data: invoices, error: invErr } = await supabase
      .from('pyra_invoices')
      .select('tax_amount, issue_date')
      .in('status', ['paid', 'partially_paid'])
      .gte('issue_date', from)
      .lte('issue_date', to);

    if (invErr) throw invErr;

    // VAT Paid: vat_amount from expenses
    const { data: expenses, error: expErr } = await supabase
      .from('pyra_expenses')
      .select('vat_amount, expense_date')
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
        .reduce((sum: number, inv: { tax_amount: number }) => sum + Number(inv.tax_amount || 0), 0);

      const paid = (expenses || [])
        .filter((exp: { expense_date: string }) => exp.expense_date >= m.start && exp.expense_date <= m.end)
        .reduce((sum: number, exp: { vat_amount: number }) => sum + Number(exp.vat_amount || 0), 0);

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
