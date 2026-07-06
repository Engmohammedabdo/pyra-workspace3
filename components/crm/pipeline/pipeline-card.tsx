'use client';

/**
 * Single lead card on the Kanban board — three-tier architecture mirroring
 * the working `components/projects/project-kanban.tsx` pattern (the proven
 * production reference for @dnd-kit's useDraggable + DragOverlay flow).
 *
 *   <PipelineCard>          source variant rendered in pipeline columns.
 *                           Plain <div> with `useDraggable.setNodeRef` +
 *                           transform style. Inner <Link> handles
 *                           navigation and receives attributes + listeners
 *                           so a click anywhere on the card area navigates
 *                           after the activator decides it's a click vs
 *                           a drag (≥ 8 px movement = drag).
 *
 *   <PipelineCardView>      pure visual presentational component — name,
 *                           value, badges, source icon, etc. NO @dnd-kit
 *                           hooks. Reused by PipelineCard (source) AND
 *                           PipelineCardOverlay (overlay ghost). Quick-
 *                           action buttons (Phone / WhatsApp) live here
 *                           but are suppressed when `isDragging` so the
 *                           overlay ghost is uncluttered.
 *
 *   <PipelineCardOverlay>   visual ghost rendered inside <DragOverlay>.
 *                           Thin wrapper around <PipelineCardView isDragging />.
 *                           NO @dnd-kit hooks. By construction CANNOT
 *                           register a competing entry in @dnd-kit's
 *                           internal `draggableNodes` Map (the previous
 *                           single-component pattern allowed that, which
 *                           overwrote the source's DOM ref → rect → null
 *                           → PositionedOverlay returned null → no
 *                           overlay paint).
 *
 * Two deliberate deviations from project-kanban (approved Phase 7 Chunk 3.6):
 *   1. Source uses `opacity-0 pointer-events-none` instead of `opacity-30`
 *      while dragging. HubSpot-style UX — only the overlay ghost paints,
 *      no double-vision.
 *   2. <DragOverlay> uses `dropAnimation={null}` (set in pipeline-board.tsx)
 *      to avoid snap-back jank when paired with our optimistic drop update.
 */

import Link from 'next/link';
import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import { Phone, MessageCircle, ArrowRightLeft, Check } from 'lucide-react';
import { LeadPriorityBadge } from '@/components/crm/lead/lead-priority-badge';
import { LeadSourceIcon } from '@/components/crm/lead/lead-source-icon';
import { formatCurrency } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { Lead } from '@/hooks/useLeads';
import type { PipelineStage } from '@/hooks/usePipelineStages';
import MobileStageSheet from './mobile-stage-sheet';

interface PipelineCardProps {
  lead: Lead;
  /** Compact mode for tighter mobile layouts */
  compact?: boolean;
  /**
   * Pipeline stages — passed down so the MobileStageSheet can list them.
   * Optional: when omitted (e.g. desktop column rendering), the mobile
   * "نقل المرحلة" button is hidden. Phase 10 Commit 1 (Q-UI-001). // i18n-exempt: doc comment
   */
  stages?: PipelineStage[];
  /**
   * Mobile stage-change callback — invoked from MobileStageSheet on tap.
   * Same signature as PipelineBoard's onDropChangeStage so both desktop
   * drag AND mobile tap share the parent's single gating implementation
   * (closed_won guard + contract_signed/closed_lost modal intercept +
   * routine path). Optional: when omitted, the mobile button is hidden.
   */
  onChangeStage?: (leadId: string, toStageId: string, fromStageId: string | null) => void;
  /**
   * Option B (Commit 2) — bulk selection. When `selectionMode` is true the card
   * renders a selectable, non-draggable, non-navigating variant (drag is also
   * sensor-disabled board-wide in this mode). Default (false) = the locked
   * draggable <Link> path, untouched.
   */
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (leadId: string) => void;
}

/**
 * daysAgoLabel — hand-rolled relative-date label preserving the exact
 * اليوم / منذ يوم / N أيام / N أسابيع / N شهور forms (Phase 3.3 migration: // i18n-exempt: doc comment
 * ported to crm.pipeline.timeAgo ICU keys; a hook since it now needs
 * useTranslations — module-level function became a hook, same call sites).
 */
function useDaysAgoLabel() {
  const t = useTranslations('crm.pipeline.timeAgo');
  return (iso: string | null | undefined): string | null => {
    if (!iso) return null;
    const days = Math.floor((Date.now() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));
    if (days < 0) return null;
    if (days === 0) return t('today');
    if (days === 1) return t('yesterday');
    if (days <= 7) return t('days', { count: days });
    if (days <= 30) return t('weeks', { count: Math.floor(days / 7) });
    return t('months', { count: Math.floor(days / 30) });
  };
}

function whatsAppHref(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return null;
  return `https://wa.me/${digits}`;
}

/**
 * Pure visual component — used both as the source's inner content
 * (inside <PipelineCard>'s draggable wrapper) AND as the overlay ghost
 * (inside <PipelineCardOverlay>). NO @dnd-kit hooks — that's what makes
 * the dual-use safe: only ONE useDraggable call exists per lead.id at any
 * time (the source's, registered by <PipelineCard>'s wrapper).
 */
function PipelineCardView({
  lead,
  compact = false,
  isDragging = false,
  hideQuickActions = false,
}: {
  lead: Lead;
  compact?: boolean;
  /** True when this view is rendered inside <DragOverlay>. Adds shadow,
   *  ring, and rotate flourish; suppresses the absolute-positioned quick-
   *  action buttons (which are a source-only affordance). */
  isDragging?: boolean;
  /** Option B (Commit 2): suppress the quick-action buttons in selection mode
   *  so a stray tap on a card edge selects instead of dialing/opening WhatsApp. */
  hideQuickActions?: boolean;
}) {
  const t = useTranslations('crm.pipeline.card');
  const daysAgoLabel = useDaysAgoLabel();
  const dealTypeLabel = useStatusLabels('leadDealType');
  const lastContact = daysAgoLabel(lead.last_contact_at);
  const winProb = lead.win_probability ?? 0;
  const value = Number(lead.expected_value) || 0;
  const currency = lead.expected_value_currency || 'AED';
  const wa = whatsAppHref(lead.phone);

  return (
    <div
      // Kept on the overlay variant only, for future debugging via
      // document.querySelector('[data-pipeline-overlay="true"]').
      data-pipeline-overlay={isDragging ? 'true' : undefined}
      className={cn(
        'group relative block rounded-xl border border-border bg-card transition-all',
        // Source-only hover affordances.
        !isDragging && 'hover:border-orange-300 dark:hover:border-orange-700/60 hover:shadow-sm',
        compact ? 'p-3' : 'p-3.5',
        // Overlay flourish.
        isDragging && 'shadow-2xl ring-2 ring-orange-300/40 dark:ring-orange-700/40 rotate-1 cursor-grabbing',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold leading-5 truncate">{lead.name}</h3>
          {lead.company && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">{lead.company}</p>
          )}
        </div>
        <LeadPriorityBadge priority={lead.priority} iconOnly />
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm font-bold tabular-nums">
          {value > 0 ? formatCurrency(value, currency) : <span className="text-muted-foreground font-normal">—</span>}
        </div>
        {winProb > 0 && (
          <span
            className={cn(
              'text-[10px] font-medium px-1.5 py-0.5 rounded-md tabular-nums',
              winProb >= 75 ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
              : winProb >= 50 ? 'bg-orange-500/10 text-orange-700 dark:text-orange-300'
              : 'bg-muted text-muted-foreground',
            )}
            title={t('winProbability')}
          >
            {winProb}%
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5 min-w-0">
          <LeadSourceIcon source={lead.source} />
          {lead.deal_type && <span className="truncate">{dealTypeLabel(lead.deal_type)}</span>}
        </div>
        {lastContact && <span className="shrink-0">{lastContact}</span>}
      </div>

      {/* Quick actions — source-only. Suppressed in overlay variant so the
          dragging ghost stays visually uncluttered, and in selection mode. */}
      {!isDragging && !hideQuickActions && (lead.phone || wa) && (
        <div
          className={cn(
            'absolute end-2 bottom-2 flex items-center gap-1',
            'opacity-0 group-hover:opacity-100 md:transition-opacity',
            'pointer-events-none group-hover:pointer-events-auto',
            'max-md:opacity-100 max-md:pointer-events-auto',
          )}
        >
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="size-7 rounded-full bg-background border border-border flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-accent"
              aria-label={t('call')}
              title={t('call')}
            >
              <Phone className="size-3.5" />
            </a>
          )}
          {wa && (
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="size-7 rounded-full bg-background border border-border flex items-center justify-center text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              aria-label={t('whatsapp')}
              title={t('whatsapp')}
            >
              <MessageCircle className="size-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Source card — rendered in pipeline columns.
 *
 * Mirrors `project-kanban.tsx`'s DraggableProjectCard: a plain <div> holds
 * `useDraggable.setNodeRef` + the transform style. Inside it, a <Link>
 * receives attributes + listeners so the entire card area is draggable.
 * Sub-8px clicks on the card pass through to the Link's navigation; ≥8px
 * pointer movement upgrades to a drag.
 *
 * DEVIATION from project-kanban: `opacity-0 pointer-events-none` while
 * dragging instead of `opacity-30` — HubSpot-style UX where only the
 * floating overlay ghost is visible during drag.
 */
export function PipelineCard({
  lead,
  compact = false,
  stages,
  onChangeStage,
  selectionMode = false,
  isSelected = false,
  onToggleSelect,
}: PipelineCardProps) {
  const t = useTranslations('crm.pipeline.card');
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: lead.id,
    data: { lead },
  });

  // Phase 10 Commit 1 (Q-UI-001): mobile-only stage-picker sheet open/close.
  // Per-card local state per Phase 7 locked "no prop drilling" decision —
  // stays inside this PipelineCard instance, not lifted to a parent.
  const [sheetOpen, setSheetOpen] = useState(false);

  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;

  // Phase 9 redirect: converted leads → the Active Customer Page
  // (/customers/[id], the relationship view); non-converted leads → the
  // Lead Detail page (/leads/[id], the editable lead view). Both are
  // valid entry points for the same lead record — PRD §04 line 23
  // "two views of same data, different shells".
  const detailHref = lead.is_converted
    ? `/dashboard/crm/customers/${lead.id}`
    : `/dashboard/crm/leads/${lead.id}`;

  // Show the mobile button only when the parent supplied BOTH stages and
  // the onChangeStage callback (defensive — desktop column rendering omits
  // both, so the button doesn't mount there). The md:hidden gate ensures
  // even when supplied, the button only paints on mobile.
  const showMobileStageButton = !!stages && !!onChangeStage;

  // Option B (Commit 2) — selection mode: render a selectable, NON-draggable,
  // NON-navigating variant. Drag is also sensor-disabled board-wide while in
  // this mode, so the default draggable <Link> path (the `return` below) is
  // byte-identical to the locked Phase 7 behavior. The useDraggable hook above
  // is still called unconditionally (rules of hooks); its listeners/transform
  // are simply not applied in this branch.
  if (selectionMode) {
    return (
      <button
        type="button"
        onClick={() => onToggleSelect?.(lead.id)}
        aria-pressed={isSelected}
        aria-label={t('selectAria', { name: lead.name })}
        className={cn(
          'relative block w-full text-start rounded-xl transition-all',
          'focus:outline-none focus:ring-2 focus:ring-orange-500/40',
          isSelected && 'ring-2 ring-orange-400 dark:ring-orange-600',
        )}
      >
        <span
          className={cn(
            'absolute top-2 start-2 z-10 size-5 rounded-md border-2 flex items-center justify-center',
            isSelected
              ? 'border-orange-500 bg-orange-500 text-white'
              : 'border-muted-foreground/40 bg-background',
          )}
          aria-hidden
        >
          {isSelected && <Check className="size-3.5" />}
        </span>
        <PipelineCardView lead={lead} compact={compact} hideQuickActions />
      </button>
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && 'opacity-0 pointer-events-none')}
    >
      <Link
        href={detailHref}
        {...attributes}
        {...listeners}
        className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500/40 md:cursor-grab md:active:cursor-grabbing"
      >
        <PipelineCardView lead={lead} compact={compact} />
      </Link>

      {/* Mobile-only "نقل المرحلة" button. Per Phase 7 Chunk 3 architecture: // i18n-exempt: doc comment
          MUST live in <PipelineCard> source wrapper, NOT inside
          PipelineCardView (which is also rendered as the drag-overlay ghost
          via PipelineCardOverlay — placing the button there would duplicate
          it in the floating drag preview). The md:hidden gate keeps desktop
          unchanged (desktop uses drag-drop). */}
      {showMobileStageButton && (
        <button
          type="button"
          onClick={(e) => {
            // Prevent the Link's navigation from also firing. Without these
            // guards, tapping the button would route to lead detail because
            // the Link's listeners are mounted on the parent.
            e.preventDefault();
            e.stopPropagation();
            setSheetOpen(true);
          }}
          className="md:hidden mt-1 w-full rounded-lg border border-border bg-muted/30 hover:bg-muted/60 px-3 py-2 text-xs font-medium text-foreground transition-colors flex items-center justify-center gap-1.5"
          aria-label={t('changeStageAria', { name: lead.name })}
        >
          <ArrowRightLeft className="size-3.5" />
          {t('changeStage')}
        </button>
      )}

      {/* Sheet portal — rendered into document.body via Radix Portal, so its
          overlay covers the full viewport regardless of this wrapper's
          stacking context. Mounted unconditionally on mobile contexts (when
          showMobileStageButton is true) so opening is instant on first tap;
          Sheet's data-state attribute keeps the DOM nearly free when closed. */}
      {showMobileStageButton && stages && onChangeStage && (
        <MobileStageSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          lead={lead}
          stages={stages}
          onSelectStage={(toStageId) =>
            onChangeStage(lead.id, toStageId, lead.stage_id ?? null)
          }
        />
      )}
    </div>
  );
}

/**
 * Visual ghost rendered inside <DragOverlay>.
 *
 * Thin wrapper around <PipelineCardView isDragging />. NO @dnd-kit hooks,
 * NO <Link>, NO setNodeRef — this is what guarantees the source's
 * useDraggable registration in @dnd-kit's draggableNodes Map is never
 * overwritten with a null-node entry.
 *
 * @dnd-kit's <DragOverlay> sets width/height from the measured source rect
 * via inline styles on its own internal wrapper (PositionedOverlay), so no
 * explicit width is needed on this component.
 */
export function PipelineCardOverlay({ lead }: { lead: Lead }) {
  return <PipelineCardView lead={lead} isDragging />;
}
