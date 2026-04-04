'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { MessageBubble } from '../message-bubble';
import { cn } from '@/lib/utils/cn';
import { MessageCircle, Search, ChevronDown, Pencil } from 'lucide-react';
import type { Message, ConversationNote } from '@/hooks/useWhatsApp';

interface MessageListProps {
  messages: Message[];
  notes: ConversationNote[];
  searchQuery: string;
}

export function MessageList({ messages, notes, searchQuery }: MessageListProps) {
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Filter messages by search
  const displayMessages = searchQuery
    ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  // Group messages by date
  const groupedMessages: { date: string; messages: Message[] }[] = [];
  let currentDate = '';
  for (const msg of displayMessages) {
    const msgDate = new Date(msg.timestamp).toLocaleDateString('ar-EG', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    if (msgDate !== currentDate) {
      currentDate = msgDate;
      groupedMessages.push({ date: msgDate, messages: [] });
    }
    groupedMessages[groupedMessages.length - 1].messages.push(msg);
  }

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distFromBottom > 200);
  }, []);

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3 relative"
    >
      {displayMessages.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground/40">
          <div className="w-16 h-16 rounded-2xl bg-muted/30 flex items-center justify-center mb-4">
            {searchQuery ? (
              <Search className="h-7 w-7 opacity-40" />
            ) : (
              <MessageCircle className="h-7 w-7 opacity-40" />
            )}
          </div>
          <p className="text-sm font-medium">
            {searchQuery ? 'لا توجد نتائج' : 'لا توجد رسائل بعد'}
          </p>
          <p className="text-xs mt-1">
            {searchQuery ? 'حاول بكلمة بحث مختلفة' : 'ابدأ المحادثة بإرسال رسالة'}
          </p>
        </div>
      ) : (
        <div className="space-y-1">
          {groupedMessages.map((group, gi) => (
            <div key={gi}>
              {/* Date separator */}
              <div className="flex items-center justify-center my-4">
                <div className="px-3 py-1 rounded-full bg-muted/50 text-[10px] font-medium text-muted-foreground/60 shadow-sm">
                  {group.date}
                </div>
              </div>
              <div className="space-y-2">
                {group.messages.map(msg => (
                  <MessageBubble
                    key={msg.id}
                    content={msg.content}
                    direction={msg.direction as 'incoming' | 'outgoing'}
                    messageType={msg.message_type}
                    mediaUrl={msg.media_url}
                    fileName={msg.file_name}
                    status={msg.status}
                    timestamp={msg.timestamp}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Internal Notes — yellow background */}
      {notes.length > 0 && notes.map(note => (
        <div key={note.id} className="flex justify-center px-4 py-1">
          <div className="max-w-[80%] bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/30 rounded-xl px-3 py-2">
            <div className="flex items-center gap-1.5 mb-0.5">
              <Pencil className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
              <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">ملاحظة داخلية</span>
              <span className="text-[10px] text-muted-foreground/50">— {note.author_display_name}</span>
            </div>
            <p className="text-xs text-amber-900 dark:text-amber-200 whitespace-pre-wrap">{note.content}</p>
            <span className="text-[9px] text-muted-foreground/40 mt-0.5 block">
              {new Date(note.created_at).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
            </span>
          </div>
        </div>
      ))}

      <div ref={messagesEndRef} />

      {/* Scroll to Bottom FAB — uses left-1/2 (centering, safe for RTL per CLAUDE.md) */}
      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="sticky bottom-3 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-card border border-border/60 shadow-lg dark:shadow-black/20 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all hover:scale-110 z-10"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
