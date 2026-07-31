import { describe, it, expect } from 'vitest';
import {
  derivePublicPaymentState,
  STRIPE_SESSION_LIFETIME_MS,
  type PaymentStateInput,
} from '@/lib/invoices/public-payment-state';

const NOW = '2026-07-31T12:00:00.000Z';
const FRESH = '2026-07-31T11:59:00.000Z';
const STALE = new Date(Date.parse(NOW) - STRIPE_SESSION_LIFETIME_MS - 1000).toISOString();

function state(over: Partial<PaymentStateInput> = {}) {
  return derivePublicPaymentState({
    invoiceStatus: 'sent',
    amountDue: 700,
    session: { status: 'pending', created_at: FRESH, checkout_url: 'https://checkout.stripe.com/x' },
    returnedFromCheckout: false,
    nowIso: NOW,
    ...over,
  });
}

describe('derivePublicPaymentState — the ledger is the only proof', () => {
  it('reports paid when the invoice status says paid', () => {
    expect(state({ invoiceStatus: 'paid', amountDue: 0 })).toBe('paid');
  });

  it('reports paid when nothing is due, whatever the status string says', () => {
    // settleInvoicePayment leaves a cancelled invoice cancelled but still
    // zeroes amount_due. The customer paid; say so.
    expect(state({ invoiceStatus: 'cancelled', amountDue: 0 })).toBe('paid');
  });

  /**
   * The attack this whole module exists for. `?paid=1` is in a URL the payer
   * controls; on its own it must never move the page off "you still owe this".
   */
  it('does NOT claim payment for a hand-typed ?paid=1 with no session row', () => {
    expect(state({ returnedFromCheckout: true, session: null })).toBe('link_inactive');
  });

  it('still shows the pay button when ?paid=1 matched nothing but a live session exists', () => {
    // `returnedFromCheckout` is false because the page could not match the
    // session_id to a row of ours — the flag alone must buy nothing.
    expect(state({ returnedFromCheckout: false })).toBe('payable');
  });

  it('does NOT claim payment for ?paid=1 against an already-consumed session', () => {
    const s = state({
      returnedFromCheckout: true,
      session: { status: 'cancelled', created_at: FRESH, checkout_url: null },
    });
    expect(s).toBe('link_inactive');
  });

  it('softens to confirming — never to paid — on a genuine return from Stripe', () => {
    expect(state({ returnedFromCheckout: true })).toBe('confirming');
  });

  it('confirming outranks partially_paid so a top-up return is not mislabelled', () => {
    expect(state({ returnedFromCheckout: true, invoiceStatus: 'partially_paid', amountDue: 200 }))
      .toBe('confirming');
  });
});

describe('derivePublicPaymentState — what the payer can act on', () => {
  it('offers the button for a live session', () => {
    expect(state()).toBe('payable');
  });

  it('offers the button on an overdue invoice', () => {
    expect(state({ invoiceStatus: 'overdue' })).toBe('payable');
  });

  it('offers the button for the remaining balance on a partially-paid invoice', () => {
    expect(state({ invoiceStatus: 'partially_paid', amountDue: 200 })).toBe('payable');
  });

  it('withholds the button once the Stripe session has outlived its ~24h', () => {
    const s = state({
      session: { status: 'pending', created_at: STALE, checkout_url: 'https://checkout.stripe.com/x' },
    });
    expect(s).toBe('link_inactive');
  });

  it('withholds the button when the session row lost its checkout_url', () => {
    expect(state({ session: { status: 'pending', created_at: FRESH, checkout_url: null } }))
      .toBe('link_inactive');
  });

  it('withholds the button when no session was ever recorded', () => {
    expect(state({ session: null })).toBe('link_inactive');
  });

  it('falls back to partially_paid when the balance has no live session behind it', () => {
    expect(state({ invoiceStatus: 'partially_paid', amountDue: 200, session: null }))
      .toBe('partially_paid');
  });

  it('reports unpayable for a draft or cancelled invoice that still owes', () => {
    expect(state({ invoiceStatus: 'draft' })).toBe('unpayable');
    expect(state({ invoiceStatus: 'cancelled' })).toBe('unpayable');
  });

  it('treats the lifetime boundary as already dead', () => {
    const exactly = new Date(Date.parse(NOW) - STRIPE_SESSION_LIFETIME_MS).toISOString();
    expect(state({
      session: { status: 'pending', created_at: exactly, checkout_url: 'https://x' },
    })).toBe('link_inactive');
  });
});
