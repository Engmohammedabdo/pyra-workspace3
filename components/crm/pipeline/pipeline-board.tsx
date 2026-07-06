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
 *               replaced by a per-card "نقل المرحلة" button that opens // i18n-exempt: doc comment
 *               <MobileStageSheet> (Phase 10 Commit 1 / Q-UI-001).
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
import { useTranslations, useLocale } from 'next-intl';
import { dirFor } from '@/lib/i18n/config';
import { cn } from '@/lib/utils/cn';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsDesktop } from '@/hooks/useIsDesktop';
import { PipelineColumn } from './pipeline-column';
import { PipelineCard, PipelineCardOverlay } from './pipeline-card';
import { PipelineEmpty } from './pipeline-empty';
import { ACCENT_DOT } from '@/lib/constants/pipeline-colors';
import type { Lead } from '@/hooks/useLeads';
import type { PipelineStage } from '@/hooks/usePipelineStages';
import type { Locale } from '@/lib/i18n/config';

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
  /**
   * Option B (Commit 2) — bulk selection. When `selectionMode` is true, drag is
   * disabled board-wide (sensor distance set unreachable, same mechanism as
   * mobile) and cards render their selectable variant. Default = locked
   * drag-drop behavior, unchanged.
   */
  selectionMode?: boolean;
  selectedIds?: Set<string>;
  onToggleSelect?: (leadId: string) => void;
}

// Effectively-disabled sensor on mobile.
const MOBILE_DRAG_DISTANCE = Number.MAX_SAFE_INTEGER;
const DESKTOP_DRAG_DISTANCE = 8;

export function PipelineBoard({
  stages,
  leads,
  loading,
  onDropChangeStage,
  selectionMode = false,
  selectedIds,
  onToggleSelect,
}: PipelineBoardProps) {
  const t = useTranslations('crm.pipeline');
  const locale = useLocale() as Locale;
  const dir = dirFor(locale);
  const isDesktop = useIsDesktop();
  const [activeLead, setActiveLead] = useState<Lead | null>(null);

  // PointerSensor with viewport-aware activation. On mobile the threshold is
  // unreachable so drag never starts; the card's Link click still works.
  // In selection mode (Option B) the threshold is likewise unreachable so a
  // card click selects instead of starting a drag — reuses the exact mobile
  // kill-switch, leaving the desktop drag path untouched when not selecting.
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance:
          isDesktop && !selectionMode ? DESKTOP_DRAG_DISTANCE : MOBILE_DRAG_DISTANCE,
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
        {t('board.stagesFailed')}
      </div>
    );
  }

  return (
    // collisionDetection: pointerWithin instead of project-kanban's
    // closestCorners. closestCorners measures rect corners in document
    // space, which mis-targets columns in our RTL layout — visual column
    // order doesn't match DOM order (the visually-rightmost column is the
    // FIRST in DOM under `dir="rtl"`), so the rect-corner geometry
    // resolves to the wrong droppable. pointerWithin tests cursor-vs-rect
    // bounds directly and is layout-direction-agnostic. This is the 3rd
    // deviation from project-kanban (alongside opacity-0 source and
    // dropAnimation={null}, both documented near the <DragOverlay> below).
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveLead(null)}
    >
      {/* Desktop / tablet — horizontal scroll */}
      <div className="hidden md:block">
        <div className="flex gap-3 overflow-x-auto pb-3" dir={dir}>
          {stages.map((s) => (
            <div key={s.id} className="shrink-0 w-72 lg:w-80">
              <PipelineColumn
                stage={s}
                leads={grouped.get(s.id) ?? []}
                selectionMode={selectionMode}
                selectedIds={selectedIds}
                onToggleSelect={onToggleSelect}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Mobile — stage tabs + single column. Drag is sensor-disabled here,
          so cards behave as plain Links plus a per-card "نقل المرحلة" // i18n-exempt: doc comment
          button that opens <MobileStageSheet> (Phase 10 Commit 1).
          The PipelineCard receives `stages` + `onChangeStage` only in the
          mobile branch; the desktop column rendering omits them so the
          button doesn't mount there. */}
      <div className="md:hidden">
        <div className="sticky top-0 z-10 -mx-4 px-4 pb-2 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin" dir={dir}>
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
                stages.find((s) => s.id === effectiveActiveId)?.name_ar ?? t('board.emptyStageFallback')
              }
            />
          ) : (
            (grouped.get(effectiveActiveId ?? '') ?? []).map((lead) => (
              <PipelineCard
                key={lead.id}
                lead={lead}
                stages={stages}
                onChangeStage={onDropChangeStage}
                selectionMode={selectionMode}
                isSelected={selectedIds?.has(lead.id)}
                onToggleSelect={onToggleSelect}
              />
            ))
          )}
        </div>
      </div>

      {/* Floating preview of the dragged card. Only renders during a drag.
          Mirrors `components/projects/project-kanban.tsx`'s DragOverlay
          pattern — a bare visual component (PipelineCardOverlay → pure
          PipelineCardView, NO @dnd-kit hooks). That guarantees exactly ONE
          useDraggable registration per lead.id at any time (the source's,
          owned by <PipelineCard>'s wrapping <div>), so @dnd-kit's
          `draggableNodes` Map stays intact and `activeNodeRect` is
          measurable → PositionedOverlay renders.

          Two deviations from project-kanban (Phase 7 Chunk 3.6):
          1. Source uses opacity-0 (HubSpot-style — no double-vision) — see
             <PipelineCard>'s isDragging guard.
          2. `dropAnimation={null}` — the default snap-back animation looks
             jarring paired with our optimistic update, which immediately
             moves the source out of its old column on drop. */}
      <DragOverlay dropAnimation={null}>
        {activeLead ? <PipelineCardOverlay lead={activeLead} /> : null}
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
