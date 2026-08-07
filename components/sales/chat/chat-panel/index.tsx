'use client';

import { useState, useCallback, useMemo, useRef, useEffect } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils/cn';
import { MessageCircle, Pencil } from 'lucide-react';
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
  useReactToMessage,
  useSendTypingIndicator,
  useSaveToFiles,
} from '@/hooks/useWhatsApp';
import { useSettings } from '@/hooks/useSettings';
import { useChatStore } from '../use-chat-store';
import { ChatHeader } from './chat-header';
import { MessageList } from './message-list';
import { ChatInput, type QuotedMessageForInput } from '../chat-input';
import type { QuotedMessage } from '../message-bubble';
import { NoteInput } from './note-input';
import { SuggestBar } from '../ai-suggest/suggest-bar';
import { DealBanner } from '../deal-banner';
import { ContextDrawer } from '../context-drawer';
import type { SlaConversationData } from '../sla/sla-indicator';
import { SendQuoteDialog } from '../dialogs/send-quote-dialog';
import { SendInvoiceDialog } from '../dialogs/send-invoice-dialog';
import { CreateLeadDialog } from '../dialogs/create-lead-dialog';
import { AddNoteDialog } from '../dialogs/add-note-dialog';
import { ScheduleFollowupDialog } from '../dialogs/schedule-followup-dialog';
import { ForwardDialog } from '../dialogs/forward-dialog';
import { AssignDialog } from '../dialogs/assign-dialog';
import { useConversationPresence } from '../hooks/use-conversation-presence';
import type { Conversation } from '@/hooks/useWhatsApp';

/** Fallback upload size limit (2 MB) */
const MAX_FALLBACK_UPLOAD_SIZE = 2 * 1024 * 1024;

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
  isMuted?: boolean;
  labels?: import('@/hooks/useWhatsApp').ConversationLabel[];
  // I4 (whole-wave review) — bannerConversation below must seed these from
  // the REAL row, not `{}`, or the contact-panel's attribute editor PATCHes
  // a wholesale update built off an empty seed and erases profile_pic /
  // last_seen_at / group description / CSAT on save.
  customAttributes?: Record<string, string> | null;
  groupDescription?: string | null;
  csatRating?: number | null;
  slaData?: SlaConversationData | null;
  isAdmin?: boolean;
  isContactTyping?: boolean;
  isGroup?: boolean;
  groupSubject?: string | null;
  participantCount?: number;
  groupPictureUrl?: string | null;
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
  conversationStatus: initialConversationStatus,
  isMuted: initialMuted,
  labels,
  customAttributes,
  groupDescription,
  csatRating,
  slaData,
  isAdmin,
  isContactTyping,
  isGroup,
  groupSubject,
  participantCount,
  groupPictureUrl,
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
    showContactPanel,
    setShowContactPanel,
    toggleContactPanel,
  } = useChatStore();

  const [showAssign, setShowAssign] = useState(false);
  const [currentLeadId, setCurrentLeadId] = useState(leadId);
  const [conversationStatus, setConversationStatus] = useState(initialConversationStatus || 'open');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [isMuted, setIsMuted] = useState(initialMuted || false);
  const [isTyping, setIsTyping] = useState(false);
  const [injectedText, setInjectedText] = useState<string | null>(null);
  const [quotedMessage, setQuotedMessage] = useState<QuotedMessageForInput | null>(null);
  const [forwardMsgId, setForwardMsgId] = useState<string | null>(null);

  // AbortController for file uploads — abort on unmount
  const uploadAbortRef = useRef<AbortController | null>(null);
  useEffect(() => {
    return () => { uploadAbortRef.current?.abort(); };
  }, []);

  // Use phone prop (from conversation metadata) or extract from JID
  const phone = phoneProp || remoteJid.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');

  // Current user for template variables
  const { data: currentUser } = useCurrentUser();
  const templateVariables = useMemo(() => ({
    contact_name: contactName || '',
    agent_name: currentUser?.display_name || '',
    phone: phone || '',
  }), [contactName, currentUser?.display_name, phone]);

  // Conversation-shaped view for the deal banner (CR-T5) — ChatPanel only
  // receives the individual fields chat-layout.tsx destructured off the real
  // Conversation row, so this reconstructs just enough of that shape for
  // DealBanner/ContextDrawer to read (currentLeadId, not the initial leadId
  // prop, so a freshly created lead shows up without a parent refetch).
  const bannerConversation: Conversation = useMemo(() => ({
    id: conversationId ?? undefined,
    remote_jid: remoteJid,
    instance_name: instanceName,
    lead_id: currentLeadId ?? null,
    client_id: clientId ?? null,
    contact_name: contactName,
    phone,
    last_message: null,
    unread_count: 0,
    assigned_to: assignedTo,
    is_group: isGroup,
    group_subject: groupSubject,
    group_description: groupDescription ?? null,
    group_picture_url: groupPictureUrl,
    participant_count: participantCount,
    labels,
    custom_attributes: customAttributes ?? null,
    csat_rating: csatRating ?? null,
  }), [conversationId, remoteJid, instanceName, currentLeadId, clientId, contactName, phone, assignedTo, isGroup, groupSubject, groupDescription, groupPictureUrl, participantCount, labels, customAttributes, csatRating]);

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
  const reactMutation = useReactToMessage();
  const typingMutation = useSendTypingIndicator();
  const saveToFilesMutation = useSaveToFiles();

  // Agent collision presence
  const { otherViewers } = useConversationPresence(conversationId || undefined);

  // Debounced typing indicator — send composing/paused to WhatsApp
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTypingSentRef = useRef<boolean>(false);

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

    // Only send typing indicator for individual chats (not groups)
    if (!conversationId || isGroup) return;
    if (typing && !lastTypingSentRef.current) {
      lastTypingSentRef.current = true;
      typingMutation.mutate({ conversation_id: conversationId, is_typing: true });
    }
    // Clear previous timeout
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    // Set paused after 2s of no typing
    typingTimeoutRef.current = setTimeout(() => {
      if (lastTypingSentRef.current) {
        lastTypingSentRef.current = false;
        typingMutation.mutate({ conversation_id: conversationId, is_typing: false });
      }
    }, 2000);
  }, [conversationId, isGroup, typingMutation]);

  // Handle reply action from message bubble
  const handleReply = useCallback((quote: QuotedMessage) => {
    setQuotedMessage({
      id: quote.id,
      messageId: quote.messageId,
      content: quote.content,
      sender: quote.sender,
    });
    // Focus the input
    setTimeout(() => {
      const input = document.querySelector('[data-chat-input]') as HTMLTextAreaElement;
      input?.focus();
    }, 50);
  }, []);

  // Handle save-to-files
  const handleSaveToFiles = useCallback((messageId: string) => {
    saveToFilesMutation.mutate(messageId, {
      onSuccess: () => toast.success('تم حفظ الملف'),
      onError: () => toast.error('فشل حفظ الملف'),
    });
  }, [saveToFilesMutation]);

  // Handle forward
  const handleForward = useCallback((messageId: string) => {
    setForwardMsgId(messageId);
  }, []);

  // Handle reaction on a message
  const handleReact = useCallback((messageId: string, emoji: string) => {
    reactMutation.mutate({
      messageId,
      reaction: emoji,
      conversationKey: conversationId || remoteJid,
    });
  }, [reactMutation, conversationId, remoteJid]);

  // Filter messages for search count
  const displayMessages = searchQuery
    ? messages.filter(m => m.content?.toLowerCase().includes(searchQuery.toLowerCase()))
    : messages;

  // For group sends, use remote_jid directly as the number (group JID)
  const sendNumber = isGroup ? remoteJid : (phone || '');

  const handleSend = useCallback(async (text: string) => {
    try {
      await sendMessageMutation.mutateAsync({
        instance_name: instanceName,
        remote_jid: remoteJid,
        conversation_id: conversationId || undefined,
        number: sendNumber,
        text,
        lead_id: leadId,
        quoted_message_id: quotedMessage?.id,
      });
      setQuotedMessage(null); // Clear quote after successful send
      // Reset typing indicator
      if (lastTypingSentRef.current && conversationId) {
        lastTypingSentRef.current = false;
        typingMutation.mutate({ conversation_id: conversationId, is_typing: false });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'فشل إرسال الرسالة');
      throw err;
    }
  }, [sendMessageMutation, instanceName, remoteJid, conversationId, sendNumber, leadId, quotedMessage, typingMutation]);

  const handleSendMedia = useCallback(async (file: File, caption?: string) => {
    try {
      const formData = new FormData();
      formData.append('file', file);
      uploadAbortRef.current = new AbortController();
      // eslint-disable-next-line no-restricted-globals -- FormData upload requires raw fetch
      const uploadRes = await fetch('/api/dashboard/files/upload-temp', {
        method: 'POST',
        body: formData,
        signal: uploadAbortRef.current.signal,
      });

      let mediaUrl: string;
      if (uploadRes.ok) {
        const uploadData = await uploadRes.json();
        mediaUrl = uploadData.data?.url || uploadData.url;
      } else {
        if (file.size > MAX_FALLBACK_UPLOAD_SIZE) {
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
        number: sendNumber,
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
  }, [sendMediaMutation, instanceName, remoteJid, conversationId, sendNumber, leadId]);

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
      setConversationStatus(newStatus);
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
        {/* Header — slim utility bar (back / search / kebab) */}
        <ChatHeader
          leadId={currentLeadId}
          conversationId={conversationId}
          conversationStatus={conversationStatus}
          isAdmin={isAdmin}
          updatingStatus={updatingStatus}
          searchOpen={searchOpen}
          searchQuery={searchQuery}
          displayMessagesCount={displayMessages.length}
          isMuted={isMuted}
          otherViewers={otherViewers}
          onBack={onBack}
          onToggleAssign={() => setShowAssign(!showAssign)}
          onToggleSearch={() => {
            setSearchOpen(!searchOpen);
            setSearchQuery('');
          }}
          onSearchChange={setSearchQuery}
          onCloseSearch={() => { setSearchOpen(false); setSearchQuery(''); }}
          onStatusChange={handleStatusChange}
          onMuteToggle={handleMuteToggle}
        />

        {/* Deal banner — identity + KPIs + stage steps + always-visible sales actions */}
        <DealBanner
          conversation={bannerConversation}
          isAdmin={isAdmin}
          isContactTyping={isContactTyping}
          onOpenDialog={setActiveDialog}
          onAssign={() => setShowAssign(true)}
          onToggleDrawer={toggleContactPanel}
        />

        {/* Messages */}
        <MessageList
          messages={displayMessages}
          notes={notes}
          leadId={currentLeadId}
          isGroup={isGroup}
          onReply={handleReply}
          onReact={handleReact}
          onSaveToFiles={handleSaveToFiles}
          onForward={handleForward}
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

        {/* Input Mode Segmented Toggle (رد/ملاحظة) + Input */}
        {conversationId && (
          <div className="mx-auto w-full max-w-[900px] px-3 pt-1">
            <div className="inline-flex items-center gap-0.5 rounded-full bg-muted p-0.5">
              <button
                onClick={() => setInputMode('message')}
                className={cn(
                  'flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                  inputMode === 'message'
                    ? 'bg-card text-emerald-700 dark:text-emerald-400 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <MessageCircle className="h-3 w-3" />
                رد
              </button>
              <button
                onClick={() => setInputMode('note')}
                className={cn(
                  'flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-colors',
                  inputMode === 'note'
                    ? 'bg-card text-amber-700 dark:text-amber-400 shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Pencil className="h-3 w-3" />
                ملاحظة
              </button>
            </div>
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
            quotedMessage={quotedMessage}
            onClearQuote={() => setQuotedMessage(null)}
          />
        )}
      </div>

      {/* Context drawer — replaces the old always-visible contact panel column */}
      <ContextDrawer
        open={showContactPanel}
        onOpenChange={setShowContactPanel}
        contactName={contactName}
        phone={phone}
        leadId={currentLeadId}
        conversationId={conversationId}
        conversation={bannerConversation}
        isAdmin={isAdmin}
        onConversationUpdated={onConversationUpdated}
      />

      {/* Assign dialog — single instance opened from either the banner's
          «إسناد» button or the header kebab's «تعيين لوكيل» item */}
      <AssignDialog
        open={showAssign}
        conversationId={conversationId}
        remoteJid={remoteJid}
        instanceName={instanceName}
        currentAgent={assignedTo || null}
        onAssigned={() => onConversationUpdated?.()}
        onClose={() => setShowAssign(false)}
      />

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
      {forwardMsgId && (
        <ForwardDialog
          open={!!forwardMsgId}
          messageId={forwardMsgId}
          onClose={() => setForwardMsgId(null)}
        />
      )}
    </div>
  );
}
