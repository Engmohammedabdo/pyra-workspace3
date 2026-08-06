'use client';

import { memo, useState, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils/cn';
import { User, Users, Pin, BellOff, Check } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import type { Conversation } from '@/hooks/useWhatsApp';
import { waitingMinutes, waitingSeverity, formatWaiting, type InboxConversationLike } from '@/lib/whatsapp/inbox';
import { LabelDots } from '../dialogs/label-picker';
import { CsatBadge } from '../csat/csat-badge';
import { isNonCompanyLine, lineLabel } from '../line-label';

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: (conv: Conversation) => void;
  bulkMode?: boolean;
  isChecked?: boolean;
  onToggleCheck?: (convId: string) => void;
  // CR-T4 — row-level quick actions. isAdmin gates «إسناد» the same way the
  // header/toolbar do; onQuickResolve is hidden once the row is already
  // resolved. Both are optional so the item still renders standalone.
  isAdmin?: boolean;
  onQuickAssign?: (conv: Conversation) => void;
  onQuickResolve?: (conv: Conversation) => void;
}

const MEDIA_LABELS: Record<string, string> = {
  image: '📷 صورة',
  audio: '🎙️ صوت',
  video: '🎥 فيديو',
  document: '📎 مستند',
  sticker: '🏷️ ملصق',
  contact: '👤 جهة اتصال',
  location: '📍 موقع',
};

/** Conversation → InboxConversationLike, matching the shape lib/whatsapp/inbox.ts requires. */
function toInboxLike(conv: Conversation): InboxConversationLike {
  return {
    id: conv.id ?? '',
    status: conv.status ?? '',
    last_customer_message_at: conv.last_customer_message_at ?? null,
    last_agent_message_at: conv.last_agent_message_at ?? null,
    last_message_at: conv.last_message_at ?? null,
  };
}

export const ConversationItem = memo(function ConversationItem({
  conversation: conv,
  isSelected,
  onSelect,
  bulkMode,
  isChecked,
  onToggleCheck,
  isAdmin,
  onQuickAssign,
  onQuickResolve,
}: ConversationItemProps) {
  const phone = conv.contact_phone || conv.phone || conv.remote_jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
  const displayName = conv.is_group
    ? (conv.group_subject || conv.contact_name || conv.remote_jid)
    : (conv.contact_name || phone);
  const msgType = conv.last_message_type || 'text';
  const profilePic = (conv.custom_attributes as Record<string, string> | null)?.profile_pic || null;
  const [imgError, setImgError] = useState(false);
  const lastMsgPreview = msgType !== 'text'
    ? MEDIA_LABELS[msgType] || '📎 ملف'
    : conv.last_message || '...';

  // Online status — check if last_seen_at is within 5 minutes
  const lastSeenAt = (conv.custom_attributes as Record<string, string> | null)?.last_seen_at;
  const isOnline = lastSeenAt
    ? (Date.now() - new Date(lastSeenAt).getTime()) < 5 * 60 * 1000
    : false;

  const hasUnread = conv.unread_count > 0;
  const isResolved = conv.status === 'resolved';
  // Snoozing only sets snoozed_until — status stays 'open' — so a snoozed
  // row still looks like a needs-reply row to waitingMinutes(). Compute it
  // explicitly so the chip can be suppressed on the Snoozed tab (CR-T2
  // precedent: a deliberately-deferred conversation must not show urgency).
  const isSnoozed = !!conv.snoozed_until && new Date(conv.snoozed_until).getTime() > Date.now();

  // Waiting chip — non-null only on a genuine needs-reply row (open,
  // customer waiting on us) that hasn't been deliberately snoozed;
  // resolved/pending rows always get null from waitingMinutes() itself,
  // and snoozed rows are forced to null here since snoozing doesn't
  // change status. This naturally scopes the chip to the needs section
  // without the item needing to know which section it's rendered in.
  const waitMins = isSnoozed ? null : waitingMinutes(toInboxLike(conv), Date.now());
  const severity = waitMins !== null ? waitingSeverity(waitMins) : null;

  const canAssign = isAdmin && !!onQuickAssign;
  const canResolve = !isResolved && !!onQuickResolve;
  const showQuickActions = canAssign || canResolve;

  function handleActivate() {
    if (bulkMode && onToggleCheck && conv.id) {
      onToggleCheck(conv.id);
    } else {
      onSelect(conv);
    }
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    // Nested-button keyboard path: the quick-action buttons (⤺ إسناد / ✓ حل)
    // live inside this row, so a bubbled Enter/Space keydown from a focused
    // button would otherwise land here too. Bail unless the row itself is
    // the actual target — acting on it would call preventDefault() and
    // handleActivate() before the browser's own Enter-to-click synthesis
    // for the button ever fires, silently swallowing the button's action
    // and selecting the row instead. Defense in depth alongside the
    // stopPropagation() on the quick-actions wrapper below.
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleActivate();
    }
  }

  return (
    <div
      data-testid={conv.id ? `conversation-${conv.id}` : undefined}
      role="button"
      tabIndex={0}
      onClick={handleActivate}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative w-full text-start px-3 py-2 border-b border-border transition-colors duration-150 flex items-center gap-3 cursor-pointer',
        'hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500/50',
        isResolved && 'opacity-60',
        isSelected && 'bg-orange-500/10 hover:bg-orange-500/10'
      )}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 72px' }}
    >
      {/* Selected-row indicator — 3px start-side bar, logical so it flips with RTL */}
      {isSelected && (
        <span aria-hidden="true" className="absolute start-0 inset-y-0 w-[3px] bg-orange-500" />
      )}

      {/* Bulk checkbox */}
      {bulkMode && (
        <div className={cn(
          'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
          isChecked
            ? 'bg-orange-500 border-orange-500 text-white'
            : 'border-muted-foreground/40 hover:border-orange-500'
        )}>
          {isChecked && <Check className="h-3 w-3" />}
        </div>
      )}

      {/* Avatar */}
      <div className="relative shrink-0">
        {conv.is_group ? (
          conv.group_picture_url ? (
            <img src={conv.group_picture_url} alt="" className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-muted text-muted-foreground border border-border flex items-center justify-center shrink-0">
              <Users className="h-6 w-6" />
            </div>
          )
        ) : profilePic && !imgError ? (
          <img
            src={profilePic}
            alt={displayName}
            className="w-12 h-12 rounded-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-muted text-muted-foreground border border-border flex items-center justify-center font-medium text-base">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {/* Online indicator */}
        {!conv.is_group && isOnline && (
          <div className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-emerald-500 border-2 border-card" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Name + Timestamp */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[17px] font-normal text-foreground truncate leading-snug">
              {conv.is_group
                ? displayName
                : (conv.contact_name || (phone.length > 5 ? `+${phone}` : phone))}
            </p>
            {conv.is_group && (
              <Users className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
          </div>
          <span className={cn(
            'text-[12px] shrink-0 tabular-nums',
            hasUnread
              ? 'text-orange-700 dark:text-orange-300'
              : 'text-muted-foreground'
          )}>
            {formatRelativeDate(conv.last_message_at || conv.last_timestamp || '')}
          </span>
        </div>

        {/* Row 2: Last message + indicators */}
        <div className="flex items-center justify-between mt-0.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {conv.is_typing ? (
              <span className="text-[14px] text-orange-700 dark:text-orange-300 animate-pulse leading-snug">
                يكتب...
              </span>
            ) : (
              <p className="text-[14px] text-muted-foreground truncate leading-snug">
                {conv.assigned_to && <span className="text-muted-foreground">{conv.assigned_to}: </span>}
                {lastMsgPreview}
              </p>
            )}
            <LabelDots labels={conv.labels} />
            {conv.status === 'resolved' && conv.csat_rating && (
              <CsatBadge rating={conv.csat_rating} size="sm" />
            )}
          </div>

          {/* Right-side indicators */}
          <div className="flex items-center gap-1.5 shrink-0 ms-2">
            {/* Waiting chip — needs-reply rows only (see waitMins comment above) */}
            {waitMins !== null && (
              <span className={cn(
                'text-[10px] font-medium px-1.5 py-0.5 rounded-full border shrink-0',
                severity === 'late'
                  ? 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/20'
                  : 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20'
              )}>
                ⏱ {formatWaiting(waitMins)}
              </span>
            )}
            {/* Line badge — only for non-company lines, so the default number
                stays clean while agent lines are unmistakable at a glance */}
            {isNonCompanyLine(conv.instance_name) && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                {lineLabel(conv.instance_name)}
              </span>
            )}
            {conv.is_muted && (
              <BellOff className="h-4 w-4 text-muted-foreground" />
            )}
            {conv.is_pinned && (
              <Pin className="h-4 w-4 text-muted-foreground" />
            )}
            {!conv.is_group && conv.lead_id && (
              <span title="عميل محتمل"><User className="h-3.5 w-3.5 text-muted-foreground" /></span>
            )}
            {hasUnread && (
              <div className="min-w-[20px] h-5 rounded-full bg-orange-500 text-white text-[11px] font-bold flex items-center justify-center px-1">
                {conv.unread_count > 99 ? '99+' : conv.unread_count}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Row-level quick actions — revealed on hover/keyboard focus, never
          trigger row selection (stopPropagation on every click, and on
          keydown too — see the nested-button note on handleKeyDown above). */}
      {showQuickActions && (
        <div
          className={cn(
            'absolute end-2 top-1/2 -translate-y-1/2 flex items-center gap-1',
            'opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity'
          )}
          onKeyDown={(e) => e.stopPropagation()}
        >
          {canAssign && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onQuickAssign?.(conv); }}
              className="text-[11px] font-medium px-2 py-1 rounded-md border border-border bg-card shadow-sm text-muted-foreground hover:bg-orange-500/10 hover:text-orange-700 dark:hover:text-orange-300 transition-colors"
            >
              ⤺ إسناد
            </button>
          )}
          {canResolve && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onQuickResolve?.(conv); }}
              className="text-[11px] font-medium px-2 py-1 rounded-md border border-border bg-card shadow-sm text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300 transition-colors"
            >
              ✓ حل
            </button>
          )}
        </div>
      )}
    </div>
  );
});
