import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { logError, type ErrorSeverity } from '@/lib/observability/log-error';

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/mobile/log-error
//
// Client-side error ingest for the Android app (mirrors the dashboard's
// `/api/observability/log-client-error` beacon pattern, adapted for the
// device-key auth surface). Body: `{ errors: [{ message, stack?, source,
// severity?, occurred_at?, android_version?, app_version_code? }] }`.
//
// Each row is funneled through the shared `logError()` (Phase 14.1) so it
// lands in `pyra_error_logs` with the same 5-layer PII redaction as every
// other server-side error. `severity` is validated against the exact union
// `logError` accepts (`ErrorSeverity`) — anything else silently falls back
// to `'error'` rather than rejecting the whole batch.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_BATCH = 20;
const MAX_MESSAGE = 2000;
const MAX_STACK = 8000;

const VALID_SEVERITIES = new Set<ErrorSeverity>(['error', 'warning', 'info']);

function isValidSeverity(value: unknown): value is ErrorSeverity {
  return typeof value === 'string' && VALID_SEVERITIES.has(value as ErrorSeverity);
}

interface IncomingErrorRow {
  message?: unknown;
  stack?: unknown;
  source?: unknown;
  severity?: unknown;
  occurred_at?: unknown;
  android_version?: unknown;
  app_version_code?: unknown;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;

    const body = await request.json().catch(() => null);
    const errors: IncomingErrorRow[] | null = Array.isArray(body?.errors) ? body.errors : null;
    if (!errors || errors.length === 0) return apiError('errors مطلوبة', 422);
    if (errors.length > MAX_BATCH) return apiError(`الحد الأقصى ${MAX_BATCH} خطأ في الدفعة`, 422);

    let received = 0;
    for (const e of errors) {
      if (typeof e?.message !== 'string' || !e.message.trim()) continue;

      const severity: ErrorSeverity = isValidSeverity(e.severity) ? e.severity : 'error';
      logError({
        severity,
        error: new Error(`[pyra-calls-app] ${e.message.slice(0, MAX_MESSAGE)}`),
        request,
        metadata: {
          action: 'mobile_app_error',
          source: 'pyra-calls-app',
          app_source: typeof e.source === 'string' ? e.source.slice(0, 60) : 'unknown',
          agent: auth.agentUsername,
          stack: typeof e.stack === 'string' ? e.stack.slice(0, MAX_STACK) : undefined,
          occurred_at: typeof e.occurred_at === 'string' ? e.occurred_at.slice(0, 40) : undefined,
          android_version:
            typeof e.android_version === 'string' ? e.android_version.slice(0, 40) : undefined,
          app_version_code: Number.isInteger(e.app_version_code) ? e.app_version_code : undefined,
        },
      });
      received++;
    }

    return apiSuccess({ received });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_log_error' } });
    return apiServerError();
  }
}
