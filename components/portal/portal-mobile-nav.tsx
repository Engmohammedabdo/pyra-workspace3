'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Menu,
  FolderKanban,
  FolderOpen,
  FileText,
  Bell,
  User,
  ScrollText,
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
    href: '/portal/scripts',
    label: 'السكريبتات',
    icon: ScrollText,
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

export function PortalMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">القائمة</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[280px] p-0">
        <SheetTitle className="sr-only">قائمة بوابة العملاء</SheetTitle>

        {/* Logo header */}
        <div className="flex items-center h-16 border-b px-4 gap-3">
          <div className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-sm">
            P
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm">PYRAMEDIA X</span>
            <span className="text-[10px] text-muted-foreground">
              بوابة العملاء
            </span>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-4rem)]">
          <nav className="space-y-1 p-3">
            {portalNavItems.map((item) => {
              const isActive =
                pathname === item.href ||
                pathname.startsWith(item.href + '/');
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
                  <Icon
                    className={cn(
                      'h-5 w-5',
                      isActive && 'text-orange-500'
                    )}
                  />
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
