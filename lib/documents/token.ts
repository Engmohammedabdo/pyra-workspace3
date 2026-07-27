import { randomBytes } from 'crypto';

/**
 * 256-bit CSPRNG token for a public document link.
 *
 * NOT `generateId()`: its 20-char cap exists to fit `varchar(20)` id columns and
 * yields ~96 bits, which is too short for a link that can legally bind a
 * customer. base64url keeps it copy-pasteable into WhatsApp without escaping.
 */
export function generateDocumentLinkToken(): string {
  return randomBytes(32).toString('base64url');
}
