'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
    <div className="border-t p-3 flex items-center gap-2 bg-background">
      <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground" disabled>
        <Paperclip className="h-5 w-5" />
      </Button>
      <Input
        ref={inputRef}
        value={text}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
        placeholder="اكتب رسالة..."
        disabled={disabled || sending}
        className="flex-1"
      />
      <Button
        onClick={handleSend}
        disabled={!text.trim() || sending || disabled}
        size="icon"
        className="shrink-0 bg-orange-500 hover:bg-orange-600 text-white"
      >
        {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
      </Button>
    </div>
  );
}
