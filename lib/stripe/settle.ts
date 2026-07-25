import type { SupabaseClient } from '@supabase/supabase-js';
import { generateId } from '@/lib/utils/id';
import { dubaiDayKey } from '@/lib/utils/format';
import { logError } from '@/lib/observability/log-error';

/**
 * Settlement core for Stripe money events.
 *
 * WHY THIS EXISTS: every money write in the webhook used to discard its
 * Supabase `{ error }` (Supabase resolves with an error property — it does NOT
 * throw), and the handler then returned HTTP 200. A failed payment insert
 * therefore produced a wrong invoice state AND told Stripe the event was
 * delivered, so it was never retried and the payment was lost silently.
 *
 * Everything here either succeeds completely or reports a retryable failure so
 * the caller can answer Stripe with a non-2xx and get the event redelivered.
 * Redelivery is safe because `uniq_payments_invoice_reference` (migration 053)
 * makes duplicate booking impossible at the database level.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * The single definition of an invoice's money state, derived from the sum of
 * its payments. All three webhook branches (payment / refund / dispute-loss)
 * share it — previously each had its own subtly different version.
 */
export function deriveInvoiceState(total: number, paymentsSum: number) {
  // Refunds are negative rows, so the sum can go below zero on an over-refund.
  // amount_paid must never be negative.
  const amountPaid = round2(Math.max(0, paymentsSum));
  const amountDue = round2(Math.max(0, total - amountPaid));
  const status: 'sent' | 'partially_paid' | 'paid' =
    amountPaid <= 0 ? 'sent' : amountDue <= 0 ? 'paid' : 'partially_paid';
  return { amountPaid, amountDue, status };
}

/**
 * Split a Stripe gross charge into the part that settles the invoice (base) and
 * the card-fee surcharge, which is collected on top and never settles anything.
 * Any malformed / hostile surcharge value degrades to "no surcharge" so the
 * full gross is credited to the client rather than silently swallowed.
 */
export function splitGross(gross: number, surchargeMeta: string | undefined | null) {
  const raw = Number(surchargeMeta);
  const surcharge =
    Number.isFinite(raw) && raw > 0 && raw < gross ? round2(raw) : 0;
  return { base: round2(gross - surcharge), surcharge };
}

export type SettleInput = {
  invoiceId: string;
  /** What Stripe actually charged, in major units. */
  grossAmount: number;
  /** The portion that settles the invoice (gross minus any surcharge). */
  baseAmount: number;
  /** Stable idempotency key — the Stripe payment intent id. */
  reference: string;
  note: string;
};

export type SettleResult =
  | {
      ok: true;
      /** True when this delivery did not create the payment row (already booked). */
      skipped: boolean;
      amountPaid: number;
      amountDue: number;
      status: string;
      invoiceNumber: string;
    }
  | { ok: false; error: string; retryable: boolean };

/**
 * Book a Stripe payment against an invoice and recompute the invoice's money
 * state. Returns a retryable failure rather than throwing, so the webhook can
 * decide the HTTP status.
 */
export async function settleInvoicePayment(
  supabase: SupabaseClient,
  input: SettleInput,
): Promise<SettleResult> {
  const { invoiceId, baseAmount, grossAmount, reference, note } = input;

  const { data: invoice, error: invErr } = await supabase
    .from('pyra_invoices')
    .select('id, total, invoice_number, status')
    .eq('id', invoiceId)
    .maybeSingle();

  if (invErr) return { ok: false, error: `invoice read: ${invErr.message}`, retryable: true };
  if (!invoice) return { ok: false, error: `invoice ${invoiceId} not found`, retryable: false };

  // A zero-amount payment would violate CHECK (amount <> 0) and is meaningless.
  if (baseAmount <= 0) {
    return { ok: false, error: `non-positive base amount ${baseAmount}`, retryable: false };
  }

  // Insert FIRST and let the unique index be the idempotency authority.
  // 23505 = unique_violation => this exact event was already settled.
  const { error: payErr } = await supabase.from('pyra_payments').insert({
    id: generateId('pay'),
    invoice_id: invoiceId,
    amount: baseAmount,
    payment_date: dubaiDayKey(),
    method: 'online',
    reference,
    notes: note,
    recorded_by: 'system',
  });

  // 23505 = the payment is already booked by an earlier delivery.
  //
  // Do NOT return here. A previous attempt may have inserted the payment and
  // then failed before updating the invoice — and its rollback may itself have
  // failed. Falling through to the recompute is what makes the Stripe retry
  // SELF-HEALING: the invoice gets brought in line with the ledger even though
  // this delivery wrote nothing. Returning early left the invoice permanently
  // wrong with no path to recovery.
  let insertedHere = true;
  if (payErr) {
    if (payErr.code === '23505') {
      insertedHere = false;
    } else {
      return { ok: false, error: `payment insert: ${payErr.message}`, retryable: true };
    }
  }

  const { data: allPayments, error: sumErr } = await supabase
    .from('pyra_payments')
    .select('amount')
    .eq('invoice_id', invoiceId);

  if (sumErr) {
    // Only undo a row THIS call created — never one an earlier delivery owns.
    if (insertedHere) await rollbackPayment(supabase, invoiceId, reference);
    return { ok: false, error: `payments re-sum: ${sumErr.message}`, retryable: true };
  }

  const sum = (allPayments ?? []).reduce(
    (s: number, p: { amount: number }) => s + Number(p.amount), 0,
  );
  const next = deriveInvoiceState(Number(invoice.total), sum);

  // Never resurrect a terminal invoice. Record the money, but leave a cancelled
  // invoice cancelled and make it loud — a payment against a cancelled invoice
  // is a real-world problem a human has to resolve.
  const isTerminal = invoice.status === 'cancelled';
  const update: Record<string, unknown> = {
    amount_paid: next.amountPaid,
    amount_due: next.amountDue,
    updated_at: new Date().toISOString(),
  };
  if (!isTerminal) update.status = next.status;

  const { error: updErr } = await supabase
    .from('pyra_invoices')
    .update(update)
    .eq('id', invoiceId);

  if (updErr) {
    if (insertedHere) await rollbackPayment(supabase, invoiceId, reference);
    return { ok: false, error: `invoice update: ${updErr.message}`, retryable: true };
  }

  if (isTerminal) {
    logError({
      severity: 'warning',
      error: new Error(`Payment received on cancelled invoice ${invoice.invoice_number}`),
      metadata: { source: 'stripe_settle', invoice_id: invoiceId, reference, gross: grossAmount },
    });
  }

  if (next.amountPaid > Number(invoice.total)) {
    logError({
      severity: 'warning',
      error: new Error(`Overpayment on invoice ${invoice.invoice_number}`),
      metadata: {
        source: 'stripe_settle',
        invoice_id: invoiceId,
        total: Number(invoice.total),
        amount_paid: next.amountPaid,
        overpaid_by: round2(next.amountPaid - Number(invoice.total)),
      },
    });
  }

  return { ok: true, skipped: !insertedHere, ...next, invoiceNumber: invoice.invoice_number };
}

async function rollbackPayment(
  supabase: SupabaseClient,
  invoiceId: string,
  reference: string,
): Promise<void> {
  const { error } = await supabase
    .from('pyra_payments')
    .delete()
    .eq('invoice_id', invoiceId)
    .eq('reference', reference);
  if (error) {
    // Now we have a payment row with no matching invoice update. Loud, because
    // only a human can reconcile this.
    logError({
      error: new Error(`Rollback of payment ${reference} failed: ${error.message}`),
      metadata: { source: 'stripe_settle', invoice_id: invoiceId, reference },
    });
  }
}

/**
 * Derive a contract's collected total from actual payments. Never incremented —
 * same doctrine as recalcContractBilled (Finance Remediation lock).
 *
 * Resolves the contract from the invoice's direct contract_id, falling back to
 * the milestone link. Returns silently when the invoice belongs to no contract.
 */
export async function recalcContractCollected(
  supabase: SupabaseClient,
  invoiceId: string,
): Promise<void> {
  const { data: invoice } = await supabase
    .from('pyra_invoices')
    .select('contract_id')
    .eq('id', invoiceId)
    .maybeSingle();

  let contractId: string | null = invoice?.contract_id ?? null;

  if (!contractId) {
    const { data: milestone } = await supabase
      .from('pyra_contract_milestones')
      .select('contract_id')
      .eq('invoice_id', invoiceId)
      .maybeSingle();
    contractId = milestone?.contract_id ?? null;
  }

  if (!contractId) return;

  // Every invoice belonging to this contract: direct link + milestone link.
  const { data: direct } = await supabase
    .from('pyra_invoices')
    .select('id')
    .eq('contract_id', contractId);

  const { data: viaMilestone } = await supabase
    .from('pyra_contract_milestones')
    .select('invoice_id')
    .eq('contract_id', contractId)
    .not('invoice_id', 'is', null);

  const ids = new Set<string>();
  (direct ?? []).forEach((i: { id: string }) => ids.add(i.id));
  (viaMilestone ?? []).forEach((m: { invoice_id: string | null }) => {
    if (m.invoice_id) ids.add(m.invoice_id);
  });
  if (ids.size === 0) return;

  // Cancelled invoices are excluded — their payments are not contract revenue.
  const { data: live } = await supabase
    .from('pyra_invoices')
    .select('id')
    .in('id', Array.from(ids))
    .neq('status', 'cancelled');

  const liveIds = (live ?? []).map((i: { id: string }) => i.id);
  if (liveIds.length === 0) return;

  const { data: payments, error: payErr } = await supabase
    .from('pyra_payments')
    .select('amount')
    .in('invoice_id', liveIds);

  if (payErr) {
    logError({
      severity: 'warning',
      error: payErr,
      metadata: { source: 'stripe_settle', step: 'recalc_contract_collected', contract_id: contractId },
    });
    return;
  }

  const total = round2(
    (payments ?? []).reduce((s: number, p: { amount: number }) => s + Number(p.amount), 0),
  );

  const { error: updErr } = await supabase
    .from('pyra_contracts')
    .update({ amount_collected: total, updated_at: new Date().toISOString() })
    .eq('id', contractId);

  if (updErr) {
    logError({
      severity: 'warning',
      error: updErr,
      metadata: { source: 'stripe_settle', step: 'update_contract_collected', contract_id: contractId },
    });
  }
}
