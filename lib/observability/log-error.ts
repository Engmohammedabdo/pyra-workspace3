/**
 * Self-contained observability layer (Phase 14.1, Commit 1).
 *
 * Funnels every server-side error into `pyra_error_logs` (migration 015).
 * Replaces external Sentry — no DSN, no third-party service, no egress.
 * The admin viewer at `/dashboard/admin/error-logs` (Commit 3) reads from
 * the same table.
 *
 * Design contract:
 *   - Fire-and-forget. Never throws to the caller. The inner Supabase
 *     write runs inside an IIFE wrapped in try/catch; any failure during
 *     redaction, network, or insert is swallowed and mirrored to
 *     `console.error` so Coolify logs still show something.
 *   - Cron-safe. Cron loops in `app/api/cron/*` rely on per-row try blocks
 *     never propagating errors. `logError()` returns `void` synchronously
 *     and the promise it kicks off is detached — a logger throw can never
 *     break a cron loop or an API response.
 *   - PII-redacted before insert. Five layers (drop / regex / regex /
 *     key-fragment / header allowlist) keep emails, phones, secrets, and
 *     auth tokens out of the table.
 *
 * Usage:
 * ```ts
 * import { logError } from '@/lib/observability/log-error';
 *
 * // From an API route (most common — caller has a NextRequest):
 * try {
 *   ...
 * } catch (err) {
 *   logError({ error: err, request, user: { id: auth.pyraUser.username, role: auth.pyraUser.role }});
 *   return apiError('حدث خطأ', 500);
 * }
 *
 * // From a background job / cron tick:
 * logError({
 *   severity: 'warning',
 *   error: new Error('Evolution send failed'),
 *   metadata: { instance: settingRow.sender_instance_name, follow_up_id: row.id },
 * });
 *
 * // From a plain-string call (no Error object):
 * logError({ severity: 'info', error: 'Webhook signature mismatch', request });
 * ```
 */

import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import type { NextRequest } from 'next/server';

// ──────────────────────────────────────────────────────────────────────────
// Public types
// ──────────────────────────────────────────────────────────────────────────

export type ErrorSeverity = 'error' | 'warning' | 'info';

export interface LogErrorOptions {
  /** Severity tier. Defaults to 'error' (the most common caller intent). */
  severity?: ErrorSeverity;
  /** The thrown value. Accepts Error, string, or any unknown thrown shape. */
  error: unknown;
  /** Originating request (when available). Headers + path + method are extracted + redacted. */
  request?: NextRequest | Request;
  /** Authenticated user context (when available). */
  user?: { id?: string | null; role?: string | null };
  /** Caller-supplied debugging context. Redacted before insert. */
  metadata?: Record<string, unknown>;
}

// ──────────────────────────────────────────────────────────────────────────
// Noise drops — never log these (CSRF probes, anonymous-auth chatter)
// ──────────────────────────────────────────────────────────────────────────

const NOISE_PATTERNS = [
  /^Unauthorized$/i,                  // Anonymous 401s — expected, not a real error
  /^CSRF token mismatch$/i,           // CSRF probes — security noise
  /^Forbidden$/i,                     // 403s on guarded routes — expected
];

function isNoiseMessage(message: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(message.trim()));
}

// ──────────────────────────────────────────────────────────────────────────
// PII redaction (Layers 2-4)
// ──────────────────────────────────────────────────────────────────────────

// Layer 2: email-shaped substrings → [EMAIL]
const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Layer 3: phone-shaped substrings → [PHONE]
//   - 7-15 digits, optional leading '+'
//   - Negative lookbehind/ahead on alphanumeric so we don't catch IDs like
//     `cl_a1B2c3...` or jwt tokens (which have stretches of digits inside
//     longer alphanumeric runs).
const PHONE_RE = /(?<![a-zA-Z0-9])\+?\d{7,15}(?![a-zA-Z0-9])/g;

// Layer 4: redact entire VALUE when KEY name contains any of these fragments
const PII_KEY_FRAGMENTS = ['phone', 'email', 'password', 'token', 'secret', 'apikey', 'api_key'];

// Layer 5: headers we never want stored (auth tokens, signatures, cookies)
const SENSITIVE_HEADER_FRAGMENTS = ['authorization', 'x-api-key', 'apikey', 'stripe-signature', 'cookie'];

function redactString(input: string): string {
  return input
    .replace(EMAIL_RE, '[EMAIL]')
    .replace(PHONE_RE, '[PHONE]');
}

function keyLooksSensitive(key: string): boolean {
  const lower = key.toLowerCase();
  return PII_KEY_FRAGMENTS.some((frag) => lower.includes(frag));
}

function headerIsSensitive(name: string): boolean {
  const lower = name.toLowerCase();
  return SENSITIVE_HEADER_FRAGMENTS.some((frag) => lower.includes(frag));
}

/**
 * Recursively redact a JSON-ish value.
 *
 *  - Strings: apply email + phone regex.
 *  - Plain objects: walk entries; if the key looks sensitive (contains
 *    `phone`, `email`, `password`, `token`, `secret`, `apikey`, `api_key`),
 *    replace the value with `[REDACTED]`. Otherwise recurse into the value.
 *  - Arrays: recurse into each element.
 *  - Other primitives (number, boolean, null, undefined): pass through.
 *
 * Depth-limited to 6 to defend against accidental cycles or pathological
 * caller metadata. At the limit, returns a sentinel string.
 */
function redactValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[REDACTED_DEPTH]';
  if (value == null) return value;
  if (typeof value === 'string') return redactString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (keyLooksSensitive(k)) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = redactValue(v, depth + 1);
      }
    }
    return out;
  }
  // Anything else (function, symbol, bigint) — coerce to a safe string
  try {
    return redactString(String(value));
  } catch {
    return '[UNSERIALIZABLE]';
  }
}

function redactHeaders(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((rawValue, rawName) => {
    if (headerIsSensitive(rawName)) {
      out[rawName] = '[REDACTED]';
    } else {
      out[rawName] = redactString(rawValue);
    }
  });
  return out;
}

// ──────────────────────────────────────────────────────────────────────────
// Error normalization
// ──────────────────────────────────────────────────────────────────────────

interface NormalizedError {
  message: string;
  errorType: string | null;
  stackTrace: string | null;
}

function normalizeError(err: unknown): NormalizedError {
  if (err instanceof Error) {
    return {
      message: redactString(err.message ?? 'Unknown error'),
      errorType: err.constructor?.name ?? 'Error',
      stackTrace: err.stack ? redactString(err.stack) : null,
    };
  }
  if (typeof err === 'string') {
    return {
      message: redactString(err),
      errorType: null,
      stackTrace: null,
    };
  }
  // Unknown shape — best-effort coerce
  try {
    return {
      message: redactString(JSON.stringify(err)),
      errorType: typeof err,
      stackTrace: null,
    };
  } catch {
    return {
      message: '[UNSERIALIZABLE_ERROR]',
      errorType: typeof err,
      stackTrace: null,
    };
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Public API
// ──────────────────────────────────────────────────────────────────────────

/**
 * Log an error to `pyra_error_logs`. Fire-and-forget.
 *
 * Returns `void` synchronously; the actual insert runs detached. Safe to
 * call from cron loops, API routes, server actions, and background jobs.
 * Never throws.
 */
export function logError(options: LogErrorOptions): void {
  // Outer try/catch is the absolute backstop. Anything that throws inside —
  // including redaction or coercion bugs — must not propagate.
  try {
    const { severity = 'error', error, request, user, metadata } = options;
    const normalized = normalizeError(error);

    // Layer 1: noise drop — don't write the row at all
    if (isNoiseMessage(normalized.message)) return;

    // Mirror to console so Coolify logs always show something even when
    // the Supabase write is in-flight or fails silently.
    if (severity === 'error') console.error('[logError]', normalized.message, error);
    else if (severity === 'warning') console.warn('[logError]', normalized.message);
    else console.info('[logError]', normalized.message);

    // Build the insert payload. Pulls request fields outside the IIFE so
    // construction-time errors are caught by the outer try.
    const requestPath = request?.url ? new URL(request.url).pathname : null;
    const requestMethod = request?.method ?? null;
    const headerSnapshot = request?.headers ? redactHeaders(request.headers) : null;

    const redactedMetadata: Record<string, unknown> = {};
    if (metadata) {
      const r = redactValue(metadata) as Record<string, unknown>;
      Object.assign(redactedMetadata, r);
    }
    if (headerSnapshot) {
      redactedMetadata.request_headers = headerSnapshot;
    }

    const environment =
      process.env.NODE_ENV === 'production' ? 'production' : 'development';

    const row = {
      id: generateId('err'),
      severity,
      message: normalized.message,
      error_type: normalized.errorType,
      stack_trace: normalized.stackTrace,
      request_path: requestPath,
      request_method: requestMethod,
      user_id: user?.id ?? null,
      user_role: user?.role ?? null,
      metadata: redactedMetadata,
      environment,
    };

    // Detached write — never await. Inner try/catch isolates Supabase /
    // network failures so the caller's frame is unaffected. The void
    // keyword tells TypeScript we explicitly discard the promise.
    void (async () => {
      try {
        const supabase = createServiceRoleClient();
        const { error: insertError } = await supabase
          .from('pyra_error_logs')
          .insert(row);
        if (insertError) {
          // Recursive logError() call could cause an infinite loop if THIS
          // write is itself the broken path. Use raw console.error.
          console.error('[logError] insert failed:', insertError.message);
        }
      } catch (innerErr) {
        console.error('[logError] write threw:', innerErr);
      }
    })();
  } catch (outerErr) {
    // Last-resort: even payload construction blew up. Log raw, never throw.
    try {
      console.error('[logError] handler threw:', outerErr);
    } catch {
      // Truly nothing we can do.
    }
  }
}
