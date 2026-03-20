'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { MessageCircle, User, Phone, Search, X, ArrowDown } from 'lucide-react';
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
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollDown, setShowScrollDown] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
    setSearchOpen(false);
    setSearchQuery('');
    fetchMessages();
    const interval = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  // Track scroll position for "scroll to bottom" button
  function handleScroll() {
    const el = containerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollDown(distFromBottom > 200);
  }

  function scrollToBottom() {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }

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

  async function handleSendMedia(file: File, caption?: string) {
    try {
      // Upload file to Supabase storage first
      const formData = new FormData();
      formData.append('file', file);
      const uploadRes = await fetch('/api/dashboard/files/upload-temp', {
        method: 'POST',
        body: formData,
      });

      let mediaUrl: string;
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        mediaUrl = uploadData.data?.url || uploadData.url;
      } else {
        // Fallback: convert to base64 data URL for small files
        if (file.size > 2 * 1024 * 1024) {
          toast.error('فشل رفع الملف — حاول ملف أصغر');
          return;
        }
        mediaUrl = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.readAsDataURL(file);
        });
      }

      // Determine media type
      let mediaType = 'document';
      if (file.type.startsWith('image/')) mediaType = 'image';
      else if (file.type.startsWith('video/')) mediaType = 'video';
      else if (file.type.startsWith('audio/')) mediaType = 'audio';

      const res = await fetch('/api/dashboard/sales/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: instanceName,
          number: phone,
          text: caption || undefined,
          media_url: mediaUrl,
          media_type: mediaType,
          mime_type: file.type,
          file_name: file.name,
          lead_id: leadId,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'فشل الإرسال');
      }
      fetchMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إرسال الملف');
      throw err;
    }
  }

  // Filter messages by search
  const displayMessages = searchQuery
    ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

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
        <div className="flex items-center gap-1">
          {/* Search Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'rounded-xl h-9 w-9',
              searchOpen && 'bg-orange-50 dark:bg-orange-950/20 text-orange-600'
            )}
            onClick={() => {
              setSearchOpen(!searchOpen);
              setSearchQuery('');
              if (!searchOpen) setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
            title="بحث في الرسائل"
          >
            <Search className="h-4 w-4" />
          </Button>

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

      {/* Search Bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-border/40 bg-muted/30 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
          <Search className="h-4 w-4 text-muted-foreground/50 shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث في الرسائل..."
            className="flex-1 bg-transparent text-sm border-none focus:outline-none placeholder:text-muted-foreground/50"
          />
          {searchQuery && (
            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              {displayMessages.length} نتيجة
            </span>
          )}
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
            className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Messages */}
      <div
        ref={containerRef}
        onScroll={handleScroll}
        className={cn(
          'flex-1 overflow-y-auto p-4 space-y-3 relative',
          'bg-gradient-to-b from-muted/10 via-transparent to-muted/10'
        )}
      >
        {displayMessages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground/50">
            <div className="w-16 h-16 rounded-2xl bg-muted/40 flex items-center justify-center mb-4">
              {searchQuery ? (
                <Search className="h-8 w-8 opacity-40" />
              ) : (
                <MessageCircle className="h-8 w-8 opacity-40" />
              )}
            </div>
            <p className="text-sm font-medium">
              {searchQuery ? 'لا توجد نتائج' : 'لا توجد رسائل بعد'}
            </p>
            <p className="text-xs mt-1 text-muted-foreground/40">
              {searchQuery ? 'حاول بكلمة بحث مختلفة' : 'ابدأ المحادثة بإرسال رسالة'}
            </p>
          </div>
        ) : (
          displayMessages.map(msg => (
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

        {/* Scroll to Bottom FAB */}
        {showScrollDown && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-2 start-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-card border border-border/60 shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-all hover:scale-105 z-10"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} onSendMedia={handleSendMedia} />
    </div>
  );
}
