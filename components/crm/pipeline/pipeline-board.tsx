'use client';

/**
 * The Kanban container.
 *
 * Desktop (md+): horizontal scrolling row of <PipelineColumn>, plus
 *                @dnd-kit drag-and-drop. PointerSensor activates after
 *                8 px movement so plain clicks still navigate via the
 *                <Link> wrapping each card.
 * Mobile (<md): sticky stage tabs + single vertical card stack. Drag is
 *               OFF — the sensor's activation distance is set to a value
 *               that's effectively unreachable. Mobile drag-trigger is
 *               replaced by a per-card "نقل المرحلة" button (Phase 7 Chunk 4).
 *
 * The board does NOT own the mutation. It surfaces drop events via
 * onDropChangeStage(leadId, toStageId, fromStageId); the parent
 * (pipeline-client) wires the optimistic update + toast.
 */

import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from '@dnd-kit/core';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { PipelineColumn } from './pipeline-column';
import { PipelineCard } from './pipeline-card';
import { PipelineEmpty } from './pipeline-empty';
import type { Lead } from '@/hooks/useLeads';
import type { PipelineStage } from '@/hooks/usePipelineStages';

interface PipelineBoardProps {
  stages: PipelineStage[] | undefined;
  leads: Lead[] | undefined;
  loading?: boolean;
  /**
   * Fired when the user drops a card on a different column.
   * Same-column drops are filtered before this fires.
   * The parent owns the mutation + optimistic update.
   */
  onDropChangeStage?: (leadId: string, toStageId: string, fromStageId: string | null) => void;
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

// Effectively-disabled sensor on mobile.
const MOBILE_DRAG_DISTANCE = Number.MAX_SAFE_INTEGER;
const DESKTOP_DRAG_DISTANCE = 8;

export function PipelineBoard({ stages, leads, loading, onDropChangeStage }: PipelineBoardProps) {
  const isDesktop = useIsDesktop();
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  // PointerSensor with viewport-aware activation. On mobile the threshold is
  // unreachable so drag never starts; the card's Link click still works.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: isDesktop ? DESKTOP_DRAG_DISTANCE : MOBILE_DRAG_DISTANCE,
      },
    }),
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const s of stages ?? []) map.set(s.id, []);
    for (const l of leads ?? []) {
      if (l.stage_id && map.has(l.stage_id)) map.get(l.stage_id)!.push(l);
    }
    return map;
  }, [stages, leads]);

  // Quick lookup so onDragEnd can pass through the from-stage too.
  const leadById = useMemo(() => {
    const map = new Map<string, Lead>();
    for (const l of leads ?? []) map.set(l.id, l);
    return map;
  }, [leads]);

  // Mobile stage tab — defaults to first stage with leads, fallback to first stage.
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const effectiveActiveId =
    activeStageId ??
    stages?.find((s) => (grouped.get(s.id)?.length ?? 0) > 0)?.id ??
    stages?.[0]?.id ??
    null;

  function handleDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setActiveLead(leadById.get(id) ?? null);
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveLead(null);
    const { active, over } = event;
    if (!over || !onDropChangeStage) return;

    const leadId = String(active.id);
    const toStageId = String(over.id);
    const lead = leadById.get(leadId);
    if (!lead) return;
    if (lead.stage_id === toStageId) return; // same-column drop = no-op

    onDropChangeStage(leadId, toStageId, lead.stage_id ?? null);
  }

  if (loading) return <BoardSkeleton />;
  if (!stages || stages.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
        لم يتم تحميل المراحل.
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveLead(null)}
    >
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

      {/* Mobile — stage tabs + single column. Drag is sensor-disabled here,
          so cards behave as plain Links. The "نقل المرحلة" button comes in
          Phase 7 Chunk 4. */}
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

      {/* Floating preview of the dragged card. Only renders during a drag.
          The original card stays at opacity 0 in its column so the source
          slot is still visible while the user moves the overlay. */}
      <DragOverlay dropAnimation={null}>
        {activeLead ? (() => {
          // PHASE 7 CHUNK 3.4 DIAGNOSTIC — confirms (a) bundle hash,
          // (b) DragOverlay render branch is hit, (c) activeLead state.
          // Remove once Abdou confirms the floating card visibility issue.
          if (typeof window !== 'undefined') {
            // eslint-disable-next-line no-console
            console.log('[CRM-DRAG-OVERLAY-RENDER]', {
              bundle: 'phase-3.4-diag-1',
              leadId: activeLead.id,
              leadName: activeLead.name,
            });
          }
          return (
            <div className="w-72 lg:w-80 max-w-[calc(100vw-2rem)]">
              <PipelineCard lead={activeLead} dragOverlay />
            </div>
          );
        })() : null}
      </DragOverlay>
    </DndContext>
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
