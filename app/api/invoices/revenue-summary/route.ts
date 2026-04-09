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

    // Cash-basis revenue: use actual payments received
    const { data: allPayments, error: payError } = await supabase
      .from('pyra_payments')
      .select('amount, payment_date');

    if (payError) {
      console.error('Revenue summary payments error:', payError);
      return apiServerError();
    }

    const thisMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
    const totalRevenue = (allPayments || []).reduce((sum, p) => sum + Number(p.amount || 0), 0);
    const revenueThisMonth = (allPayments || [])
      .filter(p => p.payment_date?.startsWith(thisMonth))
      .reduce((sum, p) => sum + Number(p.amount || 0), 0);

    // Outstanding and overdue: still invoice-based (correct)
    let invoiceQuery = supabase
      .from('pyra_invoices')
      .select('status, total, amount_due');

    if (!scope.isAdmin) {
      invoiceQuery = invoiceQuery.in('client_id', scope.clientIds);
    }

    const { data: invoices, error: invError } = await invoiceQuery;

    if (invError) {
      console.error('Revenue summary invoices error:', invError);
      return apiServerError();
    }

    let totalOutstanding = 0;
    let totalOverdue = 0;
    let totalInvoices = 0;
    let paidInvoices = 0;
    let overdueInvoices = 0;

    for (const inv of invoices || []) {
      totalInvoices++;

      if (inv.status === 'paid') {
        paidInvoices++;
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
