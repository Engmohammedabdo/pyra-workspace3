import { NextRequest, NextResponse } from 'next/server';
import { getExternalAuth, hasPermission } from '@/lib/api/external-auth';
import { apiError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
// Aliased on purpose: `hasPermission` above checks an API KEY's scopes
// (`calls:device`), while this one checks a USER's RBAC permissions. Two
// different questions with the same verb — importing both unaliased would let a
// future edit call the wrong one and silently widen the gate.
import { buildUserPermissions, hasPermission as userHasPermission } from '@/lib/auth/rbac';

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
    // T-03: role / role_id→permissions / extra_permissions are selected so the
    // check below can be about CAPABILITY, not just account status.
    .select('username, display_name, status, role, extra_permissions, pyra_roles!left(permissions)')
    .eq('username', ctx.apiKey.created_by)
    .maybeSingle();

  if (!user || user.status !== 'active') {
    return apiError('الحساب غير نشط', 403);
  }

  // ── T-03: still ACTIVE is not the same as still allowed ──────────────────
  //
  // The status check above only asks whether the account exists. A rep moved off
  // sales — demoted to `employee`, or reassigned — stays perfectly `active`, and
  // their device key kept working: the phone went on ingesting calls, writing
  // lead activity and creating leads for a role that no longer has any business
  // doing it. Deactivation was covered; role change was not.
  //
  // Gated on `leads.view` rather than `role === 'sales_agent'` deliberately.
  // Per-user `extra_permissions` exist precisely so a capability can be granted
  // WITHOUT the role (CLAUDE.md: "grant a single employee access without making
  // them a sales_agent"), so a role equality check would contradict the system's
  // own design and lock out a legitimately-granted user. `leads.view` is the CRM
  // permission for "sees their own leads", it is in sales_agent's ROLE_EXTRAS,
  // and — the part that makes it a real gate — it is NOT in BASE_EMPLOYEE, so a
  // demoted employee genuinely loses it.
  //
  // buildUserPermissions is the single source of truth for this (lib/auth/rbac),
  // mirroring getApiAuth exactly: it guarantees BASE_EMPLOYEE inheritance and
  // handles the admin `'*'` wildcard, so an admin-owned device still works.
  const permissions = buildUserPermissions(
    user.role,
    (user.pyra_roles as { permissions?: string[] } | null)?.permissions,
    user.extra_permissions,
  );
  if (!userHasPermission(permissions, 'leads.view')) {
    return apiError('الحساب لم يعد لديه صلاحية متابعة المكالمات', 403);
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
