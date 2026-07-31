/**
 * Reading structured values out of `pyra_settings`.
 *
 * `pyra_settings.value` is a **text** column, not jsonb (verified against
 * information_schema 2026-07-25). Several call sites nonetheless did
 * `setting?.value?.mode` / `setting?.value?.enabled === true` — reading a
 * property off a string, which is always `undefined`. That silently disabled
 * WhatsApp auto-assignment, CSAT surveys and the out-of-hours away message:
 * each one read its flag as falsy and returned early, every time.
 *
 * Anything structured must therefore be JSON.stringify'd on write and parsed on
 * read. These helpers are the single place that happens, and they never throw —
 * a malformed value degrades to the caller's default rather than taking down a
 * webhook.
 */

/**
 * Parse a settings value that is expected to hold a JSON object.
 * Returns null for absent, blank, malformed, or non-object values.
 *
 * Tolerates a value that is already an object: PostgREST returns text as a
 * string, but a caller may pass a pre-parsed value, and older rows written
 * before the text/JSON convention was settled could be either.
 */
export function parseSettingObject<T = Record<string, unknown>>(value: unknown): T | null {
  if (value == null) return null;

  if (typeof value === 'object') {
    return Array.isArray(value) ? null : (value as T);
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as T;
    }
    return null;
  } catch {
    // A legacy plain-text value such as "[object Object]" — the exact corruption
    // String(someObject) would have produced. Not recoverable; treat as unset.
    return null;
  }
}

/**
 * Parse a settings value that is expected to hold a number.
 *
 * Returns `fallback` for absent, blank, non-numeric or non-finite values — never
 * NaN, which would silently poison any arithmetic downstream.
 */
export function parseSettingNumber(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value !== 'string') return fallback;

  const trimmed = value.trim();
  if (!trimmed) return fallback;

  const n = Number(trimmed);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Parse a settings value that is expected to hold a boolean.
 *
 * Accepts a real boolean, the strings "true"/"false", and a JSON object of the
 * shape `{ enabled: boolean }` (the shape the WhatsApp settings UI writes for
 * its toggles). Returns `fallback` when the value is absent or unintelligible.
 */
export function parseSettingBool(value: unknown, fallback = false): boolean {
  if (value == null) return fallback;
  if (typeof value === 'boolean') return value;

  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (!trimmed) return fallback;
  }

  const obj = parseSettingObject<{ enabled?: unknown }>(value);
  if (obj && typeof obj.enabled === 'boolean') return obj.enabled;

  return fallback;
}
