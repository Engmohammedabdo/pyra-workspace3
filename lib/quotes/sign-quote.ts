import type { SupabaseClient } from '@supabase/supabase-js';
import { QUOTE_STATUS } from '@/lib/constants/statuses';
import { canSignQuote, type SignBlockReason } from './signability';
import { toPublicQuotePayload } from './public-payload';

/** Matches the portal route's existing cap — the public endpoint is the one
 *  that actually needs it, since anyone with the link can POST. */
export const MAX_SIGNATURE_LENGTH = 500_000;

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
): Promise<{ ok: true; quote: Record<string, unknown> } | { ok: false; reason: SignFailure }> {
  if (input.signatureData.length > MAX_SIGNATURE_LENGTH) {
    return { ok: false, reason: 'signature_too_large' };
  }

  const { data: quote, error: loadErr } = await supabase
    .from('pyra_quotes')
    .select('*')
    .eq('id', input.quoteId)
    .maybeSingle();

  if (loadErr) return { ok: false, reason: 'db_error' };
  if (!quote) return { ok: false, reason: 'wrong_status' };

  const verdict = canSignQuote(
    { status: quote.status, expiry_date: quote.expiry_date },
    input.todayKey,
  );
  if (!verdict.ok) return { ok: false, reason: verdict.reason };

  const { data: items } = await supabase
    .from('pyra_quote_items')
    .select('description, quantity, rate, amount')
    .eq('quote_id', input.quoteId)
    .order('sort_order', { ascending: true });

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

  if (updErr) return { ok: false, reason: 'db_error' };
  if (!updated) return { ok: false, reason: 'race' };
  return { ok: true, quote: updated };
}
