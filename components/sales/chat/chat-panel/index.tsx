'use client';

import { useState, useCallback, useMemo } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import {
  MessageCircle, FileText, Receipt, StickyNote,
  Clock, UserPlus, Pencil,
} from 'lucide-react';
import { toast } from 'sonner';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  useMessages,
  useConversationNotes,
  useSendMessage,
  useSendMediaMessage,
  useUpdateConversation,
  useAddConversationNote,
  useAiSuggestions,
} from '@/hooks/useWhatsApp';
import { useSettings } from '@/hooks/useSettings';
import { useChatStore } from '../use-chat-store';
import { ChatHeader } from './chat-header';
import { MessageList } from './message-list';
import { ChatInput } from '../chat-input';
import { NoteInput } from './note-input';
import { SuggestBar } from '../ai-suggest/suggest-bar';
import { ContactPanel } from '../contact-panel';
import { SendQuoteDialog } from '../dialogs/send-quote-dialog';
import { SendInvoiceDialog } from '../dialogs/send-invoice-dialog';
import { CreateLeadDialog } from '../dialogs/create-lead-dialog';
import { AddNoteDialog } from '../dialogs/add-note-dialog';
import { ScheduleFollowupDialog } from '../dialogs/schedule-followup-dialog';

interface ChatPanelProps {
  remoteJid: string;
  instanceName: string;
  contactName: string | null;
  leadId?: string | null;
  clientId?: string | null;
  phone?: string | null;
  assignedTo?: string | null;
  conversationId?: string | null;
  conversationStatus?: string | null;
  snoozedUntil?: string | null;
  isMuted?: boolean;
  labels?: import('@/hooks/useWhatsApp').ConversationLabel[];
  slaData?: {
    sla_policy_id?: string | null;
    sla_first_response_due?: string | null;
    sla_resolution_due?: string | null;
    sla_first_response_breached?: boolean;
    sla_resolution_breached?: boolean;
    first_reply_at?: string | null;
    resolved_at?: string | null;
    status?: string;
  } | null;
  isAdmin?: boolean;
  onBack?: () => void;
  onConversationUpdated?: () => void;
}

export function ChatPanel({
  remoteJid,
  instanceName,
  contactName,
  leadId,
  clientId,
  phone: phoneProp,
  assignedTo,
  conversationId,
  conversationStatus,
  snoozedUntil: initialSnoozedUntil,
  isMuted: initialMuted,
  labels,
  slaData,
  isAdmin,
  onBack,
  onConversationUpdated,
}: ChatPanelProps) {
  const {
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    inputMode,
    setInputMode,
    activeDialog,
    setActiveDialog,
  } = useChatStore();

  const [showAssign, setShowAssign] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [currentLeadId, setCurrentLeadId] = useState(leadId);
  const [convStatus, setConvStatus] = useState(conversationStatus || 'open');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted || false);
  const [isTyping, setIsTyping] = useState(false);
  const [injectedText, setInjectedText] = useState<string | null>(null);

  // Use phone prop (from conversation metadata) or extract from JID
  const phone = phoneProp || remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
  const displayPhone = phone && phone.length > 5 ? `+${phone}` : phone;

  // Current user for template variables
  const { data: currentUser } = useCurrentUser();
  const templateVariables = useMemo(() => ({
    contact_name: contactName || '',
    agent_name: currentUser?.display_name || '',
    phone: phone || '',
  }), [contactName, currentUser?.display_name, phone]);

  // ── React Query hooks ──
  const { data: messages = [], isLoading: messagesLoading } = useMessages(
    conversationId || undefined,
    remoteJid
  );
  const { data: notes = [] } = useConversationNotes(conversationId || undefined);
  const sendMessageMutation = useSendMessage();
  const sendMediaMutation = useSendMediaMessage();
  const addNoteMutation = useAddConversationNote();
  const updateConvMutation = useUpdateConversation();

  // ── AI Suggestions ──
  const { data: settingsData } = useSettings();
  const aiSuggestionsEnabled = settingsData?.whatsapp_ai_suggestions_enabled !== false;

  const { data: aiSuggestions = [], isLoading: suggestionsLoading } = useAiSuggestions(
    conversationId || undefined,
    messages,
    contactName,
    aiSuggestionsEnabled
  );

  const handleSuggestionSelect = useCallback((text: string) => {
    setInjectedText(text);
  }, []);

  const handleTypingChange = useCallback((typing: boolean) => {
    setIsTyping(typing);
  }, []);

  // Filter messages for search count
  const displayMessages = searchQuery
    ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  const handleSend = useCallback(async (text: string) => {
    try {
      await sendMessageMutation.mutateAsync({
        instance_name: instanceName,
        remote_jid: remoteJid,
        conversation_id: conversationId || undefined,
        number: phone,
        text,
        lead_id: leadId,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إرسال الرسالة');
      throw err;
    }
  }, [sendMessageMutation, instanceName, remoteJid, conversationId, phone, leadId]);

  const handleSendMedia = useCallback(async (file: File, caption?: string) => {
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

      await sendMediaMutation.mutateAsync({
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إرسال الملف');
      throw err;
    }
  }, [sendMediaMutation, instanceName, remoteJid, conversationId, phone, leadId]);

  // Send internal note (NOT sent to WhatsApp)
  const handleSendNote = useCallback(async (text: string) => {
    if (!conversationId) { toast.error('لا يمكن إضافة ملاحظة'); return; }
    try {
      await addNoteMutation.mutateAsync({ conversationId, content: text });
      toast.success('تم إضافة الملاحظة');
    } catch {
      toast.error('فشل إضافة الملاحظة');
    }
  }, [addNoteMutation, conversationId]);

  // Update conversation status
  const handleStatusChange = useCallback(async (newStatus: string) => {
    if (!conversationId) return;
    setUpdatingStatus(true);
    try {
      await updateConvMutation.mutateAsync({
        conversationId,
        data: { status: newStatus },
      });
      setConvStatus(newStatus);
      onConversationUpdated?.();
      toast.success(newStatus === 'resolved' ? 'تم حل المحادثة' : newStatus === 'pending' ? 'تم تعليق المحادثة' : 'تم فتح المحادثة');
    } catch {
      toast.error('فشل تحديث الحالة');
    } finally {
      setUpdatingStatus(false);
    }
  }, [conversationId, updateConvMutation, onConversationUpdated]);

  // Toggle mute
  const handleMuteToggle = useCallback(async () => {
    if (!conversationId) return;
    const newMuted = !isMuted;
    try {
      await updateConvMutation.mutateAsync({
        conversationId,
        data: { is_muted: newMuted },
      });
      setIsMuted(newMuted);
      onConversationUpdated?.();
      toast.success(newMuted ? 'تم كتم المحادثة' : 'تم إلغاء الكتم');
    } catch {
      toast.error('فشل تحديث حالة الكتم');
    }
  }, [conversationId, isMuted, updateConvMutation, onConversationUpdated]);

  if (messagesLoading) {
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
        <ChatHeader
          contactName={contactName}
          phone={phone}
          displayPhone={displayPhone}
          leadId={currentLeadId}
          assignedTo={assignedTo}
          conversationId={conversationId}
          remoteJid={remoteJid}
          instanceName={instanceName}
          convStatus={convStatus}
          isAdmin={isAdmin}
          updatingStatus={updatingStatus}
          showSidebar={showSidebar}
          showAssign={showAssign}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          displayMessagesCount={displayMessages.length}
          snoozedUntil={initialSnoozedUntil}
          isMuted={isMuted}
          labels={labels}
          slaData={slaData}
          onBack={onBack}
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
          onToggleAssign={() => setShowAssign(!showAssign)}
          onAssigned={() => onConversationUpdated?.()}
          onToggleSearch={() => {
            setSearchOpen(!searchOpen);
            setSearchQuery('');
          }}
          onSearchChange={setSearchQuery}
          onCloseSearch={() => { setSearchOpen(false); setSearchQuery(''); }}
          onStatusChange={handleStatusChange}
          onMuteToggle={handleMuteToggle}
          onSnoozed={() => onConversationUpdated?.()}
        />

        {/* Messages */}
        <MessageList
          messages={displayMessages}
          notes={notes}
        />

        {/* AI Suggest Bar — between messages and quick actions */}
        {aiSuggestionsEnabled && inputMode === 'message' && (
          <SuggestBar
            suggestions={aiSuggestions}
            isLoading={suggestionsLoading}
            isTyping={isTyping}
            onSelect={handleSuggestionSelect}
          />
        )}

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
        {inputMode === 'note' ? (
          <NoteInput onSend={handleSendNote} />
        ) : (
          <ChatInput
            onSend={handleSend}
            onSendMedia={handleSendMedia}
            templateVariables={templateVariables}
            injectedText={injectedText}
            onInjectedTextConsumed={() => setInjectedText(null)}
            onTypingChange={handleTypingChange}
          />
        )}
      </div>

      {/* Contact Info Sidebar */}
      {showSidebar && (
        <ContactPanel
          contactName={contactName}
          phone={phone}
          leadId={currentLeadId}
          conversationId={conversationId}
          isAdmin={isAdmin}
          onClose={() => setShowSidebar(false)}
          onConversationUpdated={onConversationUpdated}
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
          onSent={() => {
            // Invalidation handled by React Query
          }}
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
          onSent={() => {
            // Invalidation handled by React Query
          }}
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
