import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { logError } from '@/lib/observability/log-error';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mobile/ping
//
// Heartbeat endpoint. The app calls this on every EMPTY sync pass (no calls
// to send) so that `pyra_api_keys.last_used_at` still reflects device
// liveness — normal syncs only hit the network when there's something to
// send, so an idle phone would otherwise look identical to a dead one.
//
// `requireDeviceAuth` → `getExternalAuth` already bumps `last_used_at`
// fire-and-forget on every successful key lookup, so this route has nothing
// else to do besides the auth check itself.
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;

    return apiSuccess({ ok: true });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_ping' } });
    return apiServerError();
  }
}
