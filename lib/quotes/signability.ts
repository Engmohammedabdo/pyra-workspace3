import { QUOTE_STATUS } from '@/lib/constants/statuses';

/**
 * The single source of truth for "may this quote be signed right now".
 *
 * Both the portal sign route and the public sign route call this, and the UI
 * derives its `canSign` prop from the same function. Before this existed the
 * API guard and the view's own check could disagree, which is how a customer
 * could be shown a sign button that then 422'd.
 */
export type SignBlockReason = 'already_signed' | 'wrong_status' | 'quote_expired';

export interface SignableQuote {
  status: string;
  /** DATE column — 'YYYY-MM-DD', compared against a Dubai day key. */
  expiry_date: string | null;
}

const SIGNABLE_STATUSES: readonly string[] = [QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED];
const TERMINAL_SIGNED: readonly string[] = [QUOTE_STATUS.SIGNED, QUOTE_STATUS.INVOICED];

export function canSignQuote(
  quote: SignableQuote,
  todayKey: string,
): { ok: true } | { ok: false; reason: SignBlockReason } {
  // Status is checked first: an already-signed quote reports "signed", never
  // "expired", so the customer is not told to ask for a new quote they do not need.
  if (TERMINAL_SIGNED.includes(quote.status)) return { ok: false, reason: 'already_signed' };
  if (!SIGNABLE_STATUSES.includes(quote.status)) return { ok: false, reason: 'wrong_status' };
  // Inclusive: a quote expiring today is still signable today. Mirrors the
  // existing portal guard so behaviour does not change for portal signers.
  if (quote.expiry_date && quote.expiry_date < todayKey) {
    return { ok: false, reason: 'quote_expired' };
  }
  return { ok: true };
}
