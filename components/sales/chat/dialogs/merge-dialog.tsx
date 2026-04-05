'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchAPI, mutateAPI } from '@/hooks/api-helpers';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils/cn';
import { Merge, Loader2, MessageCircle, Calendar, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeDate } from '@/lib/utils/format';
import { CONVERSATION_STATUS_LABELS } from '@/lib/constants/statuses';
import type { ConversationsResponse, Conversation } from '@/hooks/useWhatsApp';

interface MergeDialogProps {
  open: boolean;
  onClose: () => void;
  primaryConversation: Conversation;
  contactPhone: string | null;
  onMerged: () => void;
}

export function MergeDialog({
  open,
  onClose,
  primaryConversation,
  contactPhone,
  onMerged,
}: MergeDialogProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  // Fetch other active conversations from same phone
  const { data: otherResponse, isLoading } = useQuery<ConversationsResponse>({
    queryKey: ['whatsapp-merge-candidates', contactPhone, primaryConversation.id],
    queryFn: async () => {
      const params = new URLSearchParams({
        contact_phone: contactPhone || '',
        status: 'all',
        exclude_id: primaryConversation.id || '',
        limit: '20',
      });
      const result = await fetchAPI<ConversationsResponse>(
        `/api/dashboard/sales/whatsapp/conversations?${params}`
      );
      const data = Array.isArray(result) ? result : (result?.data || []);
      return { data: Array.isArray(data) ? data : [] };
    },
    enabled: open && !!contactPhone && !!primaryConversation.id,
    staleTime: 30_000,
  });

  const candidates = otherResponse?.data || [];

  const mergeMutation = useMutation({
    mutationFn: (mergeWithId: string) =>
      mutateAPI(
        `/api/dashboard/sales/whatsapp/conversations/${primaryConversation.id}/merge`,
        'POST',
        { merge_with_id: mergeWithId }
      ),
    onSuccess: () => {
      toast.success('تم دمج المحادثات بنجاح');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-conversations'] });
      onMerged();
      onClose();
    },
    onError: () => {
      toast.error('فشل دمج المحادثات');
    },
  });

  const handleMerge = () => {
    if (!selectedId) return;
    mergeMutation.mutate(selectedId);
  };

  return (
    <Dialog open={open} onOpenChange={() => onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Merge className="h-5 w-5 text-orange-500" />
            دمج المحادثات
          </DialogTitle>
          <DialogDescription>
            اختر المحادثة التي تريد دمجها مع المحادثة الحالية. سيتم نقل جميع الرسائل والملاحظات.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 max-h-64 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin me-2" />
              جاري البحث...
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground/60">
              لا توجد محادثات أخرى لنفس جهة الاتصال
            </div>
          ) : (
            candidates.map(conv => (
              <button
                key={conv.id}
                onClick={() => setSelectedId(conv.id || null)}
                className={cn(
                  'w-full flex items-center justify-between p-3 rounded-xl border transition-all text-start',
                  selectedId === conv.id
                    ? 'border-orange-400 bg-orange-50/50 dark:bg-orange-950/20 ring-1 ring-orange-400/30'
                    : 'border-border/60 hover:border-border hover:bg-muted/30'
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge
                      variant="outline"
                      className={cn(
                        'text-[10px] h-4',
                        conv.status === 'open' && 'border-green-300 text-green-600',
                        conv.status === 'pending' && 'border-yellow-300 text-yellow-600',
                        conv.status === 'resolved' && 'border-gray-300 text-gray-500'
                      )}
                    >
                      {CONVERSATION_STATUS_LABELS[conv.status as keyof typeof CONVERSATION_STATUS_LABELS] || conv.status}
                    </Badge>
                    {conv.total_messages && (
                      <span className="text-[10px] text-muted-foreground/50 flex items-center gap-0.5">
                        <MessageCircle className="h-2.5 w-2.5" />
                        {conv.total_messages}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground/60 truncate">
                    {conv.last_message || 'لا توجد رسائل'}
                  </p>
                  <div className="flex items-center gap-1 mt-1">
                    <Calendar className="h-2.5 w-2.5 text-muted-foreground/40" />
                    <span className="text-[10px] text-muted-foreground/40">
                      {conv.created_at ? formatRelativeDate(conv.created_at) : '—'}
                    </span>
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        {selectedId && (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700 dark:text-amber-400">
              سيتم نقل جميع الرسائل والملاحظات من المحادثة المختارة إلى المحادثة الحالية. هذا الإجراء لا يمكن التراجع عنه.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} className="rounded-lg">
            إلغاء
          </Button>
          <Button
            onClick={handleMerge}
            disabled={!selectedId || mergeMutation.isPending}
            className="rounded-lg bg-orange-500 hover:bg-orange-600 text-white"
          >
            {mergeMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin me-1.5" />
            ) : (
              <Merge className="h-4 w-4 me-1.5" />
            )}
            دمج
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
