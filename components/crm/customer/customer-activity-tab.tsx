'use client';

/**
 * Activity tab — thin wrapper over the existing <ActivityTimeline> from
 * the lead-detail page. Per PRD §04 line 219: "Reuses lead's
 * activity-timeline" — the component already takes `leadId` as a prop
 * and renders the full pyra_lead_activities feed plus the composer
 * (add note / log call / schedule meeting).
 */

import { ActivityTimeline } from '@/components/crm/activity/activity-timeline';

interface Props {
  leadId: string;
}

export function CustomerActivityTab({ leadId }: Props) {
  return (
    <div className="-mt-2">
      {/* Negative margin pulls the timeline tighter to the tabs row —
          ActivityTimeline owns its own padding. */}
      <ActivityTimeline leadId={leadId} showComposer />
    </div>
  );
}
