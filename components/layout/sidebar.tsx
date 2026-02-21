'use client';

import { useState } from 'react';
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
} from 'lucide-react';

interface SidebarProps {
  user: {
    username: string;
    role: string;
    display_name: string;
  };
}

interface NavItem {
  href: string;
  label: string;
  labelEn: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
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
      { href: '/dashboard/notifications', label: 'الإشعارات', labelEn: 'Notifications', icon: Bell },
    ],
  },
  {
    title: 'إدارة الملفات',
    titleEn: 'File Management',
    items: [
      { href: '/dashboard/files', label: 'الملفات', labelEn: 'Files', icon: FolderOpen },
      { href: '/dashboard/favorites', label: 'المفضلة', labelEn: 'Favorites', icon: Star },
      { href: '/dashboard/reviews', label: 'المراجعات', labelEn: 'Reviews', icon: MessageSquare },
      { href: '/dashboard/trash', label: 'المحذوفات', labelEn: 'Trash', icon: Trash2 },
    ],
  },
  {
    title: 'العمل',
    titleEn: 'Work',
    items: [
      { href: '/dashboard/projects', label: 'المشاريع', labelEn: 'Projects', icon: Briefcase },
      { href: '/dashboard/quotes', label: 'عروض الأسعار', labelEn: 'Quotes', icon: FileText },
      { href: '/dashboard/invoices', label: 'الفواتير', labelEn: 'Invoices', icon: Receipt, adminOnly: true },
      { href: '/dashboard/clients', label: 'العملاء', labelEn: 'Clients', icon: Building2, adminOnly: true },
      { href: '/dashboard/script-reviews', label: 'مراجعات السكريبتات', labelEn: 'Script Reviews', icon: ScrollText },
    ],
  },
  {
    title: 'الفريق',
    titleEn: 'Team',
    items: [
      { href: '/dashboard/teams', label: 'الفرق', labelEn: 'Teams', icon: Building2 },
      { href: '/dashboard/users', label: 'المستخدمون', labelEn: 'Users', icon: Users, adminOnly: true },
      { href: '/dashboard/permissions', label: 'الصلاحيات', labelEn: 'Permissions', icon: Shield, adminOnly: true },
    ],
  },
  {
    title: 'النظام',
    titleEn: 'System',
    items: [
      { href: '/dashboard/activity', label: 'سجل النشاط', labelEn: 'Activity', icon: Activity },
      { href: '/dashboard/login-history', label: 'سجل الدخول', labelEn: 'Login History', icon: KeyRound, adminOnly: true },
      { href: '/dashboard/sessions', label: 'الجلسات', labelEn: 'Sessions', icon: Monitor, adminOnly: true },
      { href: '/dashboard/settings', label: 'الإعدادات', labelEn: 'Settings', icon: Settings, adminOnly: true },
    ],
  },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = user.role === 'admin';

  return (
    <TooltipProvider delayDuration={0}>
      <aside
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
              const visibleItems = group.items.filter(item => !item.adminOnly || isAdmin);
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.titleEn} className="mb-3">
                  {!collapsed && (
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                      {group.title}
                    </div>
                  )}
                  {collapsed && <div className="my-1 mx-2 border-t border-border/40" />}
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = pathname === item.href ||
                        (item.href !== '/dashboard' && pathname.startsWith(item.href));
                      const Icon = item.icon;

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

                      if (collapsed) {
                        return (
                          <Tooltip key={item.href}>
                            <TooltipTrigger asChild>
                              {link}
                            </TooltipTrigger>
                            <TooltipContent side="left" className="font-medium">
                              {item.label}
                            </TooltipContent>
                          </Tooltip>
                        );
                      }

                      return <div key={item.href}>{link}</div>;
                    })}
                  </div>
                </div>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Collapse Toggle */}
        <div className="border-t p-3">
          <Button
            variant="ghost"
            size="sm"
            className={cn('w-full', collapsed && 'px-2')}
            onClick={() => setCollapsed(!collapsed)}
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
