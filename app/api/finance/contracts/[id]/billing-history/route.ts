import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveUserScope } from '@/lib/auth/scope';
import { RECURRING_INVOICE_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/finance/contracts/[id]/billing-history
 * Returns the recurring invoice template, generated invoices, and payment summary
 * for a retainer contract.
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const scope = await resolveUserScope(auth);
  const { id } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    // 1. Verify contract exists + scope check
    const { data: contract, error: contractErr } = await supabase
      .from('pyra_contracts')
      .select('id, client_id, contract_type, start_date')
      .eq('id', id)
      .single();

    if (contractErr || !contract) return apiNotFound();

    if (!scope.isAdmin && contract.client_id && !scope.clientIds.includes(Number(contract.client_id))) {
      return apiForbidden();
    }

    // 2. Fetch linked recurring invoice template
    const { data: recurringInvoice } = await supabase
      .from('pyra_recurring_invoices')
      .select(RECURRING_INVOICE_FIELDS)
      .eq('contract_id', id)
      .maybeSingle();

    // 3. Fetch all invoices linked to this contract
    const { data: invoices } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, status, issue_date, due_date, total, amount_paid, amount_due, currency')
      .eq('contract_id', id)
      .order('issue_date', { ascending: false });

    const invoiceList = invoices || [];

    // 4. Fetch payments for all linked invoices
    const invoiceIds = invoiceList.map(inv => inv.id);
    let payments: { invoice_id: string; amount: number; payment_date: string; method: string | null }[] = [];

    if (invoiceIds.length > 0) {
      const { data: paymentRows } = await supabase
        .from('pyra_payments')
        .select('invoice_id, amount, payment_date, method')
        .in('invoice_id', invoiceIds)
        .order('payment_date', { ascending: false });

      payments = paymentRows || [];
    }

    // 5. Attach payments to invoices
    const invoicesWithPayments = invoiceList.map(inv => ({
      ...inv,
      payments: payments.filter(p => p.invoice_id === inv.id),
    }));

    // 6. Calculate summary
    const totalBilled = invoiceList.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalPaid = invoiceList.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);
    const totalRemaining = totalBilled - totalPaid;

    // Months active: count distinct months from invoices
    const months = new Set(invoiceList.map(inv => inv.issue_date?.substring(0, 7)));
    const monthsActive = months.size;

    return apiSuccess({
      recurring_invoice: recurringInvoice || null,
      invoices: invoicesWithPayments,
      summary: {
        total_billed: totalBilled,
        total_paid: totalPaid,
        total_remaining: totalRemaining,
        months_active: monthsActive,
        invoice_count: invoiceList.length,
      },
    });
  } catch {
    return apiServerError();
  }
}
