'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageBubble } from './message-bubble';
import { ChatInput } from './chat-input';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import {
  MessageCircle, User, Phone, Search, X, ChevronDown, ArrowRight,
  UserPlus, PanelRightOpen, FileText, Receipt, StickyNote, Clock, CheckCircle2, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import Link from 'next/link';
import { AssignDialog } from './dialogs/assign-dialog';
import { ContactSidebar } from './contact-sidebar';
import { SendQuoteDialog } from './dialogs/send-quote-dialog';
import { SendInvoiceDialog } from './dialogs/send-invoice-dialog';
import { CreateLeadDialog } from './dialogs/create-lead-dialog';
import { AddNoteDialog } from './dialogs/add-note-dialog';
import { ScheduleFollowupDialog } from './dialogs/schedule-followup-dialog';

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
  conversationId?: string | null;
  conversationStatus?: string | null;
  isAdmin?: boolean;
  onBack?: () => void;
  onConversationUpdated?: () => void;
}

const POLL_INTERVAL = 5000;

export function ChatWindow({ remoteJid, instanceName, contactName, leadId, clientId, phone: phoneProp, assignedTo, conversationId, conversationStatus, isAdmin, onBack, onConversationUpdated }: ChatWindowProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showScrollDown, setShowScrollDown] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [activeDialog, setActiveDialog] = useState<'quote' | 'invoice' | 'lead' | 'note' | 'followup' | null>(null);
  const [currentLeadId, setCurrentLeadId] = useState(leadId);
  const [inputMode, setInputMode] = useState<'message' | 'note'>('message');
  const [notes, setNotes] = useState<Array<{ id: string; author_display_name: string; content: string; created_at: string }>>([]);
  const [convStatus, setConvStatus] = useState(conversationStatus || 'open');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Use phone prop (from conversation metadata) or extract from JID
  const phone = phoneProp || remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
  const displayPhone = phone && phone.length > 5 ? `+${phone}` : phone;

  const fetchMessages = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '100' });
      // Prefer conversation_id (shared inbox), fall back to remote_jid (legacy)
      if (conversationId) {
        params.set('conversation_id', conversationId);
      } else {
        params.set('remote_jid', remoteJid);
      }
      const msgs = await fetchAPI<Message[]>(`/api/dashboard/sales/whatsapp/messages?${params}`);
      setMessages((msgs || []).reverse());
    } catch {
      console.error('Failed to fetch messages');
    } finally {
      setLoading(false);
    }
  }, [conversationId, remoteJid]);

  // Fetch internal notes
  const fetchNotes = useCallback(async () => {
    if (!conversationId) return;
    try {
      const data = await fetchAPI<Array<{ id: string; author_display_name: string; content: string; created_at: string }>>(`/api/dashboard/sales/whatsapp/conversations/${conversationId}/notes`);
      setNotes(data || []);
    } catch { /* silent */ }
  }, [conversationId]);

  useEffect(() => {
    setLoading(true);
    setSearchOpen(false);
    setSearchQuery('');
    setInputMode('message');
    setConvStatus(conversationStatus || 'open');
    fetchMessages();
    fetchNotes();
    const interval = setInterval(fetchMessages, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMessages, fetchNotes, conversationStatus]);

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
      await mutateAPI('/api/dashboard/sales/whatsapp/send', 'POST', {
        instance_name: instanceName,
        remote_jid: remoteJid,
        conversation_id: conversationId || undefined,
        number: phone,
        text,
        lead_id: leadId,
      });
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
      // eslint-disable-next-line no-restricted-globals -- FormData upload requires raw fetch
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

      await mutateAPI('/api/dashboard/sales/whatsapp/send', 'POST', {
        instance_name: instanceName,
        remote_jid: remoteJid,
        conversation_id: conversationId || undefined,
        number: phone,
        text: caption || undefined,
        media_url: mediaUrl,
        media_type: mediaType,
        mime_type: file.type,
        file_name: file.name,
        lead_id: leadId,
      });
      fetchMessages();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إرسال الملف');
      throw err;
    }
  }

  // Send internal note (NOT sent to WhatsApp)
  async function handleSendNote(text: string) {
    if (!conversationId) { toast.error('لا يمكن إضافة ملاحظة'); return; }
    try {
      await mutateAPI(`/api/dashboard/sales/whatsapp/conversations/${conversationId}/notes`, 'POST', { content: text });
      fetchNotes();
      toast.success('تم إضافة الملاحظة');
    } catch {
      toast.error('فشل إضافة الملاحظة');
    }
  }

  // Update conversation status
  async function handleStatusChange(newStatus: string) {
    if (!conversationId) return;
    setUpdatingStatus(true);
    try {
      await mutateAPI(`/api/dashboard/sales/whatsapp/conversations/${conversationId}`, 'PATCH', { status: newStatus });
      setConvStatus(newStatus);
      onConversationUpdated?.();
      toast.success(newStatus === 'resolved' ? 'تم حل المحادثة' : newStatus === 'pending' ? 'تم تعليق المحادثة' : 'تم فتح المحادثة');
    } catch {
      toast.error('فشل تحديث الحالة');
    } finally {
      setUpdatingStatus(false);
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
              aria-label="رجوع"
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
              aria-label="تعيين لوكيل"
            >
              <UserPlus className="h-4 w-4" />
            </Button>
          )}

          {/* Assign Dialog */}
          <AssignDialog
              open={showAssign}
              conversationId={conversationId}
              remoteJid={remoteJid}
              instanceName={instanceName}
              currentAgent={assignedTo || null}
              onAssigned={() => onConversationUpdated?.()}
              onClose={() => setShowAssign(false)}
          />

          {/* Status Actions */}
          {conversationId && (
            <div className="flex items-center gap-1">
              {convStatus !== 'resolved' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] rounded-lg text-green-600 hover:bg-green-50 dark:hover:bg-green-950/20"
                  onClick={() => handleStatusChange('resolved')}
                  disabled={updatingStatus}
                >
                  <CheckCircle2 className="h-3 w-3 me-0.5" />
                  حل
                </Button>
              )}
              {convStatus === 'open' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] rounded-lg text-yellow-600 hover:bg-yellow-50 dark:hover:bg-yellow-950/20"
                  onClick={() => handleStatusChange('pending')}
                  disabled={updatingStatus}
                >
                  <Clock className="h-3 w-3 me-0.5" />
                  تعليق
                </Button>
              )}
              {convStatus === 'resolved' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] rounded-lg text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950/20"
                  onClick={() => handleStatusChange('open')}
                  disabled={updatingStatus}
                >
                  إعادة فتح
                </Button>
              )}
            </div>
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
            aria-label="بحث"
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
            aria-label="معلومات جهة الاتصال"
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
                      id={msg.id}
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

      {/* Input Mode Toggle + Input */}
      {conversationId && (
        <div className="flex items-center gap-1 px-3 pt-1">
          <button
            onClick={() => setInputMode('message')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
              inputMode === 'message'
                ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            <MessageCircle className="h-3 w-3" />
            رسالة
          </button>
          <button
            onClick={() => setInputMode('note')}
            className={cn(
              'flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors',
              inputMode === 'note'
                ? 'bg-amber-500/10 text-amber-700 dark:text-amber-400'
                : 'text-muted-foreground hover:bg-muted/50'
            )}
          >
            <Pencil className="h-3 w-3" />
            ملاحظة داخلية
          </button>
        </div>
      )}
      <ChatInput
        onSend={inputMode === 'note' ? handleSendNote : handleSend}
        onSendMedia={inputMode === 'note' ? undefined : handleSendMedia}
      />
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
