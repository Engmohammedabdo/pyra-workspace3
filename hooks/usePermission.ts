'use client';

import { useCurrentUser } from '@/hooks/useCurrentUser';
import { hasPermission, hasAnyPermission, isSuperAdmin } from '@/lib/auth/rbac';

/**
 * Check if the current user has a specific permission.
 */
export function usePermission(permission: string): boolean {
  const { data: user } = useCurrentUser();
  if (!user?.rolePermissions) return false;
  return hasPermission(user.rolePermissions, permission);
}

/**
 * Check if the current user has ANY of the given permissions.
 */
export function useAnyPermission(permissions: string[]): boolean {
  const { data: user } = useCurrentUser();
  if (!user?.rolePermissions) return false;
  return hasAnyPermission(user.rolePermissions, permissions);
}

/**
 * Check if the current user is a super admin.
 */
export function useIsSuperAdmin(): boolean {
  const { data: user } = useCurrentUser();
  if (!user?.rolePermissions) return false;
  return isSuperAdmin(user.rolePermissions);
}
