/**
 * What the public invoice page is allowed to tell the payer.
 *
 * The hard rule this module exists to enforce: **`?paid=1` in the URL is never
 * proof of anything.** Stripe redirects the browser back in well under a
 * second, routinely before the webhook has settled, and the query string is
 * attacker-controlled besides. Only the ledger — `amount_due` / `status`, both
 * written by settleInvoicePayment — can say an invoice is paid. The return
 * flag can at most soften the message to "we have your payment, confirming",
 * and even then only when a matching pending session row actually exists.
 */

export type PublicPaymentState =
  /** The ledger says it is settled. The only state that claims payment. */
  | 'paid'
  /** Some money is booked, a balance remains. */
  | 'partially_paid'
  /** Back from Stripe, our own session row is still pending. Not a claim. */
  | 'confirming'
  /** A live checkout session exists — show the pay button. */
  | 'payable'
  /** Nothing live to pay with (session used, expired, or never recorded). */
  | 'link_inactive'
  /** The invoice itself is not in a payable state. */
  | 'unpayable';

/**
 * Stripe Checkout sessions live ~24h. Past that the hosted page is dead, so
 * rendering the button would send the customer to an error. Same constant the
 * reconcile cron uses to decide a row is stale.
 */
export const STRIPE_SESSION_LIFETIME_MS = 24 * 60 * 60 * 1000;

export interface PublicSessionRow {
  status: string;
  created_at: string;
  checkout_url: string | null;
}

export interface PaymentStateInput {
  invoiceStatus: string;
  amountDue: number;
  /** The session row for THIS invoice, or null when none was found. */
  session: PublicSessionRow | null;
  /** True only when `?paid=1` came back AND a session row for this invoice matched it. */
  returnedFromCheckout: boolean;
  nowIso: string;
}

/** Mirrors INVOICE_OUTSTANDING_STATUSES — an invoice that can still take money. */
const PAYABLE_STATUSES: readonly string[] = ['sent', 'partially_paid', 'overdue'];

export function derivePublicPaymentState(input: PaymentStateInput): PublicPaymentState {
  const { invoiceStatus, amountDue, session, returnedFromCheckout, nowIso } = input;

  // Ledger first, always. Nothing below can override a settled invoice, and
  // nothing below can fake one.
  if (invoiceStatus === 'paid' || amountDue <= 0) return 'paid';

  // The honest in-between. Requires a real pending row, so a hand-typed
  // `?paid=1` on a fresh link shows the pay button, not a reassurance.
  if (returnedFromCheckout && session?.status === 'pending') return 'confirming';

  if (!PAYABLE_STATUSES.includes(invoiceStatus)) return 'unpayable';

  const live =
    session?.status === 'pending' &&
    !!session.checkout_url &&
    Date.parse(nowIso) - Date.parse(session.created_at) < STRIPE_SESSION_LIFETIME_MS;

  if (live) return 'payable';

  // A partial payment with no live session: say so rather than offering a
  // dead button. `partially_paid` is checked here, not above, so that a
  // partially-paid invoice WITH a live session still shows the pay button for
  // the remaining balance.
  if (invoiceStatus === 'partially_paid') return 'partially_paid';

  return 'link_inactive';
}
