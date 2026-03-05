import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { resolveUserScope } from '@/lib/auth/scope';

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

// =============================================================
// GET /api/dashboard/kpis/revenue-trend
// Monthly revenue and invoiced amounts for the last 12 months.
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('dashboard.view');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);

    const supabase = createServiceRoleClient();

    // Calculate 12-month range
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const rangeStart = twelveMonthsAgo.toISOString().split('T')[0];
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    // Non-admin with no accessible clients → return empty trend data
    if (!scope.isAdmin && scope.clientIds.length === 0) {
      const emptyBuckets: { month: string; revenue: number; invoiced: number }[] = [];
      for (let i = 0; i < 12; i++) {
        const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
        emptyBuckets.push({ month: MONTH_LABELS[d.getMonth()], revenue: 0, invoiced: 0 });
      }
      return apiSuccess(emptyBuckets);
    }

    // Build scoped invoice query
    let invoiceQuery = supabase
      .from('pyra_invoices')
      .select('id, total, issue_date, client_id')
      .not('status', 'in', '("draft","cancelled")')
      .gte('issue_date', rangeStart)
      .lte('issue_date', rangeEnd);

    if (!scope.isAdmin) {
      invoiceQuery = invoiceQuery.in('client_id', scope.clientIds);
    }

    const invoicesRes = await invoiceQuery;

    // Get scoped invoice IDs to filter payments
    const scopedInvoiceIds = (invoicesRes.data || []).map((inv) => inv.id);

    let paymentsData: { amount: number; payment_date: string }[] = [];
    if (scopedInvoiceIds.length > 0) {
      let paymentQuery = supabase
        .from('pyra_payments')
        .select('amount, payment_date')
        .gte('payment_date', rangeStart)
        .lte('payment_date', rangeEnd);

      if (!scope.isAdmin) {
        paymentQuery = paymentQuery.in('invoice_id', scopedInvoiceIds);
      }

      const paymentsRes = await paymentQuery;
      paymentsData = paymentsRes.data || [];
    } else if (scope.isAdmin) {
      // Admin: fetch all payments
      const paymentsRes = await supabase
        .from('pyra_payments')
        .select('amount, payment_date')
        .gte('payment_date', rangeStart)
        .lte('payment_date', rangeEnd);
      paymentsData = paymentsRes.data || [];
    }

    // Build month buckets for last 12 months
    const buckets: Record<string, { month: string; revenue: number; invoiced: number }> = {};
    for (let i = 0; i < 12; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[key] = {
        month: MONTH_LABELS[d.getMonth()],
        revenue: 0,
        invoiced: 0,
      };
    }

    // Fill revenue from payments
    for (const p of paymentsData) {
      if (!p.payment_date) continue;
      const d = new Date(p.payment_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (buckets[key]) {
        buckets[key].revenue += p.amount || 0;
      }
    }

    // Fill invoiced from invoices
    for (const inv of invoicesRes.data || []) {
      if (!inv.issue_date) continue;
      const d = new Date(inv.issue_date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (buckets[key]) {
        buckets[key].invoiced += inv.total || 0;
      }
    }

    // Return sorted by month order
    const trend = Object.keys(buckets)
      .sort()
      .map((key) => buckets[key]);

    return apiSuccess(trend);
  } catch (err) {
    console.error('GET /api/dashboard/kpis/revenue-trend error:', err);
    return apiServerError();
  }
}
