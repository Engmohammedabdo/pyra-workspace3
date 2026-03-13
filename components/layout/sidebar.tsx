'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { hasPermission } from '@/lib/auth/rbac';
import { MODULE_GUIDES } from '@/lib/config/module-guide';
import { useSidebarBadges } from '@/hooks/useSidebarBadges';
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
  PanelLeftClose,
  PanelLeftOpen,
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
  RefreshCw,
  CreditCard,
  FileSignature,
  Repeat,
  Target,
  PieChart,
  ChevronDown,
  HelpCircle,
  HardDrive,
  UserCircle,
  CheckSquare,
  Clock,
  Kanban,
  Megaphone,
  Contact,
  CalendarOff,
  Timer,
  Banknote,
  Network,
  Clapperboard,
  Award,
  Settings2,
  Pin,
  PinOff,
  TrendingUp,
  UserPlus,
  MessageCircle,
  CheckCircle,
} from 'lucide-react';

interface SidebarProps {
  user: {
    username: string;
    role: string;
    display_name: string;
    rolePermissions?: string[];
  };
}

interface NavItem {
  href: string;
  label: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: string;
  badgeKey?: 'notifications' | 'overdue_invoices' | 'pending_approvals';
}

interface NavGroup {
  title: string;
  titleEn: string;
  items: NavItem[];
}

// ═══════════════════════════════════════════════
//  5 Reorganized Groups (was 8)
// ═══════════════════════════════════════════════
const navGroups: NavGroup[] = [
  {
    title: 'الرئيسية',
    titleEn: 'Main',
    items: [
      { href: '/dashboard', label: 'الرئيسية', labelEn: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/notifications', label: 'الإشعارات', labelEn: 'Notifications', icon: Bell, permission: 'notifications.view', badgeKey: 'notifications' },
      { href: '/dashboard/profile', label: 'ملفي الشخصي', labelEn: 'My Profile', icon: UserCircle },
      { href: '/dashboard/my-tasks', label: 'مهامي', labelEn: 'My Tasks', icon: CheckSquare },
    ],
  },
  {
    title: 'العمل',
    titleEn: 'Work',
    items: [
      { href: '/dashboard/projects', label: 'المشاريع', labelEn: 'Projects', icon: Briefcase, permission: 'projects.view' },
      { href: '/dashboard/clients', label: 'العملاء', labelEn: 'Clients', icon: Building2, permission: 'clients.view' },
      { href: '/dashboard/quotes', label: 'عروض الأسعار', labelEn: 'Quotes', icon: FileText, permission: 'quotes.view' },
      { href: '/dashboard/invoices', label: 'الفواتير', labelEn: 'Invoices', icon: Receipt, permission: 'invoices.view', badgeKey: 'overdue_invoices' },
      { href: '/dashboard/boards', label: 'لوحات العمل', labelEn: 'Boards', icon: Kanban, permission: 'boards.view' },
      { href: '/dashboard/script-reviews', label: 'مراجعات السكريبتات', labelEn: 'Script Reviews', icon: ScrollText, permission: 'script_reviews.view' },
      { href: '/dashboard/content-pipeline', label: 'خط الإنتاج', labelEn: 'Content Pipeline', icon: Clapperboard, permission: 'script_reviews.view' },
      { href: '/dashboard/files', label: 'الملفات', labelEn: 'Files', icon: FolderOpen, permission: 'files.view' },
      { href: '/dashboard/favorites', label: 'المفضلة', labelEn: 'Favorites', icon: Star, permission: 'favorites.view' },
      { href: '/dashboard/reviews', label: 'المراجعات', labelEn: 'Reviews', icon: MessageSquare, permission: 'reviews.view' },
      { href: '/dashboard/trash', label: 'المحذوفات', labelEn: 'Trash', icon: Trash2, permission: 'trash.view' },
      { href: '/dashboard/storage', label: 'التخزين', labelEn: 'Storage', icon: HardDrive, permission: 'files.view' },
    ],
  },
  {
    title: 'المبيعات',
    titleEn: 'Sales',
    items: [
      { href: '/dashboard/sales', label: 'نظرة عامة', labelEn: 'Sales Overview', icon: TrendingUp, permission: 'sales.view' },
      { href: '/dashboard/sales/leads', label: 'العملاء المحتملين', labelEn: 'Leads', icon: UserPlus, permission: 'sales_leads.view' },
      { href: '/dashboard/sales/chat', label: 'محادثات واتساب', labelEn: 'WhatsApp Chat', icon: MessageCircle, permission: 'sales_whatsapp.view' },
      { href: '/dashboard/sales/approvals', label: 'موافقات العروض', labelEn: 'Quote Approvals', icon: CheckCircle, permission: 'quote_approvals.view', badgeKey: 'pending_approvals' },
      { href: '/dashboard/sales/follow-ups', label: 'المتابعات', labelEn: 'Follow-ups', icon: Clock, permission: 'sales_leads.view' },
      { href: '/dashboard/sales/reports', label: 'تقارير المبيعات', labelEn: 'Sales Reports', icon: BarChart3, permission: 'sales.view' },
      { href: '/dashboard/sales/settings', label: 'إعدادات المبيعات', labelEn: 'Sales Settings', icon: Settings2, permission: 'sales_pipeline.manage' },
    ],
  },
  {
    title: 'الموارد البشرية',
    titleEn: 'HR',
    items: [
      { href: '/dashboard/timesheet', label: 'ساعات العمل', labelEn: 'Timesheet', icon: Clock, permission: 'timesheet.view' },
      { href: '/dashboard/attendance', label: 'الحضور', labelEn: 'Attendance', icon: Timer, permission: 'attendance.view' },
      { href: '/dashboard/leave', label: 'الإجازات', labelEn: 'Leave', icon: CalendarOff, permission: 'leave.view' },
      { href: '/dashboard/leave/settings', label: 'إعدادات الإجازات', labelEn: 'Leave Settings', icon: Settings2, permission: 'leave.manage' },
      { href: '/dashboard/my-payslips', label: 'كشف راتبي', labelEn: 'My Payslips', icon: Receipt, permission: 'payroll.view' },
      { href: '/dashboard/directory', label: 'دليل الفريق', labelEn: 'Directory', icon: Contact, permission: 'directory.view' },
      { href: '/dashboard/announcements', label: 'الإعلانات', labelEn: 'Announcements', icon: Megaphone, permission: 'announcements.view' },
      { href: '/dashboard/org-chart', label: 'الهيكل التنظيمي', labelEn: 'Org Chart', icon: Network, permission: 'directory.view' },
      { href: '/dashboard/evaluations', label: 'تقييم الأداء', labelEn: 'Evaluations', icon: Award, permission: 'evaluations.view' },
      { href: '/dashboard/evaluations/settings', label: 'إعدادات التقييم', labelEn: 'Evaluation Settings', icon: Settings2, permission: 'evaluations.manage' },
    ],
  },
  {
    title: 'المالية',
    titleEn: 'Finance',
    items: [
      { href: '/dashboard/finance', label: 'الإدارة المالية', labelEn: 'Finance', icon: Wallet, permission: 'finance.view' },
      { href: '/dashboard/finance/expenses', label: 'المصاريف', labelEn: 'Expenses', icon: ArrowDownCircle, permission: 'finance.view' },
      { href: '/dashboard/finance/subscriptions', label: 'الاشتراكات', labelEn: 'Subscriptions', icon: RefreshCw, permission: 'finance.view' },
      { href: '/dashboard/finance/cards', label: 'البطاقات', labelEn: 'Cards', icon: CreditCard, permission: 'finance.view' },
      { href: '/dashboard/finance/contracts', label: 'العقود', labelEn: 'Contracts', icon: FileSignature, permission: 'finance.view' },
      { href: '/dashboard/finance/recurring', label: 'الفواتير المتكررة', labelEn: 'Recurring Invoices', icon: Repeat, permission: 'finance.view' },
      { href: '/dashboard/finance/reports', label: 'التقارير المالية', labelEn: 'Financial Reports', icon: PieChart, permission: 'finance.view' },
      { href: '/dashboard/finance/targets', label: 'أهداف الإيرادات', labelEn: 'Revenue Targets', icon: Target, permission: 'finance.view' },
      { href: '/dashboard/payroll', label: 'الرواتب', labelEn: 'Payroll', icon: Banknote, permission: 'payroll.manage' },
    ],
  },
  {
    title: 'الإدارة',
    titleEn: 'Admin',
    items: [
      { href: '/dashboard/settings', label: 'الإعدادات', labelEn: 'Settings', icon: Settings, permission: 'settings.view' },
      { href: '/dashboard/users', label: 'المستخدمون', labelEn: 'Users', icon: Users, permission: 'users.view' },
      { href: '/dashboard/teams', label: 'الفرق', labelEn: 'Teams', icon: Building2, permission: 'teams.view' },
      { href: '/dashboard/roles', label: 'الأدوار', labelEn: 'Roles', icon: Shield, permission: 'roles.view' },
      { href: '/dashboard/permissions', label: 'الصلاحيات', labelEn: 'Permissions', icon: KeyRound, permission: 'users.manage' },
      { href: '/dashboard/reports', label: 'التقارير', labelEn: 'Reports', icon: BarChart3, permission: 'reports.view' },
      { href: '/dashboard/automations', label: 'الأتمتة', labelEn: 'Automations', icon: Zap, permission: 'automations.view' },
      { href: '/dashboard/knowledge-base', label: 'قاعدة المعرفة', labelEn: 'Knowledge Base', icon: BookOpen, permission: 'knowledge_base.view' },
      { href: '/dashboard/integrations', label: 'التكاملات', labelEn: 'Integrations', icon: Webhook, permission: 'integrations.view' },
      { href: '/dashboard/activity', label: 'سجل النشاط', labelEn: 'Activity', icon: Activity, permission: 'activity.view' },
      { href: '/dashboard/login-history', label: 'سجل الدخول', labelEn: 'Login History', icon: KeyRound, permission: 'sessions.view' },
      { href: '/dashboard/sessions', label: 'الجلسات', labelEn: 'Sessions', icon: Monitor, permission: 'sessions.view' },
    ],
  },
];

// ═══════════════════════════════════════════════
//  localStorage helpers
// ═══════════════════════════════════════════════
const STORAGE_KEY = 'pyra-sidebar-collapsed-groups';
const FAVORITES_KEY = 'pyra-sidebar-favorites';

// Old group names from the 8-group layout
const OLD_GROUP_NAMES = ['General', 'Personal', 'File Management', 'Workflow', 'Team', 'System'];
const NEW_GROUP_NAMES = navGroups.map(g => g.titleEn);

function loadCollapsedGroups(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Set();
    const parsed: string[] = JSON.parse(stored);
    // Migrate: if any old-only group name found, clear and return empty
    const hasOldNames = parsed.some(n => OLD_GROUP_NAMES.includes(n));
    if (hasOldNames) {
      localStorage.removeItem(STORAGE_KEY);
      return new Set();
    }
    // Only keep valid new group names
    return new Set(parsed.filter(n => NEW_GROUP_NAMES.includes(n)));
  } catch { return new Set(); }
}

function saveCollapsedGroups(groups: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...groups])); } catch {}
}

function loadFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveFavorites(favs: string[]) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs)); } catch {}
}

// All nav items flat — used for favorite pins lookup
const ALL_NAV_ITEMS: NavItem[] = navGroups.flatMap(g => g.items);

// ═══════════════════════════════════════════════
//  Sidebar Component
// ═══════════════════════════════════════════════
export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<string[]>([]);
  const userPerms = user.rolePermissions ?? (user.role === 'admin' ? ['*'] : ['dashboard.view']);
  const badges = useSidebarBadges();

  // Load state from localStorage on mount
  useEffect(() => {
    setCollapsedGroups(loadCollapsedGroups());
    setFavorites(loadFavorites());
  }, []);

  // Auto-expand the group containing the active page
  useEffect(() => {
    const activeGroup = navGroups.find(g =>
      g.items.some(item =>
        pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
      )
    );
    if (activeGroup && collapsedGroups.has(activeGroup.titleEn)) {
      setCollapsedGroups(prev => {
        const next = new Set(prev);
        next.delete(activeGroup.titleEn);
        saveCollapsedGroups(next);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      saveCollapsedGroups(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((href: string) => {
    setFavorites(prev => {
      const next = prev.includes(href)
        ? prev.filter(f => f !== href)
        : [...prev, href];
      saveFavorites(next);
      return next;
    });
  }, []);

  // Compute favorite items (only those the user has permission for)
  const favoriteItems = favorites
    .map(href => ALL_NAV_ITEMS.find(n => n.href === href))
    .filter((item): item is NavItem =>
      !!item && (!item.permission || hasPermission(userPerms, item.permission))
    );

  const getBadgeCount = (item: NavItem): number => {
    if (!item.badgeKey) return 0;
    return badges[item.badgeKey] ?? 0;
  };

  // ── Render a single nav item ──
  const renderNavItem = (item: NavItem, showFavToggle: boolean) => {
    const isActive = pathname === item.href ||
      (item.href !== '/dashboard' && pathname.startsWith(item.href));
    const Icon = item.icon;
    const guideDesc = MODULE_GUIDES[item.href]?.description;
    const badgeCount = getBadgeCount(item);
    const isFav = favorites.includes(item.href);

    const link = (
      <Link
        href={item.href}
        className={cn(
          'group/item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative',
          collapsed && 'justify-center px-2',
          isActive
            ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
        )}
      >
        <span className="relative shrink-0">
          <Icon className={cn('h-5 w-5', isActive && 'text-orange-500')} />
          {/* Badge dot when sidebar is collapsed */}
          {collapsed && badgeCount > 0 && (
            <span className="absolute -top-1 -end-1 w-2 h-2 rounded-full bg-orange-500" />
          )}
        </span>

        {!collapsed && (
          <>
            <span className="truncate">{item.label}</span>

            {/* Badge count */}
            {badgeCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 ms-auto shrink-0">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}

            {/* Active dot (only if no badge) */}
            {isActive && badgeCount === 0 && (
              <div className="ms-auto w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
            )}

            {/* Favorite toggle (visible on hover, not on collapsed) */}
            {showFavToggle && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFavorite(item.href);
                }}
                className={cn(
                  'absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded transition-opacity',
                  isFav
                    ? 'opacity-60 hover:opacity-100 text-orange-500'
                    : 'opacity-0 group-hover/item:opacity-60 hover:!opacity-100 text-muted-foreground'
                )}
                aria-label={isFav ? 'إزالة من المثبّتات' : 'تثبيت'}
              >
                {isFav ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </button>
            )}
          </>
        )}
      </Link>
    );

    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>
          {link}
        </TooltipTrigger>
        <TooltipContent
          side="left"
          className="max-w-[220px] text-right"
        >
          {collapsed && <p className="font-semibold text-xs">{item.label}</p>}
          {guideDesc && (
            <p className={cn(
              'text-[11px] leading-relaxed',
              collapsed ? 'text-muted-foreground mt-0.5' : 'font-medium'
            )}>
              {guideDesc}
            </p>
          )}
          {collapsed && badgeCount > 0 && (
            <p className="text-[10px] text-orange-500 mt-0.5 font-medium">
              {badgeCount} جديد
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        aria-label="القائمة الجانبية الرئيسية"
        className={cn(
          'fixed inset-y-0 start-0 z-40 flex flex-col border-e bg-sidebar transition-all duration-300 hidden lg:flex',
          collapsed ? 'w-[72px]' : 'w-[280px]'
        )}
      >
        {/* Logo */}
        <div className={cn(
          'flex items-center h-16 border-b px-4',
          collapsed ? 'justify-center' : 'gap-3'
        )}>
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
            P
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-sm truncate">PYRAMEDIA X</span>
              <span className="text-[10px] text-muted-foreground truncate">FOR AI SOLUTIONS</span>
            </div>
          )}
        </div>

        {/* Navigation */}
        <ScrollArea className="flex-1 py-2">
          <nav className="px-3">
            {/* ── Pinned Favorites Section ── */}
            {favoriteItems.length > 0 && (
              <div className="mb-3">
                {!collapsed && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-orange-500/80 uppercase tracking-wider">
                    <Pin className="h-3 w-3" />
                    <span>المثبّتات</span>
                  </div>
                )}
                {collapsed && <div className="my-1 mx-2 border-t border-orange-500/30" />}
                <div className="space-y-0.5">
                  {favoriteItems.map(item => renderNavItem(item, true))}
                </div>
              </div>
            )}

            {/* ── Nav Groups ── */}
            {navGroups.map((group) => {
              const visibleItems = group.items.filter(item => !item.permission || hasPermission(userPerms, item.permission));
              if (visibleItems.length === 0) return null;

              const isGroupCollapsed = collapsedGroups.has(group.titleEn);

              return (
                <div key={group.titleEn} className="mb-3">
                  {!collapsed && (
                    <button
                      onClick={() => toggleGroup(group.titleEn)}
                      className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider hover:text-muted-foreground transition-colors group/section"
                    >
                      <span>{group.title}</span>
                      <ChevronDown className={cn(
                        'h-3 w-3 opacity-0 group-hover/section:opacity-100 transition-all duration-200',
                        isGroupCollapsed && '-rotate-90'
                      )} />
                    </button>
                  )}
                  {collapsed && <div className="my-1 mx-2 border-t border-border/40" />}
                  <div
                    className={cn(
                      'space-y-0.5 overflow-hidden transition-all duration-200',
                      !collapsed && isGroupCollapsed && 'max-h-0 opacity-0',
                      (!collapsed && !isGroupCollapsed) && 'max-h-[800px] opacity-100',
                      collapsed && 'max-h-[800px] opacity-100'
                    )}
                  >
                    {visibleItems.map(item => renderNavItem(item, true))}
                  </div>
                </div>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Guide + Collapse Toggle */}
        <div className="border-t p-3 space-y-1">
          {/* Quick Guide Access */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard/guide"
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400 transition-colors',
                  collapsed && 'justify-center px-2',
                  pathname === '/dashboard/guide' && 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                )}
              >
                <HelpCircle className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="text-xs">دليل الاستخدام</span>}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="left" className="font-medium text-xs">
              {collapsed ? 'دليل الاستخدام' : 'شرح جميع وحدات النظام ونصائح الاستخدام'}
            </TooltipContent>
          </Tooltip>

          <Button
            variant="ghost"
            size="sm"
            className={cn('w-full', collapsed && 'px-2')}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? 'توسيع القائمة' : 'طي القائمة'}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span className="ms-2">طي القائمة</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
