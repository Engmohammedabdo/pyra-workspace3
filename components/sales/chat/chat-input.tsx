'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { toast } from 'sonner';

interface Template {
  id: string;
  title: string;
  content: string;
  category: string;
  shortcut: string | null;
}

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  onSendMedia?: (file: File, caption?: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onSend, onSendMedia, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [templatesOpen, setTemplatesOpen] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null);
  const [attachmentPreview, setAttachmentPreview] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch templates on first open
  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/sales/whatsapp/templates');
      const data = await res.json();
      setTemplates(data.data || []);
    } catch {
      console.error('Failed to fetch templates');
    }
  }, []);

  useEffect(() => {
    if (templatesOpen && templates.length === 0) {
      fetchTemplates();
    }
  }, [templatesOpen, templates.length, fetchTemplates]);

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
      setText('');
      inputRef.current?.focus();
    } catch {
      // Error handled upstream
    } finally {
      setSending(false);
    }
  }

  function handleTemplateSelect(template: Template) {
    setText(template.content);
    setTemplatesOpen(false);
    setTemplateSearch('');
    inputRef.current?.focus();
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Max 16MB
    if (file.size > 16 * 1024 * 1024) {
      toast.error('حجم الملف أكبر من 16 ميجابايت');
      return;
    }

    setAttachmentFile(file);

    // Preview for images
    if (file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = () => setAttachmentPreview(reader.result as string);
      reader.readAsDataURL(file);
    } else {
      setAttachmentPreview(null);
    }

    // Reset file input
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

  // Auto-resize textarea
  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setText(e.target.value);
    const el = e.target;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  return (
    <div className="border-t border-border/60 bg-card/80 backdrop-blur-sm">
      {/* Attachment Preview */}
      {attachmentFile && (
        <div className="px-3 pt-3 flex items-start gap-3">
          <div className={cn(
            'relative rounded-xl overflow-hidden border border-border/60',
            attachmentPreview ? 'w-20 h-20' : 'flex items-center gap-2 px-3 py-2'
          )}>
            {attachmentPreview ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={attachmentPreview} alt="" className="w-full h-full object-cover" />
              </>
            ) : (
              <>
                <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground truncate max-w-[200px]">{attachmentFile.name}</span>
              </>
            )}
            <button
              onClick={clearAttachment}
              className="absolute -top-0.5 -end-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow-sm"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <div className="text-xs text-muted-foreground/60 mt-2">
            <p>{attachmentFile.name}</p>
            <p>{(attachmentFile.size / 1024).toFixed(0)} KB</p>
          </div>
        </div>
      )}

      {/* Input Row */}
      <div className="p-3 flex items-end gap-2">
        {/* Attachment Button */}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground/60 hover:text-muted-foreground rounded-xl h-10 w-10"
              disabled={disabled || sending || !onSendMedia}
            >
              <Paperclip className="h-5 w-5" />
            </Button>
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
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-muted-foreground/60 hover:text-muted-foreground rounded-xl h-10 w-10"
              disabled={disabled || sending}
              title="ردود سريعة"
            >
              <MessageSquareText className="h-5 w-5" />
            </Button>
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
        <div className="flex-1 relative">
          <textarea
            ref={inputRef}
            value={text}
            onChange={handleTextChange}
            onKeyDown={handleKeyDown}
            placeholder="اكتب رسالة..."
            disabled={disabled || sending}
            rows={1}
            className={cn(
              'w-full rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-sm resize-none',
              'placeholder:text-muted-foreground/50',
              'focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400',
              'transition-all duration-200',
              'disabled:opacity-50',
              'max-h-[120px]'
            )}
            style={{ height: 'auto' }}
          />
        </div>

        {/* Send Button */}
        <Button
          onClick={handleSend}
          disabled={(!text.trim() && !attachmentFile) || sending || disabled}
          size="icon"
          className={cn(
            'shrink-0 rounded-xl w-10 h-10 shadow-md transition-all duration-200',
            'bg-gradient-to-br from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700',
            'text-white shadow-orange-500/20',
            'disabled:opacity-40 disabled:shadow-none'
          )}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
