'use client';

import { ActivityTimeline } from '@/components/crm/activity/activity-timeline';

/**
 * Lead Activity tab wrapper.
 *
 * Phase 15.1 Commit 1 — accepts an optional `highlightId` (sourced from
 * the `?highlight=<activity_id>` query param in mention notifications)
 * and threads it down to ActivityTimeline. The scroll-into-view + flash
 * effect lives INSIDE ActivityTimeline because that component owns the
 * data-loading state via `useLeadActivities` — `useEffect` needs to
 * wait until after the first page has rendered before the DOM lookup
 * via `data-activity-id` can succeed.
 */
export function LeadActivityTab({
  leadId,
  highlightId,
}: {
  leadId: string;
  /** Activity ID to scroll-into-view + flash on mount. Sourced from `?highlight=` query param. */
  highlightId?: string | null;
}) {
  return <ActivityTimeline leadId={leadId} highlightId={highlightId} />;
}
