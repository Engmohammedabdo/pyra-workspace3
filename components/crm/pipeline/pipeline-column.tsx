'use client';

/**
 * Single Kanban column for one stg_* stage.
 *
 * Phase 4: visual only, no drop zone.
 * Phase 7 will wrap this in @dnd-kit's <SortableContext> and add drop logic.
 */

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
}

const HEADER_TONE: Record<string, string> = {
  sky:     'border-t-sky-500',
  indigo:  'border-t-indigo-500',
  amber:   'border-t-amber-500',
  orange:  'border-t-orange-500',
  emerald: 'border-t-emerald-500',
  gold:    'border-t-yellow-500',
  stone:   'border-t-stone-400',
};

const COUNT_TONE: Record<string, string> = {
  sky:     'bg-sky-500/10 text-sky-700 dark:text-sky-300',
  indigo:  'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300',
  amber:   'bg-amber-500/10 text-amber-700 dark:text-amber-300',
  orange:  'bg-orange-500/10 text-orange-700 dark:text-orange-300',
  emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
  gold:    'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',
  stone:   'bg-stone-500/10 text-stone-700 dark:text-stone-300',
};

export function PipelineColumn({ stage, leads, className, compactCards }: PipelineColumnProps) {
  const total = leads.reduce((acc, l) => acc + (Number(l.expected_value) || 0), 0);
  const headerTone = HEADER_TONE[stage.color] ?? 'border-t-muted-foreground/40';
  const countTone = COUNT_TONE[stage.color] ?? 'bg-muted text-muted-foreground';

  return (
    <div
      className={cn(
        'flex flex-col rounded-xl border border-border bg-muted/20 border-t-4 min-h-[24rem]',
        headerTone,
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
            <PipelineCard key={lead.id} lead={lead} compact={compactCards} />
          ))
        )}
      </div>
    </div>
  );
}
