'use client';

import { cn } from '@/lib/utils/cn';
import { Search, MessageCircle } from 'lucide-react';
import { useState, useMemo } from 'react';
import type { Conversation } from '@/hooks/useWhatsApp';
import { splitInbox, type InboxConversationLike } from '@/lib/whatsapp/inbox';
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
  // CR-T4 — needs-reply/rest sectioning. Callers on a flat tab (resolved,
  // snoozed) pass false to keep the API's own order with no headers.
  sectioned?: boolean;
  isAdmin?: boolean;
  onQuickAssign?: (conv: Conversation) => void;
  onQuickResolve?: (conv: Conversation) => void;
}

// Conversation's id/status/timestamp fields are optional; splitInbox requires
// InboxConversationLike's required fields. This widens each row with safe
// defaults while keeping every original Conversation field, so the sectioned
// arrays can still be handed straight to ConversationItem.
type SectionableConversation = Conversation & InboxConversationLike;

function toSectionable(c: Conversation): SectionableConversation {
  return {
    ...c,
    id: c.id ?? '',
    status: c.status ?? '',
    last_customer_message_at: c.last_customer_message_at ?? null,
    last_agent_message_at: c.last_agent_message_at ?? null,
    last_message_at: c.last_message_at ?? null,
  };
}

export function ConversationList({
  conversations,
  selectedJid,
  onSelect,
  bulkMode,
  selectedIds,
  onToggleCheck,
  onSelectAll,
  sectioned = true,
  isAdmin,
  onQuickAssign,
  onQuickResolve,
}: ConversationListProps) {
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

  // Needs-reply (oldest customer message first) vs rest (most recent first).
  // Non-sectioned tabs skip the split entirely and keep the API's own order.
  const { needs, rest } = useMemo(() => {
    if (!sectioned) {
      return { needs: [] as SectionableConversation[], rest: filtered.map(toSectionable) };
    }
    return splitInbox(filtered.map(toSectionable), Date.now());
  }, [filtered, sectioned]);

  // Headers show ONLY when there's something needing a reply — otherwise the
  // list degrades to a plain flat list (no empty "باقي المحادثات" header).
  const showHeaders = sectioned && needs.length > 0;

  function renderItem(conv: SectionableConversation) {
    return (
      <ConversationItem
        key={conv.remote_jid}
        conversation={conv}
        isSelected={conv.remote_jid === selectedJid}
        onSelect={onSelect}
        bulkMode={bulkMode}
        isChecked={conv.id ? selectedIds?.has(conv.id) : false}
        onToggleCheck={onToggleCheck}
        isAdmin={isAdmin}
        onQuickAssign={onQuickAssign}
        onQuickResolve={onQuickResolve}
      />
    );
  }

  return (
    <div className="flex flex-col h-full border-e border-border bg-card">
      {/* Search */}
      <div className="px-3 py-2 bg-muted border-b border-border">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            id="wa-conv-search"
            data-chat-search
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="بحث بالاسم أو الرقم..."
            className={cn(
              'w-full rounded-lg border-0 bg-card ps-9 pe-3 h-9 text-[14px]',
              'text-foreground',
              'placeholder:text-muted-foreground',
              'focus:outline-none focus:ring-0',
              'transition-colors duration-200'
            )}
          />
        </div>
        {bulkMode && onSelectAll && (
          <div className="flex items-center justify-end mt-1.5">
            <button
              onClick={onSelectAll}
              className="text-[12px] text-orange-700 dark:text-orange-300 hover:underline"
            >
              تحديد الكل
            </button>
          </div>
        )}
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
            <div className="w-14 h-14 rounded-full bg-muted flex items-center justify-center mb-3">
              {search ? (
                <Search className="h-6 w-6 text-muted-foreground" />
              ) : (
                <MessageCircle className="h-6 w-6 text-muted-foreground" />
              )}
            </div>
            <p className="text-sm font-normal text-foreground">
              {search ? 'لا توجد نتائج' : 'لا توجد محادثات'}
            </p>
            {search && (
              <p className="text-[13px] text-muted-foreground mt-1">حاول بكلمة بحث مختلفة</p>
            )}
          </div>
        ) : (
          <>
            {showHeaders && (
              <div className="sticky top-0 z-10 px-3 py-1.5 text-[11px] font-semibold bg-orange-500/10 text-orange-700 dark:text-orange-300 border-b border-orange-500/20">
                محتاج رد — الأقدم الأول
              </div>
            )}
            {needs.map(renderItem)}
            {showHeaders && rest.length > 0 && (
              <div className="sticky top-0 z-10 px-3 py-1.5 text-[11px] font-semibold bg-muted text-muted-foreground border-b border-border">
                باقي المحادثات
              </div>
            )}
            {rest.map(renderItem)}
          </>
        )}
      </div>
    </div>
  );
}
