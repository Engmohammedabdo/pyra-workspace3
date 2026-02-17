import { nanoid } from 'nanoid';

/**
 * Generate a short unique ID with an optional prefix.
 * Format: `{prefix}_{nanoid}` — total ≤ 30 chars to fit varchar(30) columns.
 *
 * With a 4-char prefix + `_` = 5 chars → 25 remaining for nanoid.
 * nanoid(21) = default length, ~1 billion years to reach 1% collision probability
 * at 1000 IDs/second. More than sufficient.
 *
 * Examples:
 *   generateId('fi')   → "fi_V1StGXR8_Z5jdHi6B-myT"   (24 chars)
 *   generateId('al')   → "al_V1StGXR8_Z5jdHi6B-myT"   (24 chars)
 *   generateId('sess') → "sess_V1StGXR8_Z5jdHi6B-m"   (26 chars)
 *   generateId()       → "V1StGXR8_Z5jdHi6B-myT"       (21 chars)
 */
export function generateId(prefix: string = ''): string {
  if (prefix) {
    // Ensure total length ≤ 30: prefix + '_' + nanoid portion
    const maxRandom = Math.max(30 - prefix.length - 1, 12);
    const random = nanoid(Math.min(maxRandom, 21));
    return `${prefix}_${random}`;
  }
  return nanoid(21);
}
