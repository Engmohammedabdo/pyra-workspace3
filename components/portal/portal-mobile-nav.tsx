'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Menu } from 'lucide-react';
import { useBranding } from '@/components/portal/BrandingProvider';
import { PORTAL_NAV_ITEMS } from '@/components/portal/portal-nav-config';

export function PortalMobileNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const branding = useBranding();
  const t = useTranslations('nav');

  const primaryColor = branding.primary_color || '#f97316';
  const displayName = branding.company_name_display || 'PYRAMEDIA X';
  const logoUrl = branding.logo_url;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="lg:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">{t('portal.menuSr')}</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-[min(280px,85vw)] p-0">
        <SheetTitle className="sr-only">{t('portal.sidebarAria')}</SheetTitle>

        {/* Logo header */}
        <div className="flex items-center h-16 border-b px-4 gap-3">
          {logoUrl ? (
            <img
              src={logoUrl}
              alt={displayName}
              className="w-8 h-8 rounded-lg object-contain"
            />
          ) : (
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: primaryColor }}
            >
              {initial}
            </div>
          )}
          <div className="flex flex-col">
            <span className="font-bold text-sm">{displayName}</span>
            <span className="text-[10px] text-muted-foreground">
              {t('portal.clientPortal')}
            </span>
          </div>
        </div>

        <ScrollArea className="h-[calc(100vh-4rem)]">
          <nav className="space-y-1 p-3">
            {PORTAL_NAV_ITEMS.map((item) => {
              const isActive = item.href === '/portal'
                ? pathname === '/portal'
                : pathname === item.href || pathname.startsWith(item.href + '/');
              const Icon = item.icon;

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                    isActive
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  )}
                  style={isActive ? { backgroundColor: primaryColor + '1a' } : undefined}
                >
                  <Icon
                    className="h-5 w-5"
                    style={isActive ? { color: primaryColor } : undefined}
                  />
                  <span style={isActive ? { color: primaryColor } : undefined}>{t(`portal.items.${item.key}`)}</span>
                </Link>
              );
            })}
          </nav>
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
