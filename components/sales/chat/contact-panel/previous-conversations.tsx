'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchAPI } from '@/hooks/api-helpers';
import { cn } from '@/lib/utils/cn';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  ChevronDown,
  ChevronUp,
  History,
  MessageCircle,
  Calendar,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import type { ConversationsResponse, Message } from '@/hooks/useWhatsApp';

interface PreviousConversationsProps {
  contactPhone: string | null;
  currentConversationId: string | null;
}

export function PreviousConversations({
  contactPhone,
  currentConversationId,
}: PreviousConversationsProps) {
  const [expanded, setExpanded] = useState(false);
  const [viewingId, setViewingId] = useState<string | null>(null);

  // Fetch previous resolved conversations from same phone
  const { data: prevResponse, isLoading } = useQuery<ConversationsResponse>({
    queryKey: ['whatsapp-prev-conversations', contactPhone, currentConversationId],
    queryFn: async () => {
      const params = new URLSearchParams({
        contact_phone: contactPhone || '',
        status: 'resolved',
        exclude_id: currentConversationId || '',
        limit: '20',
      });
      const result = await fetchAPI<ConversationsResponse>(
        `/api/dashboard/sales/whatsapp/conversations?${params}`
      );
      const data = Array.isArray(result) ? result : (result?.data || []);
      return { data: Array.isArray(data) ? data : [] };
    },
    enabled: !!contactPhone && !!currentConversationId,
    staleTime: 60_000,
  });

  const prevConversations = prevResponse?.data || [];

  // Fetch messages for the conversation being viewed
  const { data: viewMessages = [], isLoading: viewLoading } = useQuery<Message[]>({
    queryKey: ['whatsapp-prev-messages', viewingId],
    queryFn: async () => {
      const params = new URLSearchParams({
        conversation_id: viewingId || '',
        limit: '100',
      });
      const msgs = await fetchAPI<Message[]>(
        `/api/dashboard/sales/whatsapp/messages?${params}`
      );
      return (msgs || []).reverse();
    },
    enabled: !!viewingId,
    staleTime: 30_000,
  });

  if (!contactPhone || isLoading) return null;
  if (prevConversations.length === 0) return null;

  return (
    <>
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center justify-between w-full py-2"
        >
          <h4 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-1.5">
            <History className="h-3 w-3" />
            محادثات سابقة ({prevConversations.length})
          </h4>
          {expanded ? (
            <ChevronUp className="h-3.5 w-3.5 text-muted-foreground/40" />
          ) : (
            <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />
          )}
        </button>

        {expanded && (
          <div className="space-y-2">
            {prevConversations.map(conv => (
              <button
                key={conv.id || conv.remote_jid}
                onClick={() => setViewingId(conv.id || null)}
                className="w-full flex items-center justify-between p-2 rounded-lg hover:bg-muted/40 transition-colors text-start"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-3 w-3 text-muted-foreground/50 shrink-0" />
                    <p className="text-xs text-muted-foreground/60">
                      {conv.created_at ? formatRelativeDate(conv.created_at) : '—'}
                    </p>
                  </div>
                  <p className="text-[11px] text-muted-foreground/40 truncate mt-0.5">
                    {conv.last_message || 'لا توجد رسائل'}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {conv.total_messages && (
                    <Badge variant="secondary" className="text-[9px] h-4 px-1">
                      <MessageCircle className="h-2.5 w-2.5 me-0.5" />
                      {conv.total_messages}
                    </Badge>
                  )}
                  <Badge variant="outline" className="text-[9px] h-4">
                    محلول
                  </Badge>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Read-only Message History Sheet */}
      <Sheet open={!!viewingId} onOpenChange={() => setViewingId(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg p-0">
          <SheetHeader className="px-4 py-3 border-b border-border/60">
            <SheetTitle className="text-sm">سجل المحادثة السابقة</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto p-4 space-y-3" style={{ maxHeight: 'calc(100vh - 80px)' }}>
            {viewLoading ? (
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <Skeleton key={i} className={cn('h-10 rounded-2xl', i % 2 === 0 ? 'w-48 ms-auto' : 'w-56')} />
                ))}
              </div>
            ) : viewMessages.length === 0 ? (
              <div className="text-center py-10 text-sm text-muted-foreground/60">
                لا توجد رسائل
              </div>
            ) : (
              viewMessages.map(msg => (
                <div
                  key={msg.id}
                  className={`flex ${msg.direction === 'outgoing' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                      msg.direction === 'outgoing'
                        ? 'bg-emerald-500/10 text-foreground rounded-ee-md'
                        : 'bg-muted/60 text-foreground rounded-es-md'
                    }`}
                  >
                    {msg.content && <p className="whitespace-pre-wrap break-words">{msg.content}</p>}
                    {!msg.content && msg.message_type !== 'text' && (
                      <p className="text-muted-foreground/60 italic">[{msg.message_type}]</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/40 mt-1 text-end tabular-nums" dir="ltr">
                      {new Date(msg.timestamp).toLocaleTimeString('ar-AE', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
