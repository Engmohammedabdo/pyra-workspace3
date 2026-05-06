/**
 * Phone number normalisation for CRM lookups.
 *
 * UAE phone numbers can be entered in many shapes:
 *   +971 50 123 4567
 *   00971501234567
 *   971 50 123 4567
 *   050-123-4567   (local)
 *   0501234567
 *
 * For duplicate detection (Q-API-001) we don't need a full E.164 parser —
 * we just need a stable shape that matches across visual variants.
 *
 * Strategy:
 *   1. Strip every non-digit
 *   2. Remove a leading "00" (international call prefix)
 *   3. Take the last N digits (default 9 — covers UAE mobile minus country
 *      code) so the same number entered with or without "971" still matches.
 */

/** Strip non-digits and remove a leading "00". */
export function stripPhone(value: string | null | undefined): string {
  if (!value) return '';
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('00') ? digits.slice(2) : digits;
}

/**
 * Stable suffix used for duplicate matching — last N digits of the
 * stripped phone. Mobile-significant portion is 9 digits in UAE.
 */
export function phoneMatchKey(value: string | null | undefined, length = 9): string {
  const digits = stripPhone(value);
  return digits.length <= length ? digits : digits.slice(-length);
}
