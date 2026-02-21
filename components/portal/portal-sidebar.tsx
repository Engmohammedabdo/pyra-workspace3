'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  FolderKanban,
  FolderOpen,
  FileText,
  Receipt,
  Bell,
  User,
  ScrollText,
  HelpCircle,
} from 'lucide-react';

const portalNavItems = [
  {
    href: '/portal/projects',
    label: 'المشاريع',
    icon: FolderKanban,
  },
  {
    href: '/portal/files',
    label: 'الملفات',
    icon: FolderOpen,
  },
  {
    href: '/portal/quotes',
    label: 'عروض الأسعار',
    icon: FileText,
  },
  {
    href: '/portal/invoices',
    label: 'الفواتير',
    icon: Receipt,
  },
  {
    href: '/portal/scripts',
    label: 'السكريبتات',
    icon: ScrollText,
  },
  {
    href: '/portal/help',
    label: 'مركز المساعدة',
    icon: HelpCircle,
  },
  {
    href: '/portal/notifications',
    label: 'الإشعارات',
    icon: Bell,
  },
  {
    href: '/portal/profile',
    label: 'الملف الشخصي',
    icon: User,
  },
];

export function PortalSidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 start-0 z-40 hidden lg:flex w-[240px] flex-col border-e bg-sidebar transition-all duration-300">
      {/* Logo */}
      <div className="flex items-center h-16 border-b px-4 gap-3">
        <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-sm shrink-0">
          P
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-sm truncate">PYRAMEDIA X</span>
          <span className="text-[10px] text-muted-foreground truncate">
            بوابة العملاء
          </span>
        </div>
      </div>

      {/* Navigation */}
      <ScrollArea className="flex-1 py-4">
        <nav className="space-y-1 px-3">
          {portalNavItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + '/');
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
              >
                <Icon
                  className={cn(
                    'h-5 w-5 shrink-0',
                    isActive && 'text-orange-500'
                  )}
                />
                <span className="truncate">{item.label}</span>
                {isActive && (
                  <div className="ms-auto w-1.5 h-1.5 rounded-full bg-orange-500" />
                )}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-4">
        <p className="text-[10px] text-muted-foreground text-center">
          &copy; {new Date().getFullYear()} PYRAMEDIA X
        </p>
      </div>
    </aside>
  );
}
