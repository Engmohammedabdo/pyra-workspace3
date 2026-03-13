'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { MessageCircle, User, Phone } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface Message {
  id: string;
  direction: string;
  content: string | null;
  message_type: string;
  media_url?: string | null;
  file_name?: string | null;
  status: string;
  timestamp: string;
}

interface ChatWindowProps {
  remoteJid: string;
  instanceName: string;
  contactName: string | null;
  leadId?: string | null;
}

const POLL_INTERVAL = 5000;

export function ChatWindow({ remoteJid, instanceName, contactName, leadId }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '');

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams({
        remote_jid: remoteJid,
        instance_name: instanceName,
        limit: '100',
      });
      const res = await fetch(`/api/dashboard/sales/whatsapp/messages?${params}`);
      const data = await res.json();
      const msgs = (data.data || []).reverse();
      setMessages(msgs);
    } catch {
      console.error('Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  }, [remoteJid, instanceName]);

  useEffect(() => {
    setLoading(true);
    fetchMessages();
    const interval = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  async function handleSend(text: string) {
    try {
      const res = await fetch('/api/dashboard/sales/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: instanceName,
          number: phone,
          text,
          lead_id: leadId,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'فشل الإرسال');
      }
      fetchMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إرسال الرسالة');
      throw err;
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div>
              <Skeleton className="h-4 w-32 mb-1.5" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className={cn('h-12 w-52 rounded-2xl', i % 2 === 0 ? 'ms-auto' : '')} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border/60 flex items-center justify-between bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-orange-400 to-amber-600 flex items-center justify-center text-white font-bold text-sm shadow-lg shadow-orange-500/15">
            {(contactName || phone).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-semibold text-sm">{contactName || phone}</p>
            <p className="text-xs text-muted-foreground/60 flex items-center gap-1" dir="ltr">
              <Phone className="h-3 w-3" />
              +{phone}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {leadId && (
            <Button variant="ghost" size="sm" asChild className="rounded-xl text-xs hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:text-orange-600">
              <Link href={`/dashboard/sales/leads/${leadId}`}>
                <User className="h-4 w-4 me-1.5" />
                عرض العميل
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div
        ref={containerRef}
        className={cn(
          'flex-1 overflow-y-auto p-4 space-y-3',
          'bg-gradient-to-b from-muted/10 via-transparent to-muted/10'
        )}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50">
            <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
              <MessageCircle className="h-8 w-8 opacity-40" />
            </div>
            <p className="text-sm font-medium">لا توجد رسائل بعد</p>
            <p className="text-xs mt-1 text-muted-foreground/40">ابدأ المحادثة بإرسال رسالة</p>
          </div>
        ) : (
          messages.map(msg => (
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
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} />
    </div>
  );
}
