'use client';

import { useState, useMemo } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Search, Forward, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useConversations, useForwardMessage } from '@/hooks/useWhatsApp';
import { toast } from 'sonner';

interface ForwardDialogProps {
  open: boolean;
  messageId: string;
  onClose: () => void;
}

export function ForwardDialog({ open, messageId, onClose }: ForwardDialogProps) {
  const [search, setSearch] = useState('');
  const [customNumber, setCustomNumber] = useState('');
  const { data: conversationsRes } = useConversations({ status: 'open', assigned: 'all' });
  const conversations = conversationsRes?.data || [];
  const forwardMutation = useForwardMessage();

  const filtered = useMemo(() => {
    if (!search) return conversations.slice(0, 20);
    const q = search.toLowerCase();
    return conversations.filter(c => {
      const name = c.contact_name?.toLowerCase() || '';
      const phone = c.contact_phone || c.phone || '';
      return name.includes(q) || phone.includes(q);
    }).slice(0, 20);
  }, [conversations, search]);

  function handleForward(toNumber: string) {
    forwardMutation.mutate(
      { messageId, toNumber },
      {
        onSuccess: () => {
          toast.success('تم تحويل الرسالة');
          onClose();
        },
        onError: () => toast.error('فشل تحويل الرسالة'),
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-5 w-5 text-orange-500" />
            تحويل الرسالة
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/40" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث بالاسم أو الرقم..."
              className="ps-9"
            />
          </div>

          {/* Contact list */}
          <div className="max-h-60 overflow-y-auto space-y-1">
            {filtered.map((conv) => {
              const phone = conv.contact_phone || conv.phone || conv.remote_jid.replace(/@.+/, '');
              return (
                <button
                  key={conv.remote_jid}
                  onClick={() => handleForward(phone)}
                  disabled={forwardMutation.isPending}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-start',
                    'hover:bg-muted/50 transition-colors disabled:opacity-50',
                  )}
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white text-xs font-bold shrink-0">
                    {(conv.contact_name || phone).charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{conv.contact_name || `+${phone}`}</p>
                    <p className="text-[10px] text-muted-foreground/50 tabular-nums" dir="ltr">+{phone}</p>
                  </div>
                </button>
              );
            })}
            {filtered.length === 0 && (
              <p className="text-center text-sm text-muted-foreground/50 py-6">لا توجد نتائج</p>
            )}
          </div>

          {/* Custom number */}
          <div className="border-t border-border/40 pt-3 space-y-2">
            <p className="text-xs text-muted-foreground">أو أدخل رقم يدوياً:</p>
            <div className="flex gap-2">
              <Input
                value={customNumber}
                onChange={(e) => setCustomNumber(e.target.value)}
                placeholder="971501234567"
                className="flex-1"
                dir="ltr"
              />
              <Button
                size="sm"
                onClick={() => handleForward(customNumber)}
                disabled={!customNumber.trim() || forwardMutation.isPending}
              >
                {forwardMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'إرسال'}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
