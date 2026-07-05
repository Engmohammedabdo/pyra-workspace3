'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations, useLocale } from 'next-intl';
import type navMessages from '@/messages/ar/nav.json';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
} from '@/components/ui/command';
import {
  LayoutDashboard,
  Users,
  FolderKanban,
  FileText,
  Bell,
  Activity,
  Settings,
  Shield,
  Trash2,
  Star,
  UsersRound,
  Search,
  HardDrive,
  Wallet,
  ArrowDownCircle,
  CreditCard,
  FileSignature,
  Repeat,
  PieChart,
  Target,
  AlertTriangle,
  Plus,
  UserPlus,
  FolderPlus,
  Receipt,
  Clock,
  Timer,
  CalendarOff,
  Banknote,
  Award,
  Contact,
  Megaphone,
  Network,
  Zap,
  BookOpen,
  Webhook,
  Monitor,
  KeyRound,
  Kanban,
  ScrollText,
  Clapperboard,
  FolderOpen,
  MessageSquare,
  BarChart3,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

// Deriving key unions from the AR catalog makes t(`items.${item.key}`) /
// t(`actions.${item.key}`) type-check against next-intl's typed keys.
type PaletteItemKey = keyof typeof navMessages.nav.palette.items;
type PaletteActionKey = keyof typeof navMessages.nav.palette.actions;

// ---- Quick Actions ----
// i18n-exempt: this array's `keywords` values contain Arabic by design (bilingual search data, not UI labels)
const QUICK_ACTIONS: { key: PaletteActionKey; path: string; icon: React.ComponentType<{ className?: string }>; keywords: string }[] = [
  { key: 'newInvoice', path: '/dashboard/invoices/new', icon: Plus, keywords: 'new invoice فاتورة جديدة إنشاء' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'newQuote', path: '/dashboard/quotes/new', icon: Plus, keywords: 'new quote عرض سعر جديد إنشاء' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'newClient', path: '/dashboard/clients?action=new', icon: UserPlus, keywords: 'new client عميل جديد إضافة' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'newProject', path: '/dashboard/projects?action=new', icon: FolderPlus, keywords: 'new project مشروع جديد إنشاء' }, // i18n-exempt: search keywords contain Arabic by design
];

// ---- Categorized Navigation ----
interface NavItem {
  key: PaletteItemKey;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string;
}

// i18n-exempt: this array's `keywords` values contain Arabic by design (bilingual search data, not UI labels)
const WORK_ITEMS: NavItem[] = [
  { key: 'dashboard', path: '/dashboard', icon: LayoutDashboard, keywords: 'dashboard home الرئيسية لوحة التحكم' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'projects', path: '/dashboard/projects', icon: FolderKanban, keywords: 'projects مشاريع المشاريع' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'clients', path: '/dashboard/clients', icon: Users, keywords: 'clients عملاء العملاء' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'quotes', path: '/dashboard/quotes', icon: FileText, keywords: 'quotes عروض اسعار عروض الأسعار' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'invoices', path: '/dashboard/invoices', icon: Receipt, keywords: 'invoices فواتير الفواتير' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'boards', path: '/dashboard/boards', icon: Kanban, keywords: 'boards بوردات لوحات مهام لوحات العمل' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'scripts', path: '/dashboard/script-reviews', icon: ScrollText, keywords: 'scripts سكريبتات مراجعات السكريبتات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'contentPipeline', path: '/dashboard/content-pipeline', icon: Clapperboard, keywords: 'content pipeline إنتاج محتوى خط الإنتاج' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'files', path: '/dashboard/files', icon: FolderOpen, keywords: 'files ملفات الملفات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'favorites', path: '/dashboard/favorites', icon: Star, keywords: 'favorites مفضلة المفضلة' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'reviews', path: '/dashboard/reviews', icon: MessageSquare, keywords: 'reviews تقييمات مراجعات المراجعات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'trash', path: '/dashboard/trash', icon: Trash2, keywords: 'trash محذوفات سلة سلة المحذوفات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'storage', path: '/dashboard/storage', icon: HardDrive, keywords: 'storage تخزين مساحة التخزين' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'notifications', path: '/dashboard/notifications', icon: Bell, keywords: 'notifications إشعارات الإشعارات' }, // i18n-exempt: search keywords contain Arabic by design
];

// i18n-exempt: this array's `keywords` values contain Arabic by design (bilingual search data, not UI labels)
const HR_ITEMS: NavItem[] = [
  { key: 'attendance', path: '/dashboard/attendance', icon: Timer, keywords: 'attendance حضور انصراف الحضور والانصراف' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'leave', path: '/dashboard/leave', icon: CalendarOff, keywords: 'leave إجازات إجازة الإجازات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'payroll', path: '/dashboard/payroll', icon: Banknote, keywords: 'payroll رواتب راتب الرواتب' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'myPayslip', path: '/dashboard/my-payslips', icon: Receipt, keywords: 'payslips كشف راتب كشف راتبي' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'timesheet', path: '/dashboard/timesheet', icon: Clock, keywords: 'timesheet ساعات عمل جدول ساعات العمل' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'evaluations', path: '/dashboard/evaluations', icon: Award, keywords: 'evaluations performance تقييم أداء تقييم الأداء' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'directory', path: '/dashboard/directory', icon: Contact, keywords: 'directory team دليل فريق موظفين دليل الفريق' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'announcements', path: '/dashboard/announcements', icon: Megaphone, keywords: 'announcements إعلانات الإعلانات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'orgChart', path: '/dashboard/org-chart', icon: Network, keywords: 'org chart هيكل تنظيمي الهيكل التنظيمي' }, // i18n-exempt: search keywords contain Arabic by design
];

// i18n-exempt: this array's `keywords` values contain Arabic by design (bilingual search data, not UI labels)
const FINANCE_ITEMS: NavItem[] = [
  { key: 'financeHome', path: '/dashboard/finance', icon: Wallet, keywords: 'finance مالية إدارة محاسبة الإدارة المالية' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'expenses', path: '/dashboard/finance/expenses', icon: ArrowDownCircle, keywords: 'expenses مصاريف نفقات المصاريف' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'cards', path: '/dashboard/finance/cards', icon: CreditCard, keywords: 'cards بطاقات البطاقات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'contracts', path: '/dashboard/finance/contracts', icon: FileSignature, keywords: 'contracts عقود العقود' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'recurring', path: '/dashboard/finance/recurring', icon: Repeat, keywords: 'recurring invoices فواتير متكررة الفواتير المتكررة' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'financeReports', path: '/dashboard/finance/reports', icon: PieChart, keywords: 'reports تقارير مالية أرباح خسائر التقارير المالية' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'revenueTargets', path: '/dashboard/finance/targets', icon: Target, keywords: 'revenue targets أهداف إيرادات أهداف الإيرادات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'financeAlerts', path: '/dashboard/finance', icon: AlertTriangle, keywords: 'alerts finance alerts تنبيهات مالية التنبيهات المالية' }, // i18n-exempt: search keywords contain Arabic by design
];

// i18n-exempt: this array's `keywords` values contain Arabic by design (bilingual search data, not UI labels)
const ADMIN_ITEMS: NavItem[] = [
  { key: 'settings', path: '/dashboard/settings', icon: Settings, keywords: 'settings إعدادات الإعدادات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'users', path: '/dashboard/users', icon: Users, keywords: 'users مستخدمون المستخدمون' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'teams', path: '/dashboard/teams', icon: UsersRound, keywords: 'teams فرق فريق الفرق' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'roles', path: '/dashboard/roles', icon: Shield, keywords: 'roles أدوار الأدوار' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'permissions', path: '/dashboard/permissions', icon: KeyRound, keywords: 'permissions صلاحيات الصلاحيات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'automations', path: '/dashboard/automations', icon: Zap, keywords: 'automations أتمتة الأتمتة' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'knowledgeBase', path: '/dashboard/knowledge-base', icon: BookOpen, keywords: 'knowledge base قاعدة معرفة قاعدة المعرفة' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'integrations', path: '/dashboard/integrations', icon: Webhook, keywords: 'integrations تكاملات التكاملات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'activityLog', path: '/dashboard/activity', icon: Activity, keywords: 'activity log نشاط سجل سجل النشاط' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'loginHistory', path: '/dashboard/login-history', icon: KeyRound, keywords: 'login history سجل دخول سجل الدخول' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'sessions', path: '/dashboard/sessions', icon: Monitor, keywords: 'sessions جلسات الجلسات' }, // i18n-exempt: search keywords contain Arabic by design
  { key: 'reports', path: '/dashboard/reports', icon: BarChart3, keywords: 'reports تقارير التقارير' }, // i18n-exempt: search keywords contain Arabic by design
];

// ---- Recent Pages (localStorage) ----
// Locale-safe: stores { path } only — the label is resolved at RENDER time
// via the catalog (t(`items.${key}`)) so a locale switch never leaves a
// stale-language recent entry. Legacy entries (pre-i18n) may still carry a
// stored `label` — kept as a fallback for old localStorage data.
const RECENT_KEY = 'pyra-recent-pages';
const MAX_RECENT = 5;

interface RecentPage {
  path: string;
  label?: string; // legacy field — pre-i18n entries only
  timestamp: number;
}

function getRecentPages(): RecentPage[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}

function addRecentPage(path: string) {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentPages().filter(r => r.path !== path);
    recent.unshift({ path, timestamp: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

// All items flat for finding icons + resolving recents labels
const ALL_ITEMS: NavItem[] = [...WORK_ITEMS, ...HR_ITEMS, ...FINANCE_ITEMS, ...ADMIN_ITEMS];

// ---- Component ----
interface CommandPaletteProps {
  trigger?: React.ReactNode;
}

export function CommandPalette({ trigger }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);
  const router = useRouter();
  const t = useTranslations('nav.palette');
  const locale = useLocale();

  // Load recent pages when dialog opens
  useEffect(() => {
    if (open) {
      setRecentPages(getRecentPages());
    }
  }, [open]);

  // Ctrl+K / Cmd+K shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleSelect = useCallback(
    (path: string) => {
      addRecentPage(path);
      setOpen(false);
      router.push(path);
    },
    [router]
  );

  // Resolve a recent page's label: current catalog first (locale-safe),
  // then the legacy stored label (pre-i18n entries), then the raw path.
  const resolveRecentLabel = useCallback(
    (r: RecentPage): string => {
      const navItem = ALL_ITEMS.find((n) => n.path === r.path);
      if (navItem) return t(`items.${navItem.key}`);
      return r.label ?? r.path;
    },
    [t]
  );

  return (
    <>
      {/* Optional trigger button */}
      {trigger && (
        <div onClick={() => setOpen(true)} className="cursor-pointer">
          {trigger}
        </div>
      )}

      {/* Mobile search icon */}
      <Button variant="ghost" size="icon" className="sm:hidden h-9 w-9" onClick={() => setOpen(true)} aria-label={t('searchAria')}>
        <Search className="h-4 w-4" />
      </Button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder={t('placeholder')} dir={locale === 'ar' ? 'rtl' : 'ltr'} />
        <CommandList>
          <CommandEmpty>{t('noResults')}</CommandEmpty>

          {/* Quick Actions */}
          <CommandGroup heading={t('quickActions')}>
            {QUICK_ACTIONS.map((item) => {
              const label = t(`actions.${item.key}`);
              return (
                <CommandItem
                  key={item.path}
                  value={`${label} ${item.keywords}`}
                  onSelect={() => handleSelect(item.path)}
                  className="gap-2"
                >
                  <item.icon className="h-4 w-4 text-orange-500" />
                  <span>{label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          {/* Recent Pages */}
          {recentPages.length > 0 && (
            <>
              <CommandGroup heading={t('recent')}>
                {recentPages.map((r) => {
                  const navItem = ALL_ITEMS.find(n => n.path === r.path);
                  const Icon = navItem?.icon || Clock;
                  const label = resolveRecentLabel(r);
                  return (
                    <CommandItem
                      key={r.path}
                      value={`${label} recent أخيرة`} // i18n-exempt: search keywords contain Arabic by design
                      onSelect={() => handleSelect(r.path)}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{label}</span>
                      <Clock className="h-3 w-3 text-muted-foreground/40 ms-auto" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {/* Work */}
          <CommandGroup heading={t('groupWork')}>
            {WORK_ITEMS.map((item) => {
              const label = t(`items.${item.key}`);
              return (
                <CommandItem
                  key={item.path}
                  value={`${label} ${item.keywords}`}
                  onSelect={() => handleSelect(item.path)}
                  className="gap-2"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          {/* HR */}
          <CommandGroup heading={t('groupHr')}>
            {HR_ITEMS.map((item) => {
              const label = t(`items.${item.key}`);
              return (
                <CommandItem
                  key={item.path}
                  value={`${label} ${item.keywords}`}
                  onSelect={() => handleSelect(item.path)}
                  className="gap-2"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          {/* Finance */}
          <CommandGroup heading={t('groupFinance')}>
            {FINANCE_ITEMS.map((item) => {
              const label = t(`items.${item.key}`);
              return (
                <CommandItem
                  key={item.path}
                  value={`${label} ${item.keywords}`}
                  onSelect={() => handleSelect(item.path)}
                  className="gap-2"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>

          {/* Admin */}
          <CommandGroup heading={t('groupAdmin')}>
            {ADMIN_ITEMS.map((item) => {
              const label = t(`items.${item.key}`);
              return (
                <CommandItem
                  key={item.path}
                  value={`${label} ${item.keywords}`}
                  onSelect={() => handleSelect(item.path)}
                  className="gap-2"
                >
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                  <span>{label}</span>
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

// Export SearchTrigger for use in topbar
export function SearchTrigger({ onClick }: { onClick: () => void }) {
  const t = useTranslations('nav.palette');
  return (
    <button
      onClick={onClick}
      className="hidden sm:flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
    >
      <Search className="h-3.5 w-3.5" />
      <span>{t('searchButton')}</span>
      <kbd className="pointer-events-none ms-4 hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">Ctrl</span>K
      </kbd>
    </button>
  );
}
