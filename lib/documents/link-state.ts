/**
 * Validity of a public document link, independent of the document it points at.
 *
 * Revocation wins over expiry: a link an admin deliberately killed must never
 * report itself as merely "expired", because the two states get different
 * operator handling even though callers render them identically (S-10).
 */
export type LinkState = 'valid' | 'expired' | 'revoked';

export interface DocumentLinkTiming {
  expires_at: string | null;
  revoked_at: string | null;
}

/** `expires_at: null` means the link never expires — a deliberate product choice. */
export function classifyLinkState(link: DocumentLinkTiming, nowIso: string): LinkState {
  if (link.revoked_at) return 'revoked';
  if (!link.expires_at) return 'valid';
  // Boundary is inclusive: a link expiring exactly now is already expired.
  return Date.parse(link.expires_at) <= Date.parse(nowIso) ? 'expired' : 'valid';
}
