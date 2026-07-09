'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetTrigger, SheetTitle } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Menu, HelpCircle } from 'lucide-react';
import { hasPermission } from '@/lib/auth/rbac';
import { useAllModuleGuides } from '@/lib/i18n/module-guide-labels';
import { NAV_GROUPS } from './nav-config';

interface MobileNavProps {
  user: {
    username: string;
    role: string;
    display_name: string;
    rolePermissions?: string[];
  };
}

export function MobileNav({ user }: MobileNavProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const userPerms = user.rolePermissions ?? (user.role === 'admin' ? ['*'] : ['dashboard.view', 'files.view']);
  const allGuides = useAllModuleGuides();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">{t('sidebar.mainNavAria')}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(280px,85vw)] p-0">
        <SheetTitle className="sr-only">{t('sidebar.mainNavAria')}</SheetTitle>
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
          <nav className="p-3 space-y-4">
            {NAV_GROUPS.map((group) => {
              const visibleItems = group.items.filter(
                item => !item.permission || hasPermission(userPerms, item.permission)
              );
              if (visibleItems.length === 0) return null;

              return (
                <div key={group.storageKey}>
                  <div className="px-3 py-1.5">
                    <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider">
                      {t(`groups.${group.key}.title`)}
                    </p>
                    <p className="text-[9px] text-muted-foreground/40 leading-tight mt-0.5">
                      {t(`groups.${group.key}.description`)}
                    </p>
                  </div>
                  <div className="space-y-0.5">
                    {visibleItems.map((item) => {
                      const isActive = pathname === item.href ||
                        (item.href !== '/dashboard' && pathname.startsWith(item.href));
                      const Icon = item.icon;
                      const guideDesc = allGuides[item.href]?.description;

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
                            <span className="block truncate">{t(`items.${item.key}`)}</span>
                            {guideDesc && (
                              <span className="block text-[10px] text-muted-foreground/60 truncate leading-tight">
                                {guideDesc}
                              </span>
                            )}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* Guide link */}
            <div>
              <Link
                href="/dashboard/guide"
                onClick={() => setOpen(false)}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                  pathname === '/dashboard/guide'
                    ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                    : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                )}
              >
                <HelpCircle className="h-5 w-5 shrink-0" />
                <span>{t('sidebar.guide')}</span>
              </Link>
            </div>
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
