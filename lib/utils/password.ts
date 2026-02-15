import { scryptSync, randomBytes, timingSafeEqual } from 'crypto';

const SALT_LENGTH = 16;
const KEY_LENGTH = 64;

/**
 * Hash a password using scrypt (Node.js built-in, no external deps).
 * Returns `salt:hash` in hex format.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(SALT_LENGTH).toString('hex');
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verify a password against a stored `salt:hash` string.
 * Uses timing-safe comparison to prevent timing attacks.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, storedHash] = stored.split(':');
  if (!salt || !storedHash) return false;

  const hash = scryptSync(password, salt, KEY_LENGTH);
  const storedBuffer = Buffer.from(storedHash, 'hex');

  if (hash.length !== storedBuffer.length) return false;
  return timingSafeEqual(hash, storedBuffer);
}
