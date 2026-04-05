'use client';

import { memo } from 'react';
import { cn } from '@/lib/utils/cn';
import { User, Pin, AlarmClock, BellOff, Check } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import type { Conversation } from '@/hooks/useWhatsApp';
import { isCurrentlySnoozed } from '@/lib/whatsapp/sla';
import { LabelDots } from '../dialogs/label-picker';
import { SlaIndicator } from '../sla/sla-indicator';
import { CsatBadge } from '../csat/csat-badge';

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: (conv: Conversation) => void;
  bulkMode?: boolean;
  isChecked?: boolean;
  onToggleCheck?: (convId: string) => void;
}

/** Generates a consistent color from a string hash */
function getAvatarColor(str: string): string {
  const colors = [
    'from-orange-400 to-amber-600',
    'from-emerald-400 to-teal-600',
    'from-blue-400 to-indigo-600',
    'from-purple-400 to-violet-600',
    'from-rose-400 to-pink-600',
    'from-cyan-400 to-sky-600',
    'from-lime-400 to-green-600',
    'from-fuchsia-400 to-purple-600',
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
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

export const ConversationItem = memo(function ConversationItem({ conversation: conv, isSelected, onSelect, bulkMode, isChecked, onToggleCheck }: ConversationItemProps) {
  const phone = conv.contact_phone || conv.phone || conv.remote_jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
  const displayName = conv.contact_name || phone;
  const avatarColor = getAvatarColor(conv.remote_jid);
  const msgType = conv.last_message_type || 'text';
  const lastMsgPreview = msgType !== 'text'
    ? MEDIA_LABELS[msgType] || '📎 ملف'
    : conv.last_message || '...';

  const isSnoozed = isCurrentlySnoozed(conv.snoozed_until);

  return (
    <button
      data-testid={conv.id ? `conversation-${conv.id}` : undefined}
      onClick={() => {
        if (bulkMode && onToggleCheck && conv.id) {
          onToggleCheck(conv.id);
        } else {
          onSelect(conv);
        }
      }}
      className={cn(
        'w-full text-start px-3 py-3 border-b border-border/20 transition-all duration-150 flex items-center gap-3',
        'hover:bg-muted/30',
        isSelected && 'bg-emerald-50/80 dark:bg-emerald-950/15 border-s-[3px] border-s-emerald-500 hover:bg-emerald-50/80 dark:hover:bg-emerald-950/15'
      )}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 76px' }}
    >
      {/* Bulk checkbox */}
      {bulkMode && (
        <div className={cn(
          'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
          isChecked
            ? 'bg-orange-500 border-orange-500 text-white'
            : 'border-border/60 hover:border-orange-400'
        )}>
          {isChecked && <Check className="h-3 w-3" />}
        </div>
      )}

      {/* Avatar */}
      <div className={cn(
        'w-11 h-11 rounded-full flex items-center justify-center font-bold text-sm shrink-0 shadow-sm',
        'bg-gradient-to-br text-white',
        isSelected ? 'from-emerald-500 to-teal-600 shadow-emerald-500/20' : avatarColor
      )}>
        {displayName.charAt(0).toUpperCase()}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className={cn(
              'font-semibold text-sm truncate',
              isSelected && 'text-emerald-700 dark:text-emerald-400'
            )}>
              {conv.contact_name || (phone.length > 5 ? `+${phone}` : phone)}
            </p>
            {conv.is_pinned && (
              <Pin className="h-3 w-3 text-orange-500 shrink-0" />
            )}
            {conv.lead_id && (
              <div className="shrink-0 w-4 h-4 rounded-full bg-orange-100 dark:bg-orange-900/30 flex items-center justify-center" title="عميل محتمل">
                <User className="h-2.5 w-2.5 text-orange-600 dark:text-orange-400" />
              </div>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground/50 shrink-0 tabular-nums">
            {formatRelativeDate(conv.last_message_at || conv.last_timestamp || '')}
          </span>
        </div>

        {/* Phone + assigned agent */}
        <div className="flex items-center gap-2 mt-0.5">
          {conv.contact_name && phone && phone.length > 5 && (
            <span className="text-[10px] text-muted-foreground/40 tabular-nums" dir="ltr">
              +{phone}
            </span>
          )}
          {conv.assigned_to ? (
            <span className="text-[10px] bg-blue-50 dark:bg-blue-950/20 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded-full">
              {conv.assigned_to}
            </span>
          ) : (
            <span className="text-[10px] bg-orange-50 dark:bg-orange-950/20 text-orange-600 dark:text-orange-400 px-1.5 py-0.5 rounded-full">
              غير مسند
            </span>
          )}
          {conv.status === 'pending' && (
            <span className="w-2 h-2 rounded-full bg-yellow-500 shrink-0" title="بانتظار الرد" />
          )}
          {conv.priority === 'urgent' && (
            <span className="w-2 h-2 rounded-full bg-red-500 shrink-0" title="عاجل" />
          )}
          {isSnoozed && (
            <span title="مؤجلة"><AlarmClock className="h-3 w-3 text-amber-500 shrink-0" /></span>
          )}
          {conv.is_muted && (
            <span title="صامتة"><BellOff className="h-3 w-3 text-gray-400 shrink-0" /></span>
          )}
          {conv.sla_policy_id && conv.status !== 'resolved' && (
            <SlaIndicator conversation={conv} compact />
          )}
        </div>

        <div className="flex items-center justify-between mt-0.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <p className="text-xs text-muted-foreground/60 truncate">
              {lastMsgPreview}
            </p>
            <LabelDots labels={conv.labels} />
            {conv.status === 'resolved' && conv.csat_rating && (
              <CsatBadge rating={conv.csat_rating} size="sm" />
            )}
          </div>
          {conv.unread_count > 0 && (
            <div className="min-w-[20px] h-[20px] rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 ms-2 shadow-sm shadow-emerald-500/20">
              {conv.unread_count > 99 ? '99+' : conv.unread_count}
            </div>
          )}
        </div>
      </div>
    </button>
  );
});
