// lib/auth/file-access.ts — Centralized file path access control
// Used by ALL file API routes to enforce path-based permissions for non-admin users.

import { hasPermission } from './rbac';
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
 * Returns empty array if no paths are configured (= no file access).
 */
export function getUserAllowedPaths(auth: ApiAuthResult): string[] {
  const userPerms = (auth.pyraUser as unknown as Record<string, unknown>)
    .permissions as {
    allowed_paths?: string[];
    paths?: Record<string, string>;
  } | null;

  if (!userPerms) return [];

  const allowedPaths = userPerms.allowed_paths || [];
  const pathKeys = userPerms.paths ? Object.keys(userPerms.paths) : [];
  return [...new Set([...allowedPaths, ...pathKeys])];
}

/**
 * Check if a user can access a specific file/folder path.
 * - Admin users: always true
 * - Non-admin users: must have the path in their allowed_paths or paths map
 *
 * A path is accessible if:
 *   1. It exactly matches an allowed path
 *   2. It is inside an allowed path (child)
 */
export function canAccessPath(auth: ApiAuthResult, targetPath: string): boolean {
  // Admins can access everything
  if (isFileAdmin(auth)) return true;

  // Check RBAC permission first — must have files.view at minimum
  if (!hasPermission(auth.pyraUser.rolePermissions, 'files.view')) return false;

  const allPaths = getUserAllowedPaths(auth);

  // No paths configured = no file access
  if (allPaths.length === 0) return false;

  const normalizedTarget = targetPath.replace(/\/+$/, '').replace(/^\/+/, '');

  return allPaths.some((allowed) => {
    const normalizedAllowed = allowed.replace(/\/+$/, '').replace(/^\/+/, '');
    return (
      normalizedTarget === normalizedAllowed ||
      normalizedTarget.startsWith(normalizedAllowed + '/')
    );
  });
}

/**
 * Check if user can access ANY of the given paths.
 * Used for batch operations (delete-batch, move-batch, copy-batch).
 */
export function canAccessAllPaths(auth: ApiAuthResult, paths: string[]): { allowed: boolean; deniedPaths: string[] } {
  if (isFileAdmin(auth)) return { allowed: true, deniedPaths: [] };

  const deniedPaths: string[] = [];
  for (const p of paths) {
    if (!canAccessPath(auth, p)) {
      deniedPaths.push(p);
    }
  }

  return { allowed: deniedPaths.length === 0, deniedPaths };
}
