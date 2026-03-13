'use client';

import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Search, MessageCircle } from 'lucide-react';
import { useState } from 'react';
import { formatRelativeDate } from '@/lib/utils/format';

export interface Conversation {
  remote_jid: string;
  instance_name: string;
  lead_id: string | null;
  client_id: string | null;
  contact_name: string | null;
  last_message: string | null;
  last_message_type: string;
  last_timestamp: string;
  unread_count: number;
  total_messages: number;
}

interface ConversationListProps {
  conversations: Conversation[];
  selectedJid: string | null;
  onSelect: (conv: Conversation) => void;
}

export function ConversationList({ conversations, selectedJid, onSelect }: ConversationListProps) {
  const [search, setSearch] = useState('');

  const filtered = conversations.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    const name = c.contact_name?.toLowerCase() || '';
    const phone = c.remote_jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
    return name.includes(q) || phone.includes(q);
  });

  return (
    <div className="flex flex-col h-full border-e border-border/60 bg-card/50">
      {/* Search */}
      <div className="p-3 border-b border-border/60">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/50" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث في المحادثات..."
            className={cn(
              'w-full rounded-xl border border-border/60 bg-muted/30 ps-9 pe-3 py-2 text-sm',
              'placeholder:text-muted-foreground/50',
              'focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400',
              'transition-all duration-200'
            )}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground/60">
            <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-3">
              <MessageCircle className="h-6 w-6 opacity-50" />
            </div>
            <p className="text-sm">لا توجد محادثات</p>
          </div>
        ) : (
          filtered.map(conv => {
            const phone = conv.remote_jid.replace('@s.whatsapp.net', '').replace('@c.us', '');
            const displayName = conv.contact_name || phone;
            const isSelected = conv.remote_jid === selectedJid;

            return (
              <button
                key={conv.remote_jid}
                onClick={() => onSelect(conv)}
                className={cn(
                  'w-full text-start px-3 py-3 border-b border-border/30 hover:bg-muted/40 transition-all duration-150 flex items-start gap-3',
                  isSelected && 'bg-orange-50/80 dark:bg-orange-950/20 border-s-[3px] border-s-orange-500 hover:bg-orange-50/80 dark:hover:bg-orange-950/20'
                )}
              >
                {/* Avatar */}
                <div className={cn(
                  'w-11 h-11 rounded-xl flex items-center justify-center font-bold text-sm shrink-0 shadow-sm transition-transform',
                  isSelected
                    ? 'bg-gradient-to-br from-orange-400 to-amber-600 text-white shadow-orange-500/20'
                    : 'bg-gradient-to-br from-gray-100 to-gray-200 dark:from-gray-800 dark:to-gray-700 text-foreground/70'
                )}>
                  {displayName.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={cn(
                      'font-medium text-sm truncate',
                      isSelected && 'text-orange-700 dark:text-orange-400'
                    )}>
                      {displayName}
                    </p>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0 ms-2">
                      {formatRelativeDate(conv.last_timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs text-muted-foreground/70 truncate">
                      {conv.last_message_type !== 'text' ? (
                        conv.last_message_type === 'image' ? '📷 صورة' :
                        conv.last_message_type === 'audio' ? '🎙️ صوت' :
                        conv.last_message_type === 'video' ? '🎥 فيديو' :
                        '📎 ملف'
                      ) : conv.last_message || '...'}
                    </p>
                    {conv.unread_count > 0 && (
                      <div className="min-w-[22px] h-[22px] rounded-full bg-gradient-to-br from-orange-400 to-amber-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0 ms-2 shadow-sm shadow-orange-500/20">
                        {conv.unread_count}
                      </div>
                    )}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
