'use client';

/**
 * Notes tab — slice of the activity timeline filtered to type='note'.
 *
 * For Phase 5 we use the existing useLeadActivities infinite query with the
 * single `type` filter, since `note` is one canonical type.
 * Phase 6 will add the composer; for now we link back to the Activity tab.
 */

import { useLeadActivities } from '@/hooks/useLeadActivities';
import { ActivityItem } from '@/components/crm/activity/activity-item';
import { ActivityComposer } from '@/components/crm/activity/activity-composer';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Loader2, StickyNote } from 'lucide-react';

export function LeadNotesTab({ leadId }: { leadId: string }) {
  const q = useLeadActivities(leadId, { type: 'note' });
  const notes = q.data?.pages.flatMap((p) => p.activities) ?? [];

  return (
    <div className="space-y-3">
      <ActivityComposer leadId={leadId} mode="note" />

      {q.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-12 w-full" />
          <Skeleton className="h-12 w-full" />
        </div>
      ) : notes.length === 0 ? (
        <EmptyState
          icon={StickyNote}
          title="لا توجد ملاحظات بعد"
          description="اكتب أول ملاحظة في المُحرّر بالأعلى لتظهر هنا"
        />
      ) : (
        <>
          <ul className="space-y-1 -m-1">
            {notes.map((a) => (
              <ActivityItem key={a.id} activity={a} />
            ))}
          </ul>
          {q.hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="outline"
                size="sm"
                onClick={() => q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
                className="gap-1.5"
              >
                {q.isFetchingNextPage ? <Loader2 className="size-3.5 animate-spin" /> : null}
                تحميل المزيد
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
