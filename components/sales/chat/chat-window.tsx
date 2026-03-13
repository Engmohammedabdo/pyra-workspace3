'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { MessageCircle, User, ExternalLink } from 'lucide-react';
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

const POLL_INTERVAL = 5000; // 5 seconds

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
      const msgs = (data.data || []).reverse(); // oldest first
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

  // Auto-scroll to bottom on new messages
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
      // Immediate refresh
      fetchMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إرسال الرسالة');
      throw err; // Re-throw so ChatInput knows it failed
    }
  }

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <Skeleton className="h-6 w-48" />
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className={`h-12 w-48 rounded-2xl ${i % 2 === 0 ? 'ms-auto' : ''}`} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-center justify-between bg-background">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center text-white font-bold text-sm">
            {(contactName || phone).charAt(0).toUpperCase()}
          </div>
          <div>
            <p className="font-medium text-sm">{contactName || phone}</p>
            <p className="text-xs text-muted-foreground" dir="ltr">+{phone}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {leadId && (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/dashboard/sales/leads/${leadId}`}>
                <User className="h-4 w-4 me-1" />
                عرض العميل
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Messages */}
      <div ref={containerRef} className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
            <MessageCircle className="h-12 w-12 mb-3 opacity-30" />
            <p className="text-sm">لا توجد رسائل بعد</p>
            <p className="text-xs mt-1">ابدأ المحادثة بإرسال رسالة</p>
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
