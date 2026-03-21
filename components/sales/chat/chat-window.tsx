'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import {
  MessageCircle, User, Phone, Search, X, ChevronDown, ArrowRight,
  UserPlus, PanelRightOpen, FileText, Receipt, StickyNote, Clock,
} from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { AssignDialog } from './assign-dialog';
import { ContactSidebar } from './contact-sidebar';
import { SendQuoteDialog } from './send-quote-dialog';
import { SendInvoiceDialog } from './send-invoice-dialog';
import { CreateLeadDialog } from './create-lead-dialog';
import { AddNoteDialog } from './add-note-dialog';
import { ScheduleFollowupDialog } from './schedule-followup-dialog';

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
  clientId?: string | null;
  phone?: string | null;
  assignedTo?: string | null;
  isAdmin?: boolean;
  onBack?: () => void;
  onConversationUpdated?: () => void;
}

const POLL_INTERVAL = 5000;

export function ChatWindow({ remoteJid, instanceName, contactName, leadId, clientId, phone: phoneProp, assignedTo, isAdmin, onBack, onConversationUpdated }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeDialog, setActiveDialog] = useState<'quote' | 'invoice' | 'lead' | 'note' | 'followup' | null>(null);
  const [currentLeadId, setCurrentLeadId] = useState(leadId);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Use phone prop (from conversation metadata) or extract from JID
  const phone = phoneProp || remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
  const displayPhone = phone && phone.length > 5 ? `+${phone}` : phone;

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
          remote_jid: remoteJid,
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

      let mediaType = 'document';
      if (file.type.startsWith('image/')) mediaType = 'image';
      else if (file.type.startsWith('video/')) mediaType = 'video';
      else if (file.type.startsWith('audio/')) mediaType = 'audio';

      const res = await fetch('/api/dashboard/sales/whatsapp/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instance_name: instanceName,
          remote_jid: remoteJid,
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

  if (loading) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b border-border/60">
          <div className="flex items-center gap-3">
            <Skeleton className="h-11 w-11 rounded-full" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        </div>
        <div className="flex-1 p-4 space-y-4">
          {[1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className={cn('h-10 rounded-2xl', i % 2 === 0 ? 'w-48 ms-auto' : 'w-56')} />
          ))}
        </div>
        <div className="p-4 border-t border-border/60">
          <Skeleton className="h-12 rounded-xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Main Chat Area */}
      <div className="flex flex-col flex-1 min-w-0 h-full">
      {/* Header */}
      <div className="px-3 py-2.5 border-b border-border/60 flex items-center justify-between bg-card/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          {/* Back button — visible on mobile */}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="rounded-xl h-9 w-9 md:hidden shrink-0"
              onClick={onBack}
            >
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}

          {/* Clickable contact info — toggles sidebar */}
          <button
            className="flex items-center gap-2.5 hover:opacity-80 transition-opacity"
            onClick={() => setShowSidebar(!showSidebar)}
          >
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-emerald-500/15">
              {(contactName || phone).charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 text-start">
              <p className="font-semibold text-sm truncate">{contactName || displayPhone}</p>
              {displayPhone && (
                <p className="text-[11px] text-muted-foreground/50 flex items-center gap-1 tabular-nums" dir="ltr">
                  <Phone className="h-2.5 w-2.5" />
                  {displayPhone}
                </p>
              )}
            </div>
          </button>
        </div>
        <div className="flex items-center gap-1 relative">
          {/* Assign to Agent — admin only */}
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className={cn(
                'rounded-xl h-9 w-9',
                showAssign && 'bg-orange-50 dark:bg-orange-950/20 text-orange-600'
              )}
              onClick={() => setShowAssign(!showAssign)}
              title="تعيين لوكيل"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          )}

          {/* Assign Dialog Popover */}
          {showAssign && (
            <AssignDialog
              remoteJid={remoteJid}
              instanceName={instanceName}
              currentAgent={assignedTo || null}
              onAssigned={() => onConversationUpdated?.()}
              onClose={() => setShowAssign(false)}
            />
          )}

          {/* Search Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'rounded-xl h-9 w-9',
              searchOpen && 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-600'
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

          {/* Contact Info Sidebar Toggle */}
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              'rounded-xl h-9 w-9 hidden lg:flex',
              showSidebar && 'bg-teal-50 dark:bg-teal-950/20 text-teal-600'
            )}
            onClick={() => setShowSidebar(!showSidebar)}
            title="معلومات جهة الاتصال"
          >
            <PanelRightOpen className="h-4 w-4" />
          </Button>

          {leadId && (
            <Button variant="ghost" size="sm" asChild className="rounded-xl text-xs hover:bg-orange-50 dark:hover:bg-orange-950/20 hover:text-orange-600 lg:hidden">
              <Link href={`/dashboard/sales/leads/${leadId}`}>
                <User className="h-3.5 w-3.5 me-1" />
                <span className="hidden sm:inline">عرض العميل</span>
              </Link>
            </Button>
          )}
        </div>
      </div>

      {/* Search Bar */}
      {searchOpen && (
        <div className="px-4 py-2 border-b border-border/30 bg-muted/20 flex items-center gap-2 animate-in slide-in-from-top-2 duration-200">
          <Search className="h-4 w-4 text-muted-foreground/40 shrink-0" />
          <input
            ref={searchInputRef}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="بحث في الرسائل..."
            className="flex-1 bg-transparent text-sm border-none focus:outline-none placeholder:text-muted-foreground/40"
          />
          {searchQuery && (
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium shrink-0 bg-emerald-50 dark:bg-emerald-950/20 px-2 py-0.5 rounded-full">
              {displayMessages.length} نتيجة
            </span>
          )}
          <button
            onClick={() => { setSearchOpen(false); setSearchQuery(''); }}
            className="shrink-0 text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Messages */}
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
        <div ref={messagesEndRef} />

        {/* Scroll to Bottom FAB — uses left-1/2 (centering, safe for RTL per CLAUDE.md) */}
        {showScrollDown && (
          <button
            onClick={scrollToBottom}
            className="sticky bottom-3 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-card border border-border/60 shadow-lg flex items-center justify-center text-muted-foreground hover:text-foreground transition-all hover:scale-110 z-10"
          >
            <ChevronDown className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Quick Actions Bar */}
      <div className="px-3 py-1.5 border-t border-border/30 flex items-center gap-1 overflow-x-auto scrollbar-none bg-muted/10">
        {currentLeadId ? (
          <>
            <button
              onClick={() => setActiveDialog('quote')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-orange-700 dark:text-orange-400 bg-orange-500/10 hover:bg-orange-500/20 transition-colors whitespace-nowrap"
            >
              <FileText className="h-3 w-3" />
              عرض سعر
            </button>
            <button
              onClick={() => setActiveDialog('invoice')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-purple-700 dark:text-purple-400 bg-purple-500/10 hover:bg-purple-500/20 transition-colors whitespace-nowrap"
            >
              <Receipt className="h-3 w-3" />
              فاتورة
            </button>
            <button
              onClick={() => setActiveDialog('note')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-yellow-700 dark:text-yellow-400 bg-yellow-500/10 hover:bg-yellow-500/20 transition-colors whitespace-nowrap"
            >
              <StickyNote className="h-3 w-3" />
              ملاحظة
            </button>
            <button
              onClick={() => setActiveDialog('followup')}
              className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-sky-700 dark:text-sky-400 bg-sky-500/10 hover:bg-sky-500/20 transition-colors whitespace-nowrap"
            >
              <Clock className="h-3 w-3" />
              متابعة
            </button>
          </>
        ) : (
          <button
            onClick={() => setActiveDialog('lead')}
            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors whitespace-nowrap"
          >
            <UserPlus className="h-3 w-3" />
            إنشاء عميل محتمل
          </button>
        )}
      </div>

      {/* Input */}
      <ChatInput onSend={handleSend} onSendMedia={handleSendMedia} />
      </div>

      {/* Contact Info Sidebar */}
      {showSidebar && (
        <ContactSidebar
          remoteJid={remoteJid}
          instanceName={instanceName}
          contactName={contactName}
          phone={phone}
          leadId={currentLeadId}
          onClose={() => setShowSidebar(false)}
        />
      )}

      {/* Dialogs */}
      {activeDialog === 'quote' && currentLeadId && (
        <SendQuoteDialog
          leadId={currentLeadId}
          remoteJid={remoteJid}
          instanceName={instanceName}
          phone={phone}
          onClose={() => setActiveDialog(null)}
          onSent={fetchMessages}
        />
      )}
      {activeDialog === 'invoice' && (
        <SendInvoiceDialog
          leadId={currentLeadId || null}
          clientId={clientId}
          remoteJid={remoteJid}
          instanceName={instanceName}
          phone={phone}
          onClose={() => setActiveDialog(null)}
          onSent={fetchMessages}
        />
      )}
      {activeDialog === 'lead' && (
        <CreateLeadDialog
          contactName={contactName}
          phone={phone}
          onClose={() => setActiveDialog(null)}
          onCreated={(newLeadId) => {
            setCurrentLeadId(newLeadId);
            onConversationUpdated?.();
          }}
        />
      )}
      {activeDialog === 'note' && currentLeadId && (
        <AddNoteDialog
          leadId={currentLeadId}
          onClose={() => setActiveDialog(null)}
          onAdded={() => {}}
        />
      )}
      {activeDialog === 'followup' && currentLeadId && (
        <ScheduleFollowupDialog
          leadId={currentLeadId}
          onClose={() => setActiveDialog(null)}
          onScheduled={() => {}}
        />
      )}
    </div>
  );
}
