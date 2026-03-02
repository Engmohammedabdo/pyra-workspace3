import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

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
      .select('id, invoice_number, issue_date, due_date, status, total, amount_paid, amount_due')
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
      .select('id, title, total_value, status, amount_billed, amount_collected')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false });

    if (ctrError) throw ctrError;
    const contractList = contracts || [];

    // 5. Calculate summary
    const today = new Date().toISOString().split('T')[0];

    const total_invoiced = invoiceList.reduce(
      (sum: number, inv: { total: number }) => sum + Number(inv.total),
      0
    );

    const total_paid = paymentList.reduce(
      (sum: number, p: { amount: number }) => sum + Number(p.amount),
      0
    );

    const total_outstanding = invoiceList
      .filter((inv: { status: string }) => inv.status !== 'paid' && inv.status !== 'cancelled')
      .reduce((sum: number, inv: { amount_due: number }) => sum + Number(inv.amount_due), 0);

    const total_overdue = invoiceList
      .filter((inv: { status: string; due_date: string }) =>
        inv.status !== 'paid' && inv.status !== 'cancelled' && inv.due_date < today
      )
      .reduce((sum: number, inv: { amount_due: number }) => sum + Number(inv.amount_due), 0);

    const contract_value = contractList.reduce(
      (sum: number, c: { total_value: number }) => sum + Number(c.total_value),
      0
    );

    return apiSuccess({
      client,
      invoices: invoiceList,
      payments: paymentList,
      contracts: contractList,
      summary: {
        total_invoiced,
        total_paid,
        total_outstanding,
        total_overdue,
        contract_value,
      },
    });
  } catch {
    return apiServerError();
  }
}
