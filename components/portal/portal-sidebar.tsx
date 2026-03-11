'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils/cn';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useBranding } from '@/components/portal/BrandingProvider';
import { usePortalNotifications } from '@/hooks/useNotifications';
import {
  FolderKanban,
  FolderOpen,
  FileText,
  FileSignature,
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
    badgeKey: null as 'notifications' | null,
  },
  {
    href: '/portal/files',
    label: 'الملفات',
    icon: FolderOpen,
    badgeKey: null as 'notifications' | null,
  },
  {
    href: '/portal/quotes',
    label: 'عروض الأسعار',
    icon: FileText,
    badgeKey: null as 'notifications' | null,
  },
  {
    href: '/portal/contracts',
    label: 'العقود',
    icon: FileSignature,
    badgeKey: null as 'notifications' | null,
  },
  {
    href: '/portal/invoices',
    label: 'الفواتير',
    icon: Receipt,
    badgeKey: null as 'notifications' | null,
  },
  {
    href: '/portal/scripts',
    label: 'السكريبتات',
    icon: ScrollText,
    badgeKey: null as 'notifications' | null,
  },
  {
    href: '/portal/help',
    label: 'مركز المساعدة',
    icon: HelpCircle,
    badgeKey: null as 'notifications' | null,
  },
  {
    href: '/portal/notifications',
    label: 'الإشعارات',
    icon: Bell,
    badgeKey: 'notifications' as 'notifications' | null,
  },
  {
    href: '/portal/profile',
    label: 'الملف الشخصي',
    icon: User,
    badgeKey: null as 'notifications' | null,
  },
];

export function PortalSidebar() {
  const pathname = usePathname();
  const branding = useBranding();
  const { unreadCount } = usePortalNotifications();

  const primaryColor = branding.primary_color || '#f97316';
  const displayName = branding.company_name_display || 'PYRAMEDIA X';
  const logoUrl = branding.logo_url;
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <aside aria-label="قائمة بوابة العملاء" className="fixed inset-y-0 start-0 z-40 hidden lg:flex w-[240px] flex-col border-e bg-sidebar transition-all duration-300">
      {/* Logo */}
      <div className="flex items-center h-16 border-b px-4 gap-3">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={displayName}
            className="w-8 h-8 rounded-lg object-contain shrink-0"
          />
        ) : (
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm shrink-0"
            style={{ backgroundColor: primaryColor }}
          >
            {initial}
          </div>
        )}
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-sm truncate">{displayName}</span>
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
                    ? 'text-sidebar-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
                )}
                style={isActive ? { backgroundColor: primaryColor + '1a' } : undefined}
              >
                <Icon
                  className="h-5 w-5 shrink-0"
                  style={isActive ? { color: primaryColor } : undefined}
                />
                <span className="truncate" style={isActive ? { color: primaryColor } : undefined}>{item.label}</span>
                {/* Badge count */}
                {item.badgeKey === 'notifications' && unreadCount > 0 ? (
                  <span
                    className="ms-auto inline-flex items-center justify-center rounded-full px-1.5 min-w-[20px] h-5 text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: primaryColor }}
                  >
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                ) : isActive ? (
                  <div
                    className="ms-auto w-1.5 h-1.5 rounded-full"
                    style={{ backgroundColor: primaryColor }}
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className="border-t p-4">
        <p className="text-[10px] text-muted-foreground text-center">
          &copy; {new Date().getFullYear()} {displayName}
        </p>
      </div>
    </aside>
  );
}
