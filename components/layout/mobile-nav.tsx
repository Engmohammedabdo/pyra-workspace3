'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Menu,
  LayoutDashboard,
  FolderOpen,
  Users,
  Building2,
  FileText,
  Activity,
  Trash2,
  Settings,
  Bell,
  Shield,
  Briefcase,
  UserCircle,
  Star,
  CheckSquare,
  History,
  Monitor,
  Wallet,
  ArrowDownCircle,
  RefreshCw,
  CreditCard,
  FileSignature,
  Repeat,
  PieChart,
  Target,
  HelpCircle,
} from 'lucide-react';
import { hasPermission } from '@/lib/auth/rbac';
import { MODULE_GUIDES } from '@/lib/config/module-guide';

interface MobileNavProps {
  user: {
    username: string;
    role: string;
    display_name: string;
    rolePermissions?: string[];
  };
}

const navItems = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { href: '/dashboard/files', label: 'الملفات', icon: FolderOpen, permission: 'files.view' },
  { href: '/dashboard/projects', label: 'المشاريع', icon: Briefcase, permission: 'projects.view' },
  { href: '/dashboard/clients', label: 'العملاء', icon: Building2, permission: 'clients.view' },
  { href: '/dashboard/users', label: 'المستخدمون', icon: Users, permission: 'users.view' },
  { href: '/dashboard/teams', label: 'الفرق', icon: Building2, permission: 'teams.view' },
  { href: '/dashboard/roles', label: 'الأدوار', icon: Shield, permission: 'roles.view' },
  { href: '/dashboard/quotes', label: 'عروض الأسعار', icon: FileText, permission: 'quotes.view' },
  { href: '/dashboard/invoices', label: 'الفواتير', icon: FileText, permission: 'invoices.view' },
  { href: '/dashboard/reviews', label: 'المراجعات', icon: CheckSquare, permission: 'reviews.view' },
  { href: '/dashboard/favorites', label: 'المفضلة', icon: Star, permission: 'favorites.view' },
  { href: '/dashboard/notifications', label: 'الإشعارات', icon: Bell, permission: 'notifications.view' },
  { href: '/dashboard/finance', label: 'الإدارة المالية', icon: Wallet, permission: 'finance.view' },
  { href: '/dashboard/finance/expenses', label: 'المصاريف', icon: ArrowDownCircle, permission: 'finance.view' },
  { href: '/dashboard/finance/subscriptions', label: 'الاشتراكات', icon: RefreshCw, permission: 'finance.view' },
  { href: '/dashboard/finance/cards', label: 'البطاقات', icon: CreditCard, permission: 'finance.view' },
  { href: '/dashboard/finance/contracts', label: 'العقود', icon: FileSignature, permission: 'finance.view' },
  { href: '/dashboard/finance/recurring', label: 'الفواتير المتكررة', icon: Repeat, permission: 'finance.view' },
  { href: '/dashboard/finance/reports', label: 'التقارير المالية', icon: PieChart, permission: 'finance.view' },
  { href: '/dashboard/finance/targets', label: 'أهداف الإيرادات', icon: Target, permission: 'finance.view' },
  { href: '/dashboard/activity', label: 'النشاط', icon: Activity, permission: 'activity.view' },
  { href: '/dashboard/trash', label: 'المحذوفات', icon: Trash2, permission: 'trash.view' },
  { href: '/dashboard/login-history', label: 'سجل الدخول', icon: History, permission: 'sessions.view' },
  { href: '/dashboard/sessions', label: 'الجلسات', icon: Monitor, permission: 'sessions.view' },
  { href: '/dashboard/profile', label: 'الملف الشخصي', icon: UserCircle },
  { href: '/dashboard/settings', label: 'الإعدادات', icon: Settings, permission: 'settings.view' },
  { href: '/dashboard/guide', label: 'دليل الاستخدام', icon: HelpCircle },
];

export function MobileNav({ user }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const userPerms = user.rolePermissions ?? (user.role === 'admin' ? ['*'] : ['dashboard.view', 'files.view']);
  const filteredItems = navItems.filter(item => !item.permission || hasPermission(userPerms, item.permission));

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">القائمة</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[280px] p-0">
        <SheetTitle className="sr-only">القائمة الرئيسية</SheetTitle>
        <div className="flex items-center h-16 border-b px-4 gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
            P
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm">PYRAMEDIA X</span>
            <span className="text-[10px] text-muted-foreground">FOR AI SOLUTIONS</span>
          </div>
        </div>
        <ScrollArea className="h-[calc(100vh-4rem)]">
          <nav className="space-y-1 p-3">
            {filteredItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              const Icon = item.icon;
              const guideDesc = MODULE_GUIDES[item.href]?.description;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                >
                  <Icon className={cn('h-5 w-5 shrink-0', isActive && 'text-orange-500')} />
                  <div className="min-w-0">
                    <span className="block truncate">{item.label}</span>
                    {guideDesc && (
                      <span className="block text-[10px] text-muted-foreground/60 truncate leading-tight">
                        {guideDesc}
                      </span>
                    )}
                  </div>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
