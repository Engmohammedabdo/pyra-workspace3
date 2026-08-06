'use client';

// Read-only pipeline-stage stepper for the deal banner's row 2 (CR-T5).
// Renders the CRM's own active-stage set, ordered by `sort_order` — the
// API's real ordering field (/api/crm/pipeline-stages) — never by array
// position. The reshuffle holding column and the two terminal stages are
// excluded from the step list: reshuffle isn't a sales-progress step, and
// closed_won/closed_lost are handled by the caller (deal-banner.tsx) — all
// steps render done for a won deal (via `isWon`), and a lost deal renders a
// muted "مغلق - خسر" chip instead of this component entirely.
//
// i18n-exempt: components/sales/chat/** is Phase 6e (not yet migrated) —
// Arabic literals match the rest of this surface.

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';
import type { PipelineStage } from '@/hooks/usePipelineStages';

const NON_STEP_STAGE_IDS = new Set<string>([
  PIPELINE_STAGE_IDS.RESHUFFLE,
  PIPELINE_STAGE_IDS.CLOSED_WON,
  PIPELINE_STAGE_IDS.CLOSED_LOST,
]);

interface StageStepsProps {
  stages: PipelineStage[];
  currentStageId: string | null;
  /** Won deal — every step renders done, none "current" (closed_won itself
   *  is excluded from the step list, so the caller must say so explicitly). */
  isWon?: boolean;
}

export function StageSteps({ stages, currentStageId, isWon }: StageStepsProps) {
  const steps = [...stages]
    .filter((s) => !NON_STEP_STAGE_IDS.has(s.id))
    .sort((a, b) => a.sort_order - b.sort_order);

  if (steps.length === 0) return null;

  // A stage not found among the steps (e.g. the lead sits in "ريشفل") leaves
  // currentIndex at -1 — every step then renders as future/muted, which is
  // the right read for a lead that isn't meaningfully "in" any sales step.
  const currentIndex = isWon ? steps.length - 1 : steps.findIndex((s) => s.id === currentStageId);

  return (
    <div className="flex items-center gap-1 py-1" role="list" aria-label="مراحل الصفقة">
      {steps.map((stage, i) => {
        const isDone = isWon || (currentIndex >= 0 && i < currentIndex);
        const isCurrent = !isWon && i === currentIndex;
        return (
          <div key={stage.id} role="listitem" className="flex flex-1 items-center min-w-0">
            <div className="flex items-center gap-1.5 min-w-0" title={stage.name_ar}>
              <span
                className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors',
                  isDone && 'bg-emerald-500 text-white',
                  isCurrent && 'bg-orange-500 text-white ring-4 ring-orange-500/20',
                  !isDone && !isCurrent && 'bg-muted text-muted-foreground'
                )}
              >
                {isDone ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span
                className={cn(
                  'hidden truncate text-[11px] sm:inline',
                  isCurrent && 'font-semibold text-orange-700 dark:text-orange-300',
                  isDone && !isCurrent && 'text-emerald-700 dark:text-emerald-300',
                  !isDone && !isCurrent && 'text-muted-foreground'
                )}
              >
                {stage.name_ar}
              </span>
            </div>
            {i < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn('mx-1.5 h-0.5 flex-1 rounded-full', isDone ? 'bg-emerald-500' : 'bg-border')}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
