import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/statement
 * Client account statement — full payment history + invoice summary.
 * Params: ?from=YYYY-MM-DD&to=YYYY-MM-DD
 */
export async function GET(req: Request) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    // ── Invoices ──
    let invoiceQuery = supabase
      .from('pyra_invoices')
      .select('id, invoice_number, status, issue_date, due_date, total, amount_paid, amount_due, currency, project_name')
      .eq('client_id', client.id)
      .neq('status', 'draft')
      .order('issue_date', { ascending: false });

    if (from) invoiceQuery = invoiceQuery.gte('issue_date', from);
    if (to) invoiceQuery = invoiceQuery.lte('issue_date', to);

    const { data: invoices, error: invErr } = await invoiceQuery;
    if (invErr) throw invErr;

    // ── Payments ──
    const invoiceIds = (invoices || []).map((i) => i.id);
    let payments: {
      id: string;
      invoice_id: string;
      amount: number;
      payment_date: string;
      method: string;
      created_at: string;
    }[] = [];

    if (invoiceIds.length > 0) {
      let payQuery = supabase
        .from('pyra_payments')
        .select('id, invoice_id, amount, payment_date, method, created_at')
        .in('invoice_id', invoiceIds)
        .order('payment_date', { ascending: false });

      if (from) payQuery = payQuery.gte('payment_date', from);
      if (to) payQuery = payQuery.lte('payment_date', to);

      const { data } = await payQuery;
      payments = (data || []) as typeof payments;
    }

    // ── Stripe payments ──
    const { data: stripePayments } = await supabase
      .from('pyra_stripe_payments')
      .select('id, invoice_id, amount, currency, status, stripe_session_id, created_at')
      .eq('client_id', client.id)
      .eq('status', 'completed')
      .order('created_at', { ascending: false });

    // ── Build statement entries (chronological) ──
    interface StatementEntry {
      date: string;
      type: 'invoice' | 'payment' | 'stripe_payment';
      description: string;
      reference: string;
      debit: number;
      credit: number;
      balance: number;
      invoice_id?: string;
      currency: string;
    }

    const entries: StatementEntry[] = [];

    // Add invoices as debits
    for (const inv of invoices || []) {
      entries.push({
        date: inv.issue_date || inv.due_date || '',
        type: 'invoice',
        description: `فاتورة ${inv.invoice_number}${inv.project_name ? ` — ${inv.project_name}` : ''}`,
        reference: inv.invoice_number,
        debit: Number(inv.total) || 0,
        credit: 0,
        balance: 0,
        invoice_id: inv.id,
        currency: inv.currency || 'AED',
      });
    }

    // Add payments as credits
    for (const pay of payments) {
      const inv = (invoices || []).find((i) => i.id === pay.invoice_id);
      const methodLabel = pay.method === 'bank_transfer' ? 'تحويل بنكي'
        : pay.method === 'cash' ? 'نقدي'
        : pay.method === 'cheque' ? 'شيك'
        : pay.method === 'stripe' ? 'Stripe'
        : pay.method || 'دفعة';
      entries.push({
        date: pay.payment_date,
        type: 'payment',
        description: `${methodLabel} — ${inv?.invoice_number || ''}`,
        reference: inv?.invoice_number || '',
        debit: 0,
        credit: Number(pay.amount) || 0,
        balance: 0,
        invoice_id: pay.invoice_id,
        currency: inv?.currency || 'AED',
      });
    }

    // Add stripe payments as credits (only if not already in payments)
    for (const sp of stripePayments || []) {
      const alreadyInPayments = payments.some(
        (p) => p.invoice_id === sp.invoice_id && p.method === 'stripe'
      );
      if (!alreadyInPayments) {
        const inv = (invoices || []).find((i) => i.id === sp.invoice_id);
        entries.push({
          date: sp.created_at?.split('T')[0] || '',
          type: 'stripe_payment',
          description: `Stripe — ${inv?.invoice_number || ''}`,
          reference: inv?.invoice_number || '',
          debit: 0,
          credit: Number(sp.amount) || 0,
          balance: 0,
          invoice_id: sp.invoice_id,
          currency: sp.currency || 'AED',
        });
      }
    }

    // Sort by date ascending
    entries.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate running balance
    let runningBalance = 0;
    for (const entry of entries) {
      runningBalance += entry.debit - entry.credit;
      entry.balance = Math.round(runningBalance * 100) / 100;
    }

    // ── Unbilled contract obligations ──
    // Find active contracts with pending milestones (not yet invoiced)
    const { data: clientContracts } = await supabase
      .from('pyra_contracts')
      .select('id, title, total_value, currency, amount_billed, contract_type, status')
      .eq('client_id', client.id)
      .in('status', ['active', 'in_progress', 'signed']);

    interface UnbilledObligation {
      contract_id: string;
      contract_title: string;
      total_value: number;
      amount_billed: number;
      unbilled_amount: number;
      currency: string;
      pending_milestones: { title: string; amount: number }[];
    }

    const unbilledObligations: UnbilledObligation[] = [];

    for (const contract of clientContracts || []) {
      const unbilled = Number(contract.total_value || 0) - Number(contract.amount_billed || 0);
      if (unbilled <= 0) continue;

      // Fetch pending milestones for milestone contracts
      let pendingMilestones: { title: string; amount: number }[] = [];
      if (contract.contract_type === 'milestone' || contract.contract_type === 'upfront_delivery') {
        const { data: milestones } = await supabase
          .from('pyra_contract_milestones')
          .select('title, amount, status')
          .eq('contract_id', contract.id)
          .eq('status', 'pending')
          .order('sort_order', { ascending: true });

        pendingMilestones = (milestones || []).map((m: { title: string; amount: number }) => ({
          title: m.title,
          amount: Number(m.amount) || 0,
        }));
      }

      unbilledObligations.push({
        contract_id: contract.id,
        contract_title: contract.title || 'بدون عنوان',
        total_value: Number(contract.total_value) || 0,
        amount_billed: Number(contract.amount_billed) || 0,
        unbilled_amount: Math.round(unbilled * 100) / 100,
        currency: contract.currency || 'AED',
        pending_milestones: pendingMilestones,
      });
    }

    const totalUnbilled = unbilledObligations.reduce((s, o) => s + o.unbilled_amount, 0);

    // ── Summary ──
    const totalInvoiced = (invoices || []).reduce((s, i) => s + (Number(i.total) || 0), 0);
    const totalPaid = (invoices || []).reduce((s, i) => s + (Number(i.amount_paid) || 0), 0);
    const totalRemaining = totalInvoiced - totalPaid;

    const overdueInvoices = (invoices || []).filter((i) => i.status === 'overdue');
    const overdueAmount = overdueInvoices.reduce((s, i) => s + (Number(i.amount_due) || 0), 0);

    return apiSuccess({
      client: {
        name: client.name,
        company: client.company,
        email: client.email,
      },
      summary: {
        total_invoiced: Math.round(totalInvoiced * 100) / 100,
        total_paid: Math.round(totalPaid * 100) / 100,
        total_remaining: Math.round(totalRemaining * 100) / 100,
        overdue_amount: Math.round(overdueAmount * 100) / 100,
        unbilled_amount: Math.round(totalUnbilled * 100) / 100,
        invoice_count: (invoices || []).length,
        payment_count: payments.length,
      },
      entries,
      invoices: invoices || [],
      unbilled_obligations: unbilledObligations,
    });
  } catch (err) {
    console.error('GET /api/portal/statement error:', err);
    return apiServerError();
  }
}
