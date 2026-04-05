'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils/cn';
import { Tag, Plus, X, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useConversationLabels,
  useConversationLabelAssignments,
  useCreateLabel,
  useAssignLabel,
  useRemoveLabel,
  type ConversationLabel,
} from '@/hooks/useWhatsApp';

const LABEL_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#22c55e',
  '#06b6d4', '#3b82f6', '#8b5cf6', '#ec4899',
  '#6b7280', '#78716c',
];

interface LabelPickerProps {
  conversationId: string;
  assignedLabels?: ConversationLabel[];
  compact?: boolean;
}

export function LabelPicker({ conversationId, assignedLabels: externalLabels, compact }: LabelPickerProps) {
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(LABEL_COLORS[0]);

  const { data: allLabels = [] } = useConversationLabels();
  const { data: assignedLabelsData = [] } = useConversationLabelAssignments(conversationId);
  const createLabel = useCreateLabel();
  const assignLabel = useAssignLabel();
  const removeLabel = useRemoveLabel();

  // Use external labels if provided, otherwise use fetched ones
  const assignedLabels = externalLabels || assignedLabelsData;
  const assignedIds = new Set(assignedLabels.map(l => l.id));

  function handleToggle(label: ConversationLabel) {
    if (assignedIds.has(label.id)) {
      removeLabel.mutate(
        { conversationId, labelId: label.id },
        { onError: () => toast.error('فشل إزالة التسمية') }
      );
    } else {
      assignLabel.mutate(
        { conversationId, labelId: label.id },
        { onError: () => toast.error('فشل إضافة التسمية') }
      );
    }
  }

  function handleCreate() {
    if (!newName.trim()) return;
    createLabel.mutate(
      { name: newName.trim(), name_ar: newName.trim(), color: newColor },
      {
        onSuccess: () => {
          setNewName('');
          setShowCreate(false);
          toast.success('تم إنشاء التسمية');
        },
        onError: () => toast.error('فشل إنشاء التسمية'),
      }
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {compact ? (
          <Button
            variant="ghost"
            size="icon"
            className="rounded-xl h-9 w-9"
            title="التسميات"
            aria-label="إدارة التسميات"
          >
            <Tag className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg text-xs gap-1.5"
          >
            <Tag className="h-3 w-3" />
            التسميات
            {assignedLabels.length > 0 && (
              <span className="bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 text-[10px] px-1.5 rounded-full">
                {assignedLabels.length}
              </span>
            )}
          </Button>
        )}
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <div className="p-3 border-b border-border/60">
          <h4 className="text-xs font-semibold text-muted-foreground/70">التسميات</h4>
        </div>

        <div className="max-h-60 overflow-y-auto p-1">
          {allLabels.length === 0 && !showCreate && (
            <p className="text-xs text-muted-foreground/50 text-center py-4">
              لا توجد تسميات بعد
            </p>
          )}

          {allLabels.map(label => {
            const isAssigned = assignedIds.has(label.id);
            return (
              <button
                key={label.id}
                onClick={() => handleToggle(label)}
                className={cn(
                  'w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors',
                  'hover:bg-muted/50',
                  isAssigned && 'bg-muted/30'
                )}
              >
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: label.color }}
                />
                <span className="flex-1 text-start truncate text-xs">
                  {label.name_ar || label.name}
                </span>
                {isAssigned && (
                  <Check className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                )}
              </button>
            );
          })}
        </div>

        {/* Create new label */}
        <div className="border-t border-border/60 p-2">
          {showCreate ? (
            <div className="space-y-2">
              <Input
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder="اسم التسمية..."
                className="h-8 text-xs rounded-lg"
                autoFocus
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
              <div className="flex flex-wrap gap-1.5">
                {LABEL_COLORS.map(color => (
                  <button
                    key={color}
                    onClick={() => setNewColor(color)}
                    className={cn(
                      'w-5 h-5 rounded-full transition-all',
                      newColor === color && 'ring-2 ring-offset-1 ring-offset-background ring-foreground/30 scale-110'
                    )}
                    style={{ backgroundColor: color }}
                  />
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  size="sm"
                  className="flex-1 h-7 text-xs rounded-lg bg-orange-500 hover:bg-orange-600 text-white"
                  onClick={handleCreate}
                  disabled={createLabel.isPending || !newName.trim()}
                >
                  {createLabel.isPending ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    'إنشاء'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 text-xs rounded-lg"
                  onClick={() => { setShowCreate(false); setNewName(''); }}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowCreate(true)}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
            >
              <Plus className="h-3 w-3" />
              إنشاء تسمية جديدة
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Small label dots display for conversation items */
export function LabelDots({ labels }: { labels?: ConversationLabel[] }) {
  if (!labels || labels.length === 0) return null;

  return (
    <div className="flex items-center gap-0.5 flex-wrap">
      {labels.slice(0, 4).map(label => (
        <span
          key={label.id}
          className="w-2 h-2 rounded-full shrink-0"
          style={{ backgroundColor: label.color }}
          title={label.name_ar || label.name}
        />
      ))}
      {labels.length > 4 && (
        <span className="text-[8px] text-muted-foreground/50 ms-0.5">
          +{labels.length - 4}
        </span>
      )}
    </div>
  );
}

/** Label badges display for contact panel */
export function LabelBadges({
  labels,
  conversationId,
  editable,
}: {
  labels?: ConversationLabel[];
  conversationId?: string;
  editable?: boolean;
}) {
  const removeLabel = useRemoveLabel();

  if (!labels || labels.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-1.5">
      {labels.map(label => (
        <span
          key={label.id}
          className="flex items-center gap-1 text-[10px] rounded-full px-2 py-0.5"
          style={{
            backgroundColor: label.color + '20',
            color: label.color,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ backgroundColor: label.color }}
          />
          {label.name_ar || label.name}
          {editable && conversationId && (
            <button
              onClick={() => removeLabel.mutate({ conversationId, labelId: label.id })}
              className="ms-0.5 hover:opacity-70 transition-opacity"
            >
              <X className="h-2.5 w-2.5" />
            </button>
          )}
        </span>
      ))}
    </div>
  );
}
