'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { MessageBubble, type QuotedMessage } from '../message-bubble';
import { MessageCircle, ChevronDown, Pencil } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import type { Message, ConversationNote } from '@/hooks/useWhatsApp';

const SENDER_COLORS = [
  'text-blue-600 dark:text-blue-400',
  'text-emerald-600 dark:text-emerald-400',
  'text-purple-600 dark:text-purple-400',
  'text-pink-600 dark:text-pink-400',
  'text-amber-600 dark:text-amber-400',
  'text-cyan-600 dark:text-cyan-400',
  'text-rose-600 dark:text-rose-400',
  'text-indigo-600 dark:text-indigo-400',
];

function getSenderColor(senderJid: string): string {
  let hash = 0;
  for (let i = 0; i < senderJid.length; i++) {
    hash = ((hash << 5) - hash) + senderJid.charCodeAt(i);
    hash |= 0;
  }
  return SENDER_COLORS[Math.abs(hash) % SENDER_COLORS.length];
}

type TimelineItem =
  | { type: 'message'; data: Message; sortTime: string }
  | { type: 'note'; data: ConversationNote; sortTime: string };

interface MessageListProps {
  messages: Message[];
  notes: ConversationNote[];
  isGroup?: boolean;
  onReply?: (quote: QuotedMessage) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onSaveToFiles?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
}

export function MessageList({ messages, notes, isGroup, onReply, onReact, onSaveToFiles, onForward }: MessageListProps) {
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Merge notes into the message timeline by timestamp
  const timeline = useMemo<TimelineItem[]>(() =>
    [
      ...messages.map(m => ({ type: 'message' as const, data: m, sortTime: m.timestamp })),
      ...notes.map(n => ({ type: 'note' as const, data: n, sortTime: n.created_at })),
    ].sort((a, b) => new Date(a.sortTime).getTime() - new Date(b.sortTime).getTime()),
    [messages, notes]
  );

  // Group timeline items by date
  const groupedItems = useMemo(() => {
    const groups: { date: string; items: TimelineItem[] }[] = [];
    let currentDate = '';
    for (const item of timeline) {
      const itemDate = new Date(item.sortTime).toLocaleDateString('ar-EG', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      if (itemDate !== currentDate) {
        currentDate = itemDate;
        groups.push({ date: itemDate, items: [] });
      }
      groups[groups.length - 1].items.push(item);
    }
    return groups;
  }, [timeline]);

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

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto px-4 py-3 relative bg-[#efeae2] dark:bg-[#0b141a]"
    >
      {timeline.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-[#667781] dark:text-[#8696a0]">
          <div className="w-16 h-16 rounded-full bg-[#dfe5e7] dark:bg-[#6b7b8a] flex items-center justify-center mb-4">
            <MessageCircle className="h-7 w-7 text-white" />
          </div>
          <p className="text-sm font-normal text-[#111b21] dark:text-[#e9edef]">لا توجد رسائل بعد</p>
          <p className="text-[13px] mt-1">ابدأ المحادثة بإرسال رسالة</p>
        </div>
      ) : (
        <div className="space-y-1">
          {groupedItems.map((group, gi) => (
            <div key={group.date || gi}>
              {/* Date separator — WhatsApp pill style */}
              <div className="flex justify-center my-3">
                <span className="bg-white/90 dark:bg-[#182229] text-[#54656f] dark:text-[#8696a0] text-[12.5px] px-3 py-1 rounded-lg shadow-sm">
                  {group.date}
                </span>
              </div>
              <div className="space-y-2">
                {group.items.map(item => {
                  if (item.type === 'message') {
                    const msg = item.data;
                    return (
                      <div key={msg.id}>
                        {isGroup && msg.direction === 'incoming' && msg.sender_name && (
                          <p className={cn('text-[13px] font-medium mb-0.5 px-1', getSenderColor(msg.sender_jid || msg.sender_name))}>
                            {msg.sender_name}
                          </p>
                        )}
                        <MessageBubble
                          id={msg.id}
                          content={msg.content}
                          direction={msg.direction as 'incoming' | 'outgoing'}
                          messageType={msg.message_type}
                          mediaUrl={msg.media_url}
                          fileName={msg.file_name}
                          status={msg.status}
                          timestamp={msg.timestamp}
                          messageId={msg.message_id}
                          contactName={msg.contact_name}
                          replyPreview={msg.reply_preview}
                          reactions={msg.reactions}
                          onReply={onReply}
                          onReact={onReact}
                          onSaveToFiles={onSaveToFiles}
                          onForward={onForward}
                        />
                      </div>
                    );
                  }
                  const note = item.data;
                  return (
                    <div key={note.id} className="flex justify-center px-4 py-0.5">
                      <div className="max-w-[80%] bg-amber-50 dark:bg-amber-950/30 border border-amber-200/60 dark:border-amber-800/30 rounded-lg px-2.5 py-1.5">
                        <div className="flex items-center gap-1 mb-0.5">
                          <Pencil className="h-2.5 w-2.5 text-amber-600 dark:text-amber-400" />
                          <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400">ملاحظة داخلية</span>
                          <span className="text-[10px] text-[#667781] dark:text-[#8696a0]">-- {note.author_display_name}</span>
                        </div>
                        <p className="text-[13px] text-amber-900 dark:text-amber-200 whitespace-pre-wrap leading-snug">{note.content}</p>
                        <span className="text-[10px] text-[#667781] dark:text-[#8696a0] mt-0.5 block">
                          {new Date(note.created_at).toLocaleString('ar-EG', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      <div ref={messagesEndRef} />

      {/* Scroll to Bottom FAB — uses left-1/2 (centering, safe for RTL per CLAUDE.md) */}
      {showScrollDown && (
        <button
          onClick={scrollToBottom}
          className="sticky bottom-3 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white dark:bg-[#202c33] border border-[#e9edef] dark:border-[#313d45] shadow-md flex items-center justify-center text-[#54656f] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef] transition-all hover:scale-110 z-10"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
