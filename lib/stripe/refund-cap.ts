/**
 * Never book back more than was booked in.
 *
 * THE BUG THIS PREVENTS: with a card surcharge, Stripe's gross and our ledger
 * deliberately disagree. A 700 invoice paid with a 4% fee is a 728 charge, but
 * `settleInvoicePayment` books only the 700 base — the 28 is a fee we
 * collected, never revenue against the invoice. Stripe's
 * `charge.amount_refunded` and `dispute.amount` are both the GROSS, so a full
 * refund would insert -728 against a ledger that only ever received 700.
 *
 * Per-invoice that looks survivable: `deriveInvoiceState` clamps `amount_paid`
 * at zero. But `recalcContractCollected` sums raw `pyra_payments.amount` across
 * every invoice on the contract WITHOUT clamping, so the stray -28 quietly
 * eats into a different invoice's contribution to the contract's collected
 * total. That is a wrong number in a finance report with no trace back to a
 * refund that looked correct at the time.
 */

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface RefundCapInput {
  /** Stripe's cumulative figure for this charge, in major units. The GROSS. */
  cumulativeRefunded: number;
  /** Sum of positive ledger rows booked under this payment intent's reference. */
  bookedForIntent: number;
  /** Sum of the absolute amounts already booked back for this intent. */
  alreadyRefunded: number;
  /** The invoice's current amount_paid — the fallback ceiling. */
  invoiceAmountPaid: number;
}

export interface RefundCapResult {
  /** The DELTA to insert now, as a positive number. Zero means nothing to book. */
  refundAmount: number;
  /** True when Stripe's gross exceeded what our ledger holds — normal with a surcharge. */
  capped: boolean;
  /** The most that may ever be booked back for this intent. */
  ceiling: number;
}

/**
 * The ceiling is the intent's own booked total when we can find it.
 *
 * When we cannot — the payment was reconciled by hand under some other
 * reference, which is exactly why the webhook grew a ledger fallback — falling
 * back to zero would silently swallow a real refund and leave the invoice
 * overstated as paid. So the fallback is instead "everything still sitting on
 * this invoice, plus whatever has already been refunded for this intent",
 * which permits refunding the invoice down to zero and no further.
 */
export function capRefundToBooked(input: RefundCapInput): RefundCapResult {
  const { cumulativeRefunded, bookedForIntent, alreadyRefunded, invoiceAmountPaid } = input;

  const ceiling =
    bookedForIntent > 0
      ? round2(bookedForIntent)
      : round2(Math.max(0, invoiceAmountPaid) + Math.max(0, alreadyRefunded));

  const refundable = Math.min(round2(cumulativeRefunded), ceiling);
  // max(0, …) matters on a replay where `alreadyRefunded` has already caught
  // up to the ceiling: without it the delta goes negative and we would insert
  // a POSITIVE payment, turning a refund replay into a phantom payment.
  const refundAmount = round2(Math.max(0, refundable - round2(alreadyRefunded)));

  return { refundAmount, capped: round2(cumulativeRefunded) > ceiling, ceiling };
}
