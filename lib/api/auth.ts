import { createServerSupabaseClient, createServiceRoleClient } from '@/lib/supabase/server';
import type { PyraUser } from '@/types/database';
import { hasPermission, buildUserPermissions } from '@/lib/auth/rbac';
import { NextResponse } from 'next/server';

export interface ApiAuthResult {
  userId: string;
  email: string;
  pyraUser: PyraUser & { rolePermissions: string[] };
}

/**
 * API-level auth check: returns user + pyraUser with role permissions, or null if not authenticated.
 * Unlike guards.ts (which uses redirect()), this returns null for API use.
 */
export async function getApiAuth(): Promise<ApiAuthResult | null> {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) return null;

    // The IDENTITY check above stays on the session client — only a valid JWT
    // gets past it. The PROFILE read below moves to the service role: audit
    // 2026-08-08 revokes SELECT on pyra_users' salary / bank_details /
    // national_id / password_hash columns from `authenticated`, and this
    // select('*') would fail on the withheld columns.
    // Safe because the lookup key comes from the VERIFIED JWT, never from
    // request input — so this still reads exactly one row: the caller's own.
    const profileClient = createServiceRoleClient();
    const { data: pyraUser, error: pyraError } = await profileClient
      .from('pyra_users')
      .select('*, pyra_roles!left(name, name_ar, permissions, color, icon)')
      .eq('username', user.user_metadata?.username || user.email)
      .single();

    if (pyraError || !pyraUser) {
      if (pyraError) console.error('getApiAuth pyra_users error:', pyraError.message);
      return null;
    }

    // Deactivation gate (Phase 1 remediation — audit Gap #1).
    // A non-active pyra_user must NOT retain API access even with a valid
    // Supabase Auth session. This is the systemic fix: setting
    // pyra_users.status to anything other than 'active' (inactive / suspended)
    // now revokes API access on the NEXT request, regardless of an unexpired
    // JWT. Fails closed — any status !== 'active' (incl. NULL) is denied.
    if (pyraUser.status !== 'active') {
      return null;
    }

    const role = pyraUser.pyra_roles;
    // Build final permissions via central helper — guarantees BASE_EMPLOYEE
    // inheritance for every internal user, regardless of DB role assignment.
    const rolePermissions = buildUserPermissions(
      pyraUser.role,
      role?.permissions,
      pyraUser.extra_permissions
    );

    return {
      userId: user.id,
      email: user.email!,
      pyraUser: {
        ...pyraUser,
        pyra_roles: undefined,
        role_name: role?.name,
        role_name_ar: role?.name_ar ?? (pyraUser.role === 'admin' ? 'مسؤول' : 'موظف'),
        role_permissions: rolePermissions,
        role_color: role?.color ?? 'gray',
        role_icon: role?.icon,
        rolePermissions,
      } as PyraUser & { rolePermissions: string[] },
    };
  } catch {
    return null;
  }
}

/**
 * Require a specific permission for API access.
 * Returns auth result or NextResponse with 403 error.
 */
export async function requireApiPermission(permission: string): Promise<ApiAuthResult | NextResponse> {
  const auth = await getApiAuth();
  if (!auth) {
    return NextResponse.json({ error: 'غير مصرح' }, { status: 401 });
  }
  if (!hasPermission(auth.pyraUser.rolePermissions, permission)) {
    return NextResponse.json({ error: 'ليس لديك صلاحية لهذا الإجراء' }, { status: 403 });
  }
  return auth;
}

/**
 * Helper to check if requireApiPermission returned an error response.
 */
export function isApiError(result: ApiAuthResult | NextResponse): result is NextResponse {
  return result instanceof NextResponse;
}

/**
 * @deprecated Use requireApiPermission() instead
 */
export async function getApiAdmin() {
  const auth = await getApiAuth();
  if (!auth) return null;
  if (!hasPermission(auth.pyraUser.rolePermissions, '*') && auth.pyraUser.role !== 'admin') return null;
  return auth;
}
