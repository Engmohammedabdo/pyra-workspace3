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

  return { agentUsername: user.username, displayName: user.display_name };
}
