'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Bell, LogOut, User } from 'lucide-react';
import { PortalMobileNav } from '@/components/portal/portal-mobile-nav';
import { usePortalNotifications } from '@/hooks/useNotifications';
import type { PyraClient } from '@/types/database';

interface PortalTopbarProps {
  client: Pick<PyraClient, 'id' | 'name' | 'email' | 'company'>;
}

export function PortalTopbar({ client }: PortalTopbarProps) {
  const router = useRouter();
  const { unreadCount } = usePortalNotifications();

  const handleLogout = async () => {
    try {
      await fetch('/api/portal/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    router.push('/portal/login');
    router.refresh();
  };

  const initials = client.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-4 lg:px-6">
      {/* Mobile Nav */}
      <PortalMobileNav />

      {/* Client info */}
      <div className="hidden sm:flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">{client.name}</span>
        <span className="text-xs text-muted-foreground truncate">
          {client.company}
        </span>
      </div>

      <div className="ms-auto flex items-center gap-2">
        {/* Notifications */}
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          title="الإشعارات"
          onClick={() => router.push('/portal/notifications')}
        >
          <Bell className="h-4 w-4" />
          {/* Dynamic unread badge */}
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>

        {/* User Menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="relative h-9 w-9 rounded-full"
            >
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-orange-500/10 text-orange-600 text-xs font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-56" align="end" forceMount>
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-medium">{client.name}</p>
                <p className="text-xs text-muted-foreground">
                  {client.company} &middot; {client.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => router.push('/portal/profile')}
            >
              <User className="me-2 h-4 w-4" />
              الملف الشخصي
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={handleLogout}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="me-2 h-4 w-4" />
              تسجيل الخروج
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
