'use client';

/**
 * Full activity timeline for a lead.
 *
 * Backed by useLeadActivities(leadId) — useInfiniteQuery with cursor
 * pagination via ?before=<created_at> per Q-UI-002 (50 / page, "Load more"
 * button at the end).
 *
 * Optional type filter: pass a `type` to scope to one activity_type.
 * Day-divider rendering: groups items by their YYYY-MM-DD created_at.
 */

import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { useLocale, useTranslations } from 'next-intl';
import { dubaiDayKey } from '@/lib/utils/format';
import { getDateFnsLocale } from '@/lib/i18n/date-locale';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Activity as ActivityIcon, Loader2 } from 'lucide-react';
import { useLeadActivities, type LeadActivity } from '@/hooks/useLeadActivities';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import { ActivityItem } from './activity-item';
import { ActivityComposer } from './activity-composer';
import { LEAD_ACTIVITY_TYPES, type LeadActivityTypeNew } from '@/lib/constants/statuses';
import type { Locale } from '@/lib/i18n/config';

interface ActivityTimelineProps {
  leadId: string;
  /** Render the composer at the top — defaults to true on the Activity tab. */
  showComposer?: boolean;
  /**
   * Phase 15.1 Commit 1 — Activity ID to scroll-into-view + flash on
   * first render after data loads. Sourced from `?highlight=<id>` query
   * param on mention notification links. Graceful no-op when the row
   * isn't in the loaded pages (v1.1 may auto-fetch older pages).
   */
  highlightId?: string | null;
}

// Stable keys (never change with locale) — used as React keys AND as the
// `activeFilter` state value. Visible labels are resolved via t() at render
// time from `crm.activity.filterGroups.*` (Phase 3.4 migration: label used to
// double as both the key and the display text; now split so switching locale
// doesn't reset the active filter).
const FILTER_GROUP_DEFS: Array<{ key: string; types: LeadActivityTypeNew[] | 'all' }> = [
  { key: 'all',       types: 'all' },
  { key: 'notes',     types: ['note'] },
  { key: 'calls',     types: ['call_logged'] },
  { key: 'whatsapp',  types: ['whatsapp_inbound', 'whatsapp_outbound'] },
  { key: 'stages',    types: ['stage_change', 'closed_won_pending', 'closed_won_approved', 'closed_won_rejected'] },
  { key: 'followUps', types: ['follow_up_created', 'follow_up_completed', 'follow_up_overdue'] },
];

export function ActivityTimeline({ leadId, showComposer = true, highlightId }: ActivityTimelineProps) {
  const t = useTranslations('crm.activity');
  const statusLabelForActivity = useStatusLabels('leadActivity');
  const locale = useLocale() as Locale;
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const filterTypes = useMemo(() => {
    const g = FILTER_GROUP_DEFS.find((f) => f.key === activeFilter);
    if (!g || g.types === 'all') return undefined;
    return g.types;
  }, [activeFilter]);

  // The infinite query supports a single `type` param. For groups with
  // multiple types (WhatsApp, stages, follow-ups) we fetch all and filter
  // client-side — Q-UI-002's 50/page is enough for v1.
  const singleType = filterTypes && filterTypes.length === 1 ? filterTypes[0] : undefined;

  const q = useLeadActivities(leadId, singleType ? { type: singleType } : undefined);

  const allActivities: LeadActivity[] = useMemo(() => {
    const flat = q.data?.pages.flatMap((p) => p.activities) ?? [];
    if (!filterTypes || singleType) return flat;
    const set = new Set<string>(filterTypes);
    return flat.filter((a) => set.has(a.activity_type));
  }, [q.data, filterTypes, singleType]);

  const groupedByDay = useMemo(() => {
    const groups = new Map<string, LeadActivity[]>();
    for (const a of allActivities) {
      // Group by the DUBAI calendar day, not UTC — `.slice(0,10)` files an
      // activity logged at 02:00 Dubai (= 22:00Z prev day) under the wrong day.
      const key = dubaiDayKey(new Date(a.created_at)); // YYYY-MM-DD (Asia/Dubai)
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    return groups;
  }, [allActivities]);

  // Phase 15.1 Commit 1 — scroll-to + flash effect for mention deep-links.
  // Fires once when:
  //   - highlightId is set (from ?highlight= query param)
  //   - the first page has loaded (q.isLoading is false)
  //   - the highlighted activity exists in allActivities
  //
  // Cleanup function clears the setTimeout per Abdou's refinement: prevents
  // a setState-on-unmounted-component warning if the user navigates away
  // before the 2-second flash completes. DOM class is also removed in the
  // cleanup so a flash interrupted by unmount doesn't leak its class.
  //
  // The DOM lookup uses `data-activity-id` (set on ActivityItem root); the
  // effect waits 1 paint via requestAnimationFrame so React's render commit
  // has placed the element into the DOM before querySelector runs.
  useEffect(() => {
    if (!highlightId || q.isLoading) return;
    const exists = allActivities.some((a) => a.id === highlightId);
    if (!exists) return; // graceful no-op when activity is too deep in history

    let timer: ReturnType<typeof setTimeout> | null = null;
    let targetEl: HTMLElement | null = null;
    const FLASH_CLASSES = ['ring-2', 'ring-orange-400', 'ring-offset-2', 'rounded-lg'];

    const raf = requestAnimationFrame(() => {
      targetEl = document.querySelector<HTMLElement>(`[data-activity-id="${CSS.escape(highlightId)}"]`);
      if (!targetEl) return;
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      targetEl.classList.add(...FLASH_CLASSES);

      timer = setTimeout(() => {
        targetEl?.classList.remove(...FLASH_CLASSES);
      }, 2000);
    });

    return () => {
      cancelAnimationFrame(raf);
      if (timer !== null) clearTimeout(timer);
      // Defensive: if the cleanup fires mid-flash, remove the class so it
      // doesn't leak onto a re-render.
      targetEl?.classList.remove(...FLASH_CLASSES);
    };
  }, [highlightId, q.isLoading, allActivities]);

  return (
    <div className="space-y-3">
      {showComposer && <ActivityComposer leadId={leadId} />}

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_GROUP_DEFS.map((g) => {
          const isActive = g.key === activeFilter;
          return (
            <button
              key={g.key}
              onClick={() => setActiveFilter(g.key)}
              aria-pressed={isActive}
              className={
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors ' +
                (isActive
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted')
              }
            >
              {t(`filterGroups.${g.key}` as Parameters<typeof t>[0])}
            </button>
          );
        })}
      </div>

      {/* Body */}
      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : allActivities.length === 0 ? (
        <EmptyState
          icon={ActivityIcon}
          title={activeFilter === 'all' ? t('empty.titleAll') : t('empty.titleFiltered')}
          description={
            activeFilter === 'all'
              ? t('empty.descriptionAll')
              : t('empty.descriptionFiltered')
          }
        />
      ) : (
        <div className="space-y-5">
          {Array.from(groupedByDay.entries()).map(([day, items]) => (
            <div key={day} className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 py-1">
                {/* `day` is a Dubai YYYY-MM-DD key — parse as local midnight so
                    the printed label matches the key regardless of viewer TZ. */}
                {format(new Date(day + 'T00:00:00'), 'eeee, d MMMM yyyy', { locale: getDateFnsLocale(locale) })}
              </h4>
              <ul className="space-y-1 -m-1 ms-2 ps-3 border-s-2 border-dashed border-border/60">
                {items.map((a) => (
                  <ActivityItem key={a.id} activity={a} />
                ))}
              </ul>
            </div>
          ))}

          {/* Load more */}
          {q.hasNextPage && (
            <div className="flex justify-center pt-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
                className="gap-1.5"
              >
                {q.isFetchingNextPage ? <Loader2 className="size-3.5 animate-spin" /> : null}
                {q.isFetchingNextPage ? t('loadingMore') : t('loadMore')}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Hint about filter labels for testers — only when there are NO activities at all */}
      {q.data?.pages?.[0]?.activities.length === 0 && (
        <p className="text-[10px] text-muted-foreground/60 text-center pt-2">
          {t('supportedTypesHint', {
            types: LEAD_ACTIVITY_TYPES.map((type) => statusLabelForActivity(type)).join(' · '),
          })}
        </p>
      )}
    </div>
  );
}
