'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils/cn';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { hasPermission } from '@/lib/auth/rbac';
import { MODULE_GUIDES } from '@/lib/config/module-guide';
import { useSidebarBadges } from '@/hooks/useSidebarBadges';
import { NAV_GROUPS, ALL_NAV_ITEMS, type NavItemConfig } from './nav-config';
import {
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  HelpCircle,
  Pin,
  PinOff,
} from 'lucide-react';

interface SidebarProps {
  user: {
    username: string;
    role: string;
    display_name: string;
    rolePermissions?: string[];
  };
}

// ═══════════════════════════════════════════════
//  localStorage helpers
// ═══════════════════════════════════════════════
const STORAGE_KEY = 'pyra-sidebar-collapsed-groups';
const FAVORITES_KEY = 'pyra-sidebar-favorites';

// Old group names from previous layouts — trigger migration to clear stale localStorage
const OLD_GROUP_NAMES = ['General', 'Personal', 'File Management', 'Workflow', 'Team', 'System', 'Work', 'Admin'];
const NEW_GROUP_NAMES = NAV_GROUPS.map(g => g.storageKey);

function loadCollapsedGroups(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return new Set();
    const parsed: string[] = JSON.parse(stored);
    // Migrate: if any old-only group name found, clear and return empty
    const hasOldNames = parsed.some(n => OLD_GROUP_NAMES.includes(n));
    if (hasOldNames) {
      localStorage.removeItem(STORAGE_KEY);
      return new Set();
    }
    // Only keep valid new group names
    return new Set(parsed.filter(n => NEW_GROUP_NAMES.includes(n)));
  } catch { return new Set(); }
}

function saveCollapsedGroups(groups: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...groups])); } catch {}
}

function loadFavorites(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const stored = localStorage.getItem(FAVORITES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch { return []; }
}

function saveFavorites(favs: string[]) {
  try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favs)); } catch {}
}

// ═══════════════════════════════════════════════
//  Sidebar Component
// ═══════════════════════════════════════════════
export function Sidebar({ user }: SidebarProps) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [favorites, setFavorites] = useState<string[]>([]);
  const userPerms = user.rolePermissions ?? (user.role === 'admin' ? ['*'] : ['dashboard.view']);
  const badges = useSidebarBadges();

  // Load state from localStorage on mount
  useEffect(() => {
    setCollapsedGroups(loadCollapsedGroups());
    setFavorites(loadFavorites());
  }, []);

  // Sync sidebar width to CSS custom property so layout can track it
  useEffect(() => {
    document.documentElement.style.setProperty(
      '--sidebar-width',
      collapsed ? '72px' : '280px'
    );
  }, [collapsed]);

  // Auto-expand the group containing the active page
  useEffect(() => {
    const activeGroup = NAV_GROUPS.find(g =>
      g.items.some(item =>
        pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
      )
    );
    if (activeGroup && collapsedGroups.has(activeGroup.storageKey)) {
      setCollapsedGroups(prev => {
        const next = new Set(prev);
        next.delete(activeGroup.storageKey);
        saveCollapsedGroups(next);
        return next;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const toggleGroup = useCallback((groupKey: string) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) next.delete(groupKey);
      else next.add(groupKey);
      saveCollapsedGroups(next);
      return next;
    });
  }, []);

  const toggleFavorite = useCallback((href: string) => {
    setFavorites(prev => {
      const next = prev.includes(href)
        ? prev.filter(f => f !== href)
        : [...prev, href];
      saveFavorites(next);
      return next;
    });
  }, []);

  // Compute favorite items (only those the user has permission for)
  const favoriteItems = favorites
    .map(href => ALL_NAV_ITEMS.find(n => n.href === href))
    .filter((item): item is NavItemConfig =>
      !!item && (!item.permission || hasPermission(userPerms, item.permission))
    );

  const getBadgeCount = (item: NavItemConfig): number => {
    if (!item.badgeKey) return 0;
    return badges[item.badgeKey] ?? 0;
  };

  // ── Render a single nav item ──
  const renderNavItem = (item: NavItemConfig, showFavToggle: boolean) => {
    const isActive = pathname === item.href ||
      (item.href !== '/dashboard' && pathname.startsWith(item.href));
    const Icon = item.icon;
    const guideDesc = MODULE_GUIDES[item.href]?.description;
    const badgeCount = getBadgeCount(item);
    const isFav = favorites.includes(item.href);

    const link = (
      <Link
        href={item.href}
        className={cn(
          'group/item flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors relative',
          collapsed && 'justify-center px-2',
          isActive
            ? 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground'
        )}
      >
        <span className="relative shrink-0">
          <Icon className={cn('h-5 w-5', isActive && 'text-orange-500')} />
          {/* Badge dot when sidebar is collapsed */}
          {collapsed && badgeCount > 0 && (
            <span className="absolute -top-1 -end-1 w-2 h-2 rounded-full bg-orange-500" />
          )}
        </span>

        {!collapsed && (
          <>
            <span className="truncate">{t(`items.${item.key}`)}</span>

            {/* Badge count */}
            {badgeCount > 0 && (
              <span className="inline-flex items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1 ms-auto shrink-0">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            )}

            {/* Active dot (only if no badge) */}
            {isActive && badgeCount === 0 && (
              <div className="ms-auto w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0" />
            )}

            {/* Favorite toggle (visible on hover, not on collapsed) */}
            {showFavToggle && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  toggleFavorite(item.href);
                }}
                className={cn(
                  'absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded transition-opacity',
                  isFav
                    ? 'opacity-60 hover:opacity-100 text-orange-500'
                    : 'opacity-0 group-hover/item:opacity-60 hover:!opacity-100 text-muted-foreground'
                )}
                aria-label={isFav ? t('sidebar.unpin') : t('sidebar.pin')}
              >
                {isFav ? <PinOff className="h-3 w-3" /> : <Pin className="h-3 w-3" />}
              </button>
            )}
          </>
        )}
      </Link>
    );

    return (
      <Tooltip key={item.href}>
        <TooltipTrigger asChild>
          {link}
        </TooltipTrigger>
        <TooltipContent
          side="left"
          className="max-w-[220px] text-end"
        >
          {collapsed && <p className="font-semibold text-xs">{t(`items.${item.key}`)}</p>}
          {guideDesc && (
            <p className={cn(
              'text-[11px] leading-relaxed',
              collapsed ? 'text-muted-foreground mt-0.5' : 'font-medium'
            )}>
              {guideDesc}
            </p>
          )}
          {collapsed && badgeCount > 0 && (
            <p className="text-[10px] text-orange-500 mt-0.5 font-medium">
              {t('sidebar.badgeNew', { count: badgeCount })}
            </p>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider delayDuration={0}>
      <aside
        aria-label={t('sidebar.mainNavAria')}
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
          <motion.div
            className="w-8 h-8 rounded-lg bg-orange-500 flex items-center justify-center text-white font-bold text-sm shrink-0"
            whileHover={{ rotate: [0, -8, 8, 0], scale: 1.1 }}
            transition={{ duration: 0.4 }}
          >
            P
          </motion.div>
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
            {/* ── Pinned Favorites Section ── */}
            {favoriteItems.length > 0 && (
              <div className="mb-3">
                {!collapsed && (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-semibold text-orange-500/80 uppercase tracking-wider">
                    <Pin className="h-3 w-3" />
                    <span>{t('sidebar.pinned')}</span>
                  </div>
                )}
                {collapsed && <div className="my-1 mx-2 border-t border-orange-500/30" />}
                <div className="space-y-0.5">
                  {favoriteItems.map(item => renderNavItem(item, true))}
                </div>
              </div>
            )}

            {/* ── Nav Groups ── */}
            {NAV_GROUPS.map((group) => {
              const visibleItems = group.items.filter(item => !item.permission || hasPermission(userPerms, item.permission));
              if (visibleItems.length === 0) return null;

              const isGroupCollapsed = collapsedGroups.has(group.storageKey);

              return (
                <div key={group.storageKey} className="mb-3">
                  {!collapsed && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <button
                          onClick={() => toggleGroup(group.storageKey)}
                          className="flex items-center justify-between w-full px-3 py-1.5 text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wider hover:text-muted-foreground transition-colors group/section"
                        >
                          <span>{t(`groups.${group.key}.title`)}</span>
                          <ChevronDown className={cn(
                            'h-3 w-3 opacity-0 group-hover/section:opacity-100 transition-all duration-200',
                            isGroupCollapsed && '-rotate-90'
                          )} />
                        </button>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="max-w-[200px] text-end">
                        <p className="text-[11px] leading-relaxed">{t(`groups.${group.key}.description`)}</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
                  {collapsed && <div className="my-1 mx-2 border-t border-border/40" />}
                  <AnimatePresence initial={false}>
                    {(!collapsed ? !isGroupCollapsed : true) && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: 'easeInOut' }}
                        className="space-y-0.5 overflow-hidden"
                      >
                        {visibleItems.map(item => renderNavItem(item, true))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </nav>
        </ScrollArea>

        {/* Guide + Collapse Toggle */}
        <div className="border-t p-3 space-y-1">
          {/* Quick Guide Access */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard/guide"
                className={cn(
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-orange-500/10 hover:text-orange-600 dark:hover:text-orange-400 transition-colors',
                  collapsed && 'justify-center px-2',
                  pathname === '/dashboard/guide' && 'bg-orange-500/10 text-orange-600 dark:text-orange-400'
                )}
              >
                <HelpCircle className="h-4 w-4 shrink-0" />
                {!collapsed && <span className="text-xs">{t('sidebar.guide')}</span>}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="left" className="font-medium text-xs">
              {collapsed ? t('sidebar.guide') : t('sidebar.guideHint')}
            </TooltipContent>
          </Tooltip>

          <Button
            variant="ghost"
            size="sm"
            className={cn('w-full', collapsed && 'px-2')}
            onClick={() => setCollapsed(!collapsed)}
            aria-label={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
          >
            {collapsed ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <>
                <PanelLeftClose className="h-4 w-4" />
                <span className="ms-2">{t('sidebar.collapse')}</span>
              </>
            )}
          </Button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
