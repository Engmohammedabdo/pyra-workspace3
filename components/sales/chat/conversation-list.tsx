'use client';

import { cn } from '@/lib/utils/cn';
import { Search, MessageCircle } from 'lucide-react';
import type { Conversation } from '@/hooks/useWhatsApp';
import { ConversationItem } from './conversation-list/conversation-item';

// Re-export Conversation type for backward compatibility
export type { Conversation } from '@/hooks/useWhatsApp';

interface ConversationListProps {
  // Pre-ordered by the caller: needs-reply (oldest customer message first),
  // then the rest (most recent first), already search-filtered — see
  // chat-layout.tsx's displayConversations useMemo. This list renders that
  // EXACT order (sliced at needsCount for the section header) rather than
  // recomputing it, so the rendered order always matches what
  // use-chat-shortcuts.ts navigates over (I3, whole-wave review) — a second,
  // independent split here would silently drift from the shortcuts' array.
  conversations: Conversation[];
  // Boundary index into `conversations`: rows before it are the needs-reply
  // section, the rest are "باقي المحادثات". 0 when unsectioned or empty.
  needsCount: number;
  search: string;
  onSearchChange: (value: string) => void;
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

export function ConversationList({
  conversations,
  needsCount,
  search,
  onSearchChange,
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
  // Slicing allocates two new ARRAYS, never new per-row objects — every row
  // keeps its exact reference from the caller's memo, so ConversationItem's
  // own memo still bails out for unchanged rows across polls (see the
  // reference-identity note that used to live on this file's now-removed
  // SectionableConversation cast, moved to chat-layout.tsx alongside the
  // computation it describes).
  const needs = needsCount > 0 ? conversations.slice(0, needsCount) : [];
  const rest = conversations.slice(needsCount);

  // Headers show ONLY when there's something needing a reply — otherwise the
  // list degrades to a plain flat list (no empty "باقي المحادثات" header).
  const showHeaders = sectioned && needs.length > 0;

  function renderItem(conv: Conversation) {
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
            onChange={e => onSearchChange(e.target.value)}
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
        {conversations.length === 0 ? (
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
