import type { SupabaseClient } from '@supabase/supabase-js';
import { QUOTE_STATUS } from '@/lib/constants/statuses';
import { canSignQuote, type SignBlockReason } from './signability';
import { toPublicQuotePayload } from './public-payload';

/** Matches the portal route's existing cap — the public endpoint is the one
 *  that actually needs it, since anyone with the link can POST. */
export const MAX_SIGNATURE_LENGTH = 500_000;

/**
 * signed_by is unbounded `text` and, per migration 055, append-only once
 * set — an oversized name would be permanently welded to a legally-binding
 * quote with no way to ever correct it (Task 6 review, Finding 1; applied to
 * the offline attestation path in the final-review pass). Shared by every
 * signing path that enforces this cap — the public link route and the
 * offline-attestation route both import this constant instead of redefining
 * it. Each UI's `maxLength` on the name input must stay in sync with this
 * value.
 */
export const MAX_SIGNED_BY_LENGTH = 200;

export type SignFailure = SignBlockReason | 'race' | 'db_error' | 'signature_too_large';

export interface SignQuoteInput {
  quoteId: string;
  signatureData: string;
  signedBy: string;
  signedIp: string | null;
  userAgent: string | null;
  source: 'portal' | 'public_link' | 'offline';
  linkId?: string | null;
  /** Dubai day key — pass dubaiDayKey() from the caller. */
  todayKey: string;
}

/**
 * The one place a quote becomes signed.
 *
 * Race safety is the conditional `.in('status', [sent, viewed])`: two concurrent
 * submits both pass the read guard, and exactly one wins the UPDATE. The loser
 * gets `race`, which callers render as the friendly already-signed state rather
 * than an error.
 *
 * signed_snapshot freezes what the signature attests to, so a later edit cannot
 * silently change what the customer agreed to.
 */
export async function signQuote(
  supabase: SupabaseClient,
  input: SignQuoteInput,
): Promise<
  | { ok: true; quote: Record<string, unknown> }
  | { ok: false; reason: SignFailure; error?: unknown }
> {
  if (input.signatureData.length > MAX_SIGNATURE_LENGTH) {
    return { ok: false, reason: 'signature_too_large' };
  }

  const { data: quote, error: loadErr } = await supabase
    .from('pyra_quotes')
    .select('*')
    .eq('id', input.quoteId)
    .maybeSingle();

  if (loadErr) return { ok: false, reason: 'db_error', error: loadErr };
  if (!quote) return { ok: false, reason: 'wrong_status' };

  const verdict = canSignQuote(
    { status: quote.status, expiry_date: quote.expiry_date },
    input.todayKey,
  );
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  const { data: items, error: itemsErr } = await supabase
    .from('pyra_quote_items')
    .select('description, quantity, rate, amount')
    .eq('quote_id', input.quoteId)
    .order('sort_order', { ascending: true });

  // A failed items fetch must NEVER fall through to `items ?? []` — that
  // would freeze an empty line-item list into `signed_snapshot` on a
  // legally-binding quote, and migration 055 makes that column append-only,
  // so the corruption can never be corrected afterward (final-review
  // Critical finding). Both public callers of signQuote() already check
  // their own items-fetch error; this is the shared core's own fetch, and
  // the portal caller has no fallback of its own, so this guard is the only
  // thing protecting it.
  if (itemsErr) return { ok: false, reason: 'db_error', error: itemsErr };

  const snapshot = toPublicQuotePayload(quote, items ?? []);
  const now = new Date().toISOString();

  const { data: updated, error: updErr } = await supabase
    .from('pyra_quotes')
    .update({
      status: QUOTE_STATUS.SIGNED,
      signature_data: input.signatureData,
      signed_by: input.signedBy,
      signed_at: now,
      signed_ip: input.signedIp,
      signed_user_agent: input.userAgent,
      signature_source: input.source,
      signed_link_id: input.linkId ?? null,
      signed_snapshot: snapshot,
      updated_at: now,
    })
    .eq('id', input.quoteId)
    .in('status', [QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED])
    .select('*')
    .maybeSingle();

  if (updErr) return { ok: false, reason: 'db_error', error: updErr };
  if (!updated) return { ok: false, reason: 'race' };
  return { ok: true, quote: updated };
}
