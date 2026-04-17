'use client';

import { memo, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { User, Users, Pin, BellOff, Check } from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import type { Conversation } from '@/hooks/useWhatsApp';
import { LabelDots } from '../dialogs/label-picker';
import { CsatBadge } from '../csat/csat-badge';

interface ConversationItemProps {
  conversation: Conversation;
  isSelected: boolean;
  onSelect: (conv: Conversation) => void;
  bulkMode?: boolean;
  isChecked?: boolean;
  onToggleCheck?: (convId: string) => void;
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
        'w-full text-start px-3 py-2 border-b border-[#e9edef] dark:border-[#313d45] transition-colors duration-150 flex items-center gap-3',
        'hover:bg-[#f0f2f5] dark:hover:bg-[#202c33]',
        isSelected && 'bg-[#f0f2f5] dark:bg-[#2a3942] hover:bg-[#f0f2f5] dark:hover:bg-[#2a3942]'
      )}
      style={{ contentVisibility: 'auto', containIntrinsicSize: '0 72px' }}
    >
      {/* Bulk checkbox */}
      {bulkMode && (
        <div className={cn(
          'w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors',
          isChecked
            ? 'bg-[#00a884] border-[#00a884] text-white'
            : 'border-[#8696a0] hover:border-[#00a884]'
        )}>
          {isChecked && <Check className="h-3 w-3" />}
        </div>
      )}

      {/* Avatar — WhatsApp style: plain gray bg with white icon/initial */}
      <div className="relative shrink-0">
        {conv.is_group ? (
          conv.group_picture_url ? (
            <img src={conv.group_picture_url} alt="" className="w-12 h-12 rounded-full object-cover" />
          ) : (
            <div className="w-12 h-12 rounded-full bg-[#dfe5e7] dark:bg-[#6b7b8a] flex items-center justify-center text-white shrink-0">
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
          <div className="w-12 h-12 rounded-full bg-[#dfe5e7] dark:bg-[#6b7b8a] flex items-center justify-center font-medium text-base text-white">
            {displayName.charAt(0).toUpperCase()}
          </div>
        )}
        {/* Online indicator */}
        {!conv.is_group && isOnline && (
          <div className="absolute bottom-0 end-0 w-3 h-3 rounded-full bg-[#00a884] border-2 border-white dark:border-[#111b21]" />
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        {/* Row 1: Name + Timestamp */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="text-[17px] font-normal text-[#111b21] dark:text-[#e9edef] truncate leading-snug">
              {conv.is_group
                ? displayName
                : (conv.contact_name || (phone.length > 5 ? `+${phone}` : phone))}
            </p>
            {conv.is_group && (
              <Users className="h-3.5 w-3.5 text-[#667781] dark:text-[#8696a0] shrink-0" />
            )}
          </div>
          <span className={cn(
            'text-[12px] shrink-0 tabular-nums',
            hasUnread
              ? 'text-[#00a884]'
              : 'text-[#667781] dark:text-[#8696a0]'
          )}>
            {formatRelativeDate(conv.last_message_at || conv.last_timestamp || '')}
          </span>
        </div>

        {/* Row 2: Last message + indicators */}
        <div className="flex items-center justify-between mt-0.5">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            {conv.is_typing ? (
              <span className="text-[14px] text-[#00a884] animate-pulse leading-snug">
                يكتب...
              </span>
            ) : (
              <p className="text-[14px] text-[#667781] dark:text-[#8696a0] truncate leading-snug">
                {conv.assigned_to && <span className="text-[#667781] dark:text-[#8696a0]">{conv.assigned_to}: </span>}
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
            {conv.is_muted && (
              <BellOff className="h-4 w-4 text-[#667781] dark:text-[#8696a0]" />
            )}
            {conv.is_pinned && (
              <Pin className="h-4 w-4 text-[#667781] dark:text-[#8696a0]" />
            )}
            {!conv.is_group && conv.lead_id && (
              <span title="عميل محتمل"><User className="h-3.5 w-3.5 text-[#667781] dark:text-[#8696a0]" /></span>
            )}
            {hasUnread && (
              <div className="min-w-[20px] h-5 rounded-full bg-[#00a884] text-white text-[11px] font-bold flex items-center justify-center px-1">
                {conv.unread_count > 99 ? '99+' : conv.unread_count}
              </div>
            )}
          </div>
        </div>
      </div>
    </button>
  );
});
