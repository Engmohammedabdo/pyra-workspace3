'use client';

/**
 * The Kanban container.
 *
 * Desktop (md+): horizontal scrolling row of <PipelineColumn>.
 * Mobile (<md): sticky stage tabs + a single vertical card stack for the
 *               active stage. Same data, two layouts.
 *
 * Drag-and-drop is OFF in Phase 4 — added in Phase 7 by wrapping this
 * board in @dnd-kit's <DndContext> + <SortableContext>.
 */

import { useMemo, useState } from 'react';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { PipelineColumn } from './pipeline-column';
import { PipelineCard } from './pipeline-card';
import { PipelineEmpty } from './pipeline-empty';
import type { Lead } from '@/hooks/useLeads';
import type { PipelineStage } from '@/hooks/usePipelineStages';

interface PipelineBoardProps {
  stages: PipelineStage[] | undefined;
  leads: Lead[] | undefined;
  loading?: boolean;
}

const ACCENT_DOT: Record<string, string> = {
  sky:     'bg-sky-500',
  indigo:  'bg-indigo-500',
  amber:   'bg-amber-500',
  orange:  'bg-orange-500',
  emerald: 'bg-emerald-500',
  gold:    'bg-yellow-500',
  stone:   'bg-stone-400',
};

export function PipelineBoard({ stages, leads, loading }: PipelineBoardProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of stages ?? []) map.set(s.id, []);
    for (const l of leads ?? []) {
      if (l.stage_id && map.has(l.stage_id)) map.get(l.stage_id)!.push(l);
    }
    return map;
  }, [stages, leads]);

  // Mobile stage tab — defaults to first stage with leads, fallback to first stage.
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const effectiveActiveId =
    activeStageId ??
    stages?.find((s) => (grouped.get(s.id)?.length ?? 0) > 0)?.id ??
    stages?.[0]?.id ??
    null;

  if (loading) return <BoardSkeleton />;
  if (!stages || stages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        لم يتم تحميل المراحل.
      </div>
    );
  }

  return (
    <>
      {/* Desktop / tablet — horizontal scroll */}
      <div className="hidden md:block">
        <div className="flex gap-3 overflow-x-auto pb-3" dir="rtl">
          {stages.map((s) => (
            <div key={s.id} className="shrink-0 w-72 lg:w-80">
              <PipelineColumn stage={s} leads={grouped.get(s.id) ?? []} />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile — stage tabs + single column */}
      <div className="md:hidden">
        <div className="sticky top-0 z-10 -mx-4 px-4 pb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" dir="rtl">
            {stages.map((s) => {
              const count = grouped.get(s.id)?.length ?? 0;
              const isActive = effectiveActiveId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setActiveStageId(s.id)}
                  className={cn(
                    'shrink-0 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors',
                    isActive
                      ? 'bg-foreground text-background border-foreground'
                      : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
                  )}
                >
                  <span className={cn('size-1.5 rounded-full', ACCENT_DOT[s.color] ?? 'bg-current')} aria-hidden />
                  <span>{s.name_ar}</span>
                  <span className={cn('tabular-nums', isActive ? 'text-background/80' : 'text-muted-foreground/70')}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-2 space-y-2">
          {effectiveActiveId && (grouped.get(effectiveActiveId)?.length ?? 0) === 0 ? (
            <PipelineEmpty
              stageLabel={
                stages.find((s) => s.id === effectiveActiveId)?.name_ar ?? 'هذه المرحلة'
              }
            />
          ) : (
            (grouped.get(effectiveActiveId ?? '') ?? []).map((lead) => (
              <PipelineCard key={lead.id} lead={lead} />
            ))
          )}
        </div>
      </div>
    </>
  );
}

function BoardSkeleton() {
  return (
    <>
      <div className="hidden md:flex gap-3 overflow-hidden pb-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="shrink-0 w-72 lg:w-80 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        ))}
      </div>
      <div className="md:hidden space-y-2">
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    </>
  );
}
