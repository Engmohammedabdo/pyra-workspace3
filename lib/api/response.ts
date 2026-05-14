import { NextResponse, type NextRequest } from 'next/server';
import { logError } from '@/lib/observability/log-error';

/**
 * Consistent API response helpers
 * All responses follow: { data?, error?, meta? }
 */

export function apiSuccess<T>(data: T, meta?: Record<string, unknown>, status = 200) {
  return NextResponse.json({ data, error: null, meta: meta || null }, { status });
}

export function apiError(error: string, status = 400, meta?: Record<string, unknown>) {
  return NextResponse.json({ data: null, error, meta: meta || null }, { status });
}

export function apiUnauthorized(message = 'غير مصرح — يجب تسجيل الدخول') {
  return apiError(message, 401);
}

export function apiForbidden(message = 'لا تملك صلاحية الوصول') {
  return apiError(message, 403);
}

export function apiNotFound(message = 'غير موجود') {
  return apiError(message, 404);
}

export function apiValidationError(message: string) {
  return apiError(message, 422);
}

/**
 * Return a 500 response and (optionally) record the underlying error in the
 * observability table.
 *
 * Backwards-compatible signature:
 *   - apiServerError()                                  → existing behaviour
 *   - apiServerError('custom message')                  → existing behaviour
 *   - apiServerError('custom message', err)             → logs err
 *   - apiServerError('custom message', err, request)    → logs err with request context
 *
 * When `err` is provided, calls `logError({ error: err, request })` —
 * fire-and-forget, never throws, never blocks the response. The 722 existing
 * callers (Phase 14.1 Commit 2 audit) that pass 0 or 1 args remain valid.
 *
 * For richer context (user + custom metadata), call `logError()` explicitly
 * in the catch block BEFORE returning apiServerError(). High-risk routes
 * (crons, webhooks, state-change) do this; see CLAUDE.md "Critical Rules".
 */
export function apiServerError(
  message: string = 'خطأ في الخادم',
  err?: unknown,
  request?: NextRequest,
) {
  if (err !== undefined) {
    logError({ error: err, request });
  }
  return apiError(message, 500);
}
