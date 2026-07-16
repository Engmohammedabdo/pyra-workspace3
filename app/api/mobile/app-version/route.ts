import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { resolveChannel } from '../_lib/app-channel';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { logError } from '@/lib/observability/log-error';
import { createServiceRoleClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mobile/app-version?app=pyra-calls|pyra-calls-e2e
//
// Self-update check-in. The app calls this on startup / periodically and
// compares `latest.version_code` to its own `BuildConfig.VERSION_CODE` to
// decide whether to prompt for an update. `app` defaults to `pyra-calls`
// (the production channel) when omitted or unrecognized — see
// `resolveChannel()` in `../_lib/app-channel.ts`.
//
// Returns `latest: null` when no active release row exists for the channel
// yet (e.g. a brand-new e2e channel before its first publish).
// ─────────────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;

    const svc = createServiceRoleClient();
    const { data: release, error } = await svc
      .from('pyra_app_releases')
      .select('version_code, version_name, release_notes')
      .eq('app', resolveChannel(request))
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      logError({ error, request, metadata: { action: 'mobile_app_version' } });
      return apiServerError();
    }

    return apiSuccess({ latest: release ?? null });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_app_version' } });
    return apiServerError();
  }
}
