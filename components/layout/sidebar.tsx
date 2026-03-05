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
  AlertTriangle,
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
}

interface NavGroup {
  title: string;
  titleEn: string;
  items: NavItem[];
}

const navGroups: NavGroup[] = [
  {
    title: 'عام',
    titleEn: 'General',
    items: [
      { href: '/dashboard', label: 'الرئيسية', labelEn: 'Dashboard', icon: LayoutDashboard },
      { href: '/dashboard/notifications', label: 'الإشعارات', labelEn: 'Notifications', icon: Bell, permission: 'notifications.view' },
    ],
  },
  {
    title: 'شخصي',
    titleEn: 'Personal',
    items: [
      { href: '/dashboard/profile', label: 'ملفي الشخصي', labelEn: 'My Profile', icon: UserCircle },
      { href: '/dashboard/my-tasks', label: 'مهامي', labelEn: 'My Tasks', icon: CheckSquare },
      { href: '/dashboard/timesheet', label: 'ساعات العمل', labelEn: 'Timesheet', icon: Clock, permission: 'timesheet.view' },
    ],
  },
  {
    title: 'إدارة الملفات',
    titleEn: 'File Management',
    items: [
      { href: '/dashboard/files', label: 'الملفات', labelEn: 'Files', icon: FolderOpen, permission: 'files.view' },
      { href: '/dashboard/favorites', label: 'المفضلة', labelEn: 'Favorites', icon: Star, permission: 'favorites.view' },
      { href: '/dashboard/reviews', label: 'المراجعات', labelEn: 'Reviews', icon: MessageSquare, permission: 'reviews.view' },
      { href: '/dashboard/trash', label: 'المحذوفات', labelEn: 'Trash', icon: Trash2, permission: 'trash.view' },
      { href: '/dashboard/storage', label: 'التخزين', labelEn: 'Storage', icon: HardDrive, permission: 'files.view' },
    ],
  },
  {
    title: 'العمل',
    titleEn: 'Work',
    items: [
      { href: '/dashboard/projects', label: 'المشاريع', labelEn: 'Projects', icon: Briefcase, permission: 'projects.view' },
      { href: '/dashboard/quotes', label: 'عروض الأسعار', labelEn: 'Quotes', icon: FileText, permission: 'quotes.view' },
      { href: '/dashboard/invoices', label: 'الفواتير', labelEn: 'Invoices', icon: Receipt, permission: 'invoices.view' },
      { href: '/dashboard/clients', label: 'العملاء', labelEn: 'Clients', icon: Building2, permission: 'clients.view' },
      { href: '/dashboard/script-reviews', label: 'مراجعات السكريبتات', labelEn: 'Script Reviews', icon: ScrollText, permission: 'script_reviews.view' },
    ],
  },
  {
    title: 'سير العمل',
    titleEn: 'Workflow',
    items: [
      { href: '/dashboard/boards', label: 'لوحات العمل', labelEn: 'Boards', icon: Kanban, permission: 'boards.view' },
      { href: '/dashboard/announcements', label: 'الإعلانات', labelEn: 'Announcements', icon: Megaphone, permission: 'announcements.view' },
      { href: '/dashboard/directory', label: 'دليل الفريق', labelEn: 'Directory', icon: Contact, permission: 'directory.view' },
      { href: '/dashboard/leave', label: 'الإجازات', labelEn: 'Leave', icon: CalendarOff, permission: 'leave.view' },
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
    ],
  },
  {
    title: 'الفريق',
    titleEn: 'Team',
    items: [
      { href: '/dashboard/teams', label: 'الفرق', labelEn: 'Teams', icon: Building2, permission: 'teams.view' },
      { href: '/dashboard/users', label: 'المستخدمون', labelEn: 'Users', icon: Users, permission: 'users.view' },
      { href: '/dashboard/roles', label: 'الأدوار', labelEn: 'Roles', icon: Shield, permission: 'roles.view' },
      { href: '/dashboard/permissions', label: 'الصلاحيات', labelEn: 'Permissions', icon: KeyRound, permission: 'users.manage' },
    ],
  },
  {
    title: 'النظام',
    titleEn: 'System',
    items: [
      { href: '/dashboard/reports', label: 'التقارير', labelEn: 'Reports', icon: BarChart3, permission: 'reports.view' },
      { href: '/dashboard/automations', label: 'الأتمتة', labelEn: 'Automations', icon: Zap, permission: 'automations.view' },
      { href: '/dashboard/knowledge-base', label: 'قاعدة المعرفة', labelEn: 'Knowledge Base', icon: BookOpen, permission: 'knowledge_base.view' },
      { href: '/dashboard/integrations', label: 'التكاملات', labelEn: 'Integrations', icon: Webhook, permission: 'integrations.view' },
      { href: '/dashboard/activity', label: 'سجل النشاط', labelEn: 'Activity', icon: Activity, permission: 'activity.view' },
      { href: '/dashboard/login-history', label: 'سجل الدخول', labelEn: 'Login History', icon: KeyRound, permission: 'sessions.view' },
      { href: '/dashboard/sessions', label: 'الجلسات', labelEn: 'Sessions', icon: Monitor, permission: 'sessions.view' },
      { href: '/dashboard/settings', label: 'الإعدادات', labelEn: 'Settings', icon: Settings, permission: 'settings.view' },
    ],
  },
];

const STORAGE_KEY = 'pyra-sidebar-collapsed-groups';

function loadCollapsedGroups(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? new Set(JSON.parse(stored)) : new Set();
  } catch { return new Set(); }
}

function saveCollapsedGroups(groups: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...groups])); } catch {}
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const userPerms = user.rolePermissions ?? (user.role === 'admin' ? ['*'] : ['dashboard.view']);

  // Load collapsed groups from localStorage on mount
  useEffect(() => {
    setCollapsedGroups(loadCollapsedGroups());
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
                      (!collapsed && !isGroupCollapsed) && 'max-h-[500px] opacity-100',
                      collapsed && 'max-h-[500px] opacity-100'
                    )}
                  >
                    {visibleItems.map((item) => {
                      const isActive = pathname === item.href ||
                        (item.href !== '/dashboard' && pathname.startsWith(item.href));
                      const Icon = item.icon;
                      const guideDesc = MODULE_GUIDES[item.href]?.description;

                      const link = (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                            collapsed && 'justify-center px-2',
                            isActive
                              ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                              : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                          )}
                        >
                          <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-orange-500')} />
                          {!collapsed && <span className="truncate">{item.label}</span>}
                          {isActive && !collapsed && (
                            <div className="ms-auto w-1.5 h-1.5 rounded-full bg-orange-500" />
                          )}
                        </Link>
                      );

                      // Always show tooltip (collapsed = label + desc, expanded = desc only)
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
                          </TooltipContent>
                        </Tooltip>
                      );
                    })}
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
