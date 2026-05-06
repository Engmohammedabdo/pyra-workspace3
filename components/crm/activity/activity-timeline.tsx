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

import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Activity as ActivityIcon, Loader2 } from 'lucide-react';
import { useLeadActivities, type LeadActivity } from '@/hooks/useLeadActivities';
import { ActivityItem } from './activity-item';
import { LEAD_ACTIVITY_TYPES, LEAD_ACTIVITY_LABELS_AR, type LeadActivityTypeNew } from '@/lib/constants/statuses';

interface ActivityTimelineProps {
  leadId: string;
}

const FILTER_GROUPS: Array<{ label: string; types: LeadActivityTypeNew[] | 'all' }> = [
  { label: 'كل النشاط', types: 'all' },
  { label: 'ملاحظات',     types: ['note'] },
  { label: 'مكالمات',     types: ['call_logged'] },
  { label: 'WhatsApp',    types: ['whatsapp_inbound', 'whatsapp_outbound'] },
  { label: 'مراحل',       types: ['stage_change', 'closed_won_pending', 'closed_won_approved', 'closed_won_rejected'] },
  { label: 'متابعات',     types: ['follow_up_created', 'follow_up_completed', 'follow_up_overdue'] },
];

export function ActivityTimeline({ leadId }: ActivityTimelineProps) {
  const [activeFilter, setActiveFilter] = useState<string>('all');

  const filterTypes = useMemo(() => {
    const g = FILTER_GROUPS.find((f) => f.label === activeFilter);
    if (!g || g.types === 'all') return undefined;
    return g.types;
  }, [activeFilter]);

  // The infinite query supports a single `type` param. For groups with
  // multiple types (WhatsApp, مراحل, متابعات) we fetch all and filter
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
      const key = a.created_at.slice(0, 10); // YYYY-MM-DD
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(a);
    }
    return groups;
  }, [allActivities]);

  return (
    <div className="space-y-3">
      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTER_GROUPS.map((g) => {
          const isActive = g.label === activeFilter;
          return (
            <button
              key={g.label}
              onClick={() => setActiveFilter(g.label)}
              className={
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors ' +
                (isActive
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted')
              }
            >
              {g.label}
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
          title={activeFilter === 'all' ? 'لا يوجد نشاط بعد' : 'لا يوجد نشاط في هذا التصنيف'}
          description={
            activeFilter === 'all'
              ? 'بمجرد ما يتم تسجيل ملاحظة، مكالمة، أو رسالة WhatsApp ستظهر هنا.'
              : 'جرّب تصنيف آخر من الفلاتر بالأعلى.'
          }
        />
      ) : (
        <div className="space-y-5">
          {Array.from(groupedByDay.entries()).map(([day, items]) => (
            <div key={day} className="space-y-1">
              <h4 className="text-xs font-medium text-muted-foreground sticky top-0 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70 py-1">
                {format(new Date(day), 'eeee, d MMMM yyyy', { locale: ar })}
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
                {q.isFetchingNextPage ? 'جاري التحميل...' : 'تحميل المزيد'}
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Hint about filter labels for testers — only when there are NO activities at all */}
      {q.data?.pages?.[0]?.activities.length === 0 && (
        <p className="text-[10px] text-muted-foreground/60 text-center pt-2">
          الأنشطة المدعومة: {LEAD_ACTIVITY_TYPES.map((t) => LEAD_ACTIVITY_LABELS_AR[t]).join(' · ')}
        </p>
      )}
    </div>
  );
}
