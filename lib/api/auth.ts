import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { PyraUser } from '@/types/database';
import { hasPermission, getDefaultPermissionsForLegacyRole } from '@/lib/auth/rbac';
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

    const { data: pyraUser, error: pyraError } = await supabase
      .from('pyra_users')
      .select('*, pyra_roles!left(name, name_ar, permissions, color, icon)')
      .eq('username', user.user_metadata?.username || user.email)
      .single();

    if (pyraError || !pyraUser) {
      if (pyraError) console.error('getApiAuth pyra_users error:', pyraError.message);
      return null;
    }

    const role = pyraUser.pyra_roles;
    const rolePermissions: string[] = role?.permissions
      ?? getDefaultPermissionsForLegacyRole(pyraUser.role);

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
