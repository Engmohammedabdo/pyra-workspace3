// lib/auth/rbac.ts — Role-Based Access Control Engine
// Permission format: module.action (e.g., 'files.view', 'finance.manage')
// Wildcard support: '*' = all permissions, 'files.*' = all file permissions

// ============================================================
// Permission Constants
// ============================================================

export const PERMISSIONS = {
  // Dashboard
  DASHBOARD_VIEW: 'dashboard.view',

  // Calendar (Phase 15.1 Commit 5) — unified view over tasks/follow-ups/meetings
  CALENDAR_VIEW: 'calendar.view',

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
  QUOTES_DELETE: 'quotes.delete',          // delete ANY quote (admin / manager)
  QUOTES_DELETE_OWN: 'quotes.delete_own',  // delete OWN quotes only (sales agent)

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

  // Error Logs (Phase 14.1 — admin observability viewer)
  ERROR_LOGS_VIEW: 'error_logs.view',
  ERROR_LOGS_MANAGE: 'error_logs.manage',

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

  // Boards
  BOARDS_VIEW: 'boards.view',
  BOARDS_MANAGE: 'boards.manage',

  // Tasks
  TASKS_VIEW: 'tasks.view',
  TASKS_CREATE: 'tasks.create',
  TASKS_MANAGE: 'tasks.manage',

  // Directory
  DIRECTORY_VIEW: 'directory.view',

  // Timesheets
  TIMESHEET_VIEW: 'timesheet.view',
  TIMESHEET_MANAGE: 'timesheet.manage',
  TIMESHEET_APPROVE: 'timesheet.approve',

  // Announcements
  ANNOUNCEMENTS_VIEW: 'announcements.view',
  ANNOUNCEMENTS_MANAGE: 'announcements.manage',

  // Leave
  LEAVE_VIEW: 'leave.view',
  LEAVE_MANAGE: 'leave.manage',
  LEAVE_APPROVE: 'leave.approve',

  // Attendance
  ATTENDANCE_VIEW: 'attendance.view',
  ATTENDANCE_MANAGE: 'attendance.manage',

  // HR Overview
  HR_VIEW: 'hr.view',
  HR_MANAGE: 'hr.manage',

  // Productivity (own-scope monthly stats; admin report is gated by hr.view)
  PRODUCTIVITY_VIEW: 'productivity.view',

  // Employee Documents
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_MANAGE: 'documents.manage',

  // Payroll
  PAYROLL_VIEW: 'payroll.view',
  PAYROLL_MANAGE: 'payroll.manage',

  // Evaluations
  EVALUATIONS_VIEW: 'evaluations.view',
  EVALUATIONS_MANAGE: 'evaluations.manage',

  // Overtime
  OVERTIME_VIEW: 'overtime.view',
  OVERTIME_MANAGE: 'overtime.manage',

  // Leave Types
  LEAVE_TYPES_VIEW: 'leave_types.view',
  LEAVE_TYPES_MANAGE: 'leave_types.manage',

  // Content Pipeline
  CONTENT_PIPELINE_VIEW: 'content_pipeline.view',
  CONTENT_PIPELINE_MANAGE: 'content_pipeline.manage',

  // Sales & Call Center — legacy /dashboard/sales/* PROTECTED routes (post-
  // Phase 12 sunset). These permissions still gate the 5 routes that
  // intentionally survived the sunset: chat, whatsapp-analytics,
  // whatsapp-campaigns, approvals (quote workflow), settings. Renaming
  // to a generic `sales.*` namespace is v1.1 backlog (touches many call
  // sites).
  SALES_VIEW: 'sales.view',
  SALES_MANAGE: 'sales.manage',
  SALES_LEADS_VIEW: 'sales_leads.view',
  SALES_LEADS_CREATE: 'sales_leads.create',
  // ⚠️ MISLEADING NAME (audit Gap #4, 2026-06-19) — despite the `.manage` suffix,
  // this does NOT grant manage-all or bypass lead ownership. Every route gating
  // on it ALSO enforces own-lead scope (canAccessLead / own-lead filter), and the
  // leads LIST endpoint scopes by `sales_leads.view` + own-lead filter — so a
  // sales_agent holding this can only ever touch their OWN leads. Functionally
  // correct, just badly named. A proper rename (→ `sales_leads.update`) is
  // DEFERRED to the broader sales.* rename pass (v1.1, see Phase 12 decision #4)
  // to avoid a piecemeal 13-reference / 3-deploy / 403-risk migration.
  SALES_LEADS_MANAGE: 'sales_leads.manage',
  SALES_WHATSAPP_VIEW: 'sales_whatsapp.view',
  SALES_WHATSAPP_SEND: 'sales_whatsapp.send',
  SALES_WHATSAPP_GROUPS_VIEW: 'sales_whatsapp_groups.view',
  SALES_WHATSAPP_GROUPS_MANAGE: 'sales_whatsapp_groups.manage',
  SALES_PIPELINE_MANAGE: 'sales_pipeline.manage',
  QUOTE_APPROVALS_VIEW: 'quote_approvals.view',
  QUOTE_APPROVALS_MANAGE: 'quote_approvals.manage',

  // ── CRM rebuild (CRM-PRD/03-API-AND-PERMISSIONS.md § New RBAC Permissions) ──
  // The new /dashboard/crm/* surface uses this namespace. Legacy sales_leads.*
  // kept above for the PROTECTED /dashboard/sales/* routes that survived
  // Phase 12 sunset (chat, whatsapp-analytics, whatsapp-campaigns, approvals,
  // settings). Permission renaming + call-site migration are v1.1 backlog.
  LEADS_VIEW:        'leads.view',         // see own leads (sales_agent), all leads (admin)
  LEADS_CREATE:      'leads.create',
  LEADS_UPDATE:      'leads.update',       // edit own lead fields (excluding closed_won transition)
  LEADS_ASSIGN:      'leads.assign',       // change assigned_to (manager + admin)
  LEADS_DELETE:      'leads.delete',       // archive/soft-delete (manager + admin)
  LEADS_MOVE_STAGE:  'leads.move_stage',   // drag/drop stage change (own leads, except closed_won)
  LEADS_APPROVE:     'leads.approve',      // approve closed_won (manager via canApproveFor; admin)
  LEADS_MANAGE:      'leads.manage',       // admin override — sees all leads everywhere
  LEADS_EDIT_CORE:   'leads.edit_core',    // ADMIN-ONLY — edit the lead's own data (name/phone/email/company/…). NOT in BASE_EMPLOYEE or ROLE_EXTRAS.
  LEAD_ACTIVITIES_VIEW:   'lead_activities.view',
  LEAD_ACTIVITIES_CREATE: 'lead_activities.create',
  FOLLOW_UPS_VIEW:        'follow_ups.view',
  FOLLOW_UPS_CREATE:      'follow_ups.create',
  FOLLOW_UPS_COMPLETE:    'follow_ups.complete',
  FOLLOW_UPS_MANAGE:      'follow_ups.manage',         // admin only
  CRM_REPORTS_VIEW:       'crm_reports.view',
  CRM_REPORTS_TEAM_VIEW:  'crm_reports.team_view',     // manager + admin only
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

// ============================================================
// extra_permissions input validation
// ============================================================

/**
 * Set of every PERMISSIONS string value — lazy-built ONCE at module load.
 * Used by validateExtraPermissions() to whitelist admin-assignable per-user
 * grants against the known permission catalog.
 *
 * Phase D Commit 1 (LOCK 3): exact-match only — no wildcards. The `*`
 * superuser perm and any `module.*` flavour MUST be managed via
 * `pyra_roles.permissions` (auditable role assignment), NOT via
 * `extra_permissions` (silent per-user grant).
 */
const ALLOWED_EXTRA_PERMISSIONS = new Set<string>(Object.values(PERMISSIONS));

export interface ValidateExtraPermissionsOk {
  ok: true;
  value: string[];
}
export interface ValidateExtraPermissionsErr {
  ok: false;
  /** Arabic-message error suitable for `apiValidationError(...)`. */
  error: string;
  /** The first invalid permission encountered, included for debugging. */
  rejected?: string;
}

/**
 * Validate an `extra_permissions` input from an admin request body.
 *
 * Rules:
 *   - undefined/null → ok, value: [] (treat as "no grants")
 *   - Not an array → reject (Arabic message)
 *   - Array contains a non-string → reject
 *   - Array contains `*` OR `module.*` wildcard → reject (use `pyra_roles`
 *     for wildcards — keeps audit trail clean)
 *   - Array contains a string not in the PERMISSIONS catalog → reject with
 *     the rejected permission included for debugging
 *   - Otherwise → ok, value: deduplicated array
 *
 * Phase D Commit 1 (audit P2 #1) — closes admin foot-gun where a phished
 * admin or typo could grant `["*"]` to any user, instantly promoting them
 * to super-admin without going through the auditable role-assignment flow.
 */
export function validateExtraPermissions(
  input: unknown,
): ValidateExtraPermissionsOk | ValidateExtraPermissionsErr {
  if (input === undefined || input === null) {
    return { ok: true, value: [] };
  }
  if (!Array.isArray(input)) {
    return { ok: false, error: 'extra_permissions يجب أن تكون مصفوفة' };
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of input) {
    if (typeof item !== 'string') {
      return {
        ok: false,
        error: 'extra_permissions يجب أن تحتوي على نصوص فقط',
      };
    }
    const v = item.trim();
    if (!v) continue;
    // Reject wildcards explicitly — wildcards go via pyra_roles only
    if (v === '*' || v.endsWith('.*')) {
      return {
        ok: false,
        error: 'الصلاحيات الشاملة (wildcards) غير مسموحة هنا — استخدم نظام الأدوار',
        rejected: v,
      };
    }
    if (!ALLOWED_EXTRA_PERMISSIONS.has(v)) {
      return {
        ok: false,
        error: `صلاحية غير معروفة: ${v}`,
        rejected: v,
      };
    }
    if (!seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return { ok: true, value: out };
}

// ============================================================
// Permission Modules (for UI grouping)
// ============================================================

// Display-name catalogue for the 3 UI surfaces that render permission
// checkboxes/badges (role editor, users extra-permissions picker, profile
// read-only view — see lib/auth/rbac.ts usage grep, Phase 6a discovery).
// i18n Phase 6a (2026-07-09): Arabic `labelAr` (module + permission level)
// moved OUT of this array into messages/{ar,en}/rbac.json
// (`rbac.modules.<key>` / `rbac.permissions.<prefix>.<suffix>`), consumed
// via the `useRbacLabels()` resolver in lib/i18n/rbac-labels.ts — NEVER
// re-add labelAr here. The English `label` field is KEPT as a structural
// fallback (still read directly by 2 call sites as of Phase 6a Task 1;
// full resolver wiring lands in Phase 6a Task 5).

export interface PermissionModule {
  key: string;
  label: string;
  permissions: { key: string; label: string }[];
}

export const PERMISSION_MODULES: PermissionModule[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    permissions: [
      { key: 'dashboard.view', label: 'View Dashboard' },
    ],
  },
  {
    key: 'calendar',
    label: 'Calendar',
    permissions: [
      { key: 'calendar.view', label: 'View Calendar' },
    ],
  },
  {
    key: 'files',
    label: 'Files',
    permissions: [
      { key: 'files.view', label: 'View Files' },
      { key: 'files.upload', label: 'Upload Files' },
      { key: 'files.edit', label: 'Edit Files' },
      { key: 'files.delete', label: 'Delete Files' },
      { key: 'files.share', label: 'Share Files' },
    ],
  },
  {
    key: 'projects',
    label: 'Projects',
    permissions: [
      { key: 'projects.view', label: 'View Projects' },
      { key: 'projects.create', label: 'Create Projects' },
      { key: 'projects.edit', label: 'Edit Projects' },
      { key: 'projects.delete', label: 'Delete Projects' },
    ],
  },
  {
    key: 'clients',
    label: 'Clients',
    permissions: [
      { key: 'clients.view', label: 'View Clients' },
      { key: 'clients.create', label: 'Create Clients' },
      { key: 'clients.edit', label: 'Edit Clients' },
      { key: 'clients.delete', label: 'Delete Clients' },
    ],
  },
  {
    key: 'quotes',
    label: 'Quotes',
    permissions: [
      { key: 'quotes.view', label: 'View Quotes' },
      { key: 'quotes.create', label: 'Create Quotes' },
      { key: 'quotes.edit', label: 'Edit Quotes' },
      { key: 'quotes.delete', label: 'Delete Quotes' },
      { key: 'quotes.delete_own', label: 'Delete Own Quotes' },
    ],
  },
  {
    key: 'invoices',
    label: 'Invoices',
    permissions: [
      { key: 'invoices.view', label: 'View Invoices' },
      { key: 'invoices.create', label: 'Create Invoices' },
      { key: 'invoices.edit', label: 'Edit Invoices' },
      { key: 'invoices.delete', label: 'Delete Invoices' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    permissions: [
      { key: 'finance.view', label: 'View Finance' },
      { key: 'finance.manage', label: 'Manage Finance' },
    ],
  },
  {
    key: 'users',
    label: 'Users',
    permissions: [
      { key: 'users.view', label: 'View Users' },
      { key: 'users.manage', label: 'Manage Users' },
    ],
  },
  {
    key: 'roles',
    label: 'Roles',
    permissions: [
      { key: 'roles.view', label: 'View Roles' },
      { key: 'roles.manage', label: 'Manage Roles' },
    ],
  },
  {
    key: 'teams',
    label: 'Teams',
    permissions: [
      { key: 'teams.view', label: 'View Teams' },
      { key: 'teams.manage', label: 'Manage Teams' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    permissions: [
      { key: 'reports.view', label: 'View Reports' },
    ],
  },
  {
    key: 'settings',
    label: 'Settings',
    permissions: [
      { key: 'settings.view', label: 'View Settings' },
      { key: 'settings.manage', label: 'Manage Settings' },
    ],
  },
  {
    key: 'automations',
    label: 'Automations',
    permissions: [
      { key: 'automations.view', label: 'View Automations' },
      { key: 'automations.manage', label: 'Manage Automations' },
    ],
  },
  {
    key: 'knowledge_base',
    label: 'Knowledge Base',
    permissions: [
      { key: 'knowledge_base.view', label: 'View Knowledge Base' },
      { key: 'knowledge_base.manage', label: 'Manage Knowledge Base' },
    ],
  },
  {
    key: 'integrations',
    label: 'Integrations',
    permissions: [
      { key: 'integrations.view', label: 'View Integrations' },
      { key: 'integrations.manage', label: 'Manage Integrations' },
    ],
  },
  {
    key: 'activity',
    label: 'Activity',
    permissions: [
      { key: 'activity.view', label: 'View Activity Log' },
    ],
  },
  {
    key: 'trash',
    label: 'Trash',
    permissions: [
      { key: 'trash.view', label: 'View Trash' },
      { key: 'trash.restore', label: 'Restore Items' },
      { key: 'trash.purge', label: 'Purge Items' },
    ],
  },
  {
    key: 'sessions',
    label: 'Sessions',
    permissions: [
      { key: 'sessions.view', label: 'View Sessions' },
      { key: 'sessions.manage', label: 'Manage Sessions' },
    ],
  },
  {
    key: 'error_logs',
    label: 'Error Logs',
    permissions: [
      { key: 'error_logs.view', label: 'View Error Logs' },
      { key: 'error_logs.manage', label: 'Resolve Error Logs' },
    ],
  },
  {
    key: 'reviews',
    label: 'Reviews',
    permissions: [
      { key: 'reviews.view', label: 'View Reviews' },
      { key: 'reviews.manage', label: 'Manage Reviews' },
    ],
  },
  {
    key: 'notifications',
    label: 'Notifications',
    permissions: [
      { key: 'notifications.view', label: 'View Notifications' },
    ],
  },
  {
    key: 'favorites',
    label: 'Favorites',
    permissions: [
      { key: 'favorites.view', label: 'View Favorites' },
      { key: 'favorites.manage', label: 'Manage Favorites' },
    ],
  },
  {
    key: 'script_reviews',
    label: 'Script Reviews',
    permissions: [
      { key: 'script_reviews.view', label: 'View Script Reviews' },
      { key: 'script_reviews.manage', label: 'Manage Script Reviews' },
    ],
  },
  {
    key: 'boards',
    label: 'Boards',
    permissions: [
      { key: 'boards.view', label: 'View Boards' },
      { key: 'boards.manage', label: 'Manage Boards' },
    ],
  },
  {
    key: 'tasks',
    label: 'Tasks',
    permissions: [
      { key: 'tasks.view', label: 'View Tasks' },
      { key: 'tasks.create', label: 'Create Tasks' },
      { key: 'tasks.manage', label: 'Manage Tasks' },
      { key: 'productivity.view', label: 'View Own Productivity' },
    ],
  },
  {
    key: 'directory',
    label: 'Directory',
    permissions: [
      { key: 'directory.view', label: 'View Directory' },
    ],
  },
  {
    key: 'timesheet',
    label: 'Timesheets',
    permissions: [
      { key: 'timesheet.view', label: 'View Timesheets' },
      { key: 'timesheet.manage', label: 'Manage Timesheets' },
      { key: 'timesheet.approve', label: 'Approve Timesheets' },
    ],
  },
  {
    key: 'announcements',
    label: 'Announcements',
    permissions: [
      { key: 'announcements.view', label: 'View Announcements' },
      { key: 'announcements.manage', label: 'Manage Announcements' },
    ],
  },
  {
    key: 'leave',
    label: 'Leave',
    permissions: [
      { key: 'leave.view', label: 'View Leave' },
      { key: 'leave.manage', label: 'Manage Leave' },
      { key: 'leave.approve', label: 'Approve Leave' },
    ],
  },
  {
    key: 'attendance',
    label: 'Attendance',
    permissions: [
      { key: 'attendance.view', label: 'View Attendance' },
      { key: 'attendance.manage', label: 'Manage Attendance' },
    ],
  },
  {
    key: 'hr',
    label: 'HR Overview',
    permissions: [
      { key: 'hr.view', label: 'View HR Dashboard' },
      { key: 'hr.manage', label: 'Manage HR' },
    ],
  },
  {
    key: 'documents',
    label: 'Employee Documents',
    permissions: [
      { key: 'documents.view', label: 'View Own Documents' },
      { key: 'documents.manage', label: 'Manage Documents' },
    ],
  },
  {
    key: 'payroll',
    label: 'Payroll',
    permissions: [
      { key: 'payroll.view', label: 'View Payroll' },
      { key: 'payroll.manage', label: 'Manage Payroll' },
    ],
  },
  {
    key: 'evaluations',
    label: 'Evaluations',
    permissions: [
      { key: 'evaluations.view', label: 'View Evaluations' },
      { key: 'evaluations.manage', label: 'Manage Evaluations' },
    ],
  },
  {
    key: 'overtime',
    label: 'Overtime',
    permissions: [
      { key: 'overtime.view', label: 'View Overtime' },
      { key: 'overtime.manage', label: 'Manage Overtime' },
    ],
  },
  {
    key: 'leave_types',
    label: 'Leave Types',
    permissions: [
      { key: 'leave_types.view', label: 'View Leave Types' },
      { key: 'leave_types.manage', label: 'Manage Leave Types' },
    ],
  },
  {
    key: 'content_pipeline',
    label: 'Content Pipeline',
    permissions: [
      { key: 'content_pipeline.view', label: 'View Content Pipeline' },
      { key: 'content_pipeline.manage', label: 'Manage Content Pipeline' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales & Call Center',
    permissions: [
      { key: 'sales.view', label: 'View Sales' },
      { key: 'sales.manage', label: 'Manage Sales' },
      { key: 'sales_leads.view', label: 'View Leads' },
      { key: 'sales_leads.create', label: 'Create Leads' },
      { key: 'sales_leads.manage', label: 'Manage Leads' },
      { key: 'sales_whatsapp.view', label: 'View WhatsApp' },
      { key: 'sales_whatsapp.send', label: 'Send WhatsApp' },
      { key: 'sales_whatsapp_groups.view', label: 'View WhatsApp Groups' },
      { key: 'sales_whatsapp_groups.manage', label: 'Manage WhatsApp Groups' },
      { key: 'sales_pipeline.manage', label: 'Manage Pipeline' },
      { key: 'quote_approvals.view', label: 'View Quote Approvals' },
      { key: 'quote_approvals.manage', label: 'Manage Quote Approvals' },
    ],
  },
  {
    key: 'crm',
    label: 'CRM (Sales rebuild)',
    permissions: [
      { key: 'leads.view',        label: 'View Leads (CRM)' },
      { key: 'leads.create',      label: 'Create Lead' },
      { key: 'leads.update',      label: 'Update Own Lead' },
      { key: 'leads.assign',      label: 'Assign / Transfer Lead' },
      { key: 'leads.delete',      label: 'Archive Lead' },
      { key: 'leads.move_stage',  label: 'Move Stage (Pipeline)' },
      { key: 'leads.approve',     label: 'Approve Closed Won' },
      { key: 'leads.manage',      label: 'Admin: see all leads' },
      { key: 'leads.edit_core',   label: 'Edit Lead Data (Admin)' },
      { key: 'lead_activities.view',   label: 'View Activity Timeline' },
      { key: 'lead_activities.create', label: 'Add Note / Log Call' },
      { key: 'follow_ups.view',     label: 'View Follow-ups' },
      { key: 'follow_ups.create',   label: 'Schedule Follow-up' },
      { key: 'follow_ups.complete', label: 'Mark Follow-up Done' },
      { key: 'follow_ups.manage',   label: 'Admin: manage all follow-ups' },
      { key: 'crm_reports.view',      label: 'View CRM Reports (own)' },
      { key: 'crm_reports.team_view', label: 'View CRM Reports (team)' },
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

// ============================================================
// Role Permission Inheritance
// ============================================================
// Every internal user (employee, sales_agent, etc.) inherits BASE_EMPLOYEE.
// Role-specific permissions are ADDED on top — never duplicated.
// When adding a new employee-facing feature, add permission to
// BASE_EMPLOYEE and ALL roles get it automatically.
// ============================================================

/**
 * Permissions every internal user gets (HR self-service ONLY).
 *
 * Naming convention used across the codebase:
 *   `*.view`     → read OWN data (self-service)
 *   `*.create`   → create OWN records
 *   `*.approve`  → approve OTHERS' records (manager/HR action — NEVER in BASE)
 *   `*.manage`   → admin-level CRUD on ANY record (NEVER in BASE)
 *
 * Why: list endpoints (e.g. /api/leave GET) treat anyone with `*.manage` as
 * a global manager and skip the `username = self` scope filter. Putting
 * `leave.manage` in BASE_EMPLOYEE leaked every employee's leave records to
 * every other employee. Same pattern for attendance and timesheet.
 *
 * If a feature needs employees to edit their OWN records, use ownership
 * checks (`row.username === auth.pyraUser.username`), not a `*.manage` perm.
 */
const BASE_EMPLOYEE: string[] = [
  'dashboard.view',
  'calendar.view',  // Phase 15.1 Commit 5 — every internal user sees their own events
  'notifications.view',
  // HR Self-Service — every employee needs these (read-only or own-record)
  'directory.view',
  'announcements.view',
  'timesheet.view',     // see own timesheet
  'timesheet.create',   // log own hours
  'leave.view',         // see own leave + balance
  'leave.create',       // submit own leave request
  'attendance.view',    // see own attendance
  'attendance.create',  // check in / check out
  'payroll.view',       // see own payslips (my-payslips)
  'evaluations.view',   // see own evaluations
  'overtime.view',      // see own overtime
  'documents.view',     // see own uploaded documents
  // Boards/tasks self-service — production employees work from their member
  // boards (board list API scopes non-admins to member boards; verified
  // app/api/boards/route.ts:36-41)
  'boards.view',
  'tasks.view',
  'tasks.create',
  'productivity.view',  // own monthly production stats (my-tasks card)
];

/** Role-specific permissions added ON TOP of BASE_EMPLOYEE */
const ROLE_EXTRAS: Record<string, string[]> = {
  employee: [],  // Employee = BASE_EMPLOYEE only (no extras)

  sales_agent: [
    // Legacy Sales — gates the PROTECTED /dashboard/sales/* routes that
    // survived Phase 12 sunset (chat, whatsapp-analytics, whatsapp-campaigns,
    // approvals, settings). v1.1 backlog: rename to a generic namespace.
    'sales.view',
    'sales_leads.view',
    'sales_leads.create',
    'sales_leads.manage',  // scope-limited despite the name — see PERMISSIONS def note (audit Gap #4)
    'sales_whatsapp.view',
    'sales_whatsapp.send',
    'sales_whatsapp_groups.view',
    'sales_whatsapp_groups.manage',
    'quotes.view',
    'quotes.create',
    'quotes.delete_own',  // Group 2 — agents can delete quotes THEY created (own scope)
    'quote_approvals.view',
    'clients.view',
    // CRM rebuild — own-only access; canAccessLead() enforces row scope.
    // INTENTIONALLY OMITTED: leads.assign, leads.approve, leads.delete,
    // leads.manage, follow_ups.manage, crm_reports.team_view
    'leads.view',
    'leads.create',
    'leads.update',
    'leads.move_stage',
    'lead_activities.view',
    'lead_activities.create',
    'follow_ups.view',
    'follow_ups.create',
    'follow_ups.complete',
    'crm_reports.view',
  ],

  // Add future roles here:
  // call_center: ['sales_whatsapp.view', 'sales_whatsapp.send', 'sales_leads.view'],
  // accountant: ['finance.view', 'invoices.view', 'invoices.manage'],
  // project_manager: ['projects.view', 'projects.manage', 'boards.view', 'boards.manage'],
};

/**
 * Get default permissions for a role.
 * Admin gets wildcard. Internal roles inherit BASE_EMPLOYEE + extras.
 * Client gets minimal access.
 */
export function getDefaultPermissionsForLegacyRole(role: string): string[] {
  if (role === 'admin') return ['*'];
  if (role === 'client') return ['dashboard.view', 'notifications.view'];

  // All internal roles inherit BASE_EMPLOYEE
  const extras = ROLE_EXTRAS[role] || [];
  return [...BASE_EMPLOYEE, ...extras];
}

/**
 * Build the FINAL permissions list for a user — single source of truth.
 *
 * Merges (deduplicated):
 *   1. BASE_EMPLOYEE — HR self-service every internal user must have
 *      (dashboard, notifications, leave, attendance, payroll, ...)
 *   2. Role permissions — from DB pyra_roles.permissions if present,
 *      otherwise from ROLE_EXTRAS legacy mapping
 *   3. extra_permissions — per-user grants from pyra_users.extra_permissions
 *
 * Special cases (skip merging):
 *   - legacyRole === 'admin' OR DB role contains '*' → wildcard ['*']
 *   - legacyRole === 'client' → minimal portal access
 *
 * This function is the ONE place where the final permission set is built.
 * Both lib/api/auth.ts and lib/auth/guards.ts must route through here so
 * the same rules apply to API requests and page renders alike.
 *
 * Why this exists: previously each call site did
 *   `dbRolePermissions ?? legacyMapping`
 * which meant any user with a DB role_id silently lost their BASE_EMPLOYEE
 * permissions (no leave, no attendance, no timesheet, etc.).
 */
export function buildUserPermissions(
  legacyRole: string,
  dbRolePermissions: string[] | null | undefined,
  extraPermissions: string[] | null | undefined
): string[] {
  // Wildcard cases — bypass merging entirely
  if (legacyRole === 'admin' || dbRolePermissions?.includes('*')) {
    return ['*'];
  }
  if (legacyRole === 'client') {
    return ['dashboard.view', 'notifications.view'];
  }

  // Internal user — always inherit BASE_EMPLOYEE
  const rolePerms = dbRolePermissions ?? ROLE_EXTRAS[legacyRole] ?? [];
  const extras = Array.isArray(extraPermissions) ? extraPermissions : [];

  return Array.from(new Set([...BASE_EMPLOYEE, ...rolePerms, ...extras]));
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
