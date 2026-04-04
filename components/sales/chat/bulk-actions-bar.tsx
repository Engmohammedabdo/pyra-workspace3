'use client';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils/cn';
import {
  X, CheckCircle2, AlertTriangle,
  Tag, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { useBulkUpdateConversations, useConversationLabels } from '@/hooks/useWhatsApp';

interface BulkActionsBarProps {
  selectedIds: Set<string>;
  onClear: () => void;
  onDone: () => void;
}

export function BulkActionsBar({ selectedIds, onClear, onDone }: BulkActionsBarProps) {
  const bulkUpdate = useBulkUpdateConversations();
  const { data: labels = [] } = useConversationLabels();
  const ids = Array.from(selectedIds);

  if (ids.length === 0) return null;

  async function handleAction(action: string, value: Record<string, unknown>) {
    try {
      await bulkUpdate.mutateAsync({
        ids,
        action: action as 'assign' | 'status' | 'priority' | 'label' | 'snooze' | 'mute',
        value,
      });
      toast.success(`تم تحديث ${ids.length} محادثة`);
      onDone();
    } catch {
      toast.error('فشل التحديث الجماعي');
    }
  }

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-center gap-2 bg-card border border-border/60 rounded-2xl shadow-2xl shadow-black/10 dark:shadow-black/30 px-4 py-2.5 backdrop-blur-sm">
        {/* Count */}
        <div className="flex items-center gap-2 pe-3 border-e border-border/40">
          <span className="bg-orange-500 text-white text-xs font-bold w-6 h-6 rounded-full flex items-center justify-center">
            {ids.length}
          </span>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            محادثة محددة
          </span>
        </div>

        {/* Status */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="rounded-lg text-xs h-8 gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" />
              الحالة
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1" align="center">
            <ActionBtn label="حل" color="text-green-600" loading={bulkUpdate.isPending} onClick={() => handleAction('status', { status: 'resolved' })} />
            <ActionBtn label="إعادة فتح" color="text-blue-600" loading={bulkUpdate.isPending} onClick={() => handleAction('status', { status: 'open' })} />
            <ActionBtn label="تعليق" color="text-yellow-600" loading={bulkUpdate.isPending} onClick={() => handleAction('status', { status: 'pending' })} />
          </PopoverContent>
        </Popover>

        {/* Priority */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="rounded-lg text-xs h-8 gap-1">
              <AlertTriangle className="h-3.5 w-3.5" />
              الأولوية
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1" align="center">
            <ActionBtn label="عاجل" color="text-red-600" loading={bulkUpdate.isPending} onClick={() => handleAction('priority', { priority: 'urgent' })} />
            <ActionBtn label="مرتفع" color="text-orange-600" loading={bulkUpdate.isPending} onClick={() => handleAction('priority', { priority: 'high' })} />
            <ActionBtn label="عادي" color="text-blue-600" loading={bulkUpdate.isPending} onClick={() => handleAction('priority', { priority: 'normal' })} />
            <ActionBtn label="منخفض" color="text-green-600" loading={bulkUpdate.isPending} onClick={() => handleAction('priority', { priority: 'low' })} />
          </PopoverContent>
        </Popover>

        {/* Label */}
        {labels.length > 0 && (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="sm" className="rounded-lg text-xs h-8 gap-1">
                <Tag className="h-3.5 w-3.5" />
                تسمية
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-48 p-1 max-h-48 overflow-y-auto" align="center">
              {labels.map(label => (
                <button
                  key={label.id}
                  disabled={bulkUpdate.isPending}
                  onClick={() => handleAction('label', { label_id: label.id })}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-muted/50 transition-colors"
                >
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: label.color }} />
                  {label.name_ar || label.name}
                </button>
              ))}
            </PopoverContent>
          </Popover>
        )}

        {/* Clear */}
        <Button
          variant="ghost"
          size="sm"
          className="rounded-lg text-xs h-8"
          onClick={onClear}
        >
          <X className="h-3.5 w-3.5 me-1" />
          مسح
        </Button>
      </div>
    </div>
  );
}

function ActionBtn({ label, color, loading, onClick }: {
  label: string;
  color: string;
  loading: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className={cn(
        'w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs hover:bg-muted/50 transition-colors',
        color
      )}
      disabled={loading}
      onClick={onClick}
    >
      {label}
      {loading && <Loader2 className="h-3 w-3 animate-spin ms-auto" />}
    </button>
  );
}
