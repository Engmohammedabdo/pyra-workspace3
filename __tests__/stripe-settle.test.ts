import { describe, it, expect } from 'vitest';
import { deriveInvoiceState, splitGross } from '@/lib/stripe/settle';

/**
 * The webhook's three money branches each hand-rolled their own "recompute the
 * invoice from the payments sum" logic, and they disagreed:
 *   - the completed branch had no zero-paid arm, so a silently-failed payment
 *     insert relabelled a wholly UNPAID invoice as 'partially_paid'
 *   - the refund branch left amount_paid unclamped and negative
 *   - the dispute branch clamped amount_paid but derived status differently
 * deriveInvoiceState is the single definition all three now share.
 */
describe('deriveInvoiceState', () => {
  it('marks fully paid when the sum covers the total', () => {
    expect(deriveInvoiceState(5000, 5000)).toEqual({
      amountPaid: 5000, amountDue: 0, status: 'paid',
    });
  });

  it('marks partially paid on a short payment', () => {
    expect(deriveInvoiceState(6000, 5000)).toEqual({
      amountPaid: 5000, amountDue: 1000, status: 'partially_paid',
    });
  });

  it('returns to sent when refunds zero the balance', () => {
    expect(deriveInvoiceState(5000, 0)).toEqual({
      amountPaid: 0, amountDue: 5000, status: 'sent',
    });
  });

  it('treats a net-negative payments sum as unpaid, never negative', () => {
    // Over-refund: refunds exceed payments. amount_paid must not go negative.
    expect(deriveInvoiceState(5000, -200)).toEqual({
      amountPaid: 0, amountDue: 5000, status: 'sent',
    });
  });

  it('keeps an overpayment visible instead of clamping it away', () => {
    // Clamping amount_paid to total would hide a double charge entirely.
    expect(deriveInvoiceState(5000, 6000)).toEqual({
      amountPaid: 6000, amountDue: 0, status: 'paid',
    });
  });

  it('rounds to 2dp rather than accumulating float error', () => {
    expect(deriveInvoiceState(100, 33.333)).toEqual({
      amountPaid: 33.33, amountDue: 66.67, status: 'partially_paid',
    });
  });

  it('handles a zero-total invoice without dividing by anything', () => {
    expect(deriveInvoiceState(0, 0)).toEqual({
      amountPaid: 0, amountDue: 0, status: 'sent',
    });
  });
});

/**
 * The card surcharge is charged on top of amount_due but must NOT settle the
 * invoice — only the base does. splitGross is the one place that separates them.
 */
describe('splitGross', () => {
  it('reproduces the real 2026-07-25 transaction', () => {
    expect(splitGross(5175, '175')).toEqual({ base: 5000, surcharge: 175 });
  });

  it('treats a missing surcharge as an all-base payment', () => {
    expect(splitGross(5000, undefined)).toEqual({ base: 5000, surcharge: 0 });
  });

  it('ignores a non-numeric surcharge rather than producing NaN', () => {
    expect(splitGross(5000, 'abc')).toEqual({ base: 5000, surcharge: 0 });
  });

  it('ignores a negative surcharge — it could only ever inflate the base', () => {
    expect(splitGross(5000, '-100')).toEqual({ base: 5000, surcharge: 0 });
  });

  it('ignores a surcharge larger than the gross', () => {
    expect(splitGross(100, '500')).toEqual({ base: 100, surcharge: 0 });
  });

  it('rounds the base to 2dp', () => {
    expect(splitGross(345, '11.67')).toEqual({ base: 333.33, surcharge: 11.67 });
  });
});
