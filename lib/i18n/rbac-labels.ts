'use client';

import { useTranslations } from 'next-intl';

/**
 * Locale-aware label lookup for the RBAC permission-display catalogue
 * (`messages/{ar,en}/rbac.json`). Mirrors the `useStatusLabels` pattern in
 * `lib/i18n/status-labels.ts` (same `.has()` guard + raw-key fallback so it
 * never throws in a render path).
 *
 * Catalog shape (see rbac.json):
 *   - `rbac.modules.<moduleKey>` — flat keyed object. Module keys never
 *     contain a dot (they are `lib/auth/rbac.ts` `PERMISSION_MODULES[].key`,
 *     e.g. `dashboard`, `knowledge_base`, `sales_leads` is NOT a module key —
 *     see the permissions note below for that one).
 *   - `rbac.permissions.<prefix>.<suffix>` — every `PERMISSIONS` value has
 *     EXACTLY one dot (`module.action`, e.g. `dashboard.view`,
 *     `quotes.delete_own`, `leads.edit_core`). Passing the raw permission
 *     key straight into `t(permissionKey)` resolves it as a NESTED path —
 *     no manual splitting needed — because next-intl treats dots in `t()`
 *     calls as path separators, not literal key characters. This is why
 *     `rbac.permissions` is a nested `{ <prefix>: { <suffix>: '...' } }`
 *     object rather than a flat `"module.action": "label"` map.
 *
 * Re-key mapping is the IDENTITY function: call `moduleLabel(module.key)` /
 * `permissionLabel(perm.key)` directly — no transformation needed by
 * consumers. One nuance: a permission's catalog PREFIX is its OWN key
 * prefix (e.g. `productivity.view` → prefix `productivity`), NOT
 * necessarily the `PERMISSION_MODULES[].key` of the module array entry that
 * happens to list it (e.g. `productivity.view` lives inside the `tasks`
 * module's `permissions[]` in rbac.ts, but its catalog entry is
 * `rbac.permissions.productivity.view`) — irrelevant to callers since they
 * always pass `perm.key`, never the containing module's key.
 */
export function useRbacLabels(): {
  moduleLabel: (moduleKey: string) => string;
  permissionLabel: (permissionKey: string) => string;
} {
  const tModules = useTranslations('rbac.modules');
  const tPermissions = useTranslations('rbac.permissions');

  return {
    moduleLabel: (moduleKey: string) =>
      tModules.has(moduleKey as Parameters<typeof tModules>[0])
        ? tModules(moduleKey as Parameters<typeof tModules>[0])
        : moduleKey,
    permissionLabel: (permissionKey: string) =>
      tPermissions.has(permissionKey as Parameters<typeof tPermissions>[0])
        ? tPermissions(permissionKey as Parameters<typeof tPermissions>[0])
        : permissionKey,
  };
}
