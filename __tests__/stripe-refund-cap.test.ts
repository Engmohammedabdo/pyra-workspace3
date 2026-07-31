import { describe, it, expect } from 'vitest';
import { capRefundToBooked } from '@/lib/stripe/refund-cap';

function cap(over: Partial<Parameters<typeof capRefundToBooked>[0]> = {}) {
  return capRefundToBooked({
    cumulativeRefunded: 0,
    bookedForIntent: 700,
    alreadyRefunded: 0,
    invoiceAmountPaid: 700,
    ...over,
  });
}

describe('capRefundToBooked — the surcharge case', () => {
  /**
   * The live shape: 700 invoice, 4% card fee, Stripe charged 728. The ledger
   * only ever received the 700 base, so a full refund must book 700 — not the
   * 728 Stripe reports.
   */
  it('caps a full refund of a surcharged charge at the booked base', () => {
    const r = cap({ cumulativeRefunded: 728 });
    expect(r.refundAmount).toBe(700);
    expect(r.capped).toBe(true);
    expect(r.ceiling).toBe(700);
  });

  it('leaves an unsurcharged full refund exactly as Stripe reports it', () => {
    const r = cap({ cumulativeRefunded: 700 });
    expect(r.refundAmount).toBe(700);
    expect(r.capped).toBe(false);
  });

  it('passes a partial refund through untouched', () => {
    expect(cap({ cumulativeRefunded: 300 }).refundAmount).toBe(300);
  });

  it('books only the remaining delta when a partial refund is topped up to full', () => {
    // First refund of 300 is on the ledger; Stripe's cumulative is now the
    // full gross 728. Only 400 more may be booked, not 428.
    const r = cap({ cumulativeRefunded: 728, alreadyRefunded: 300 });
    expect(r.refundAmount).toBe(400);
    expect(r.capped).toBe(true);
  });

  it('never lets the two refund steps exceed the base between them', () => {
    const first = cap({ cumulativeRefunded: 300 });
    const second = cap({ cumulativeRefunded: 728, alreadyRefunded: first.refundAmount });
    expect(first.refundAmount + second.refundAmount).toBe(700);
  });
});

describe('capRefundToBooked — replays and idempotency', () => {
  it('books nothing on an exact replay', () => {
    expect(cap({ cumulativeRefunded: 728, alreadyRefunded: 700 }).refundAmount).toBe(0);
  });

  /**
   * Without the max(0, …) this returns a negative delta, and the caller
   * inserts `amount: -refundAmount` — a POSITIVE payment row. A refund replay
   * would credit the customer's invoice instead of debiting it.
   */
  it('never returns a negative delta, which would insert a phantom payment', () => {
    const r = cap({ cumulativeRefunded: 728, alreadyRefunded: 900 });
    expect(r.refundAmount).toBe(0);
    expect(r.refundAmount).toBeGreaterThanOrEqual(0);
  });
});

describe('capRefundToBooked — the hand-reconciled fallback', () => {
  /**
   * The payment exists on the ledger but under some other reference (booked by
   * hand), so no positive row matches this intent. Capping at zero here would
   * swallow a real refund and leave the invoice permanently overstated as
   * paid — the exact failure the webhook's ledger fallback was added to fix.
   */
  it('falls back to the invoice balance rather than refusing the refund', () => {
    const r = cap({ cumulativeRefunded: 500, bookedForIntent: 0, invoiceAmountPaid: 500 });
    expect(r.refundAmount).toBe(500);
    expect(r.capped).toBe(false);
  });

  it('still refuses to take the invoice below zero on the fallback path', () => {
    const r = cap({ cumulativeRefunded: 900, bookedForIntent: 0, invoiceAmountPaid: 500 });
    expect(r.refundAmount).toBe(500);
    expect(r.capped).toBe(true);
  });

  it('accounts for earlier refunds when falling back', () => {
    // 500 was paid, 200 already refunded (so amount_paid now reads 300).
    // The ceiling must be 500, leaving 300 still refundable.
    const r = cap({
      cumulativeRefunded: 500,
      bookedForIntent: 0,
      alreadyRefunded: 200,
      invoiceAmountPaid: 300,
    });
    expect(r.ceiling).toBe(500);
    expect(r.refundAmount).toBe(300);
  });

  it('books nothing when the invoice holds no money at all', () => {
    const r = cap({ cumulativeRefunded: 400, bookedForIntent: 0, invoiceAmountPaid: 0 });
    expect(r.refundAmount).toBe(0);
  });
});

describe('capRefundToBooked — rounding', () => {
  it('keeps an awkward base exact', () => {
    // 333.33 @ 3.5% → 11.67 fee → 345.00 gross.
    const r = cap({ cumulativeRefunded: 345, bookedForIntent: 333.33, invoiceAmountPaid: 333.33 });
    expect(r.refundAmount).toBe(333.33);
  });

  it('never emits more than 2dp', () => {
    const r = cap({ cumulativeRefunded: 100.005, bookedForIntent: 99.999, invoiceAmountPaid: 100 });
    expect(Math.round(r.refundAmount * 100) / 100).toBe(r.refundAmount);
  });
});
