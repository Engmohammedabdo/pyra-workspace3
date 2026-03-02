// lib/auth/rbac.ts — Role-Based Access Control Engine
// Permission format: module.action (e.g., 'files.view', 'finance.manage')
// Wildcard support: '*' = all permissions, 'files.*' = all file permissions

// ============================================================
// Permission Constants
// ============================================================

export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: 'dashboard.view',

  // Files
  FILES_VIEW: 'files.view',
  FILES_UPLOAD: 'files.upload',
  FILES_EDIT: 'files.edit',
  FILES_DELETE: 'files.delete',
  FILES_SHARE: 'files.share',

  // Projects
  PROJECTS_VIEW: 'projects.view',
  PROJECTS_CREATE: 'projects.create',
  PROJECTS_EDIT: 'projects.edit',
  PROJECTS_DELETE: 'projects.delete',

  // Clients
  CLIENTS_VIEW: 'clients.view',
  CLIENTS_CREATE: 'clients.create',
  CLIENTS_EDIT: 'clients.edit',
  CLIENTS_DELETE: 'clients.delete',

  // Quotes
  QUOTES_VIEW: 'quotes.view',
  QUOTES_CREATE: 'quotes.create',
  QUOTES_EDIT: 'quotes.edit',
  QUOTES_DELETE: 'quotes.delete',

  // Invoices
  INVOICES_VIEW: 'invoices.view',
  INVOICES_CREATE: 'invoices.create',
  INVOICES_EDIT: 'invoices.edit',
  INVOICES_DELETE: 'invoices.delete',

  // Finance
  FINANCE_VIEW: 'finance.view',
  FINANCE_MANAGE: 'finance.manage',

  // Users
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',

  // Roles
  ROLES_VIEW: 'roles.view',
  ROLES_MANAGE: 'roles.manage',

  // Teams
  TEAMS_VIEW: 'teams.view',
  TEAMS_MANAGE: 'teams.manage',

  // Reports
  REPORTS_VIEW: 'reports.view',

  // Settings
  SETTINGS_VIEW: 'settings.view',
  SETTINGS_MANAGE: 'settings.manage',

  // Automations
  AUTOMATIONS_VIEW: 'automations.view',
  AUTOMATIONS_MANAGE: 'automations.manage',

  // Knowledge Base
  KNOWLEDGE_BASE_VIEW: 'knowledge_base.view',
  KNOWLEDGE_BASE_MANAGE: 'knowledge_base.manage',

  // Integrations
  INTEGRATIONS_VIEW: 'integrations.view',
  INTEGRATIONS_MANAGE: 'integrations.manage',

  // Activity
  ACTIVITY_VIEW: 'activity.view',

  // Trash
  TRASH_VIEW: 'trash.view',
  TRASH_RESTORE: 'trash.restore',
  TRASH_PURGE: 'trash.purge',

  // Sessions
  SESSIONS_VIEW: 'sessions.view',
  SESSIONS_MANAGE: 'sessions.manage',

  // Reviews
  REVIEWS_VIEW: 'reviews.view',
  REVIEWS_MANAGE: 'reviews.manage',

  // Notifications
  NOTIFICATIONS_VIEW: 'notifications.view',

  // Favorites
  FAVORITES_VIEW: 'favorites.view',
  FAVORITES_MANAGE: 'favorites.manage',

  // Script Reviews
  SCRIPT_REVIEWS_VIEW: 'script_reviews.view',
  SCRIPT_REVIEWS_MANAGE: 'script_reviews.manage',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ============================================================
// Permission Modules (for UI grouping)
// ============================================================

export interface PermissionModule {
  key: string;
  label: string;
  labelAr: string;
  permissions: { key: string; label: string; labelAr: string }[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    labelAr: 'لوحة التحكم',
    permissions: [
      { key: 'dashboard.view', label: 'View Dashboard', labelAr: 'عرض لوحة التحكم' },
    ],
  },
  {
    key: 'files',
    label: 'Files',
    labelAr: 'الملفات',
    permissions: [
      { key: 'files.view', label: 'View Files', labelAr: 'عرض الملفات' },
      { key: 'files.upload', label: 'Upload Files', labelAr: 'رفع الملفات' },
      { key: 'files.edit', label: 'Edit Files', labelAr: 'تعديل الملفات' },
      { key: 'files.delete', label: 'Delete Files', labelAr: 'حذف الملفات' },
      { key: 'files.share', label: 'Share Files', labelAr: 'مشاركة الملفات' },
    ],
  },
  {
    key: 'projects',
    label: 'Projects',
    labelAr: 'المشاريع',
    permissions: [
      { key: 'projects.view', label: 'View Projects', labelAr: 'عرض المشاريع' },
      { key: 'projects.create', label: 'Create Projects', labelAr: 'إنشاء مشاريع' },
      { key: 'projects.edit', label: 'Edit Projects', labelAr: 'تعديل المشاريع' },
      { key: 'projects.delete', label: 'Delete Projects', labelAr: 'حذف المشاريع' },
    ],
  },
  {
    key: 'clients',
    label: 'Clients',
    labelAr: 'العملاء',
    permissions: [
      { key: 'clients.view', label: 'View Clients', labelAr: 'عرض العملاء' },
      { key: 'clients.create', label: 'Create Clients', labelAr: 'إضافة عملاء' },
      { key: 'clients.edit', label: 'Edit Clients', labelAr: 'تعديل العملاء' },
      { key: 'clients.delete', label: 'Delete Clients', labelAr: 'حذف العملاء' },
    ],
  },
  {
    key: 'quotes',
    label: 'Quotes',
    labelAr: 'عروض الأسعار',
    permissions: [
      { key: 'quotes.view', label: 'View Quotes', labelAr: 'عرض العروض' },
      { key: 'quotes.create', label: 'Create Quotes', labelAr: 'إنشاء عروض' },
      { key: 'quotes.edit', label: 'Edit Quotes', labelAr: 'تعديل العروض' },
      { key: 'quotes.delete', label: 'Delete Quotes', labelAr: 'حذف العروض' },
    ],
  },
  {
    key: 'invoices',
    label: 'Invoices',
    labelAr: 'الفواتير',
    permissions: [
      { key: 'invoices.view', label: 'View Invoices', labelAr: 'عرض الفواتير' },
      { key: 'invoices.create', label: 'Create Invoices', labelAr: 'إنشاء فواتير' },
      { key: 'invoices.edit', label: 'Edit Invoices', labelAr: 'تعديل الفواتير' },
      { key: 'invoices.delete', label: 'Delete Invoices', labelAr: 'حذف الفواتير' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    labelAr: 'المالية',
    permissions: [
      { key: 'finance.view', label: 'View Finance', labelAr: 'عرض المالية' },
      { key: 'finance.manage', label: 'Manage Finance', labelAr: 'إدارة المالية' },
    ],
  },
  {
    key: 'users',
    label: 'Users',
    labelAr: 'المستخدمون',
    permissions: [
      { key: 'users.view', label: 'View Users', labelAr: 'عرض المستخدمين' },
      { key: 'users.manage', label: 'Manage Users', labelAr: 'إدارة المستخدمين' },
    ],
  },
  {
    key: 'roles',
    label: 'Roles',
    labelAr: 'الأدوار',
    permissions: [
      { key: 'roles.view', label: 'View Roles', labelAr: 'عرض الأدوار' },
      { key: 'roles.manage', label: 'Manage Roles', labelAr: 'إدارة الأدوار' },
    ],
  },
  {
    key: 'teams',
    label: 'Teams',
    labelAr: 'الفرق',
    permissions: [
      { key: 'teams.view', label: 'View Teams', labelAr: 'عرض الفرق' },
      { key: 'teams.manage', label: 'Manage Teams', labelAr: 'إدارة الفرق' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    labelAr: 'التقارير',
    permissions: [
      { key: 'reports.view', label: 'View Reports', labelAr: 'عرض التقارير' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    labelAr: 'الإعدادات',
    permissions: [
      { key: 'settings.view', label: 'View Settings', labelAr: 'عرض الإعدادات' },
      { key: 'settings.manage', label: 'Manage Settings', labelAr: 'إدارة الإعدادات' },
    ],
  },
  {
    key: 'automations',
    label: 'Automations',
    labelAr: 'الأتمتة',
    permissions: [
      { key: 'automations.view', label: 'View Automations', labelAr: 'عرض الأتمتة' },
      { key: 'automations.manage', label: 'Manage Automations', labelAr: 'إدارة الأتمتة' },
    ],
  },
  {
    key: 'knowledge_base',
    label: 'Knowledge Base',
    labelAr: 'قاعدة المعرفة',
    permissions: [
      { key: 'knowledge_base.view', label: 'View Knowledge Base', labelAr: 'عرض قاعدة المعرفة' },
      { key: 'knowledge_base.manage', label: 'Manage Knowledge Base', labelAr: 'إدارة قاعدة المعرفة' },
    ],
  },
  {
    key: 'integrations',
    label: 'Integrations',
    labelAr: 'التكاملات',
    permissions: [
      { key: 'integrations.view', label: 'View Integrations', labelAr: 'عرض التكاملات' },
      { key: 'integrations.manage', label: 'Manage Integrations', labelAr: 'إدارة التكاملات' },
    ],
  },
  {
    key: 'activity',
    label: 'Activity',
    labelAr: 'النشاط',
    permissions: [
      { key: 'activity.view', label: 'View Activity Log', labelAr: 'عرض سجل النشاط' },
    ],
  },
  {
    key: 'trash',
    label: 'Trash',
    labelAr: 'المحذوفات',
    permissions: [
      { key: 'trash.view', label: 'View Trash', labelAr: 'عرض المحذوفات' },
      { key: 'trash.restore', label: 'Restore Items', labelAr: 'استعادة العناصر' },
      { key: 'trash.purge', label: 'Purge Items', labelAr: 'حذف نهائي' },
    ],
  },
  {
    key: 'sessions',
    label: 'Sessions',
    labelAr: 'الجلسات',
    permissions: [
      { key: 'sessions.view', label: 'View Sessions', labelAr: 'عرض الجلسات' },
      { key: 'sessions.manage', label: 'Manage Sessions', labelAr: 'إدارة الجلسات' },
    ],
  },
  {
    key: 'reviews',
    label: 'Reviews',
    labelAr: 'المراجعات',
    permissions: [
      { key: 'reviews.view', label: 'View Reviews', labelAr: 'عرض المراجعات' },
      { key: 'reviews.manage', label: 'Manage Reviews', labelAr: 'إدارة المراجعات' },
    ],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    labelAr: 'الإشعارات',
    permissions: [
      { key: 'notifications.view', label: 'View Notifications', labelAr: 'عرض الإشعارات' },
    ],
  },
  {
    key: 'favorites',
    label: 'Favorites',
    labelAr: 'المفضلة',
    permissions: [
      { key: 'favorites.view', label: 'View Favorites', labelAr: 'عرض المفضلة' },
      { key: 'favorites.manage', label: 'Manage Favorites', labelAr: 'إدارة المفضلة' },
    ],
  },
  {
    key: 'script_reviews',
    label: 'Script Reviews',
    labelAr: 'مراجعات السكريبتات',
    permissions: [
      { key: 'script_reviews.view', label: 'View Script Reviews', labelAr: 'عرض مراجعات السكريبتات' },
      { key: 'script_reviews.manage', label: 'Manage Script Reviews', labelAr: 'إدارة مراجعات السكريبتات' },
    ],
  },
];

// ============================================================
// Permission Check Functions
// ============================================================

/**
 * Check if a user has a specific permission.
 * Supports wildcards: '*' matches everything, 'files.*' matches all file permissions.
 */
export function hasPermission(userPermissions: string[], required: string): boolean {
  if (!userPermissions || userPermissions.length === 0) return false;

  // Full wildcard
  if (userPermissions.includes('*')) return true;

  // Direct match
  if (userPermissions.includes(required)) return true;

  // Module wildcard (e.g., 'files.*' matches 'files.view')
  const [module] = required.split('.');
  if (userPermissions.includes(`${module}.*`)) return true;

  return false;
}

/**
 * Check if user has ANY of the required permissions.
 */
export function hasAnyPermission(userPermissions: string[], required: string[]): boolean {
  return required.some(perm => hasPermission(userPermissions, perm));
}

/**
 * Check if user has ALL of the required permissions.
 */
export function hasAllPermissions(userPermissions: string[], required: string[]): boolean {
  return required.every(perm => hasPermission(userPermissions, perm));
}

/**
 * Check if user is a super admin (has wildcard permission).
 */
export function isSuperAdmin(userPermissions: string[]): boolean {
  return userPermissions?.includes('*') ?? false;
}

// ============================================================
// Backward Compatibility
// ============================================================

/**
 * Get default permissions for legacy role values (before RBAC migration).
 * Used when role_id is null.
 */
export function getDefaultPermissionsForLegacyRole(role: string): string[] {
  switch (role) {
    case 'admin':
      return ['*'];
    case 'employee':
    case 'client':
    default:
      return ['dashboard.view', 'files.view', 'projects.view', 'notifications.view', 'favorites.view', 'favorites.manage'];
  }
}

// ============================================================
// Role Color Utilities
// ============================================================

export const ROLE_COLORS: Record<string, string> = {
  red: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800',
  orange: 'bg-orange-500/10 text-orange-600 dark:text-orange-400 border-orange-200 dark:border-orange-800',
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800',
  purple: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-200 dark:border-purple-800',
  green: 'bg-green-500/10 text-green-600 dark:text-green-400 border-green-200 dark:border-green-800',
  gray: 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-200 dark:border-gray-800',
  pink: 'bg-pink-500/10 text-pink-600 dark:text-pink-400 border-pink-200 dark:border-pink-800',
  yellow: 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-200 dark:border-yellow-800',
  teal: 'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-200 dark:border-teal-800',
  indigo: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800',
};

export function getRoleColorClasses(color: string): string {
  return ROLE_COLORS[color] || ROLE_COLORS.gray;
}
