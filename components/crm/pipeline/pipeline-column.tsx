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
import { useLocale } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { PipelineCard } from './pipeline-card';
import { PipelineEmpty } from './pipeline-empty';
import { ACCENT_DOT } from '@/lib/constants/pipeline-colors';
import { formatCurrency } from '@/lib/utils/format';
import type { Lead } from '@/hooks/useLeads';
import type { PipelineStage } from '@/hooks/usePipelineStages';

interface PipelineColumnProps {
  stage: PipelineStage;
  leads: Lead[];
  className?: string;
  compactCards?: boolean;
  /** Position of this stage in the ordered pipeline — powers the card's
   *  derived "next step" line (see lib/crm/next-step.ts). */
  stageIndex: number;
  stageCount: number;
  /** TRUE per-stage count + summed value from the server's `stage_summary`
   *  aggregate (over ALL matching leads, not just the loaded page). When
   *  omitted, falls back to the loaded `leads` length/sum — preserving the
   *  pre-summary behavior for any caller that doesn't pass them. */
  count?: number;
  value?: number;
  /** Option B (Commit 2) — bulk selection, threaded down to each card. */
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (leadId: string) => void;
}

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
  stageIndex,
  stageCount,
  count,
  value,
  selectionMode,
  selectedIds,
  onToggleSelect,
}: PipelineColumnProps) {
  const locale = useLocale();
  // Stage rows are bilingual DB data (name + name_ar) — pick by locale.
  const stageName = locale === 'ar' ? stage.name_ar : (stage.name || stage.name_ar);
  // Prefer the server's true per-stage aggregate; fall back to the loaded page
  // (pre-summary behavior) when the summary isn't supplied.
  const displayCount = count ?? leads.length;
  const total = value ?? leads.reduce((acc, l) => acc + (Number(l.expected_value) || 0), 0);
  const dotTone = ACCENT_DOT[stage.color] ?? 'bg-muted-foreground/40';
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
        'flex flex-col rounded-2xl border border-border bg-muted min-h-[24rem] transition-colors duration-150',
        isOver && overTint,
        className,
      )}
    >
      <header className="px-3.5 py-3 flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className={cn('size-2 rounded-full shrink-0', dotTone)} aria-hidden />
            <h3 className="text-[13.5px] font-bold truncate">{stageName}</h3>
          </div>
          {total > 0 && (
            <p className="text-[11px] text-muted-foreground tabular-nums font-mono mt-0.5 ps-4">
              {formatCurrency(total, 'AED')}
            </p>
          )}
        </div>
        <span className="shrink-0 inline-flex items-center justify-center min-w-7 h-6 px-2 rounded-full text-xs font-bold font-mono tabular-nums bg-card text-foreground border border-border">
          {displayCount}
        </span>
      </header>

      <div className="flex-1 px-2 pb-3 space-y-2 overflow-y-auto">
        {leads.length === 0 ? (
          <PipelineEmpty stageLabel={stageName} />
        ) : (
          leads.map((lead) => (
            <PipelineCard
              key={lead.id}
              lead={lead}
              compact={compactCards}
              stageIndex={stageIndex}
              stageCount={stageCount}
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
