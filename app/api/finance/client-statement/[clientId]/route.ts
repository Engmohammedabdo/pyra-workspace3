import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { toAED } from '@/lib/utils/currency';
import { dubaiDayKey } from '@/lib/utils/format';
import { INVOICE_STATUS, INVOICE_OUTSTANDING_STATUSES } from '@/lib/constants/statuses';

type RouteContext = { params: Promise<{ clientId: string }> };

export async function GET(
  _req: NextRequest,
  context: RouteContext
) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const { clientId } = await context.params;
  const supabase = createServiceRoleClient();

  try {
    // 1. Fetch client info
    const { data: client, error: clientError } = await supabase
      .from('pyra_clients')
      .select('id, name, company, email')
      .eq('id', clientId)
      .single();

    if (clientError || !client) return apiNotFound('العميل غير موجود');

    // 2. Fetch all invoices for this client
    const { data: invoices, error: invError } = await supabase
      .from('pyra_invoices')
      .select('id, invoice_number, issue_date, due_date, status, total, amount_paid, amount_due, currency')
      .eq('client_id', clientId)
      .order('issue_date', { ascending: false });

    if (invError) throw invError;
    const invoiceList = invoices || [];

    // 3. Fetch all payments linked to those invoices
    const invoiceIds = invoiceList.map((inv: { id: string }) => inv.id);
    let paymentList: Array<{
      id: string;
      invoice_id: string;
      amount: number;
      payment_date: string;
      method: string;
    }> = [];

    if (invoiceIds.length > 0) {
      const { data: payments, error: payError } = await supabase
        .from('pyra_payments')
        .select('id, invoice_id, amount, payment_date, method')
        .in('invoice_id', invoiceIds)
        .order('payment_date', { ascending: false });

      if (payError) throw payError;
      paymentList = payments || [];
    }

    // 4. Fetch contracts for this client
    const { data: contracts, error: ctrError } = await supabase
      .from('pyra_contracts')
      .select('id, title, total_value, status, amount_billed, amount_collected, currency')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (ctrError) throw ctrError;
    const contractList = contracts || [];

    // 5. Calculate summary (Batch 4: AED-converted per invoice currency;
    // drafts are NOT receivables — a never-sent invoice must not appear as
    // debt; cancelled excluded as before)
    const today = dubaiDayKey();
    const currencyOf = new Map<string, string>(
      invoiceList.map((inv: { id: string; currency: string | null }) => [inv.id, inv.currency || 'AED'])
    );
    const billableList = invoiceList.filter(
      (inv: { status: string }) =>
        inv.status !== INVOICE_STATUS.DRAFT && inv.status !== INVOICE_STATUS.CANCELLED
    );

    const total_invoiced = billableList.reduce(
      (sum: number, inv: { total: number; currency: string | null }) =>
        sum + toAED(Number(inv.total), inv.currency || 'AED'),
      0
    );

    // total_paid counts only payments on BILLABLE invoices — a payment
    // recorded against a draft/cancelled invoice would otherwise inflate
    // "paid" against a base that excludes its invoice.
    const billableIds = new Set(billableList.map((inv: { id: string }) => inv.id));
    const total_paid = paymentList
      .filter((p: { invoice_id: string }) => billableIds.has(p.invoice_id))
      .reduce(
        (sum: number, p: { amount: number; invoice_id: string }) =>
          sum + toAED(Number(p.amount), currencyOf.get(p.invoice_id) || 'AED'),
        0
      );

    const total_outstanding = billableList
      .filter((inv: { status: string }) =>
        (INVOICE_OUTSTANDING_STATUSES as readonly string[]).includes(inv.status)
      )
      .reduce(
        (sum: number, inv: { amount_due: number; currency: string | null }) =>
          sum + toAED(Number(inv.amount_due), inv.currency || 'AED'),
        0
      );

    const total_overdue = billableList
      .filter((inv: { status: string; due_date: string }) =>
        (INVOICE_OUTSTANDING_STATUSES as readonly string[]).includes(inv.status) && inv.due_date < today
      )
      .reduce(
        (sum: number, inv: { amount_due: number; currency: string | null }) =>
          sum + toAED(Number(inv.amount_due), inv.currency || 'AED'),
        0
      );

    // Same doctrine as the four aggregates above — never sum across currencies.
    const contract_value = contractList.reduce(
      (sum: number, c: { total_value: number; currency: string | null }) =>
        sum + toAED(Number(c.total_value), c.currency || 'AED'),
      0
    );

    return apiSuccess({
      client,
      invoices: invoiceList,
      // Payments have no currency column by design — a payment's currency is
      // its invoice's currency (Finance Remediation lock). Thread it onto each
      // row so the UI never assumes AED.
      payments: paymentList.map((p) => ({
        ...p,
        currency: currencyOf.get(p.invoice_id) || 'AED',
      })),
      contracts: contractList,
      summary: {
        total_invoiced: Math.round(total_invoiced * 100) / 100,
        total_paid: Math.round(total_paid * 100) / 100,
        total_outstanding: Math.round(total_outstanding * 100) / 100,
        total_overdue: Math.round(total_overdue * 100) / 100,
        contract_value: Math.round(contract_value * 100) / 100,
      },
    });
  } catch {
    return apiServerError();
  }
}
