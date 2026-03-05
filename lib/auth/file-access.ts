// lib/auth/file-access.ts — Centralized file path access control
// Uses DYNAMIC scope resolution: team membership → projects → storage_paths
// Falls back to manual pyra_users.permissions.allowed_paths as override.

import { hasPermission } from './rbac';
import { resolveUserScope, canAccessPathByScope, type UserScope } from './scope';
import type { ApiAuthResult } from '@/lib/api/auth';

/**
 * Check if a user is a file admin (can access ALL files).
 */
export function isFileAdmin(auth: ApiAuthResult): boolean {
  const perms = auth.pyraUser.rolePermissions;
  return (
    hasPermission(perms, '*') ||
    hasPermission(perms, 'files.manage') ||
    auth.pyraUser.role === 'admin'
  );
}

/**
 * Get all allowed file paths for a non-admin user.
 * DYNAMIC: Resolves from team→project→storage_path chain + manual overrides.
 */
export async function getUserAllowedPaths(auth: ApiAuthResult): Promise<string[]> {
  if (isFileAdmin(auth)) return []; // Admins bypass — not needed

  const scope = await resolveUserScope(auth);
  return scope.storagePaths;
}

/**
 * Check if a user can access a specific file/folder path.
 * DYNAMIC: Uses scope resolver (team→project→storage_path).
 *
 * - Admin users: always true
 * - Non-admin users: must have a project (via team or task assignment)
 *   with a storage_path that matches the target path
 */
export async function canAccessPath(auth: ApiAuthResult, targetPath: string): Promise<boolean> {
  // Admins can access everything
  if (isFileAdmin(auth)) return true;

  // Check RBAC permission first — must have files.view at minimum
  if (!hasPermission(auth.pyraUser.rolePermissions, 'files.view')) return false;

  const scope = await resolveUserScope(auth);
  return canAccessPathByScope(scope, targetPath);
}

/**
 * Check if user can access ALL of the given paths.
 * Used for batch operations (delete-batch, move-batch, copy-batch).
 */
export async function canAccessAllPaths(
  auth: ApiAuthResult,
  paths: string[]
): Promise<{ allowed: boolean; deniedPaths: string[] }> {
  if (isFileAdmin(auth)) return { allowed: true, deniedPaths: [] };

  const scope = await resolveUserScope(auth);

  const deniedPaths: string[] = [];
  for (const p of paths) {
    if (!canAccessPathByScope(scope, p)) {
      deniedPaths.push(p);
    }
  }

  return { allowed: deniedPaths.length === 0, deniedPaths };
}

/**
 * Resolve the user's full scope. Convenience re-export for APIs that need
 * scoped data beyond just file paths (e.g., boards, clients, tasks).
 */
export { resolveUserScope, type UserScope } from './scope';
