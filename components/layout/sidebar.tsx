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
  FileText,
  Activity,
  Trash2,
  Settings,
  Bell,
  Shield,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';

interface SidebarProps {
  user: {
    username: string;
    role: string;
    display_name: string;
  };
}

const navItems = [
  { href: '/dashboard', label: 'الرئيسية', labelEn: 'Dashboard', icon: LayoutDashboard },
  { href: '/dashboard/files', label: 'الملفات', labelEn: 'Files', icon: FolderOpen },
  { href: '/dashboard/users', label: 'المستخدمون', labelEn: 'Users', icon: Users, adminOnly: true },
  { href: '/dashboard/teams', label: 'الفرق', labelEn: 'Teams', icon: Building2 },
  { href: '/dashboard/permissions', label: 'الصلاحيات', labelEn: 'Permissions', icon: Shield, adminOnly: true },
  { href: '/dashboard/quotes', label: 'عروض الأسعار', labelEn: 'Quotes', icon: FileText },
  { href: '/dashboard/notifications', label: 'الإشعارات', labelEn: 'Notifications', icon: Bell },
  { href: '/dashboard/activity', label: 'النشاط', labelEn: 'Activity', icon: Activity },
  { href: '/dashboard/trash', label: 'المحذوفات', labelEn: 'Trash', icon: Trash2 },
  { href: '/dashboard/settings', label: 'الإعدادات', labelEn: 'Settings', icon: Settings, adminOnly: true },
];

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = user.role === 'admin';

  const filteredItems = navItems.filter(item => !item.adminOnly || isAdmin);

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
        <ScrollArea className="flex-1 py-4">
          <nav className="space-y-1 px-3">
            {filteredItems.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== '/dashboard' && pathname.startsWith(item.href));
              const Icon = item.icon;

              const link = (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
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

              return link;
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
