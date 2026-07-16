import { NextRequest, NextResponse } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

export interface DeviceAuthContext {
  agentUsername: string;
  displayName: string;
}

/**
 * Shared device-auth guard for /api/mobile/* routes.
 *
 * x-api-key device auth: the key must carry the `calls:device` permission
 * AND its creator (the sales agent who logged in via
 * /api/mobile/auth/login) must still be `status='active'` — a deactivated
 * agent's device key is rejected even if the key row itself is still
 * `is_active=true` (mirrors the account-status gate applied at every other
 * auth entry point per the User Deactivation Procedure).
 */
export async function requireDeviceAuth(
  request: NextRequest,
): Promise<DeviceAuthContext | NextResponse> {
  const ctx = await getExternalAuth(request);
  if (!ctx) return apiError('مفتاح API غير صالح أو مفقود', 401);
  if (!hasPermission(ctx, 'calls:device')) {
    return apiError('المفتاح لا يملك صلاحية calls:device', 403);
  }

  const svc = createServiceRoleClient();
  const { data: user } = await svc
    .from('pyra_users')
    .select('username, display_name, status')
    .eq('username', ctx.apiKey.created_by)
    .maybeSingle();

  if (!user || user.status !== 'active') {
    return apiError('الحساب غير نشط', 403);
  }

  // Fleet visibility: stamp the app version the device reports.
  // Fire-and-forget; the .or() guard makes repeat requests with an
  // unchanged version a no-op write. Bounded to a 5-digit versionCode so a
  // garbage header can't be misused to smuggle an oversized value into the
  // column.
  //
  // NOTE: a plain `.neq('app_version_code', versionCode)` would NOT match
  // the column's initial NULL state — SQL's `NULL <> value` evaluates to
  // unknown (excluded from WHERE), so a device would never get its FIRST
  // stamp and `app_version_code` would stay NULL forever. The `.or()` below
  // explicitly matches "currently unset" OR "currently a different value".
  // versionCode is validated above to be a bounded positive integer
  // (parseInt output, 1-99999), so interpolating it into the filter string
  // is safe — no PostgREST-filter-injection surface (Phase 14.3 #3).
  const versionHeader = request.headers.get('x-app-version');
  const versionCode = versionHeader ? parseInt(versionHeader, 10) : NaN;
  if (Number.isInteger(versionCode) && versionCode > 0 && versionCode < 100000) {
    svc
      .from('pyra_api_keys')
      .update({ app_version_code: versionCode })
      .eq('id', ctx.apiKey.id)
      .or(`app_version_code.is.null,app_version_code.neq.${versionCode}`)
      .then(() => {});
  }

  return { agentUsername: user.username, displayName: user.display_name };
}
