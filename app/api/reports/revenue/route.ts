import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiError, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/reports/revenue
// Revenue report with date range and period grouping.
// Admin only.
//
// Query params:
//   ?from=YYYY-MM-DD  (default: 30 days ago)
//   ?to=YYYY-MM-DD    (default: today)
//   ?period=monthly|quarterly|yearly  (default: monthly)
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();
    const url = new URL(request.url);

    const from = url.searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];
    const period = url.searchParams.get('period') || 'monthly';
    const toEnd = to + 'T23:59:59';

    if (!['monthly', 'quarterly', 'yearly'].includes(period)) {
      return apiError('period must be monthly, quarterly, or yearly', 400);
    }

    const [
      paymentsRes,
      invoicesRes,
      outstandingRes,
      overdueRes,
    ] = await Promise.all([
      // All payments in range
      supabase
        .from('pyra_payments')
        .select('id, amount, payment_date, method')
        .gte('payment_date', from)
        .lte('payment_date', to),

      // Invoices in range (non-draft, non-cancelled) for invoiced total
      supabase
        .from('pyra_invoices')
        .select('id, total, created_at')
        .not('status', 'in', '("draft","cancelled")')
        .gte('created_at', from)
        .lte('created_at', toEnd),

      // Outstanding invoices (all time, not scoped to range)
      supabase
        .from('pyra_invoices')
        .select('amount_due')
        .in('status', ['sent', 'partially_paid', 'overdue']),

      // Overdue invoices (all time)
      supabase
        .from('pyra_invoices')
        .select('amount_due')
        .eq('status', 'overdue'),
    ]);

    const payments = paymentsRes.data || [];
    const invoices = invoicesRes.data || [];

    // Total revenue (sum of payments in range)
    const totalRevenue = payments.reduce(
      (sum: number, p: { amount: number }) => sum + (p.amount || 0),
      0
    );

    // Total invoiced (sum of invoice totals in range)
    const totalInvoiced = invoices.reduce(
      (sum: number, i: { total: number }) => sum + (i.total || 0),
      0
    );

    // Total outstanding
    const totalOutstanding = (outstandingRes.data || []).reduce(
      (sum: number, i: { amount_due: number }) => sum + (i.amount_due || 0),
      0
    );

    // Total overdue
    const totalOverdue = (overdueRes.data || []).reduce(
      (sum: number, i: { amount_due: number }) => sum + (i.amount_due || 0),
      0
    );

    // Revenue trend: group payments and invoices by period
    const revenueBuckets: Record<string, { revenue: number; invoiced: number }> = {};

    for (const p of payments) {
      const key = getPeriodKey((p as { payment_date: string }).payment_date, period);
      if (!revenueBuckets[key]) revenueBuckets[key] = { revenue: 0, invoiced: 0 };
      revenueBuckets[key].revenue += (p as { amount: number }).amount || 0;
    }

    for (const inv of invoices) {
      const key = getPeriodKey((inv as { created_at: string }).created_at, period);
      if (!revenueBuckets[key]) revenueBuckets[key] = { revenue: 0, invoiced: 0 };
      revenueBuckets[key].invoiced += (inv as { total: number }).total || 0;
    }

    const revenueTrend = Object.entries(revenueBuckets)
      .map(([periodKey, data]) => ({
        period: periodKey,
        revenue: data.revenue,
        invoiced: data.invoiced,
      }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // By payment method
    const methodMap: Record<string, { count: number; total: number }> = {};
    for (const p of payments) {
      const method = (p as { method: string }).method || 'unknown';
      if (!methodMap[method]) methodMap[method] = { count: 0, total: 0 };
      methodMap[method].count += 1;
      methodMap[method].total += (p as { amount: number }).amount || 0;
    }

    const byPaymentMethod = Object.entries(methodMap)
      .map(([method, data]) => ({
        method,
        count: data.count,
        total: data.total,
      }))
      .sort((a, b) => b.total - a.total);

    return apiSuccess({
      total_revenue: totalRevenue,
      total_invoiced: totalInvoiced,
      total_outstanding: totalOutstanding,
      total_overdue: totalOverdue,
      revenue_trend: revenueTrend,
      by_payment_method: byPaymentMethod,
    });
  } catch (err) {
    console.error('GET /api/reports/revenue error:', err);
    return apiServerError();
  }
}

/**
 * Get a period key string from a date string.
 * monthly  -> "2025-01"
 * quarterly -> "2025-Q1"
 * yearly   -> "2025"
 */
function getPeriodKey(dateStr: string, period: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = d.getMonth(); // 0-indexed

  switch (period) {
    case 'quarterly': {
      const quarter = Math.floor(month / 3) + 1;
      return `${year}-Q${quarter}`;
    }
    case 'yearly':
      return `${year}`;
    case 'monthly':
    default: {
      const mm = String(month + 1).padStart(2, '0');
      return `${year}-${mm}`;
    }
  }
}
