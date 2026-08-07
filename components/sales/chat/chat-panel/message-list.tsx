'use client';

import { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { MessageBubble, NoteBubble, type QuotedMessage } from '../message-bubble';
import { CallEventPill } from '../call-event-pill';
import { MessageCircle, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useLeadCallActivities, type LeadActivity } from '@/hooks/useLeadActivities';
import { mergeThread } from '@/lib/whatsapp/inbox';
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

// Activity types that render as inline call pills. mergeThread (lib/whatsapp/
// inbox.ts) itself does not filter by type — the caller (here) does.
const CALL_ACTIVITY_TYPES = new Set(['call_logged', 'call_attempt']);

type TimelineItem =
  | { type: 'message'; data: Message; sortTime: string }
  | { type: 'note'; data: ConversationNote; sortTime: string }
  | { type: 'call'; data: LeadActivity; sortTime: string };

interface MessageListProps {
  messages: Message[];
  notes: ConversationNote[];
  leadId?: string | null;
  isGroup?: boolean;
  onReply?: (quote: QuotedMessage) => void;
  onReact?: (messageId: string, emoji: string) => void;
  onSaveToFiles?: (messageId: string) => void;
  onForward?: (messageId: string) => void;
}

export function MessageList({ messages, notes, leadId, isGroup, onReply, onReact, onSaveToFiles, onForward }: MessageListProps) {
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Inline call events (CR-T6) — skipped entirely when the conversation has
  // no linked lead (useLeadCallActivities gates on `enabled: !!leadId`).
  // CR-T7: reads a calls-only query (server-filtered `types=call_logged,
  // call_attempt`) instead of the mixed-activity CRM timeline query — a busy
  // lead's webhook-mirrored messages no longer push older calls off page 1.
  const { data: activitiesData } = useLeadCallActivities(leadId ?? undefined);
  const callActivities = useMemo(
    () =>
      // Defensive re-filter: the query is already calls-only server-side,
      // this just guards against a future allowlist change on the route.
      (activitiesData?.pages.flatMap((p) => p.activities) ?? []).filter((a) =>
        CALL_ACTIVITY_TYPES.has(a.activity_type),
      ),
    [activitiesData],
  );

  // Merge messages + calls chronologically (ties: message before call — see
  // mergeThread's own contract), then fold in notes the same way the
  // original code did before calls existed.
  const threadEvents = useMemo(() => mergeThread(messages, callActivities), [messages, callActivities]);
  const timeline = useMemo<TimelineItem[]>(() => {
    const fromThread: TimelineItem[] = threadEvents.map((ev) =>
      ev.kind === 'message'
        ? { type: 'message', data: ev.item as Message, sortTime: (ev.item as Message).timestamp }
        : { type: 'call', data: ev.item as LeadActivity, sortTime: (ev.item as LeadActivity).created_at },
    );
    const noteItems: TimelineItem[] = notes.map((n) => ({ type: 'note', data: n, sortTime: n.created_at }));
    return [...fromThread, ...noteItems].sort(
      (a, b) => new Date(a.sortTime).getTime() - new Date(b.sortTime).getTime(),
    );
  }, [threadEvents, notes]);

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
      className="flex-1 overflow-y-auto px-4 py-3 relative bg-background flex flex-col"
    >
      {timeline.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mb-4">
            <MessageCircle className="h-7 w-7 text-muted-foreground" />
          </div>
          <p className="text-sm font-normal text-foreground">لا توجد رسائل بعد</p>
          <p className="text-[13px] mt-1">ابدأ المحادثة بإرسال رسالة</p>
        </div>
      ) : (
        // mt-auto pushes a short thread to the bottom; the centred max-width
        // is what stops the thread reading as a WhatsApp window stretched
        // across a 2560px monitor — messages stay in one readable column with
        // the two sides close enough to scan as a conversation.
        <div className="mt-auto w-full max-w-[900px] mx-auto space-y-1.5">
          {groupedItems.map((group, gi) => (
            <div key={group.date || gi}>
              {/* Date separator — pill style */}
              <div className="flex justify-center my-3">
                <span className="bg-card/90 text-muted-foreground text-[12.5px] px-3 py-1 rounded-lg shadow-sm">
                  {group.date}
                </span>
              </div>
              <div className="flex flex-col gap-2.5">
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
                  if (item.type === 'call') {
                    return <CallEventPill key={item.data.id} activity={item.data} />;
                  }
                  const note = item.data;
                  return (
                    <NoteBubble
                      key={note.id}
                      content={note.content}
                      authorName={note.author_display_name}
                      timestamp={note.created_at}
                    />
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
          className="sticky bottom-3 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-card border border-border shadow-md flex items-center justify-center text-muted-foreground hover:text-foreground transition-all hover:scale-110 z-10"
        >
          <ChevronDown className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}
