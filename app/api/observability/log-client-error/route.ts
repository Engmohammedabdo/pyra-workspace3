/**
 * Client-error beacon (Phase 14.1, Commit 2).
 *
 * The Client Component error boundaries at `app/dashboard/error.tsx` and
 * `app/portal/(main)/error.tsx` cannot call `logError()` directly — the
 * underlying `createServiceRoleClient()` reads `SUPABASE_SERVICE_ROLE_KEY`
 * which is server-only. This route bridges that gap.
 *
 * Boundaries fire-and-forget POST here inside their `useEffect`; this route
 * authenticates the request (any valid session — dashboard OR portal),
 * then funnels the payload through `logError()` server-side. PII redaction
 * + 5-layer pipeline inherited verbatim.
 *
 * Anonymous spam is rejected at the auth gate (401) before any insert is
 * attempted. The body shape is permissive but all string fields flow
 * through `redactString` + `redactValue` inside `logError`.
 *
 * Returns 204 No Content on success — boundaries don't surface the response.
 */

import { NextResponse, type NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import { getPortalSession } from '@/lib/portal/auth';
import { logError } from '@/lib/observability/log-error';

interface ClientErrorBody {
  message?: string;
  stack?: string;
  location?: string;
  digest?: string;
}

export async function POST(request: NextRequest) {
  // Auth gate — accept dashboard session OR portal session.
  // Either returns a normalized {id, role}; null = 401.
  const dashboardAuth = await getApiAuth();
  let user: { id: string; role: string } | null = null;

  if (dashboardAuth) {
    user = {
      id: dashboardAuth.pyraUser.username,
      role: dashboardAuth.pyraUser.role,
    };
  } else {
    const portalClient = await getPortalSession();
    if (portalClient) {
      user = { id: portalClient.id, role: 'client' };
    }
  }

  if (!user) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }

  // Parse body defensively — boundary might POST a partial payload during
  // teardown. Anything missing falls back to a safe default.
  let body: ClientErrorBody = {};
  try {
    body = (await request.json()) as ClientErrorBody;
  } catch {
    // Empty body or invalid JSON — still log, just with less context.
  }

  const message = typeof body.message === 'string' && body.message.trim()
    ? body.message.trim()
    : 'Unknown client error';

  // Build a synthetic Error so `normalizeError` in logError captures
  // the stack trace correctly under the same redaction path.
  const syntheticError = new Error(message);
  if (typeof body.stack === 'string') {
    syntheticError.stack = body.stack;
  }

  logError({
    severity: 'error',
    error: syntheticError,
    request,
    user,
    metadata: {
      location: typeof body.location === 'string' ? body.location : 'unknown',
      digest: typeof body.digest === 'string' ? body.digest : null,
      source: 'client_error_boundary',
    },
  });

  return new NextResponse(null, { status: 204 });
}
