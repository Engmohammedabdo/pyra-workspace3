import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';

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
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();

    // Calculate 12-month range
    const now = new Date();
    const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const rangeStart = twelveMonthsAgo.toISOString().split('T')[0];
    const rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    const [paymentsRes, invoicesRes] = await Promise.all([
      // Payments in range
      supabase
        .from('pyra_payments')
        .select('amount, payment_date')
        .gte('payment_date', rangeStart)
        .lte('payment_date', rangeEnd),

      // Invoices in range (non-draft, non-cancelled)
      supabase
        .from('pyra_invoices')
        .select('total, issue_date')
        .not('status', 'in', '("draft","cancelled")')
        .gte('issue_date', rangeStart)
        .lte('issue_date', rangeEnd),
    ]);

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
    for (const p of paymentsRes.data || []) {
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
