import { NextRequest, NextResponse } from 'next/server';
import { requireDeviceAuth } from '../_lib/device-auth';
import { resolveChannel } from '../_lib/app-channel';
import { apiSuccess, apiError, apiServerError } from '@/lib/api/response';
import { logError } from '@/lib/observability/log-error';
import { createServiceRoleClient } from '@/lib/supabase/server';

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/mobile/app-download?app=pyra-calls|pyra-calls-e2e
//
// Returns a 1-hour signed URL for the active release's APK on the given
// channel, plus its version_code/sha256/size_bytes so the app can verify the
// download before install-prompting. `storage_path` (the private
// `pyra-private` bucket path) is intentionally NEVER included in the
// response — Gap #3 Phase 3a doctrine, same as every other signed-URL route
// in this codebase.
// ─────────────────────────────────────────────────────────────────────────────

const APK_BUCKET = 'pyra-private';
const SIGNED_URL_TTL = 3600; // 1 hour

export async function GET(request: NextRequest) {
  try {
    const auth = await requireDeviceAuth(request);
    if (auth instanceof NextResponse) return auth;

    const svc = createServiceRoleClient();
    const { data: release, error } = await svc
      .from('pyra_app_releases')
      .select('version_code, storage_path, sha256, size_bytes')
      .eq('app', resolveChannel(request))
      .eq('is_active', true)
      .maybeSingle();

    if (error) {
      logError({ error, request, metadata: { action: 'mobile_app_download' } });
      return apiServerError();
    }
    if (!release) return apiError('لا يوجد إصدار متاح', 404);

    const { data: signed, error: signErr } = await svc.storage
      .from(APK_BUCKET)
      .createSignedUrl(release.storage_path, SIGNED_URL_TTL);

    if (signErr || !signed?.signedUrl) {
      logError({
        error: signErr ?? new Error('createSignedUrl returned no URL'),
        request,
        metadata: { action: 'mobile_app_download' },
      });
      return apiServerError();
    }

    // storage_path intentionally NOT returned
    return apiSuccess({
      url: signed.signedUrl,
      version_code: release.version_code,
      sha256: release.sha256,
      size_bytes: release.size_bytes,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'mobile_app_download' } });
    return apiServerError();
  }
}
