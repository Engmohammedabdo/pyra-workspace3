'use client';

import { cn } from '@/lib/utils/cn';
import { Search, MessageCircle } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Conversation } from '@/hooks/useWhatsApp';
import { ConversationItem } from './conversation-list/conversation-item';

// Re-export Conversation type for backward compatibility
export type { Conversation } from '@/hooks/useWhatsApp';

interface ConversationListProps {
  conversations: Conversation[];
  selectedJid: string | null;
  onSelect: (conv: Conversation) => void;
  bulkMode?: boolean;
  selectedIds?: Set<string>;
  onToggleCheck?: (id: string) => void;
  onSelectAll?: () => void;
}

export function ConversationList({ conversations, selectedJid, onSelect, bulkMode, selectedIds, onToggleCheck, onSelectAll }: ConversationListProps) {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search) return conversations;
    const q = search.toLowerCase();
    return conversations.filter(c => {
      const name = c.contact_name?.toLowerCase() || '';
      const phone = c.contact_phone || c.phone || c.remote_jid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
      return name.includes(q) || phone.includes(q);
    });
  }, [conversations, search]);

  return (
    <div className="flex flex-col h-full border-e border-[#e9edef] dark:border-[#313d45] bg-white dark:bg-[#111b21]">
      {/* Search — WhatsApp Web style */}
      <div className="px-3 py-2 bg-[#f0f2f5] dark:bg-[#111b21] border-b border-[#e9edef] dark:border-[#313d45]">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#54656f] dark:text-[#8696a0]" />
          <input
            data-chat-search
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرقم..."
            className={cn(
              'w-full rounded-lg border-0 bg-white dark:bg-[#202c33] ps-9 pe-3 h-9 text-[14px]',
              'text-[#111b21] dark:text-[#e9edef]',
              'placeholder:text-[#667781] dark:placeholder:text-[#8696a0]',
              'focus:outline-none focus:ring-0',
              'transition-colors duration-200'
            )}
          />
        </div>
        {bulkMode && onSelectAll && (
          <div className="flex items-center justify-end mt-1.5">
            <button
              onClick={onSelectAll}
              className="text-[12px] text-[#00a884] hover:underline"
            >
              تحديد الكل
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-[#667781] dark:text-[#8696a0]">
            <div className="w-14 h-14 rounded-full bg-[#dfe5e7] dark:bg-[#6b7b8a] flex items-center justify-center mb-3">
              {search ? (
                <Search className="h-6 w-6 text-white" />
              ) : (
                <MessageCircle className="h-6 w-6 text-white" />
              )}
            </div>
            <p className="text-sm font-normal text-[#111b21] dark:text-[#e9edef]">
              {search ? 'لا توجد نتائج' : 'لا توجد محادثات'}
            </p>
            {search && (
              <p className="text-[13px] text-[#667781] dark:text-[#8696a0] mt-1">حاول بكلمة بحث مختلفة</p>
            )}
          </div>
        ) : (
          filtered.map(conv => (
            <ConversationItem
              key={conv.remote_jid}
              conversation={conv}
              isSelected={conv.remote_jid === selectedJid}
              onSelect={onSelect}
              bulkMode={bulkMode}
              isChecked={conv.id ? selectedIds?.has(conv.id) : false}
              onToggleCheck={onToggleCheck}
            />
          ))
        )}
      </div>
    </div>
  );
}
