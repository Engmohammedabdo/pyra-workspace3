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
} from 'lucide-react';

interface MobileNavProps {
  user: {
    username: string;
    role: string;
    display_name: string;
  };
}

const navItems = [
  { href: '/dashboard', label: 'الرئيسية', icon: LayoutDashboard },
  { href: '/dashboard/files', label: 'الملفات', icon: FolderOpen },
  { href: '/dashboard/projects', label: 'المشاريع', icon: Briefcase },
  { href: '/dashboard/clients', label: 'العملاء', icon: Building2, adminOnly: true },
  { href: '/dashboard/users', label: 'المستخدمون', icon: Users, adminOnly: true },
  { href: '/dashboard/teams', label: 'الفرق', icon: Building2 },
  { href: '/dashboard/permissions', label: 'الصلاحيات', icon: Shield, adminOnly: true },
  { href: '/dashboard/quotes', label: 'عروض الأسعار', icon: FileText },
  { href: '/dashboard/reviews', label: 'المراجعات', icon: CheckSquare },
  { href: '/dashboard/favorites', label: 'المفضلة', icon: Star },
  { href: '/dashboard/notifications', label: 'الإشعارات', icon: Bell },
  { href: '/dashboard/activity', label: 'النشاط', icon: Activity },
  { href: '/dashboard/trash', label: 'المحذوفات', icon: Trash2 },
  { href: '/dashboard/login-history', label: 'سجل الدخول', icon: History, adminOnly: true },
  { href: '/dashboard/sessions', label: 'الجلسات', icon: Monitor, adminOnly: true },
  { href: '/dashboard/profile', label: 'الملف الشخصي', icon: UserCircle },
  { href: '/dashboard/settings', label: 'الإعدادات', icon: Settings, adminOnly: true },
];

export function MobileNav({ user }: MobileNavProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const isAdmin = user.role === 'admin';
  const filteredItems = navItems.filter(item => !item.adminOnly || isAdmin);

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
                  <Icon className={cn('h-5 w-5', isActive && 'text-orange-500')} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
