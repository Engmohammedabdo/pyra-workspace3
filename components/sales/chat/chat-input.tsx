'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils/cn';
import { Send, Paperclip, Loader2 } from 'lucide-react';

interface ChatInputProps {
  onSend: (text: string) => Promise<void>;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleSend() {
    const trimmed = text.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      await onSend(trimmed);
      setText('');
      inputRef.current?.focus();
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="border-t border-border/60 p-3 flex items-center gap-2 bg-card/80 backdrop-blur-sm">
      <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground/60 hover:text-muted-foreground rounded-xl" disabled>
        <Paperclip className="h-5 w-5" />
      </Button>
      <div className="flex-1 relative">
        <input
          ref={inputRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
          placeholder="اكتب رسالة..."
          disabled={disabled || sending}
          className={cn(
            'w-full rounded-xl border border-border/60 bg-muted/30 px-4 py-2.5 text-sm',
            'placeholder:text-muted-foreground/50',
            'focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400',
            'transition-all duration-200',
            'disabled:opacity-50'
          )}
        />
      </div>
      <Button
        onClick={handleSend}
        disabled={!text.trim() || sending || disabled}
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
  );
}
