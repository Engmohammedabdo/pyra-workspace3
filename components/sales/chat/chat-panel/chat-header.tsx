'use client';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import {
  Phone, Search, X, ArrowRight, UserPlus,
  PanelRightOpen, User, CheckCircle2, Clock,
  BellOff, Bell, Users,
} from 'lucide-react';
import Link from 'next/link';
import { useRef, useState } from 'react';
import { AssignDialog } from '../dialogs/assign-dialog';
import { SnoozePicker } from '../dialogs/snooze-picker';
import { LabelPicker } from '../dialogs/label-picker';
import { SlaIndicator } from '../sla/sla-indicator';
import type { SlaConversationData } from '../sla/sla-indicator';
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
  slaData?: SlaConversationData | null;
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
  slaData,
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
      <div className="px-3 py-2.5 border-b border-border/60 flex items-center justify-between bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          {/* Back button — visible on mobile */}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl h-9 w-9 md:hidden shrink-0"
              onClick={onBack}
              aria-label="رجوع"
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          {/* Clickable contact info — toggles sidebar */}
          <button
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            onClick={onToggleSidebar}
          >
            {isGroup ? (
              groupPictureUrl && !headerImgError ? (
                <img
                  src={groupPictureUrl}
                  alt={groupSubject || contactName || phone}
                  className="w-10 h-10 rounded-full shadow-md object-cover"
                  onError={() => setHeaderImgError(true)}
                />
              ) : (
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center text-white shadow-md shadow-orange-500/15">
                  <Users className="h-5 w-5" />
                </div>
              )
            ) : profilePic && !headerImgError ? (
              <img
                src={profilePic}
                alt={contactName || phone}
                className="w-10 h-10 rounded-full shadow-md object-cover"
                onError={() => setHeaderImgError(true)}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-emerald-500/15">
                {(contactName || phone).charAt(0).toUpperCase()}
              </div>
            )}
            <div className="min-w-0 text-start">
              <p className="font-semibold text-sm truncate">
                {isGroup ? (groupSubject || contactName || displayPhone) : (contactName || displayPhone)}
              </p>
              {isContactTyping ? (
                <span className="text-[10px] text-emerald-500 flex items-center gap-1 animate-pulse">
                  <span>يكتب</span>
                  <span className="flex gap-0.5">
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0s' }} />
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0.2s' }} />
                    <span className="w-1 h-1 rounded-full bg-emerald-500 animate-bounce" style={{ animationDelay: '0.4s' }} />
                  </span>
                </span>
              ) : isGroup ? (
                <span className="text-[11px] text-muted-foreground/50 flex items-center gap-1">
                  <Users className="h-2.5 w-2.5" />
                  {participantCount || 0} عضو
                </span>
              ) : displayPhone ? (
                <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1 tabular-nums" dir="ltr">
                  <Phone className="h-2.5 w-2.5" />
                  {displayPhone}
                </p>
              ) : null}
            </div>
          </button>

          {/* SLA Indicator */}
          {slaData && <SlaIndicator conversation={slaData} />}

          {/* Other Agents Viewing (Collision Detection) */}
          {otherViewers.length > 0 && (
            <div className="flex items-center gap-1 shrink-0" title={otherViewers.join(', ')}>
              <div className="flex -space-x-1.5 rtl:space-x-reverse">
                {otherViewers.slice(0, 3).map((agent) => (
                  <div
                    key={agent}
                    className="w-6 h-6 rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center text-white text-[9px] font-bold border-2 border-card"
                  >
                    {agent.charAt(0).toUpperCase()}
                  </div>
                ))}
              </div>
              <span className="text-[9px] text-blue-500 dark:text-blue-400 font-medium">
                {otherViewers.length === 1 ? `${otherViewers[0]} يشاهد` : `${otherViewers.length} يشاهدون`}
              </span>
            </div>
          )}

          {/* Business Hours Badge */}
          {isOutsideBusinessHours && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border border-amber-200/50 dark:border-amber-800/30 flex items-center gap-1 shrink-0">
              <Clock className="h-2.5 w-2.5" />
              خارج ساعات العمل
            </span>
          )}
        </div>
        <div className="flex items-center gap-1 relative">
          {/* Assign to Agent — admin only */}
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'rounded-xl h-9 w-9',
                showAssign && 'bg-orange-50 dark:bg-orange-950/20 text-orange-600'
              )}
              onClick={onToggleAssign}
              title="تعيين لوكيل"
              aria-label="تعيين لوكيل"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          )}

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

          {/* Snooze */}
          {conversationId && (
            <SnoozePicker
              conversationId={conversationId}
              snoozedUntil={snoozedUntil}
              onSnoozed={onSnoozed}
            />
          )}

          {/* Mute */}
          {conversationId && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'rounded-xl h-9 w-9',
                isMuted && 'bg-gray-100 dark:bg-gray-800/40 text-gray-500'
              )}
              onClick={onMuteToggle}
              title={isMuted ? 'إلغاء الكتم' : 'كتم'}
              aria-label={isMuted ? 'إلغاء الكتم' : 'كتم'}
            >
              {isMuted ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
            </Button>
          )}

          {/* Labels */}
          {conversationId && (
            <LabelPicker
              conversationId={conversationId}
              assignedLabels={labels}
              compact
            />
          )}

          {/* Status Actions */}
          {conversationId && (
            <div className="flex items-center gap-1">
              {conversationStatus !== 'resolved' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
                  onClick={() => onStatusChange('resolved')}
                  disabled={updatingStatus}
                  data-testid="btn-resolve"
                >
                  <CheckCircle2 className="h-3 w-3 me-0.5" />
                  حل
                </Button>
              )}
              {conversationStatus === 'open' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] rounded-lg text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/20"
                  onClick={() => onStatusChange('pending')}
                  disabled={updatingStatus}
                >
                  <Clock className="h-3 w-3 me-0.5" />
                  تعليق
                </Button>
              )}
              {conversationStatus === 'resolved' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                  onClick={() => onStatusChange('open')}
                  disabled={updatingStatus}
                >
                  إعادة فتح
                </Button>
              )}
            </div>
          )}

          {/* Search Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'rounded-xl h-9 w-9',
              searchOpen && 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600'
            )}
            onClick={() => {
              onToggleSearch();
              if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
            title="بحث في الرسائل"
            aria-label="بحث"
          >
            <Search className="h-4 w-4" />
          </Button>

          {/* Contact Info Sidebar Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'rounded-xl h-9 w-9 hidden lg:flex',
              showSidebar && 'bg-teal-50 dark:bg-teal-950/20 text-teal-600'
            )}
            onClick={onToggleSidebar}
            title="معلومات جهة الاتصال"
            aria-label="معلومات جهة الاتصال"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>

          {leadId && (
            <Button variant="ghost" size="sm" asChild className="rounded-xl text-xs hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:text-orange-600 lg:hidden">
              <Link href={`/dashboard/sales/leads/${leadId}`}>
                <User className="h-3.5 w-3.5 me-1" />
                <span className="hidden sm:inline">عرض العميل</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-border/30 bg-muted/20 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
          <Search className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
            placeholder="بحث في الرسائل..."
            className="flex-1 bg-transparent text-sm border-none focus:outline-none placeholder:text-muted-foreground/40"
          />
          {searchQuery && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium shrink-0 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-full">
              {displayMessagesCount} نتيجة
            </span>
          )}
          <button
            onClick={onCloseSearch}
            className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </>
  );
}
