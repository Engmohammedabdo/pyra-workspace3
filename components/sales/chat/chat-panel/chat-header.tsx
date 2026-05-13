'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import {
  Search, X, ArrowRight, UserPlus,
  PanelRightOpen, User, CheckCircle2, Clock,
  BellOff, Bell, Users, MoreVertical,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { AssignDialog } from '../dialogs/assign-dialog';
import { SnoozePicker } from '../dialogs/snooze-picker';
import { LabelPicker } from '../dialogs/label-picker';
import type { ConversationLabel } from '@/hooks/useWhatsApp';

interface ChatHeaderProps {
  contactName: string | null;
  phone: string;
  displayPhone: string;
  leadId?: string | null;
  assignedTo?: string | null;
  conversationId?: string | null;
  remoteJid: string;
  instanceName: string;
  conversationStatus: string;
  isAdmin?: boolean;
  updatingStatus: boolean;
  showSidebar: boolean;
  showAssign: boolean;
  searchOpen: boolean;
  searchQuery: string;
  displayMessagesCount: number;
  snoozedUntil?: string | null;
  isMuted?: boolean;
  labels?: ConversationLabel[];
  isContactTyping?: boolean;
  otherViewers?: string[];
  profilePic?: string | null;
  isOutsideBusinessHours?: boolean;
  isGroup?: boolean;
  groupSubject?: string | null;
  participantCount?: number;
  groupPictureUrl?: string | null;
  onBack?: () => void;
  onToggleSidebar: () => void;
  onToggleAssign: () => void;
  onAssigned: () => void;
  onToggleSearch: () => void;
  onSearchChange: (query: string) => void;
  onCloseSearch: () => void;
  onStatusChange: (status: string) => void;
  onMuteToggle?: () => void;
  onSnoozed?: () => void;
}

export function ChatHeader({
  contactName,
  phone,
  displayPhone,
  leadId,
  assignedTo,
  conversationId,
  remoteJid,
  instanceName,
  conversationStatus,
  isAdmin,
  updatingStatus,
  showSidebar,
  showAssign,
  searchOpen,
  searchQuery,
  displayMessagesCount,
  snoozedUntil,
  isMuted,
  labels,
  onBack,
  onToggleSidebar,
  onToggleAssign,
  onAssigned,
  onToggleSearch,
  onSearchChange,
  onCloseSearch,
  onStatusChange,
  isContactTyping,
  otherViewers = [],
  profilePic,
  isOutsideBusinessHours,
  isGroup,
  groupSubject,
  participantCount,
  groupPictureUrl,
  onMuteToggle,
  onSnoozed,
}: ChatHeaderProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [headerImgError, setHeaderImgError] = useState(false);

  return (
    <>
      <div className="px-4 py-2 border-b border-[#e9edef] dark:border-[#313d45] flex items-center justify-between bg-[#f0f2f5] dark:bg-[#202c33]" style={{ minHeight: 60 }}>
        <div className="flex items-center gap-2.5">
          {/* Back button -- visible on mobile */}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full h-10 w-10 md:hidden shrink-0 text-[#54656f] dark:text-[#aebac1] hover:bg-[#e9edef] dark:hover:bg-[#313d45]"
              onClick={onBack}
              aria-label="رجوع"
            >
              <ArrowRight className="h-5 w-5" />
            </Button>
          )}

          {/* Clickable contact info -- toggles sidebar */}
          <button
            className="flex items-center gap-3 hover:opacity-80 transition-opacity"
            onClick={onToggleSidebar}
          >
            {isGroup ? (
              groupPictureUrl && !headerImgError ? (
                <img
                  src={groupPictureUrl}
                  alt={groupSubject || contactName || phone}
                  className="w-10 h-10 rounded-full object-cover"
                  onError={() => setHeaderImgError(true)}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-[#6b7b8a] dark:bg-[#6b7b8a] flex items-center justify-center">
                  <Users className="h-5 w-5 text-white" />
                </div>
              )
            ) : profilePic && !headerImgError ? (
              <img
                src={profilePic}
                alt={contactName || phone}
                className="w-10 h-10 rounded-full object-cover"
                onError={() => setHeaderImgError(true)}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#6b7b8a] dark:bg-[#6b7b8a] flex items-center justify-center text-white font-normal text-base">
                {(contactName || phone).charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 text-start">
              <p className="text-[16px] font-normal text-[#111b21] dark:text-[#e9edef] truncate">
                {isGroup ? (groupSubject || contactName || displayPhone) : (contactName || displayPhone)}
              </p>
              {isContactTyping ? (
                <span className="text-[13px] text-[#00a884] flex items-center gap-1">
                  <span>يكتب...</span>
                </span>
              ) : isGroup ? (
                <span className="text-[13px] text-[#667781] dark:text-[#8696a0] flex items-center gap-1">
                  {participantCount || 0} عضو
                </span>
              ) : displayPhone ? (
                <p className="text-[13px] text-[#667781] dark:text-[#8696a0] tabular-nums" dir="ltr">
                  {displayPhone}
                </p>
              ) : null}
            </div>
          </button>

          {/* Other Agents Viewing (Collision Detection) -- subtle pills */}
          {otherViewers.length > 0 && (
            <div className="flex items-center gap-1 shrink-0 ms-2" title={otherViewers.join(', ')}>
              <div className="flex -space-x-1.5 rtl:space-x-reverse">
                {otherViewers.slice(0, 3).map((agent) => (
                  <div
                    key={agent}
                    className="w-5 h-5 rounded-full bg-[#667781] dark:bg-[#8696a0] flex items-center justify-center text-white text-[8px] font-medium border border-[#f0f2f5] dark:border-[#202c33]"
                  >
                    {agent.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <span className="text-[11px] text-[#667781] dark:text-[#8696a0]">
                {otherViewers.length === 1 ? `${otherViewers[0]} يشاهد` : `${otherViewers.length} يشاهدون`}
              </span>
            </div>
          )}

          {/* Business Hours Badge -- subtle */}
          {isOutsideBusinessHours && (
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#e9edef] dark:bg-[#313d45] text-[#667781] dark:text-[#8696a0] flex items-center gap-1 shrink-0 ms-1">
              <Clock className="h-3 w-3" />
              خارج ساعات العمل
            </span>
          )}
        </div>

        <div className="flex items-center gap-0.5">
          {/* Search Toggle */}
          <button
            className={cn(
              'h-10 w-10 rounded-full flex items-center justify-center transition-colors',
              searchOpen
                ? 'bg-[#e9edef] dark:bg-[#313d45] text-[#00a884]'
                : 'text-[#54656f] dark:text-[#aebac1] hover:bg-[#e9edef] dark:hover:bg-[#313d45]'
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

          {/* Contact Info Sidebar Toggle */}
          <button
            className={cn(
              'h-10 w-10 rounded-full items-center justify-center transition-colors hidden lg:flex',
              showSidebar
                ? 'bg-[#e9edef] dark:bg-[#313d45] text-[#00a884]'
                : 'text-[#54656f] dark:text-[#aebac1] hover:bg-[#e9edef] dark:hover:bg-[#313d45]'
            )}
            onClick={onToggleSidebar}
            title="معلومات جهة الاتصال"
            aria-label="معلومات جهة الاتصال"
          >
            <PanelRightOpen className="h-5 w-5" />
          </button>

          {/* More menu (vertical dots) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className="h-10 w-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-[#e9edef] dark:hover:bg-[#313d45] transition-colors"
                aria-label="المزيد"
              >
                <MoreVertical className="h-5 w-5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {/* Assign to Agent -- admin only */}
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

          {/* Hidden pickers -- triggered from dropdown or kept for popover use */}
          <div className="hidden">
            {/* Assign Dialog */}
            <AssignDialog
              open={showAssign}
              conversationId={conversationId}
              remoteJid={remoteJid}
              instanceName={instanceName}
              currentAgent={assignedTo || null}
              onAssigned={onAssigned}
              onClose={onToggleAssign}
            />
          </div>

          {/* Snooze & Label pickers rendered but visually hidden -- they use their own popovers */}
          <div className="hidden">
            {conversationId && (
              <SnoozePicker
                conversationId={conversationId}
                snoozedUntil={snoozedUntil}
                onSnoozed={onSnoozed}
              />
            )}
            {conversationId && (
              <LabelPicker
                conversationId={conversationId}
                assignedLabels={labels}
                compact
              />
            )}
          </div>
        </div>
      </div>

      {/* Search Bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-[#e9edef] dark:border-[#313d45] bg-[#f0f2f5] dark:bg-[#202c33] flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
          <Search className="h-4 w-4 text-[#667781] dark:text-[#8696a0] shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="بحث في الرسائل..."
            className="flex-1 bg-white dark:bg-[#2a3942] text-sm border-none focus:outline-none placeholder:text-[#667781] dark:placeholder:text-[#8696a0] rounded-lg px-3 py-1.5 text-[#111b21] dark:text-[#e9edef]"
          />
          {searchQuery && (
            <span className="text-[11px] text-[#00a884] font-medium shrink-0 px-2 py-0.5">
              {displayMessagesCount} نتيجة
            </span>
          )}
          <button
            onClick={onCloseSearch}
            className="shrink-0 text-[#667781] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
