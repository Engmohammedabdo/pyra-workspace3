'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { Send, Loader2 } from 'lucide-react';
import { MentionTextarea } from '@/components/ui/mention-textarea';

interface NoteInputProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
}

/**
 * Note input with @mention support.
 * Uses MentionTextarea from shared UI components.
 * Fetches all users (not project-scoped) for mentions.
 */
export function NoteInput({ onSend, disabled }: NoteInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);

  const handleSend = useCallback(async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await onSend(trimmed);
      setText('');
    } catch {
      // Error handled upstream
    } finally {
      setSending(false);
    }
  }, [text, sending, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend]
  );

  return (
    <div className="border-t border-amber-300/30 dark:border-amber-700/30 bg-amber-50/30 dark:bg-amber-950/10 backdrop-blur-sm">
      <div className="p-3 flex items-end gap-2">
        <div className="flex-1">
          <MentionTextarea
            value={text}
            onChange={setText}
            onKeyDown={handleKeyDown}
            placeholder="اكتب ملاحظة داخلية... (@ لذكر شخص)"
            rows={2}
            className={cn(
              'rounded-xl border-amber-200/60 dark:border-amber-800/40 bg-white/50 dark:bg-gray-900/50',
              'focus-visible:ring-amber-500/30 focus-visible:border-amber-400',
              'placeholder:text-amber-600/30 dark:placeholder:text-amber-400/30',
              'text-sm resize-none min-h-[40px]'
            )}
            disabled={disabled || sending}
          />
        </div>
        {text.trim() && (
          <Button
            onClick={handleSend}
            disabled={!text.trim() || sending || disabled}
            size="icon"
            aria-label="إرسال ملاحظة"
            className={cn(
              'shrink-0 rounded-xl w-10 h-10 shadow-md dark:shadow-black/20 transition-all duration-200',
              'bg-gradient-to-br from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700',
              'text-white shadow-amber-500/20',
              'disabled:opacity-40 disabled:shadow-none'
            )}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        )}
      </div>
    </div>
  );
}
