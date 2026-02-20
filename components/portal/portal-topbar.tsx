'use client';

import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
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
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Bell, LogOut, User, Sun, Moon, BellRing } from 'lucide-react';
import { PortalMobileNav } from '@/components/portal/portal-mobile-nav';
import { PortalCommandSearch } from '@/components/portal/portal-command-search';
import { usePortalNotifications, requestNotificationPermission } from '@/hooks/useNotifications';
import type { PyraClient } from '@/types/database';
import { useEffect, useState } from 'react';

interface PortalTopbarProps {
  client: Pick<PyraClient, 'id' | 'name' | 'email' | 'company'>;
}

export function PortalTopbar({ client }: PortalTopbarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { unreadCount } = usePortalNotifications();
  const [pushEnabled, setPushEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Avoid hydration mismatch
  useEffect(() => {
    setMounted(true);
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushEnabled(Notification.permission === 'granted');
    }
  }, []);

  const handleLogout = async () => {
    try {
      await fetch('/api/portal/auth/logout', { method: 'POST' });
    } catch {
      // ignore
    }
    router.push('/portal/login');
    router.refresh();
  };

  const handleTogglePush = async () => {
    const result = await requestNotificationPermission();
    setPushEnabled(result === 'granted');
  };

  const initials = client.name
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <TooltipProvider delayDuration={300}>
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

        <div className="ms-auto flex items-center gap-1.5">
          {/* Global Search */}
          <PortalCommandSearch />

          {/* Desktop Push Toggle */}
          {mounted && 'Notification' in window && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={pushEnabled ? 'text-orange-500' : 'text-muted-foreground'}
                  onClick={handleTogglePush}
                >
                  <BellRing className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {pushEnabled ? 'إشعارات سطح المكتب مفعّلة' : 'تفعيل إشعارات سطح المكتب'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Dark Mode Toggle */}
          {mounted && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {theme === 'dark' ? (
                    <Sun className="h-4 w-4" />
                  ) : (
                    <Moon className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                {theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
              </TooltipContent>
            </Tooltip>
          )}

          {/* Notifications */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="relative"
                onClick={() => router.push('/portal/notifications')}
              >
                <Bell className="h-4 w-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -end-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[10px] font-bold text-white animate-in zoom-in-50 duration-200">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {unreadCount > 0 ? `${unreadCount} إشعار جديد` : 'الإشعارات'}
            </TooltipContent>
          </Tooltip>

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
    </TooltipProvider>
  );
}
