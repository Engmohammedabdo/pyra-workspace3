import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveUserScope } from '@/lib/auth/scope';

/**
 * GET /api/invoices/revenue-summary
 * Aggregate revenue stats across all invoices.
 * Admin only.
 */
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('finance.view');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);

    // Non-admin with no accessible clients → empty revenue summary
    if (!scope.isAdmin && scope.clientIds.length === 0) {
      return apiSuccess({
        total_revenue: 0,
        total_outstanding: 0,
        total_overdue: 0,
        revenue_this_month: 0,
        total_invoices: 0,
        paid_invoices: 0,
        overdue_invoices: 0,
      });
    }

    const supabase = createServiceRoleClient();

    // Get invoices for aggregation (scoped for non-admins)
    let query = supabase
      .from('pyra_invoices')
      .select('status, total, amount_paid, amount_due, created_at, updated_at');

    if (!scope.isAdmin) {
      query = query.in('client_id', scope.clientIds);
    }

    const { data: invoices, error } = await query;

    if (error) {
      console.error('Revenue summary error:', error);
      return apiServerError();
    }

    const now = new Date();
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let totalRevenue = 0;
    let totalOutstanding = 0;
    let totalOverdue = 0;
    let revenueThisMonth = 0;
    let totalInvoices = 0;
    let paidInvoices = 0;
    let overdueInvoices = 0;

    for (const inv of invoices || []) {
      totalInvoices++;

      if (inv.status === 'paid') {
        totalRevenue += inv.total;
        paidInvoices++;
        if (inv.updated_at?.startsWith(thisMonth)) {
          revenueThisMonth += inv.total;
        }
      }

      if (['sent', 'partially_paid', 'overdue'].includes(inv.status)) {
        totalOutstanding += inv.amount_due;
      }

      if (inv.status === 'overdue') {
        totalOverdue += inv.amount_due;
        overdueInvoices++;
      }
    }

    return apiSuccess({
      total_revenue: totalRevenue,
      total_outstanding: totalOutstanding,
      total_overdue: totalOverdue,
      revenue_this_month: revenueThisMonth,
      total_invoices: totalInvoices,
      paid_invoices: paidInvoices,
      overdue_invoices: overdueInvoices,
    });
  } catch (err) {
    console.error('GET /api/invoices/revenue-summary error:', err);
    return apiServerError();
  }
}
