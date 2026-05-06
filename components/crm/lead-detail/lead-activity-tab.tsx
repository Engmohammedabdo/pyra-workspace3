'use client';

import { ActivityTimeline } from '@/components/crm/activity/activity-timeline';

export function LeadActivityTab({ leadId }: { leadId: string }) {
  return <ActivityTimeline leadId={leadId} />;
}
