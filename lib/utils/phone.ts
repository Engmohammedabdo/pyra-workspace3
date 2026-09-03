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

/**
 * Full E.164 digits for DIALING / SENDING — never for matching.
 *
 * WHY THIS EXISTS (2026-09-03): the campaign sender fed Evolution the raw
 * stored number. 706 of 798 seeded contacts are UAE local `05xxxxxxxx`, and
 * Evolution's whatsappNumbers check returns exists:false for a number with no
 * country code — the SAME number returns exists:true once prefixed with 971
 * (verified live). Sending the local form burned 88% of the list to a
 * terminal `invalid` status on the pre-flight check. Matching (phoneMatchKey,
 * suppression) is unaffected because it keys on the last 9 digits regardless
 * of prefix; only the OUTBOUND number needs the country code.
 *
 * Rules (UAE, default country 971):
 *   0501234567     → 971501234567   (local: drop the trunk 0, prefix 971)
 *   501234567      → 971501234567   (bare 9-digit significant number)
 *   971501234567   → 971501234567   (already E.164)
 *   00971501234567 → 971501234567   (int'l call prefix stripped by stripPhone)
 *   +971 50 123 4567 → 971501234567 (punctuation stripped)
 *
 * Returns '' when the input cannot be resolved to a plausible number, so the
 * caller can skip it rather than send to a malformed target.
 */
export function toDialableUAE(value: string | null | undefined, countryCode = '971'): string {
  let d = stripPhone(value); // non-digits gone, leading "00" gone
  if (!d) return '';
  if (d.startsWith(countryCode)) return d;
  // Local trunk form: a leading 0 replaces the country code.
  if (d.startsWith('0')) d = d.slice(1);
  // A bare significant number (UAE mobile significant part is 9 digits,
  // starting 5). Anything already long enough to carry a country code we
  // leave alone rather than guess.
  if (d.length < 4) return '';
  if (d.length <= 10) return countryCode + d;
  return d;
}
