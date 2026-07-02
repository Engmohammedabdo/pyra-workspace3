import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveUserScope } from '@/lib/auth/scope';
import { toAED } from '@/lib/utils/currency';
import { getInvoiceCurrencyMap, sumPaymentsAED } from '@/lib/finance/payment-currency';
import { dubaiDayKey } from '@/lib/utils/format';
import { INVOICE_STATUS, INVOICE_OUTSTANDING_STATUSES } from '@/lib/constants/statuses';

/**
 * GET /api/invoices/revenue-summary
 * Aggregate revenue stats (cash-basis: actual payments received).
 *
 * Finance audit 2026-07-02 (F-REV-SUM) rework:
 * - payments are now SCOPED for non-admins (previously company-wide)
 * - all sums are AED-converted per invoice currency (never mix currencies)
 * - "this month" uses the Dubai calendar month, not UTC
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

    // Invoices first — they carry the scope filter AND the currency map
    let invoiceQuery = supabase
      .from('pyra_invoices')
      .select('id, status, total, amount_due, currency');

    if (!scope.isAdmin) {
      invoiceQuery = invoiceQuery.in('client_id', scope.clientIds);
    }

    const { data: invoices, error: invError } = await invoiceQuery;
    if (invError) {
      console.error('Revenue summary invoices error:', invError);
      return apiServerError();
    }

    const currencyByInvoice = new Map<string, string>(
      (invoices || []).map((i: { id: string; currency: string | null }) => [i.id, i.currency || 'AED'])
    );

    // Cash-basis revenue: actual payments, scoped via the invoices above
    let payQuery = supabase.from('pyra_payments').select('amount, payment_date, invoice_id');
    if (!scope.isAdmin) {
      const scopedIds = (invoices || []).map((i: { id: string }) => i.id);
      if (scopedIds.length === 0) {
        payQuery = payQuery.in('invoice_id', ['__none__']);
      } else {
        payQuery = payQuery.in('invoice_id', scopedIds);
      }
    }
    const { data: allPayments, error: payError } = await payQuery;
    if (payError) {
      console.error('Revenue summary payments error:', payError);
      return apiServerError();
    }

    // Admin payments may reference invoices outside the fetched set only if
    // the invoice was deleted — resolve any missing currencies defensively.
    const missingIds = (allPayments || [])
      .map((p: { invoice_id: string | null }) => p.invoice_id)
      .filter((id): id is string => !!id && !currencyByInvoice.has(id));
    if (missingIds.length > 0) {
      const extra = await getInvoiceCurrencyMap(supabase, missingIds);
      extra.forEach((v, k) => currencyByInvoice.set(k, v));
    }

    const thisMonth = dubaiDayKey().slice(0, 7); // YYYY-MM (Dubai calendar)
    const totalRevenue = sumPaymentsAED(allPayments || [], currencyByInvoice);
    const revenueThisMonth = sumPaymentsAED(
      (allPayments || []).filter((p: { payment_date: string | null }) => p.payment_date?.startsWith(thisMonth)),
      currencyByInvoice
    );

    let totalOutstanding = 0;
    let totalOverdue = 0;
    let totalInvoices = 0;
    let paidInvoices = 0;
    let overdueInvoices = 0;

    for (const inv of invoices || []) {
      totalInvoices++;

      if (inv.status === INVOICE_STATUS.PAID) {
        paidInvoices++;
      }

      const dueAED = toAED(Number(inv.amount_due || 0), inv.currency || 'AED');
      if ((INVOICE_OUTSTANDING_STATUSES as readonly string[]).includes(inv.status)) {
        totalOutstanding += dueAED;
      }

      if (inv.status === INVOICE_STATUS.OVERDUE) {
        totalOverdue += dueAED;
        overdueInvoices++;
      }
    }

    return apiSuccess({
      total_revenue: totalRevenue,
      total_outstanding: Math.round(totalOutstanding * 100) / 100,
      total_overdue: Math.round(totalOverdue * 100) / 100,
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
