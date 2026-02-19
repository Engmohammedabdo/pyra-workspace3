import { nanoid } from 'nanoid';

/**
 * Generate a short unique ID with an optional prefix.
 * Format: `{prefix}_{nanoid}` — total ≤ 20 chars to fit varchar(20) columns.
 *
 * nanoid(16) ≈ ~2 trillion IDs before 1% collision at 1000 IDs/sec.
 * More than sufficient for any table.
 *
 * Examples:
 *   generateId('cl')   → "cl_a1B2c3D4e5F6g7h"  (19 chars)
 *   generateId('fi')   → "fi_a1B2c3D4e5F6g7h"  (19 chars)
 *   generateId('log')  → "log_a1B2c3D4e5F6g7"  (20 chars)
 *   generateId('sess') → "sess_a1B2c3D4e5F6g"  (20 chars)
 *   generateId()       → "a1B2c3D4e5F6g7h8i9J" (20 chars)
 */
export function generateId(prefix: string = ''): string {
  if (prefix) {
    // Ensure total length ≤ 20: prefix + '_' + nanoid portion
    const maxRandom = Math.max(20 - prefix.length - 1, 8);
    const random = nanoid(Math.min(maxRandom, 16));
    return `${prefix}_${random}`;
  }
  return nanoid(20);
}
