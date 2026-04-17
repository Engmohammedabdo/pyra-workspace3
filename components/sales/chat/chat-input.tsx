'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useWhatsAppTemplates, type WhatsAppTemplate } from '@/hooks/useWhatsApp';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import {
  Send,
  Paperclip,
  Loader2,
  MessageSquareText,
  X,
  ImageIcon,
  FileText,
  Plus,
  Mic,
  Square,
  MapPin,
  Vote,
  Contact,
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';

/** WhatsApp media size limit (16 MB) */
const MAX_MEDIA_SIZE = 16 * 1024 * 1024;

/** Variables available for template substitution */
export interface TemplateVariables {
  contact_name?: string;
  agent_name?: string;
  phone?: string;
}

export interface QuotedMessageForInput {
  id: string;
  messageId: string;
  content: string;
  sender?: string;
}

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  onSendMedia?: (file: File, caption?: string) => Promise<void>;
  onSendPoll?: (name: string, options: string[]) => Promise<void>;
  onSendLocation?: (lat: number, lng: number, name?: string) => Promise<void>;
  onSendContact?: (fullName: string, phoneNumber: string) => Promise<void>;
  disabled?: boolean;
  /** Variables for template substitution */
  templateVariables?: TemplateVariables;
  /** Inject text externally (e.g. from AI suggestions) */
  injectedText?: string | null;
  /** Callback when injected text has been consumed */
  onInjectedTextConsumed?: () => void;
  /** Notify parent when the user starts/stops typing */
  onTypingChange?: (isTyping: boolean) => void;
  /** Quoted message to reply to */
  quotedMessage?: QuotedMessageForInput | null;
  /** Clear the quoted message */
  onClearQuote?: () => void;
}

export function ChatInput({
  onSend,
  onSendMedia,
  onSendPoll,
  onSendLocation,
  onSendContact,
  disabled,
  templateVariables,
  injectedText,
  onInjectedTextConsumed,
  onTypingChange,
  quotedMessage,
  onClearQuote,
}: ChatInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const { data: templates = [] } = useWhatsAppTemplates();
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordingChunksRef = useRef<Blob[]>([]);
  const recordingTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Handle injected text from AI suggestions
  useEffect(() => {
    if (injectedText) {
      setText(injectedText);
      onInjectedTextConsumed?.();
      // Focus and move cursor to end
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.style.height = 'auto';
          inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 100) + 'px';
        }
      }, 50);
    }
  }, [injectedText, onInjectedTextConsumed]);

  // Notify parent of typing state changes
  useEffect(() => {
    onTypingChange?.(text.trim().length > 0);
  }, [text, onTypingChange]);

  // Cleanup MediaRecorder and recording timer on unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stream?.getTracks().forEach(t => t.stop());
        mediaRecorderRef.current = null;
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
    };
  }, []);

  const filteredTemplates = templates.filter(t => {
    if (!templateSearch) return true;
    const q = templateSearch.toLowerCase();
    return t.title.toLowerCase().includes(q) || t.content.toLowerCase().includes(q);
  });

  async function handleSend() {
    const trimmed = text.trim();
    if ((!trimmed && !attachmentFile) || sending) return;

    setSending(true);
    try {
      if (attachmentFile && onSendMedia) {
        await onSendMedia(attachmentFile, trimmed || undefined);
        clearAttachment();
      } else if (trimmed) {
        await onSend(trimmed);
      }
      setText(''); // Only clear on success
      inputRef.current?.focus();
    } catch {
      // Don't clear text -- user can retry
    } finally {
      setSending(false);
    }
  }

  function substituteVariables(content: string): string {
    if (!templateVariables) return content;
    return content
      .replace(/\{\{contact_name\}\}/g, templateVariables.contact_name || '')
      .replace(/\{\{agent_name\}\}/g, templateVariables.agent_name || '')
      .replace(/\{\{phone\}\}/g, templateVariables.phone || '');
  }

  function handleTemplateSelect(template: WhatsAppTemplate) {
    setText(substituteVariables(template.content));
    setTemplatesOpen(false);
    setTemplateSearch('');
    inputRef.current?.focus();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    processFile(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function clearAttachment() {
    setAttachmentFile(null);
    setAttachmentPreview(null);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  // Open templates when user types "/" at the start
  useEffect(() => {
    if (text === '/') {
      setTemplatesOpen(true);
      setTemplateSearch('');
      setText('');
    }
  }, [text]);

  // -- Drag & Drop --
  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(true);
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
  }
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  // -- Paste (images from clipboard) --
  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) processFile(file);
        break;
      }
    }
  }

  function processFile(file: File) {
    if (file.size > MAX_MEDIA_SIZE) {
      toast.error('حجم الملف أكبر من 16 ميجابايت');
      return;
    }
    setAttachmentFile(file);
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setAttachmentPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setAttachmentPreview(null);
    }
  }

  // -- Voice Recording --
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Detect supported MIME type (Safari doesn't support audio/webm)
      const mimeType = typeof MediaRecorder.isTypeSupported === 'function'
        && MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : typeof MediaRecorder.isTypeSupported === 'function'
          && MediaRecorder.isTypeSupported('audio/mp4')
          ? 'audio/mp4'
          : '';
      const ext = mimeType === 'audio/mp4' ? 'mp4' : 'webm';

      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recordingChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordingChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const finalType = mimeType || 'audio/webm';
        const blob = new Blob(recordingChunksRef.current, { type: finalType });
        const file = new File([blob], `voice-${Date.now()}.${ext}`, { type: finalType });
        processFile(file);
        setIsRecording(false);
        setRecordingTime(0);
        if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(t => t + 1);
      }, 1000);
    } catch {
      toast.error('لم يتم السماح بالوصول للميكروفون');
    }
  }

  function stopRecording() {
    mediaRecorderRef.current?.stop();
  }

  function cancelRecording() {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stream.getTracks().forEach(t => t.stop());
      mediaRecorderRef.current = null;
    }
    recordingChunksRef.current = [];
    setIsRecording(false);
    setRecordingTime(0);
    if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
  }

  function formatRecordingTime(seconds: number) {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // Auto-resize textarea
  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 100) + 'px';
  }

  return (
    <div
      className={cn(
        'border-t border-[#e9edef] dark:border-[#313d45] bg-[#f0f2f5] dark:bg-[#202c33] transition-colors',
        isDragging && 'bg-[#e2f7cb] dark:bg-[#025144]/30 border-[#00a884]/50'
      )}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Quoted message preview */}
      {quotedMessage && (
        <div className="px-4 py-2 flex items-center gap-2">
          <div className="flex-1 bg-white dark:bg-[#2a3942] rounded-lg border-s-4 border-s-[#00a884] ps-3 pe-2 py-2 min-w-0">
            {quotedMessage.sender && (
              <p className="text-[11px] font-medium text-[#00a884]">
                {quotedMessage.sender}
              </p>
            )}
            <p className="text-[13px] text-[#667781] dark:text-[#8696a0] line-clamp-1">
              {quotedMessage.content || '...'}
            </p>
          </div>
          <button
            onClick={onClearQuote}
            className="shrink-0 text-[#667781] dark:text-[#8696a0] hover:text-[#111b21] dark:hover:text-[#e9edef] transition-colors"
            aria-label="إلغاء الرد"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Drag overlay */}
      {isDragging && (
        <div className="px-4 pt-3 text-center text-sm text-[#00a884] font-medium">
          اسحب الملف هنا للإرسال
        </div>
      )}

      {/* Recording UI */}
      {isRecording && (
        <div className="px-4 pt-3 flex items-center gap-3">
          <div className="flex items-center gap-2 flex-1 bg-white dark:bg-[#2a3942] rounded-lg px-4 py-2.5">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-[15px] font-medium text-red-500 tabular-nums">
              {formatRecordingTime(recordingTime)}
            </span>
            <span className="text-[13px] text-[#667781] dark:text-[#8696a0]">جاري التسجيل...</span>
          </div>
          <button
            className="h-10 w-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#aebac1] hover:bg-[#e9edef] dark:hover:bg-[#313d45] transition-colors"
            onClick={cancelRecording}
            title="إلغاء"
            aria-label="إلغاء"
          >
            <X className="h-5 w-5" />
          </button>
          <button
            className="h-10 w-10 rounded-full flex items-center justify-center bg-red-500 hover:bg-red-600 text-white transition-colors"
            onClick={stopRecording}
            title="إيقاف وإرسال"
            aria-label="إيقاف وإرسال"
          >
            <Square className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Attachment Preview */}
      {attachmentFile && (
        <div className="px-4 pt-3 flex items-start gap-3">
          <div className={cn(
            'relative rounded-lg overflow-hidden border border-[#e9edef] dark:border-[#313d45]',
            attachmentPreview ? 'w-20 h-20' : 'flex items-center gap-2 px-3 py-2 bg-white dark:bg-[#2a3942]'
          )}>
            {attachmentPreview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachmentPreview} alt="" className="w-full h-full object-cover" />
              </>
            ) : (
              <>
                <FileText className="h-5 w-5 text-[#667781] dark:text-[#8696a0] shrink-0" />
                <span className="text-[13px] text-[#667781] dark:text-[#8696a0] truncate max-w-[200px]">{attachmentFile.name}</span>
              </>
            )}
            <button
              onClick={clearAttachment}
              className="absolute -top-0.5 -end-0.5 w-5 h-5 rounded-full bg-[#54656f] text-white flex items-center justify-center shadow-sm"
              aria-label="إزالة"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="text-[13px] text-[#667781] dark:text-[#8696a0] mt-2">
            <p>{attachmentFile.name}</p>
            <p>{(attachmentFile.size / 1024).toFixed(0)} KB</p>
          </div>
        </div>
      )}

      {/* Input Row */}
      <div className="px-2 py-2 flex items-end gap-1">
        {/* Attachment Button */}
        <Popover>
          <PopoverTrigger asChild>
            <button
              className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#8696a0] hover:bg-[#e9edef] dark:hover:bg-[#313d45] transition-colors disabled:opacity-40"
              disabled={disabled || sending || !onSendMedia}
              aria-label="إرفاق ملف"
            >
              <Paperclip className="h-5 w-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-48 p-1" align="start" sideOffset={8}>
            <button
              onClick={() => {
                fileInputRef.current?.setAttribute('accept', 'image/*');
                fileInputRef.current?.click();
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted/50 transition-colors"
            >
              <ImageIcon className="h-4 w-4 text-blue-500" />
              صورة
            </button>
            <button
              onClick={() => {
                fileInputRef.current?.setAttribute('accept', '.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar');
                fileInputRef.current?.click();
              }}
              className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted/50 transition-colors"
            >
              <FileText className="h-4 w-4 text-red-500" />
              مستند
            </button>
            {onSendPoll && (
              <button
                onClick={() => {
                  const question = prompt('سؤال الاستطلاع:');
                  if (!question) return;
                  const optionsStr = prompt('الخيارات (مفصولة بفاصلة):');
                  if (!optionsStr) return;
                  const options = optionsStr.split(',').map((o) => o.trim()).filter(Boolean);
                  if (options.length < 2) { toast.error('يجب إدخال خيارين على الأقل'); return; }
                  onSendPoll(question, options);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted/50 transition-colors"
              >
                <Vote className="h-4 w-4 text-purple-500" />
                استطلاع
              </button>
            )}
            {onSendLocation && (
              <button
                onClick={() => {
                  const latStr = prompt('خط العرض (Latitude):');
                  const lngStr = prompt('خط الطول (Longitude):');
                  if (!latStr || !lngStr) return;
                  const locName = prompt('اسم الموقع (اختياري):') || undefined;
                  onSendLocation(parseFloat(latStr), parseFloat(lngStr), locName);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted/50 transition-colors"
              >
                <MapPin className="h-4 w-4 text-red-500" />
                موقع
              </button>
            )}
            {onSendContact && (
              <button
                onClick={() => {
                  const fullName = prompt('اسم جهة الاتصال:');
                  if (!fullName) return;
                  const phoneNumber = prompt('رقم الهاتف:');
                  if (!phoneNumber) return;
                  onSendContact(fullName, phoneNumber);
                }}
                className="flex items-center gap-2 w-full px-3 py-2 text-sm rounded-lg hover:bg-muted/50 transition-colors"
              >
                <Contact className="h-4 w-4 text-teal-500" />
                جهة اتصال
              </button>
            )}
          </PopoverContent>
        </Popover>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />

        {/* Templates Button */}
        <Popover open={templatesOpen} onOpenChange={setTemplatesOpen}>
          <PopoverTrigger asChild>
            <button
              className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#8696a0] hover:bg-[#e9edef] dark:hover:bg-[#313d45] transition-colors disabled:opacity-40"
              disabled={disabled || sending}
              title="ردود سريعة"
              aria-label="ردود سريعة"
            >
              <MessageSquareText className="h-5 w-5" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-72 p-0" align="start" sideOffset={8}>
            <div className="p-2 border-b border-border/60">
              <input
                value={templateSearch}
                onChange={e => setTemplateSearch(e.target.value)}
                placeholder="بحث في القوالب..."
                className="w-full text-sm bg-transparent border-none focus:outline-none placeholder:text-muted-foreground/50"
                autoFocus
              />
            </div>
            <div className="max-h-60 overflow-y-auto p-1">
              {filteredTemplates.length === 0 ? (
                <div className="py-6 text-center text-sm text-muted-foreground/60">
                  {templates.length === 0 ? 'لا توجد قوالب' : 'لا توجد نتائج'}
                </div>
              ) : (
                filteredTemplates.map(t => (
                  <button
                    key={t.id}
                    onClick={() => handleTemplateSelect(t)}
                    className="w-full text-start px-3 py-2 rounded-lg hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium truncate">{t.title}</p>
                      {t.shortcut && (
                        <span className="text-[10px] bg-muted px-1.5 py-0.5 rounded-md text-muted-foreground shrink-0">
                          /{t.shortcut}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground/70 truncate mt-0.5">{t.content}</p>
                  </button>
                ))
              )}
            </div>
            {/* Template variables hint */}
            {templateVariables && (
              <div className="border-t border-border/60 px-3 py-2">
                <p className="text-[9px] text-muted-foreground/50 mb-1 font-medium">المتغيرات المتاحة:</p>
                <div className="flex flex-wrap gap-1">
                  <code className="text-[9px] bg-muted/60 px-1.5 py-0.5 rounded">{'{{contact_name}}'}</code>
                  <code className="text-[9px] bg-muted/60 px-1.5 py-0.5 rounded">{'{{agent_name}}'}</code>
                  <code className="text-[9px] bg-muted/60 px-1.5 py-0.5 rounded">{'{{phone}}'}</code>
                </div>
              </div>
            )}
            <div className="border-t border-border/60 p-1">
              <button
                onClick={() => {
                  setTemplatesOpen(false);
                  window.open('/dashboard/sales/whatsapp-templates', '_blank');
                }}
                className="w-full flex items-center justify-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground py-2 rounded-lg hover:bg-muted/30 transition-colors"
              >
                <Plus className="h-3 w-3" />
                إدارة القوالب
              </button>
            </div>
          </PopoverContent>
        </Popover>

        {/* Textarea */}
        {!isRecording && (
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              data-chat-input
              value={text}
              onChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder="اكتب رسالة..."
              disabled={disabled || sending}
              rows={1}
              className={cn(
                'w-full rounded-lg bg-white dark:bg-[#2a3942] px-3 py-2.5 text-[15px] resize-none',
                'text-[#111b21] dark:text-[#e9edef]',
                'placeholder:text-[#667781] dark:placeholder:text-[#8696a0]',
                'focus:outline-none',
                'transition-all duration-200',
                'disabled:opacity-50',
                'max-h-[100px]'
              )}
              style={{ height: 'auto', minHeight: 42 }}
            />
          </div>
        )}

        {/* Voice Record Button -- show when no text and no attachment */}
        {!text.trim() && !attachmentFile && !isRecording && (
          <button
            className="shrink-0 h-10 w-10 rounded-full flex items-center justify-center text-[#54656f] dark:text-[#8696a0] hover:bg-[#e9edef] dark:hover:bg-[#313d45] transition-colors disabled:opacity-40"
            onClick={startRecording}
            disabled={disabled || sending}
            title="تسجيل رسالة صوتية"
            aria-label="تسجيل رسالة صوتية"
          >
            <Mic className="h-5 w-5" />
          </button>
        )}

        {/* Send Button -- WhatsApp green circle */}
        {!isRecording && (text.trim() || attachmentFile) && (
          <button
            onClick={handleSend}
            disabled={(!text.trim() && !attachmentFile) || sending || disabled}
            aria-label="إرسال"
            data-testid="chat-send-button"
            className={cn(
              'shrink-0 rounded-full w-10 h-10 flex items-center justify-center transition-all duration-200',
              'bg-[#00a884] hover:bg-[#008f72] text-white',
              'disabled:opacity-40'
            )}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        )}
      </div>
    </div>
  );
}
