import { customAlphabet } from 'nanoid';

/**
 * Pure input handling for the quick payment link.
 *
 * Kept out of the route handler so the validation rules are unit-testable
 * without a Supabase or Stripe client — every rule here decides either what a
 * client gets charged or what row is written, so "it looked right" is not a
 * good enough standard.
 */

/**
 * Stripe wants the smallest currency unit, and `amount * 100` is only correct
 * for currencies with exactly two decimal places. JPY has zero (so *100 would
 * charge 100x) and KWD/BHD/OMR have three (so *100 would charge a tenth).
 *
 * Rather than carry a full exponent table for currencies this business has
 * never invoiced in (every one of the 32 invoices in prod is AED), the quick
 * link accepts only two-decimal currencies. Adding a currency here without
 * also fixing the minor-unit conversion would silently misprice a payment.
 */
export const QUICK_PAYMENT_CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR'] as const;

/**
 * Fat-finger ceiling. Not a business rule about deal size — a typed extra zero
 * on a walk-in payment is far more likely than a genuine seven-figure card
 * charge, and a card acquirer would decline the latter anyway.
 */
export const MAX_QUICK_PAYMENT_AMOUNT = 1_000_000;

export const MAX_QUICK_PAYMENT_NAME_LENGTH = 200;
export const MAX_QUICK_PAYMENT_DESCRIPTION_LENGTH = 500;

const round2 = (n: number) => Math.round(n * 100) / 100;

export type QuickPaymentInput = {
  name: string;
  amount: number;
  currency: string;
  description: string | null;
  email: string | null;
  phone: string | null;
};

export type QuickPaymentParseResult =
  | { ok: true; value: QuickPaymentInput }
  | { ok: false; field: 'name' | 'amount' | 'currency' | 'email' | 'description' };

/**
 * Deliberately permissive: this only has to reject obvious typos so a
 * reachable customer address is not silently turned into an unreachable one.
 * Real deliverability is proven by sending, never by a regex.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseQuickPaymentInput(
  body: Record<string, unknown>,
  defaultCurrency: string,
): QuickPaymentParseResult {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name || name.length > MAX_QUICK_PAYMENT_NAME_LENGTH) return { ok: false, field: 'name' };

  // `Number('')` and `Number(null)` are both 0, which would pass a bare
  // `> 0` check only by accident — reject non-numeric shapes up front.
  const rawAmount = body.amount;
  if (typeof rawAmount !== 'number' && typeof rawAmount !== 'string') {
    return { ok: false, field: 'amount' };
  }
  const amount = round2(Number(rawAmount));
  if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_QUICK_PAYMENT_AMOUNT) {
    return { ok: false, field: 'amount' };
  }

  const currencyRaw =
    typeof body.currency === 'string' && body.currency.trim()
      ? body.currency.trim().toUpperCase()
      : defaultCurrency.toUpperCase();
  if (!(QUICK_PAYMENT_CURRENCIES as readonly string[]).includes(currencyRaw)) {
    return { ok: false, field: 'currency' };
  }

  const description =
    typeof body.description === 'string' && body.description.trim()
      ? body.description.trim()
      : null;
  if (description && description.length > MAX_QUICK_PAYMENT_DESCRIPTION_LENGTH) {
    return { ok: false, field: 'description' };
  }

  let email: string | null = null;
  if (typeof body.email === 'string' && body.email.trim()) {
    email = body.email.trim().toLowerCase();
    if (!EMAIL_SHAPE.test(email)) return { ok: false, field: 'email' };
  }

  const phone = typeof body.phone === 'string' && body.phone.trim() ? body.phone.trim() : null;

  return { ok: true, value: { name, amount, currency: currencyRaw, description, email, phone } };
}

/**
 * A stand-in address for a walk-in who did not give us one.
 *
 * `pyra_clients.email` is NOT NULL and UNIQUE, so something must go in the
 * column. The convention elsewhere in the codebase is `{slug}@placeholder.invalid`
 * derived from the name — which COLLIDES on the second walk-in called the same
 * thing, and a 23505 there would abort a payment link for no reason. A random
 * suffix is unique by construction.
 *
 * `.invalid` is reserved by RFC 2606 and can never resolve, so nothing will
 * ever try to deliver mail here and quietly succeed against someone else's
 * domain. It is also the reason quick-link invoices must be kept out of any
 * future dunning run — see the plan's out-of-scope note.
 *
 * The alphabet is pinned to lowercase alphanumerics rather than using the
 * default nanoid one: that includes `-` and `_`, which are legal in an email
 * local part but survive nothing gracefully once a human retypes the address
 * or a downstream tool normalises it. 12 chars of 36 is ~4.7e18 values.
 */
const placeholderSuffix = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 12);

export function mintPlaceholderEmail(): string {
  return `qp-${placeholderSuffix()}@placeholder.invalid`;
}
