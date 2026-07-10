/**
 * Centralized module guide / documentation metadata — STRUCTURAL ONLY.
 *
 * Every dashboard module (sidebar page) has a route key (the object key,
 * usually equal to `href`) mapped to a `slug` — the lookup key into the
 * bilingual `guide.<slug>` catalog entry in `messages/{ar,en}/guide.json`
 * (description/goal/tips/keywords). This file holds NO translatable text —
 * content lives in the catalog; resolve it via `lib/i18n/module-guide-labels.ts`
 * (`useModuleGuide` / `useAllModuleGuides` / `useModuleGuideSearch`).
 *
 * ## Slug scheme (documented, see `slugifyRoutePath` below)
 * The object key (a route path, occasionally with a `[id]` segment or a
 * `?tab=x` query string for tab-specific guide entries) is converted to an
 * ASCII, next-intl-safe slug:
 *   1. Strip the leading `/`.
 *   2. Replace every run of non-alphanumeric characters (`/`, `[`, `]`,
 *      `?`, `=`, `-`, etc.) with a single underscore.
 *   3. Trim leading/trailing underscores, lowercase the result.
 * Examples: `/dashboard` → `dashboard`; `/dashboard/clients/[id]` →
 * `dashboard_clients_id`; `/dashboard/crm/leads/[id]?tab=tasks` →
 * `dashboard_crm_leads_id_tab_tasks`. All 78 slugs are unique (verified).
 * The `guide.json` catalog also has one reserved non-entry key, `ui`, for
 * the guide page's own chrome (search placeholder, section headings, empty
 * state) — never a valid module slug, excluded from `ModuleGuideSlug`.
 */

export function slugifyRoutePath(routeKey: string): string {
  return routeKey
    .replace(/^\//, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
}

// Derives the literal-string union of valid catalog slugs straight from the
// AR source of truth (mirrors the `NavItemKey = keyof typeof nav.nav.items`
// pattern in `components/layout/nav-config.ts`) — a typo'd slug on any
// MODULE_GUIDES entry below fails `pnpm run check`, not silently at runtime.
// 'ui' is the guide page's own chrome sub-tree, excluded — it is never a
// per-module slug.
import type guideAr from '@/messages/ar/guide.json';
export type ModuleGuideSlug = Exclude<keyof typeof guideAr.guide, 'ui'>;

export interface ModuleGuideEntry {
  /** Sidebar href / route key (structural — used for navigation, not lookup by itself) */
  href: string;
  /** Catalog lookup key — `guide.<slug>` in messages/{ar,en}/guide.json */
  slug: ModuleGuideSlug;
}

export const MODULE_GUIDES: Record<string, ModuleGuideEntry> = {
  /* ═══════════════ عام (General) ═══════════════ */ // i18n-exempt: decorative section divider comment
  '/dashboard': { href: '/dashboard', slug: 'dashboard' },
  '/dashboard/notifications': { href: '/dashboard/notifications', slug: 'dashboard_notifications' },
  /* ═══════════════ إدارة الملفات ═══════════════ */ // i18n-exempt: decorative section divider comment
  '/dashboard/files': { href: '/dashboard/files', slug: 'dashboard_files' },
  '/dashboard/favorites': { href: '/dashboard/favorites', slug: 'dashboard_favorites' },
  '/dashboard/reviews': { href: '/dashboard/reviews', slug: 'dashboard_reviews' },
  '/dashboard/trash': { href: '/dashboard/trash', slug: 'dashboard_trash' },
  '/dashboard/storage': { href: '/dashboard/storage', slug: 'dashboard_storage' },
  /* ═══════════════ العمل ═══════════════ */ // i18n-exempt: decorative section divider comment
  '/dashboard/projects': { href: '/dashboard/projects', slug: 'dashboard_projects' },
  '/dashboard/quotes': { href: '/dashboard/quotes', slug: 'dashboard_quotes' },
  '/dashboard/quotes/analytics': { href: '/dashboard/quotes/analytics', slug: 'dashboard_quotes_analytics' },
  '/dashboard/invoices': { href: '/dashboard/invoices', slug: 'dashboard_invoices' },
  '/dashboard/clients': { href: '/dashboard/clients', slug: 'dashboard_clients' },
  '/dashboard/clients/[id]': { href: '/dashboard/clients', slug: 'dashboard_clients_id' },
  '/dashboard/script-reviews': { href: '/dashboard/script-reviews', slug: 'dashboard_script_reviews' },
  /* ═══════════════ الدليل ═══════════════ */ // i18n-exempt: decorative section divider comment
  '/dashboard/guide': { href: '/dashboard/guide', slug: 'dashboard_guide' },
  /* ═══════════════ شخصي + سير العمل ═══════════════ */ // i18n-exempt: decorative section divider comment
  '/dashboard/profile': { href: '/dashboard/profile', slug: 'dashboard_profile' },
  '/dashboard/boards': { href: '/dashboard/boards', slug: 'dashboard_boards' },
  '/dashboard/my-tasks': { href: '/dashboard/my-tasks', slug: 'dashboard_my_tasks' },
  '/dashboard/directory': { href: '/dashboard/directory', slug: 'dashboard_directory' },
  '/dashboard/hr': { href: '/dashboard/hr', slug: 'dashboard_hr' },
  '/dashboard/hr/productivity': { href: '/dashboard/hr/productivity', slug: 'dashboard_hr_productivity' },
  '/dashboard/approvals': { href: '/dashboard/approvals', slug: 'dashboard_approvals' },
  '/dashboard/timesheet': { href: '/dashboard/timesheet', slug: 'dashboard_timesheet' },
  '/dashboard/announcements': { href: '/dashboard/announcements', slug: 'dashboard_announcements' },
  '/dashboard/leave': { href: '/dashboard/leave', slug: 'dashboard_leave' },
  '/dashboard/leave/settings': { href: '/dashboard/leave/settings', slug: 'dashboard_leave_settings' },
  '/dashboard/hr/leave-balances': { href: '/dashboard/hr/leave-balances', slug: 'dashboard_hr_leave_balances' },
  '/dashboard/attendance': { href: '/dashboard/attendance', slug: 'dashboard_attendance' },
  '/dashboard/org-chart': { href: '/dashboard/org-chart', slug: 'dashboard_org_chart' },
  '/dashboard/my-payslips': { href: '/dashboard/my-payslips', slug: 'dashboard_my_payslips' },
  /* ═══════════════ المالية ═══════════════ */ // i18n-exempt: decorative section divider comment
  '/dashboard/finance': { href: '/dashboard/finance', slug: 'dashboard_finance' },
  '/dashboard/finance/expenses': { href: '/dashboard/finance/expenses', slug: 'dashboard_finance_expenses' },
  '/dashboard/finance/expenses/categories': { href: '/dashboard/finance/expenses/categories', slug: 'dashboard_finance_expenses_categories' },
  '/dashboard/finance/client-statement': { href: '/dashboard/finance/client-statement', slug: 'dashboard_finance_client_statement' },
  '/dashboard/finance/cards': { href: '/dashboard/finance/cards', slug: 'dashboard_finance_cards' },
  '/dashboard/finance/contracts': { href: '/dashboard/finance/contracts', slug: 'dashboard_finance_contracts' },
  '/dashboard/finance/credit-notes': { href: '/dashboard/finance/credit-notes', slug: 'dashboard_finance_credit_notes' },
  '/dashboard/finance/suppliers': { href: '/dashboard/finance/suppliers', slug: 'dashboard_finance_suppliers' },
  '/dashboard/finance/purchase-orders': { href: '/dashboard/finance/purchase-orders', slug: 'dashboard_finance_purchase_orders' },
  '/dashboard/finance/recurring': { href: '/dashboard/finance/recurring', slug: 'dashboard_finance_recurring' },
  '/dashboard/finance/reports': { href: '/dashboard/finance/reports', slug: 'dashboard_finance_reports' },
  '/dashboard/finance/targets': { href: '/dashboard/finance/targets', slug: 'dashboard_finance_targets' },
  '/dashboard/payroll': { href: '/dashboard/payroll', slug: 'dashboard_payroll' },
  '/dashboard/evaluations': { href: '/dashboard/evaluations', slug: 'dashboard_evaluations' },
  '/dashboard/evaluations/settings': { href: '/dashboard/evaluations/settings', slug: 'dashboard_evaluations_settings' },
  '/dashboard/hr/documents': { href: '/dashboard/hr/documents', slug: 'dashboard_hr_documents' },
  '/dashboard/hr/documents/settings': { href: '/dashboard/hr/documents/settings', slug: 'dashboard_hr_documents_settings' },
  '/dashboard/hr/onboarding': { href: '/dashboard/hr/onboarding', slug: 'dashboard_hr_onboarding' },
  '/dashboard/hr/work-schedules': { href: '/dashboard/hr/work-schedules', slug: 'dashboard_hr_work_schedules' },
  '/dashboard/my-documents': { href: '/dashboard/my-documents', slug: 'dashboard_my_documents' },
  '/dashboard/content-pipeline': { href: '/dashboard/content-pipeline', slug: 'dashboard_content_pipeline' },
  /* ═══════════════ الفريق ═══════════════ */ // i18n-exempt: decorative section divider comment
  '/dashboard/teams': { href: '/dashboard/teams', slug: 'dashboard_teams' },
  '/dashboard/users': { href: '/dashboard/users', slug: 'dashboard_users' },
  '/dashboard/roles': { href: '/dashboard/roles', slug: 'dashboard_roles' },
  '/dashboard/permissions': { href: '/dashboard/permissions', slug: 'dashboard_permissions' },
  /* ═══════════════ النظام ═══════════════ */ // i18n-exempt: decorative section divider comment
  '/dashboard/reports': { href: '/dashboard/reports', slug: 'dashboard_reports' },
  '/dashboard/automations': { href: '/dashboard/automations', slug: 'dashboard_automations' },
  '/dashboard/knowledge-base': { href: '/dashboard/knowledge-base', slug: 'dashboard_knowledge_base' },
  '/dashboard/integrations': { href: '/dashboard/integrations', slug: 'dashboard_integrations' },
  '/dashboard/activity': { href: '/dashboard/activity', slug: 'dashboard_activity' },
  '/dashboard/login-history': { href: '/dashboard/login-history', slug: 'dashboard_login_history' },
  '/dashboard/sessions': { href: '/dashboard/sessions', slug: 'dashboard_sessions' },
  '/dashboard/admin/error-logs': { href: '/dashboard/admin/error-logs', slug: 'dashboard_admin_error_logs' },
  '/dashboard/settings': { href: '/dashboard/settings', slug: 'dashboard_settings' },
  /* ═══════════════ المبيعات ═══════════════ */ // i18n-exempt: decorative section divider comment
  '/dashboard/crm': { href: '/dashboard/crm', slug: 'dashboard_crm' },
  '/dashboard/crm/pipeline': { href: '/dashboard/crm/pipeline', slug: 'dashboard_crm_pipeline' },
  '/dashboard/crm/leads/archived': { href: '/dashboard/crm/leads/archived', slug: 'dashboard_crm_leads_archived' },
  '/dashboard/calendar': { href: '/dashboard/calendar', slug: 'dashboard_calendar' },
  '/dashboard/crm/leads/[id]?tab=tasks': { href: '/dashboard/crm/pipeline', slug: 'dashboard_crm_leads_id_tab_tasks' },
  '/dashboard/crm/leads/[id]?tab=activity': { href: '/dashboard/crm/pipeline', slug: 'dashboard_crm_leads_id_tab_activity' },
  '/dashboard/crm/leads/[id]?tab=files': { href: '/dashboard/crm/pipeline', slug: 'dashboard_crm_leads_id_tab_files' },
  '/dashboard/sales/chat': { href: '/dashboard/sales/chat', slug: 'dashboard_sales_chat' },
  '/dashboard/sales/approvals': { href: '/dashboard/sales/approvals', slug: 'dashboard_sales_approvals' },
  '/dashboard/crm/follow-ups': { href: '/dashboard/crm/follow-ups', slug: 'dashboard_crm_follow_ups' },
  '/dashboard/crm/calls': { href: '/dashboard/crm/calls', slug: 'dashboard_crm_calls' },
  '/dashboard/sales/whatsapp-analytics': { href: '/dashboard/sales/whatsapp-analytics', slug: 'dashboard_sales_whatsapp_analytics' },
  '/dashboard/sales/settings': { href: '/dashboard/sales/settings', slug: 'dashboard_sales_settings' },
  '/dashboard/admin/backup-procedure': { href: '/dashboard/admin/error-logs', slug: 'dashboard_admin_backup_procedure' },
  '/dashboard/admin/security-checklist': { href: '/dashboard/admin/error-logs', slug: 'dashboard_admin_security_checklist' },
};

/**
 * Get module guide entry by href (exact match or prefix match).
 * Returns the STRUCTURAL entry ({ href, slug }) — resolve translated content
 * via `useModuleGuide()` in `lib/i18n/module-guide-labels.ts`.
 */
export function getModuleGuide(pathname: string): ModuleGuideEntry | undefined {
  // Try exact match first
  if (MODULE_GUIDES[pathname]) return MODULE_GUIDES[pathname];

  // Try prefix match (e.g., /dashboard/files/some/path → /dashboard/files)
  const segments = pathname.split('/');
  while (segments.length > 2) {
    segments.pop();
    const prefix = segments.join('/');
    if (MODULE_GUIDES[prefix]) return MODULE_GUIDES[prefix];
  }

  return undefined;
}
