'use client';

/**
 * Phase 15.1 Commit 3 — single lead-task row.
 *
 * Inline-edit scope (locked per Q3-2 = (a)):
 *   - status: checkbox click toggles pending ↔ completed
 *   - title: click-to-edit (Enter saves, Escape cancels)
 *   - everything else → kebab menu → "تعديل التفاصيل" Sheet
 *
 * Completed task styling:
 *   - title:     line-through + text-muted-foreground
 *   - container: opacity-60 + bg-muted/30
 *   - checkbox:  stays in 'checked' state; click reverts to in_progress
 *
 * Priority chips (locked spec B):
 *   urgent → AlertOctagon + red
 *   high   → AlertTriangle + orange
 *   medium → Minus + amber
 *   low    → ArrowDown + slate
 *   null   → no chip
 */

import { useState, useRef, useEffect } from 'react';
import { toast } from 'sonner';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  AlertOctagon,
  AlertTriangle,
  Minus,
  ArrowDown,
  MoreVertical,
  Loader2,
  Pencil,
  Trash2,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatTaskDueDate } from '@/lib/utils/format';
import { useUpdateLeadTask } from '@/hooks/useLeadTasks';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Locale } from '@/lib/i18n/config';
import type { PyraLeadTask, LeadTaskPriority } from '@/types/database';

interface PrioritySpec {
  icon: LucideIcon;
  tone: string;
}

const PRIORITY_SPECS: Record<LeadTaskPriority, PrioritySpec> = {
  urgent: {
    icon: AlertOctagon,
    tone: 'bg-red-500/10 text-red-700 dark:text-red-400 border-red-200 dark:border-red-800/40',
  },
  high: {
    icon: AlertTriangle,
    tone: 'bg-orange-500/10 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/40',
  },
  medium: {
    icon: Minus,
    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40',
  },
  low: {
    icon: ArrowDown,
    tone: 'bg-slate-500/10 text-slate-700 dark:text-slate-400 border-slate-200 dark:border-slate-800/40',
  },
};

export interface LeadTaskRowProps {
  task: PyraLeadTask;
  /** Click handler for the kebab "تعديل التفاصيل" item — opens parent Sheet. */
  onEdit: () => void;
  /** Click handler for the kebab "حذف" item — opens parent AlertDialog. */
  onDelete: () => void;
}

export function LeadTaskRow({ task, onEdit, onDelete }: LeadTaskRowProps) {
  const t = useTranslations('crm.leadTabs.tasks.row');
  const locale = useLocale() as Locale;
  const priorityLabelFor = useStatusLabels('leadTaskPriority');
  const update = useUpdateLeadTask();
  const isDone = task.status === 'completed';

  // ── Inline title edit ──
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => {
    if (editingTitle) titleInputRef.current?.focus();
  }, [editingTitle]);
  // Keep the draft in sync when external updates change the source title.
  useEffect(() => {
    if (!editingTitle) setTitleDraft(task.title);
  }, [task.title, editingTitle]);

  async function commitTitle() {
    const next = titleDraft.trim();
    if (!next) {
      toast.error(t('requiredTitle'));
      setTitleDraft(task.title);
      setEditingTitle(false);
      return;
    }
    if (next === task.title) {
      setEditingTitle(false);
      return;
    }
    try {
      await update.mutateAsync({
        lead_id: task.lead_id,
        task_id: task.id,
        title: next,
      });
      setEditingTitle(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updateTitleError'));
      setTitleDraft(task.title);
      setEditingTitle(false);
    }
  }

  function cancelTitle() {
    setTitleDraft(task.title);
    setEditingTitle(false);
  }

  // ── Status toggle ──
  async function toggleStatus(checked: boolean | 'indeterminate') {
    // Toggle TO completed when checked, AWAY (back to in_progress) when not.
    // Server's PATCH handler owns the completed_at lifecycle (Phase 15.1
    // Commit 2 FIX 2).
    const newStatus = checked === true ? 'completed' : 'in_progress';
    if (newStatus === task.status) return;
    try {
      await update.mutateAsync({
        lead_id: task.lead_id,
        task_id: task.id,
        status: newStatus,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('updateStatusError'));
    }
  }

  // ── Render ──
  const due = formatTaskDueDate(task.due_date, new Date(), locale);
  const prioritySpec = task.priority ? PRIORITY_SPECS[task.priority] : null;
  const PriorityIcon = prioritySpec?.icon;

  return (
    <div
      className={cn(
        'group relative flex items-start gap-3 p-3 rounded-lg border border-border transition-colors',
        isDone
          ? 'opacity-60 bg-muted/30'
          : 'hover:bg-muted/40 hover:border-orange-200 dark:hover:border-orange-800/40',
      )}
    >
      {/* Status checkbox — h-11 stays well above the 44px touch target via
          padded hit area on the parent div on mobile. */}
      <Checkbox
        checked={isDone}
        onCheckedChange={toggleStatus}
        disabled={update.isPending}
        aria-label={isDone ? t('uncompleteAria') : t('completeAria')}
        className="mt-1 h-5 w-5"
      />

      {/* Title + meta column */}
      <div className="min-w-0 flex-1">
        {editingTitle ? (
          <Input
            ref={titleInputRef}
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void commitTitle();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                cancelTitle();
              }
            }}
            className="h-8 text-sm"
            maxLength={200}
            aria-label={t('editTitleAria')}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingTitle(true)}
            className={cn(
              'text-start text-sm font-medium leading-5 truncate w-full hover:text-foreground transition-colors',
              isDone && 'line-through text-muted-foreground',
            )}
            aria-label={t('clickToEditAria')}
          >
            {task.title}
          </button>
        )}

        {/* Meta row: due + priority + assignee */}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <Badge
            variant="outline"
            className={cn('text-[10px] px-1.5 py-0 h-5 border-0', due.tone)}
          >
            {due.label}
          </Badge>

          {prioritySpec && PriorityIcon && (
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] px-1.5 py-0 h-5 inline-flex items-center gap-1 border',
                prioritySpec.tone,
              )}
            >
              <PriorityIcon className="size-3" aria-hidden />
              {priorityLabelFor(task.priority as LeadTaskPriority)}
            </Badge>
          )}

          {task.assigned_to_display_name && (
            <span className="text-[10px] text-muted-foreground truncate">
              · {task.assigned_to_display_name}
            </span>
          )}
        </div>
      </div>

      {/* Kebab — opens parent-controlled menu (parent decides Sheet vs Popover
          based on viewport via the onEdit/onDelete props). On mobile the
          parent passes onEdit that opens a Sheet; we use a simple button-
          group inline here for both because both actions are 1-tap each. */}
      <div className="shrink-0 flex items-center gap-1 self-start">
        {update.isPending && <Loader2 className="size-4 animate-spin text-muted-foreground" aria-hidden />}
        <TaskKebab onEdit={onEdit} onDelete={onDelete} />
      </div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────
// Kebab — DropdownMenu with two items: تعديل التفاصيل + حذف.
// ──────────────────────────────────────────────────────────────────────────

function TaskKebab({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const t = useTranslations('crm.leadTabs.tasks.row');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-11 w-8 p-0 -my-2 text-muted-foreground hover:text-foreground"
          aria-label={t('moreOptionsAria')}
        >
          <MoreVertical className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem onSelect={() => onEdit()}>
          <Pencil className="size-4 me-2" aria-hidden />
          {t('editDetails')}
        </DropdownMenuItem>
        <DropdownMenuItem
          onSelect={() => onDelete()}
          className="text-red-600 dark:text-red-400 focus:text-red-700 dark:focus:text-red-300"
        >
          <Trash2 className="size-4 me-2" aria-hidden />
          {t('delete')}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
