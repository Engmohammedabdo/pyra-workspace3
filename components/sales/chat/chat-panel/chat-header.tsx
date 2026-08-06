'use client';

// Slim utility header (CR-T5) — the identity block (avatar/name/line badge/
// phone) and the contact-drawer toggle moved into the deal banner
// (deal-banner.tsx), which now mounts above this bar. What's left: the
// mobile back button, message search, and a kebab menu for everything that
// doesn't fit the banner's action row (assign, mute, resolve/pending/reopen,
// view-lead link). AssignDialog itself now mounts once in chat-panel/index.tsx
// alongside the banner's «إسناد» button — this file only flips the shared
// toggle so both entry points open the same dialog instance.

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { Search, X, ArrowRight, UserPlus, CheckCircle2, Clock, BellOff, Bell, MoreVertical, User } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { useRef } from 'react';

interface ChatHeaderProps {
  leadId?: string | null;
  conversationId?: string | null;
  conversationStatus: string;
  isAdmin?: boolean;
  updatingStatus: boolean;
  searchOpen: boolean;
  searchQuery: string;
  displayMessagesCount: number;
  isMuted?: boolean;
  otherViewers?: string[];
  onBack?: () => void;
  onToggleAssign: () => void;
  onToggleSearch: () => void;
  onSearchChange: (query: string) => void;
  onCloseSearch: () => void;
  onStatusChange: (status: string) => void;
  onMuteToggle?: () => void;
}

export function ChatHeader({
  leadId,
  conversationId,
  conversationStatus,
  isAdmin,
  updatingStatus,
  searchOpen,
  searchQuery,
  displayMessagesCount,
  isMuted,
  otherViewers = [],
  onBack,
  onToggleAssign,
  onToggleSearch,
  onSearchChange,
  onCloseSearch,
  onStatusChange,
  onMuteToggle,
}: ChatHeaderProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2" style={{ minHeight: 52 }}>
        <div className="flex items-center gap-2">
          {/* Back button -- visible on mobile */}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-10 w-10 md:hidden shrink-0 text-muted-foreground hover:bg-muted"
              onClick={onBack}
              aria-label="رجوع"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          )}

          {/* Other Agents Viewing (Collision Detection) -- subtle pills, kept from the old header */}
          {otherViewers.length > 0 && (
            <div className="flex items-center gap-1 shrink-0" title={otherViewers.join(', ')}>
              <div className="flex -space-x-1.5 rtl:space-x-reverse">
                {otherViewers.slice(0, 3).map((agent) => (
                  <div
                    key={agent}
                    className="w-5 h-5 rounded-full bg-muted text-muted-foreground flex items-center justify-center text-[8px] font-medium border border-card"
                  >
                    {agent.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <span className="text-[11px] text-muted-foreground">
                {otherViewers.length === 1 ? `${otherViewers[0]} يشاهد` : `${otherViewers.length} يشاهدون`}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {/* Search Toggle */}
          <button
            className={cn(
              'h-10 w-10 rounded-full flex items-center justify-center transition-colors',
              searchOpen ? 'bg-muted text-primary' : 'text-muted-foreground hover:bg-muted'
            )}
            onClick={() => {
              onToggleSearch();
              if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
            title="بحث في الرسائل"
            aria-label="بحث"
          >
            <Search className="h-5 w-5" />
          </button>

          {/* More menu (vertical dots) -- everything that doesn't fit the banner */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-10 w-10 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors"
                aria-label="المزيد"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* Assign to Agent -- admin only; opens the same AssignDialog as the banner's «إسناد» button */}
              {isAdmin && (
                <DropdownMenuItem onClick={onToggleAssign} className="gap-2 text-xs">
                  <UserPlus className="h-4 w-4" />
                  تعيين لوكيل
                </DropdownMenuItem>
              )}

              {/* Mute */}
              {conversationId && (
                <DropdownMenuItem onClick={onMuteToggle} className="gap-2 text-xs">
                  {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
                  {isMuted ? 'إلغاء الكتم' : 'كتم'}
                </DropdownMenuItem>
              )}

              {/* Status Actions */}
              {conversationId && (
                <>
                  <DropdownMenuSeparator />
                  {conversationStatus !== 'resolved' && (
                    <DropdownMenuItem
                      onClick={() => onStatusChange('resolved')}
                      disabled={updatingStatus}
                      className="gap-2 text-xs text-green-600 dark:text-green-400"
                      data-testid="btn-resolve"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      حل المحادثة
                    </DropdownMenuItem>
                  )}
                  {conversationStatus === 'open' && (
                    <DropdownMenuItem
                      onClick={() => onStatusChange('pending')}
                      disabled={updatingStatus}
                      className="gap-2 text-xs text-yellow-600 dark:text-yellow-400"
                    >
                      <Clock className="h-4 w-4" />
                      تعليق
                    </DropdownMenuItem>
                  )}
                  {conversationStatus === 'resolved' && (
                    <DropdownMenuItem
                      onClick={() => onStatusChange('open')}
                      disabled={updatingStatus}
                      className="gap-2 text-xs text-blue-600 dark:text-blue-400"
                    >
                      إعادة فتح
                    </DropdownMenuItem>
                  )}
                </>
              )}

              {leadId && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild className="gap-2 text-xs">
                    <Link href={`/dashboard/crm/leads/${leadId}`}>
                      <User className="h-4 w-4" />
                      عرض العميل
                    </Link>
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Search Bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-border bg-muted flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
          <Search className="h-4 w-4 text-muted-foreground shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="بحث في الرسائل..."
            className="flex-1 bg-background text-sm border-none focus:outline-none placeholder:text-muted-foreground rounded-lg px-3 py-1.5 text-foreground"
          />
          {searchQuery && (
            <span className="text-[11px] text-primary font-medium shrink-0 px-2 py-0.5">
              {displayMessagesCount} نتيجة
            </span>
          )}
          <button
            onClick={onCloseSearch}
            className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
