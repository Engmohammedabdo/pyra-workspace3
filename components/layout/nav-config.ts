import type nav from '@/messages/ar/nav.json';
import {
  LayoutDashboard,
  FolderOpen,
  Users,
  Building2,
  Briefcase,
  FileText,
  Activity,
  Trash2,
  Settings,
  Bell,
  Shield,
  MessageSquare,
  Monitor,
  KeyRound,
  Star,
  ScrollText,
  Receipt,
  BarChart3,
  Zap,
  BookOpen,
  Webhook,
  Wallet,
  ArrowDownCircle,
  CreditCard,
  FileSignature,
  Repeat,
  Target,
  PieChart,
  HardDrive,
  UserCircle,
  CheckSquare,
  Clock,
  Kanban,
  Megaphone,
  Contact,
  CalendarOff,
  CalendarClock,
  Timer,
  Banknote,
  Network,
  Clapperboard,
  Award,
  Settings2,
  TrendingUp,
  MessageCircle,
  CheckCircle,
  ShieldCheck,
  FileCheck,
  Truck,
  ShoppingCart,
  ClipboardCheck,
  Bug,
  UserPlus,
  CalendarDays,
} from 'lucide-react';

// Deriving key unions from the AR catalog makes t(`items.${item.key}`)
// type-check against next-intl's typed keys (template literals over literal
// unions infer a key union — no casts needed in the render paths).
export type NavItemKey = keyof typeof nav.nav.items;
export type NavGroupKey = keyof typeof nav.nav.groups;

export interface NavItemConfig {
  key: NavItemKey; // nav.items.<key>
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  badgeKey?:
    | 'notifications'
    | 'overdue_invoices'
    | 'pending_approvals'
    | 'unassigned_conversations'
    | 'team_approvals'
    | 'follow_ups_pending'
    | 'crm_pending_approvals';
}

export interface NavGroupConfig {
  key: NavGroupKey; // nav.groups.<key>
  storageKey: string; // legacy titleEn — PRESERVED verbatim (localStorage collapse-state key)
  items: NavItemConfig[];
}

// ═══════════════════════════════════════════════
//  10 Well-organized Groups (max 10 items each)
//  Single source of truth — consumed by sidebar.tsx + mobile-nav.tsx
// ═══════════════════════════════════════════════
export const NAV_GROUPS: NavGroupConfig[] = [
  {
    key: 'main',
    storageKey: 'Main',
    items: [
      { key: 'dashboard', href: '/dashboard', icon: LayoutDashboard },
      { key: 'notifications', href: '/dashboard/notifications', icon: Bell, permission: 'notifications.view', badgeKey: 'notifications' },
      { key: 'profile', href: '/dashboard/profile', icon: UserCircle },
      { key: 'myTasks', href: '/dashboard/my-tasks', icon: CheckSquare },
      // Phase 15.1 Commit 5 — calendar lands in the "main" group so it's
      // discoverable next to my-tasks (both surfaces show "my work"
      // across the system).
      { key: 'calendar', href: '/dashboard/calendar', icon: CalendarClock, permission: 'calendar.view' },
    ],
  },
  {
    key: 'business',
    storageKey: 'Business',
    items: [
      { key: 'projects', href: '/dashboard/projects', icon: Briefcase, permission: 'projects.view' },
      { key: 'clients', href: '/dashboard/clients', icon: Building2, permission: 'clients.view' },
      { key: 'quotes', href: '/dashboard/quotes', icon: FileText, permission: 'quotes.view' },
      { key: 'quotesAnalytics', href: '/dashboard/quotes/analytics', icon: BarChart3, permission: 'quotes.view' },
      { key: 'invoices', href: '/dashboard/invoices', icon: Receipt, permission: 'invoices.view', badgeKey: 'overdue_invoices' },
      { key: 'boards', href: '/dashboard/boards', icon: Kanban, permission: 'boards.view' },
    ],
  },
  {
    key: 'content',
    storageKey: 'Content & Files',
    items: [
      { key: 'scriptReviews', href: '/dashboard/script-reviews', icon: ScrollText, permission: 'script_reviews.view' },
      { key: 'contentPipeline', href: '/dashboard/content-pipeline', icon: Clapperboard, permission: 'script_reviews.view' },
      { key: 'files', href: '/dashboard/files', icon: FolderOpen, permission: 'files.view' },
      { key: 'favorites', href: '/dashboard/favorites', icon: Star, permission: 'favorites.view' },
      { key: 'reviews', href: '/dashboard/reviews', icon: MessageSquare, permission: 'reviews.view' },
      { key: 'trash', href: '/dashboard/trash', icon: Trash2, permission: 'trash.view' },
      { key: 'storage', href: '/dashboard/storage', icon: HardDrive, permission: 'files.view' },
    ],
  },
  {
    key: 'crm',
    storageKey: 'CRM',
    items: [
      { key: 'crmDashboard', href: '/dashboard/crm', icon: TrendingUp, permission: 'leads.view' },
      { key: 'pipeline', href: '/dashboard/crm/pipeline', icon: Kanban, permission: 'leads.view' },
      { key: 'customers', href: '/dashboard/crm/customers', icon: Users, permission: 'leads.view' },
      { key: 'whatsappChat', href: '/dashboard/sales/chat', icon: MessageCircle, permission: 'sales_whatsapp.view', badgeKey: 'unassigned_conversations' },
      { key: 'whatsappAnalytics', href: '/dashboard/sales/whatsapp-analytics', icon: PieChart, permission: 'sales_whatsapp.view' },
      { key: 'whatsappCampaigns', href: '/dashboard/sales/whatsapp-campaigns', icon: Megaphone, permission: 'sales_whatsapp.manage' },
      { key: 'followUps', href: '/dashboard/crm/follow-ups', icon: Clock, permission: 'follow_ups.view', badgeKey: 'follow_ups_pending' },
      { key: 'crmApprovals', href: '/dashboard/crm/approvals', icon: ShieldCheck, permission: 'leads.approve', badgeKey: 'crm_pending_approvals' },
      { key: 'quoteApprovals', href: '/dashboard/sales/approvals', icon: CheckCircle, permission: 'quote_approvals.view', badgeKey: 'pending_approvals' },
      { key: 'salesSettings', href: '/dashboard/sales/settings', icon: Settings2, permission: 'sales_pipeline.manage' },
    ],
  },
  {
    // Admin-only HR aggregate pages — gated by admin-level permissions (hr.view, hr.manage,
    // leave.approve, documents.manage, payroll.manage, evaluations.manage).
    // Employees with only BASE_EMPLOYEE perms will not see any item in this group.
    key: 'hr',
    storageKey: 'HR',
    items: [
      { key: 'hrOverview', href: '/dashboard/hr', icon: LayoutDashboard, permission: 'hr.view' },
      { key: 'productivity', href: '/dashboard/hr/productivity', icon: BarChart3, permission: 'hr.view' },
      { key: 'teamApprovals', href: '/dashboard/approvals', icon: ClipboardCheck, permission: 'leave.approve', badgeKey: 'team_approvals' },
      { key: 'leaveSettings', href: '/dashboard/leave/settings', icon: Settings2, permission: 'leave.manage' },
      { key: 'leaveBalances', href: '/dashboard/hr/leave-balances', icon: CalendarDays, permission: 'leave.manage' },
      { key: 'evaluationSettings', href: '/dashboard/evaluations/settings', icon: Settings2, permission: 'evaluations.manage' },
      { key: 'hrDocuments', href: '/dashboard/hr/documents', icon: FileText, permission: 'documents.manage' },
      { key: 'documentTypes', href: '/dashboard/hr/documents/settings', icon: Settings2, permission: 'documents.manage' },
      { key: 'onboarding', href: '/dashboard/hr/onboarding', icon: UserPlus, permission: 'hr.manage' },
      { key: 'workSchedules', href: '/dashboard/hr/work-schedules', icon: Clock, permission: 'attendance.manage' },
    ],
  },
  {
    // Self-service HR pages — all gated by BASE_EMPLOYEE permissions so every
    // internal user (employee, sales_agent, admin) sees this group.
    key: 'selfService',
    storageKey: 'Self-Service',
    items: [
      { key: 'timesheet', href: '/dashboard/timesheet', icon: Clock, permission: 'timesheet.view' },
      { key: 'attendance', href: '/dashboard/attendance', icon: Timer, permission: 'attendance.view' },
      { key: 'leave', href: '/dashboard/leave', icon: CalendarOff, permission: 'leave.view' },
      { key: 'myPayslips', href: '/dashboard/my-payslips', icon: Receipt, permission: 'payroll.view' },
      { key: 'evaluations', href: '/dashboard/evaluations', icon: Award, permission: 'evaluations.view' },
      { key: 'myDocuments', href: '/dashboard/my-documents', icon: FileText, permission: 'documents.view' },
      { key: 'directory', href: '/dashboard/directory', icon: Contact, permission: 'directory.view' },
      { key: 'announcements', href: '/dashboard/announcements', icon: Megaphone, permission: 'announcements.view' },
      { key: 'orgChart', href: '/dashboard/org-chart', icon: Network, permission: 'directory.view' },
    ],
  },
  {
    key: 'finance',
    storageKey: 'Finance',
    items: [
      { key: 'financeHome', href: '/dashboard/finance', icon: Wallet, permission: 'finance.view' },
      { key: 'expenses', href: '/dashboard/finance/expenses', icon: ArrowDownCircle, permission: 'finance.view' },
      { key: 'cards', href: '/dashboard/finance/cards', icon: CreditCard, permission: 'finance.view' },
      { key: 'contracts', href: '/dashboard/finance/contracts', icon: FileSignature, permission: 'finance.view' },
      { key: 'recurring', href: '/dashboard/finance/recurring', icon: Repeat, permission: 'finance.view' },
      { key: 'creditNotes', href: '/dashboard/finance/credit-notes', icon: FileCheck, permission: 'finance.view' },
      { key: 'suppliers', href: '/dashboard/finance/suppliers', icon: Truck, permission: 'finance.view' },
      { key: 'purchaseOrders', href: '/dashboard/finance/purchase-orders', icon: ShoppingCart, permission: 'finance.view' },
      { key: 'financeReports', href: '/dashboard/finance/reports', icon: PieChart, permission: 'finance.view' },
      { key: 'revenueTargets', href: '/dashboard/finance/targets', icon: Target, permission: 'finance.view' },
      { key: 'payroll', href: '/dashboard/payroll', icon: Banknote, permission: 'payroll.manage' },
    ],
  },
  {
    key: 'team',
    storageKey: 'Team Management',
    items: [
      { key: 'users', href: '/dashboard/users', icon: Users, permission: 'users.view' },
      { key: 'teams', href: '/dashboard/teams', icon: Building2, permission: 'teams.view' },
      { key: 'roles', href: '/dashboard/roles', icon: Shield, permission: 'roles.view' },
      { key: 'permissions', href: '/dashboard/permissions', icon: KeyRound, permission: 'users.manage' },
    ],
  },
  {
    key: 'tools',
    storageKey: 'Tools',
    items: [
      { key: 'settings', href: '/dashboard/settings', icon: Settings, permission: 'settings.view' },
      { key: 'reports', href: '/dashboard/reports', icon: BarChart3, permission: 'reports.view' },
      { key: 'automations', href: '/dashboard/automations', icon: Zap, permission: 'automations.view' },
      { key: 'knowledgeBase', href: '/dashboard/knowledge-base', icon: BookOpen, permission: 'knowledge_base.view' },
      { key: 'integrations', href: '/dashboard/integrations', icon: Webhook, permission: 'integrations.view' },
    ],
  },
  {
    key: 'security',
    storageKey: 'Security',
    items: [
      { key: 'activityLog', href: '/dashboard/activity', icon: Activity, permission: 'activity.view' },
      { key: 'loginHistory', href: '/dashboard/login-history', icon: KeyRound, permission: 'sessions.view' },
      { key: 'sessions', href: '/dashboard/sessions', icon: Monitor, permission: 'sessions.view' },
      { key: 'errorLogs', href: '/dashboard/admin/error-logs', icon: Bug, permission: 'error_logs.view' },
    ],
  },
];

// All nav items flat — used for favorite pins lookup (sidebar) + palette (Task 15)
export const ALL_NAV_ITEMS: NavItemConfig[] = NAV_GROUPS.flatMap((g) => g.items);
