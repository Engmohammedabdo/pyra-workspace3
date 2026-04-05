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
    <div className="flex flex-col h-full border-e border-border/60 bg-card/50">
      {/* Search + Sort */}
      <div className="p-3 border-b border-border/40 bg-card/80 space-y-2">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
          <input
            data-chat-search
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرقم..."
            className={cn(
              'w-full rounded-xl border border-border/50 bg-muted/20 ps-9 pe-3 py-2.5 text-sm',
              'placeholder:text-muted-foreground/40',
              'focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-400/60',
              'transition-all duration-200'
            )}
          />
        </div>
        <div className="flex items-center justify-end">
          <div className="flex items-center gap-2">
            {bulkMode && onSelectAll && (
              <button
                onClick={onSelectAll}
                className="text-[10px] text-orange-600 dark:text-orange-400 hover:underline"
              >
                تحديد الكل
              </button>
            )}
            <span className="text-[10px] text-muted-foreground/40">
              {filtered.length} محادثة
            </span>
          </div>
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto" style={{ contentVisibility: 'auto' }}>
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
            <div className="w-14 h-14 rounded-2xl bg-muted/40 flex items-center justify-center mb-3">
              {search ? (
                <Search className="h-6 w-6 opacity-40" />
              ) : (
                <MessageCircle className="h-6 w-6 opacity-40" />
              )}
            </div>
            <p className="text-sm font-medium">
              {search ? 'لا توجد نتائج' : 'لا توجد محادثات'}
            </p>
            {search && (
              <p className="text-xs text-muted-foreground/40 mt-1">حاول بكلمة بحث مختلفة</p>
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
