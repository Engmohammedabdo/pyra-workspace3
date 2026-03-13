'use client';

import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
    <div className="flex flex-col h-full border-e">
      {/* Search */}
      <div className="p-3 border-b">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث..."
            className="ps-9 h-9"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <MessageCircle className="h-8 w-8 mb-2 opacity-50" />
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
                  'w-full text-start px-4 py-3 border-b hover:bg-muted/50 transition-colors flex items-start gap-3',
                  isSelected && 'bg-orange-50 dark:bg-orange-950/30 border-s-2 border-s-orange-500'
                )}
              >
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-sm shrink-0">
                  {displayName.charAt(0).toUpperCase()}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-sm truncate">{displayName}</p>
                    <span className="text-[10px] text-muted-foreground shrink-0 ms-2">
                      {formatRelativeDate(conv.last_timestamp)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className="text-xs text-muted-foreground truncate">
                      {conv.last_message_type !== 'text' ? (
                        conv.last_message_type === 'image' ? '📷 صورة' :
                        conv.last_message_type === 'audio' ? '🎙️ صوت' :
                        conv.last_message_type === 'video' ? '🎥 فيديو' :
                        '📎 ملف'
                      ) : conv.last_message || '...'}
                    </p>
                    {conv.unread_count > 0 && (
                      <Badge className="bg-orange-500 text-white text-[10px] min-w-[20px] h-5 shrink-0 ms-2">
                        {conv.unread_count}
                      </Badge>
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
