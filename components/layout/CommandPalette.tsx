'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  RefreshCw,
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

// ---- Quick Actions ----
const QUICK_ACTIONS = [
  { label: 'فاتورة جديدة', path: '/dashboard/invoices/new', icon: Plus, keywords: 'new invoice فاتورة جديدة إنشاء' },
  { label: 'عرض سعر جديد', path: '/dashboard/quotes/new', icon: Plus, keywords: 'new quote عرض سعر جديد إنشاء' },
  { label: 'عميل جديد', path: '/dashboard/clients?action=new', icon: UserPlus, keywords: 'new client عميل جديد إضافة' },
  { label: 'مشروع جديد', path: '/dashboard/projects?action=new', icon: FolderPlus, keywords: 'new project مشروع جديد إنشاء' },
];

// ---- Categorized Navigation ----
interface NavItem {
  label: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords: string;
}

const WORK_ITEMS: NavItem[] = [
  { label: 'لوحة التحكم', path: '/dashboard', icon: LayoutDashboard, keywords: 'dashboard home الرئيسية' },
  { label: 'المشاريع', path: '/dashboard/projects', icon: FolderKanban, keywords: 'projects مشاريع' },
  { label: 'العملاء', path: '/dashboard/clients', icon: Users, keywords: 'clients عملاء' },
  { label: 'عروض الأسعار', path: '/dashboard/quotes', icon: FileText, keywords: 'quotes عروض اسعار' },
  { label: 'الفواتير', path: '/dashboard/invoices', icon: Receipt, keywords: 'invoices فواتير' },
  { label: 'لوحات العمل', path: '/dashboard/boards', icon: Kanban, keywords: 'boards بوردات لوحات مهام' },
  { label: 'السكريبتات', path: '/dashboard/script-reviews', icon: ScrollText, keywords: 'scripts سكريبتات مراجعات' },
  { label: 'خط الإنتاج', path: '/dashboard/content-pipeline', icon: Clapperboard, keywords: 'content pipeline إنتاج محتوى' },
  { label: 'الملفات', path: '/dashboard/files', icon: FolderOpen, keywords: 'files ملفات' },
  { label: 'المفضلة', path: '/dashboard/favorites', icon: Star, keywords: 'favorites مفضلة' },
  { label: 'المراجعات', path: '/dashboard/reviews', icon: MessageSquare, keywords: 'reviews تقييمات مراجعات' },
  { label: 'سلة المحذوفات', path: '/dashboard/trash', icon: Trash2, keywords: 'trash محذوفات سلة' },
  { label: 'التخزين', path: '/dashboard/storage', icon: HardDrive, keywords: 'storage تخزين مساحة' },
  { label: 'الإشعارات', path: '/dashboard/notifications', icon: Bell, keywords: 'notifications إشعارات' },
];

const HR_ITEMS: NavItem[] = [
  { label: 'الحضور والانصراف', path: '/dashboard/attendance', icon: Timer, keywords: 'attendance حضور انصراف' },
  { label: 'الإجازات', path: '/dashboard/leave', icon: CalendarOff, keywords: 'leave إجازات إجازة' },
  { label: 'الرواتب', path: '/dashboard/payroll', icon: Banknote, keywords: 'payroll رواتب راتب' },
  { label: 'كشف راتبي', path: '/dashboard/my-payslips', icon: Receipt, keywords: 'payslips كشف راتب' },
  { label: 'ساعات العمل', path: '/dashboard/timesheet', icon: Clock, keywords: 'timesheet ساعات عمل جدول' },
  { label: 'تقييم الأداء', path: '/dashboard/evaluations', icon: Award, keywords: 'evaluations تقييم أداء' },
  { label: 'دليل الفريق', path: '/dashboard/directory', icon: Contact, keywords: 'directory دليل فريق موظفين' },
  { label: 'الإعلانات', path: '/dashboard/announcements', icon: Megaphone, keywords: 'announcements إعلانات' },
  { label: 'الهيكل التنظيمي', path: '/dashboard/org-chart', icon: Network, keywords: 'org chart هيكل تنظيمي' },
];

const FINANCE_ITEMS: NavItem[] = [
  { label: 'الإدارة المالية', path: '/dashboard/finance', icon: Wallet, keywords: 'finance مالية إدارة محاسبة' },
  { label: 'المصاريف', path: '/dashboard/finance/expenses', icon: ArrowDownCircle, keywords: 'expenses مصاريف نفقات' },
  { label: 'الاشتراكات', path: '/dashboard/finance/subscriptions', icon: RefreshCw, keywords: 'subscriptions اشتراكات' },
  { label: 'البطاقات', path: '/dashboard/finance/cards', icon: CreditCard, keywords: 'cards بطاقات' },
  { label: 'العقود', path: '/dashboard/finance/contracts', icon: FileSignature, keywords: 'contracts عقود' },
  { label: 'الفواتير المتكررة', path: '/dashboard/finance/recurring', icon: Repeat, keywords: 'recurring invoices فواتير متكررة' },
  { label: 'التقارير المالية', path: '/dashboard/finance/reports', icon: PieChart, keywords: 'reports تقارير مالية أرباح خسائر' },
  { label: 'أهداف الإيرادات', path: '/dashboard/finance/targets', icon: Target, keywords: 'revenue targets أهداف إيرادات' },
  { label: 'التنبيهات المالية', path: '/dashboard/finance', icon: AlertTriangle, keywords: 'alerts تنبيهات مالية' },
];

const ADMIN_ITEMS: NavItem[] = [
  { label: 'الإعدادات', path: '/dashboard/settings', icon: Settings, keywords: 'settings إعدادات' },
  { label: 'المستخدمون', path: '/dashboard/users', icon: Users, keywords: 'users مستخدمون' },
  { label: 'الفرق', path: '/dashboard/teams', icon: UsersRound, keywords: 'teams فرق فريق' },
  { label: 'الأدوار', path: '/dashboard/roles', icon: Shield, keywords: 'roles أدوار' },
  { label: 'الصلاحيات', path: '/dashboard/permissions', icon: KeyRound, keywords: 'permissions صلاحيات' },
  { label: 'الأتمتة', path: '/dashboard/automations', icon: Zap, keywords: 'automations أتمتة' },
  { label: 'قاعدة المعرفة', path: '/dashboard/knowledge-base', icon: BookOpen, keywords: 'knowledge base قاعدة معرفة' },
  { label: 'التكاملات', path: '/dashboard/integrations', icon: Webhook, keywords: 'integrations تكاملات' },
  { label: 'سجل النشاط', path: '/dashboard/activity', icon: Activity, keywords: 'activity نشاط سجل' },
  { label: 'سجل الدخول', path: '/dashboard/login-history', icon: KeyRound, keywords: 'login history سجل دخول' },
  { label: 'الجلسات', path: '/dashboard/sessions', icon: Monitor, keywords: 'sessions جلسات' },
  { label: 'التقارير', path: '/dashboard/reports', icon: BarChart3, keywords: 'reports تقارير' },
];

// ---- Recent Pages (localStorage) ----
const RECENT_KEY = 'pyra-recent-pages';
const MAX_RECENT = 5;

interface RecentPage {
  path: string;
  label: string;
  timestamp: number;
}

function getRecentPages(): RecentPage[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch { return []; }
}

function addRecentPage(path: string, label: string) {
  if (typeof window === 'undefined') return;
  try {
    const recent = getRecentPages().filter(r => r.path !== path);
    recent.unshift({ path, label, timestamp: Date.now() });
    localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, MAX_RECENT)));
  } catch { /* ignore */ }
}

// All items flat for finding icons
const ALL_ITEMS: NavItem[] = [...WORK_ITEMS, ...HR_ITEMS, ...FINANCE_ITEMS, ...ADMIN_ITEMS];

// ---- Component ----
interface CommandPaletteProps {
  trigger?: React.ReactNode;
}

export function CommandPalette({ trigger }: CommandPaletteProps) {
  const [open, setOpen] = useState(false);
  const [recentPages, setRecentPages] = useState<RecentPage[]>([]);
  const router = useRouter();

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
    (path: string, label: string) => {
      addRecentPage(path, label);
      setOpen(false);
      router.push(path);
    },
    [router]
  );

  return (
    <>
      {/* Optional trigger button */}
      {trigger && (
        <div onClick={() => setOpen(true)} className="cursor-pointer">
          {trigger}
        </div>
      )}

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="ابحث عن صفحة أو إجراء..." dir="rtl" />
        <CommandList>
          <CommandEmpty>لا توجد نتائج</CommandEmpty>

          {/* Quick Actions */}
          <CommandGroup heading="إجراءات سريعة">
            {QUICK_ACTIONS.map((item) => (
              <CommandItem
                key={item.path}
                value={`${item.label} ${item.keywords}`}
                onSelect={() => handleSelect(item.path, item.label)}
                className="gap-2"
              >
                <item.icon className="h-4 w-4 text-orange-500" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          <CommandSeparator />

          {/* Recent Pages */}
          {recentPages.length > 0 && (
            <>
              <CommandGroup heading="تمت زيارتها مؤخراً">
                {recentPages.map((r) => {
                  const navItem = ALL_ITEMS.find(n => n.path === r.path);
                  const Icon = navItem?.icon || Clock;
                  return (
                    <CommandItem
                      key={r.path}
                      value={`${r.label} recent أخيرة`}
                      onSelect={() => handleSelect(r.path, r.label)}
                      className="gap-2"
                    >
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <span>{r.label}</span>
                      <Clock className="h-3 w-3 text-muted-foreground/40 ms-auto" />
                    </CommandItem>
                  );
                })}
              </CommandGroup>
              <CommandSeparator />
            </>
          )}

          {/* Work */}
          <CommandGroup heading="العمل">
            {WORK_ITEMS.map((item) => (
              <CommandItem
                key={item.path}
                value={`${item.label} ${item.keywords}`}
                onSelect={() => handleSelect(item.path, item.label)}
                className="gap-2"
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {/* HR */}
          <CommandGroup heading="الموارد البشرية">
            {HR_ITEMS.map((item) => (
              <CommandItem
                key={item.path}
                value={`${item.label} ${item.keywords}`}
                onSelect={() => handleSelect(item.path, item.label)}
                className="gap-2"
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {/* Finance */}
          <CommandGroup heading="المالية">
            {FINANCE_ITEMS.map((item) => (
              <CommandItem
                key={item.path}
                value={`${item.label} ${item.keywords}`}
                onSelect={() => handleSelect(item.path, item.label)}
                className="gap-2"
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>

          {/* Admin */}
          <CommandGroup heading="الإدارة">
            {ADMIN_ITEMS.map((item) => (
              <CommandItem
                key={item.path}
                value={`${item.label} ${item.keywords}`}
                onSelect={() => handleSelect(item.path, item.label)}
                className="gap-2"
              >
                <item.icon className="h-4 w-4 text-muted-foreground" />
                <span>{item.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

// Export SearchTrigger for use in topbar
export function SearchTrigger({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="hidden sm:flex items-center gap-2 rounded-md border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted"
    >
      <Search className="h-3.5 w-3.5" />
      <span>بحث...</span>
      <kbd className="pointer-events-none ms-4 hidden select-none items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium opacity-100 sm:flex">
        <span className="text-xs">Ctrl</span>K
      </kbd>
    </button>
  );
}
