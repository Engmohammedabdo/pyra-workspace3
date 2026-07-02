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
    // Cancelled invoices are excluded — they are not receivables and must
    // not appear as debits on a client statement.
    let invoiceQuery = supabase
      .from('pyra_invoices')
      .select('id, invoice_number, status, issue_date, due_date, total, amount_paid, amount_due, currency, project_name')
      .eq('client_id', client.id)
      .not('status', 'in', '(draft,cancelled)')
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
      reference: string | null;
      created_at: string;
    }[] = [];

    if (invoiceIds.length > 0) {
      let payQuery = supabase
        .from('pyra_payments')
        .select('id, invoice_id, amount, payment_date, method, reference, created_at')
        .in('invoice_id', invoiceIds)
        .order('payment_date', { ascending: false });

      if (from) payQuery = payQuery.gte('payment_date', from);
      if (to) payQuery = payQuery.lte('payment_date', to);

      const { data } = await payQuery;
      payments = (data || []) as typeof payments;
    }

    // NOTE (finance audit 2026-07-02, F-STMT-DBL): pyra_stripe_payments rows
    // are intentionally NOT ledger entries. The Stripe webhook always books
    // the settled money into pyra_payments (method 'online') — the ledger's
    // single source of truth for money received is pyra_payments, so adding
    // stripe session rows double-credited every online payment.

    // ── Build statement entries (chronological) ──
    interface StatementEntry {
      date: string;
      type: 'invoice' | 'payment' | 'refund';
      description: string;
      reference: string;
      debit: number;
      credit: number;
      balance: number;
      invoice_id?: string;
      currency: string;
    }

    const METHOD_LABELS: Record<string, string> = {
      bank_transfer: 'تحويل بنكي',
      cash: 'نقدي',
      cheque: 'شيك',
      stripe: 'دفع إلكتروني',
      online: 'دفع إلكتروني',
      credit_note: 'إشعار دائن (استرداد)',
      refund: 'استرداد',
      dispute_lost: 'نزاع بنكي',
    };

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

    // Add payments as credits. NEGATIVE payments (credit-note refunds,
    // Stripe refunds, lost disputes) are money returned to the client —
    // proper ledger presentation puts them in the DEBIT column as a positive
    // amount with a clear label, never as a "negative credit".
    for (const pay of payments) {
      const inv = (invoices || []).find((i) => i.id === pay.invoice_id);
      const methodLabel = METHOD_LABELS[pay.method] || pay.method || 'دفعة';
      const amount = Number(pay.amount) || 0;
      const isRefund = amount < 0;
      const refText = pay.method === 'credit_note' && pay.reference ? ` ${pay.reference}` : '';
      entries.push({
        date: pay.payment_date,
        type: isRefund ? 'refund' : 'payment',
        description: `${methodLabel}${refText} — ${inv?.invoice_number || ''}`,
        reference: (pay.method === 'credit_note' && pay.reference) || inv?.invoice_number || '',
        debit: isRefund ? Math.abs(amount) : 0,
        credit: isRefund ? 0 : amount,
        balance: 0,
        invoice_id: pay.invoice_id,
        currency: inv?.currency || 'AED',
      });
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
    // amount_due is the clamped per-invoice source of truth — keeps the
    // summary consistent with what each invoice row shows.
    const totalRemaining = (invoices || []).reduce((s, i) => s + (Number(i.amount_due) || 0), 0);

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
