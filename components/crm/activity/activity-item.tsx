'use client';

/**
 * Single timeline entry. Renders differently based on activity_type.
 *
 * The canonical types live in lib/constants/statuses.ts (LEAD_ACTIVITY_TYPES).
 * Each type has:
 *   - icon
 *   - tone (color background + text)
 *   - render() that picks content from `description` + `metadata`
 *
 * Falls through to a neutral default for unknown types so legacy rows
 * (note, call, message, conversion, etc.) still render sensibly.
 */

import { useLocale, useTranslations } from 'next-intl';
import { cn } from '@/lib/utils/cn';
import {
  StickyNote, Phone, PhoneIncoming, PhoneOutgoing, CalendarClock,
  MessageCircle, Mail, Paperclip,
  Pencil, UserCog, AlertTriangle, CheckCircle2, XCircle, Hourglass,
  PlusCircle, Activity as ActivityIcon, ArrowRightCircle, BellRing,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import {
  type LeadActivityTypeNew,
  type PipelineStageId,
} from '@/lib/constants/statuses';
import type { Locale } from '@/lib/i18n/config';
import type { LeadActivity } from '@/hooks/useLeadActivities';

type IconType = React.ComponentType<{ className?: string }>;

interface VariantSpec {
  icon: IconType;
  tone: string;
}

// Icons + tones only — labels are resolved in-component via
// useStatusLabels('leadActivity') (Phase 3.4 restructure, same pattern as the
// P2 taskPriority accessor swap: module-level maps can't call hooks, so the
// translatable part moves inside the component).
const VARIANTS: Partial<Record<LeadActivityTypeNew, VariantSpec>> = {
  lead_created:        { icon: PlusCircle,    tone: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  stage_change:        { icon: ArrowRightCircle, tone: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400' },
  note:                { icon: StickyNote,    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
  call_logged:         { icon: Phone,         tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300' },
  meeting_scheduled:   { icon: CalendarClock, tone: 'bg-purple-500/10 text-purple-700 dark:text-purple-300' },
  whatsapp_inbound:    { icon: MessageCircle, tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  whatsapp_outbound:   { icon: MessageCircle, tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  email_sent:          { icon: Mail,          tone: 'bg-blue-500/10 text-blue-700 dark:text-blue-300' },
  file_attached:       { icon: Paperclip,     tone: 'bg-stone-500/10 text-stone-700 dark:text-stone-300' },
  field_updated:       { icon: Pencil,        tone: 'bg-muted text-muted-foreground' },
  assignment_changed:  { icon: UserCog,       tone: 'bg-muted text-muted-foreground' },
  closed_won_pending:  { icon: Hourglass,     tone: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300' },
  closed_won_approved: { icon: CheckCircle2,  tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  closed_won_rejected: { icon: XCircle,       tone: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  follow_up_created:   { icon: BellRing,      tone: 'bg-orange-500/10 text-orange-600 dark:text-orange-400' },
  follow_up_completed: { icon: CheckCircle2,  tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' },
  follow_up_overdue:   { icon: AlertTriangle, tone: 'bg-red-500/10 text-red-700 dark:text-red-300' },
  idle_warning:        { icon: AlertTriangle, tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300' },
};

const FALLBACK: VariantSpec = {
  icon: ActivityIcon,
  tone: 'bg-muted text-muted-foreground',
};

interface ActivityItemProps {
  activity: LeadActivity;
}

function metadataString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
}

/**
 * Call duration as m:ss from metadata. Auto-synced calls (device sync) carry
 * duration_seconds; older composer entries carry duration_minutes only.
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

export function ActivityItem({ activity }: ActivityItemProps) {
  const t = useTranslations('crm.activity');
  const locale = useLocale() as Locale;
  const statusLabelForActivity = useStatusLabels('leadActivity');
  const stageLabelFor = useStatusLabels('pipelineStage');
  const variant = VARIANTS[activity.activity_type as LeadActivityTypeNew] ?? FALLBACK;
  // Calls get a direction-aware icon (metadata.direction: 'inbound' | 'outbound')
  const callDirection = activity.activity_type === 'call_logged'
    ? metadataString(activity.metadata, 'direction')
    : null;
  const Icon = callDirection === 'inbound'
    ? PhoneIncoming
    : callDirection === 'outbound'
      ? PhoneOutgoing
      : variant.icon;
  const actor = activity.created_by_display_name ?? activity.created_by ?? t('fallbackActor');
  const defaultLabel = activity.activity_type
    ? statusLabelForActivity(activity.activity_type)
    : t('fallbackLabel');

  // Derive a one-line title that's specific to the type when possible.
  const title = (() => {
    switch (activity.activity_type) {
      case 'stage_change': {
        const from = metadataString(activity.metadata, 'from_stage');
        const to = metadataString(activity.metadata, 'to_stage');
        const fromLabel = from ? stageLabelFor(from as PipelineStageId) : null;
        const toLabel = to ? stageLabelFor(to as PipelineStageId) : null;
        if (fromLabel && toLabel) return t('titles.stageChangeFromTo', { from: fromLabel, to: toLabel });
        if (toLabel) return t('titles.stageChangeToOnly', { to: toLabel });
        return defaultLabel;
      }
      case 'field_updated': {
        const field = metadataString(activity.metadata, 'field');
        if (!field) return defaultLabel;
        const fieldLabel = t.has(`fields.${field}` as Parameters<typeof t>[0])
          ? t(`fields.${field}` as Parameters<typeof t>[0])
          : field;
        return t('titles.fieldUpdated', { field: fieldLabel });
      }
      case 'assignment_changed': {
        const to = metadataString(activity.metadata, 'to_user');
        return to ? t('titles.assignmentChanged', { to }) : defaultLabel;
      }
      case 'closed_won_rejected': {
        const reason = metadataString(activity.metadata, 'reason');
        return reason ? t('titles.closedWonRejected', { reason }) : defaultLabel;
      }
      case 'call_logged': {
        const duration = callDuration(activity.metadata);
        if (callDirection === 'inbound') {
          return duration ? t('titles.callInbound', { duration }) : t('titles.callInboundNoDuration');
        }
        if (callDirection === 'outbound') {
          return duration ? t('titles.callOutbound', { duration }) : t('titles.callOutboundNoDuration');
        }
        // legacy rows without direction metadata
        return duration ? t('titles.callWithDuration', { duration }) : defaultLabel;
      }
      default:
        return defaultLabel;
    }
  })();

  return (
    // Phase 15.1 Commit 1 — `data-activity-id` is the DOM hook used by
    // ActivityTimeline's highlight effect (querySelector + scrollIntoView +
    // flash-ring class). Stable id; never changes between renders.
    <li
      data-activity-id={activity.id}
      className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors"
    >
      <span
        className={cn(
          'shrink-0 size-8 rounded-full flex items-center justify-center mt-0.5',
          variant.tone,
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-5 font-medium">{title}</p>

        {activity.description && (
          <p className="text-sm text-muted-foreground leading-5 mt-0.5 whitespace-pre-wrap break-words">
            {activity.description}
          </p>
        )}

        <p className="text-xs text-muted-foreground mt-1">
          {actor} · {formatRelativeDate(activity.created_at, locale)}
        </p>
      </div>
    </li>
  );
}
