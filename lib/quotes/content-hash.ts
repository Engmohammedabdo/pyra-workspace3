import { createHash } from 'crypto';
import type { PublicQuotePayload } from './public-payload';

/**
 * Binds a public link to the commercial content it was minted for (S-8).
 *
 * Deliberately excludes `status`, `signed_at` and `signed_by`: those move during
 * the normal life of a link (sent -> viewed on first open, then signed) without
 * the customer's offer changing. Hashing them would invalidate every link the
 * moment it was opened.
 */
const VOLATILE_FIELDS = new Set(['status', 'signed_at', 'signed_by']);

export function quoteContentHash(payload: PublicQuotePayload): string {
  const stable: Record<string, unknown> = {};
  // Sort keys so the digest is independent of property insertion order.
  for (const key of Object.keys(payload).sort()) {
    if (VOLATILE_FIELDS.has(key)) continue;
    stable[key] = (payload as Record<string, unknown>)[key];
  }
  return createHash('sha256').update(JSON.stringify(stable)).digest('hex');
}
