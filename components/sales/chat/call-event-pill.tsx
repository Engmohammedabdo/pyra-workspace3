'use client';

// Inline call-event pill (CR-T6) — renders a lead's call_logged/call_attempt
// activity as a centered system pill inside the message thread, exactly like
// a WhatsApp date separator. Pure presentational: message-list.tsx supplies
// the already-filtered activity row via mergeThread (lib/whatsapp/inbox.ts).
//
// i18n-exempt: components/sales/chat/** is Phase 6e (not yet migrated) —
// Arabic literals match the rest of this surface.

import type { LeadActivity } from '@/hooks/useLeadActivities';

function metadataString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
}

/**
 * Call duration as m:ss from metadata — mirrors the callDuration helper in
 * components/crm/activity/activity-item.tsx (kept local per the brief: no
 * cross-import of a CRM-timeline component into the chat surface).
 */
function callDuration(meta: unknown): string | null {
  const secsRaw = metadataString(meta, 'duration_seconds');
  const minsRaw = metadataString(meta, 'duration_minutes');
  const secs = secsRaw !== null
    ? Math.round(Number(secsRaw))
    : minsRaw !== null
      ? Math.round(Number(minsRaw) * 60)
      : null;
  if (secs === null || !Number.isFinite(secs) || secs < 0) return null;
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
}

const DIRECTION_SUFFIX: Record<string, string> = {
  inbound: ' (واردة)',
  outbound: ' (صادرة)',
};

interface CallEventPillProps {
  activity: LeadActivity;
}

export function CallEventPill({ activity }: CallEventPillProps) {
  const isAttempt = activity.activity_type === 'call_attempt';
  const agentName = activity.created_by_display_name || activity.created_by || null;
  const duration = callDuration(activity.metadata);
  const direction = metadataString(activity.metadata, 'direction');
  const directionSuffix = !isAttempt && direction ? DIRECTION_SUFFIX[direction] ?? '' : '';

  const label = isAttempt
    ? '☎ محاولة اتصال — لم يرد'
    : `📞 مكالمة${duration ? ` ${duration}` : ''}${agentName ? ` — ${agentName}` : ''}${directionSuffix}`;

  return (
    <div className="flex justify-center px-4 py-1">
      <span
        className={
          isAttempt
            ? 'rounded-full bg-rose-500/10 px-3 py-1 text-[11.5px] font-medium text-rose-700 dark:text-rose-300'
            : 'rounded-full bg-emerald-500/10 px-3 py-1 text-[11.5px] font-medium text-emerald-700 dark:text-emerald-300'
        }
      >
        {label}
      </span>
    </div>
  );
}
