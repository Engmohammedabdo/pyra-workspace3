'use client';

/**
 * Single Kanban column for one stg_* stage.
 *
 * Phase 7 Chunk 3.1: wired to @dnd-kit's useDroppable. The whole column
 * (header + body + empty placeholder) is the drop zone. While a card
 * hovers over it, the column gets a soft tint matching its stage color
 * so the user sees the target visually distinct from the others.
 */

import { useDroppable } from '@dnd-kit/core';
import { cn } from '@/lib/utils/cn';
import { PipelineCard } from './pipeline-card';
import { PipelineEmpty } from './pipeline-empty';
import { formatCurrency } from '@/lib/utils/format';
import type { Lead } from '@/hooks/useLeads';
import type { PipelineStage } from '@/hooks/usePipelineStages';

interface PipelineColumnProps {
  stage: PipelineStage;
  leads: Lead[];
  className?: string;
  compactCards?: boolean;
  /** Option B (Commit 2) — bulk selection, threaded down to each card. */
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (leadId: string) => void;
}

const HEADER_TONE: Record<string, string> = {
  violet:  'border-t-violet-500',
  sky:     'border-t-sky-500',
  indigo:  'border-t-indigo-500',
  amber:   'border-t-amber-500',
  orange:  'border-t-orange-500',
  emerald: 'border-t-emerald-500',
  gold:    'border-t-yellow-500',
  stone:   'border-t-stone-400',
};

const COUNT_TONE: Record<string, string> = {
  violet:  'bg-violet-500/10 text-violet-700 dark:text-violet-300',
  sky:     'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  indigo:  'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  amber:   'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  orange:  'bg-orange-500/10 text-orange-700 dark:text-orange-300',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  gold:    'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
  stone:   'bg-stone-500/10 text-stone-700 dark:text-stone-300',
};

const OVER_TINT: Record<string, string> = {
  violet:  'bg-violet-500/10 ring-2 ring-violet-300 dark:ring-violet-700/60',
  sky:     'bg-sky-500/10 ring-2 ring-sky-300 dark:ring-sky-700/60',
  indigo:  'bg-indigo-500/10 ring-2 ring-indigo-300 dark:ring-indigo-700/60',
  amber:   'bg-amber-500/10 ring-2 ring-amber-300 dark:ring-amber-700/60',
  orange:  'bg-orange-500/10 ring-2 ring-orange-300 dark:ring-orange-700/60',
  emerald: 'bg-emerald-500/10 ring-2 ring-emerald-300 dark:ring-emerald-700/60',
  gold:    'bg-yellow-500/10 ring-2 ring-yellow-300 dark:ring-yellow-700/60',
  stone:   'bg-stone-500/10 ring-2 ring-stone-300 dark:ring-stone-600/60',
};

export function PipelineColumn({
  stage,
  leads,
  className,
  compactCards,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: PipelineColumnProps) {
  const total = leads.reduce((acc, l) => acc + (Number(l.expected_value) || 0), 0);
  const headerTone = HEADER_TONE[stage.color] ?? 'border-t-muted-foreground/40';
  const countTone = COUNT_TONE[stage.color] ?? 'bg-muted text-muted-foreground';
  const overTint = OVER_TINT[stage.color] ?? 'bg-muted/60 ring-2 ring-muted-foreground/40';

  // Drop zone for the whole column. Carries the stage_id so the board's
  // onDragEnd can identify the target.
  const { isOver, setNodeRef } = useDroppable({
    id: stage.id,
    data: { stage_id: stage.id },
  });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'flex flex-col rounded-xl border border-border bg-muted/20 border-t-4 min-h-[24rem] transition-colors duration-150',
        headerTone,
        isOver && overTint,
        className,
      )}
    >
      <header className="px-3.5 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold truncate">{stage.name_ar}</h3>
          {total > 0 && (
            <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
              {formatCurrency(total, 'AED')}
            </p>
          )}
        </div>
        <span
          className={cn(
            'shrink-0 inline-flex items-center justify-center min-w-7 h-6 px-2 rounded-full text-xs font-semibold tabular-nums',
            countTone,
          )}
        >
          {leads.length}
        </span>
      </header>

      <div className="flex-1 px-2 pb-3 space-y-2 overflow-y-auto">
        {leads.length === 0 ? (
          <PipelineEmpty stageLabel={stage.name_ar} />
        ) : (
          leads.map((lead) => (
            <PipelineCard
              key={lead.id}
              lead={lead}
              compact={compactCards}
              selectionMode={selectionMode}
              isSelected={selectedIds?.has(lead.id)}
              onToggleSelect={onToggleSelect}
            />
          ))
        )}
      </div>
    </div>
  );
}
