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

import { cn } from '@/lib/utils/cn';
import {
  StickyNote, Phone, CalendarClock, MessageCircle, Mail, Paperclip,
  Pencil, UserCog, AlertTriangle, CheckCircle2, XCircle, Hourglass,
  PlusCircle, Activity as ActivityIcon, ArrowRightCircle, BellRing,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import {
  LEAD_ACTIVITY_LABELS_AR,
  PIPELINE_STAGE_LABELS_AR,
  type LeadActivityTypeNew,
  type PipelineStageId,
} from '@/lib/constants/statuses';
import type { LeadActivity } from '@/hooks/useLeadActivities';

type IconType = React.ComponentType<{ className?: string }>;

interface VariantSpec {
  icon: IconType;
  tone: string;
  defaultLabel: string;
}

const VARIANTS: Partial<Record<LeadActivityTypeNew, VariantSpec>> = {
  lead_created:        { icon: PlusCircle,    tone: 'bg-orange-500/10 text-orange-600 dark:text-orange-400',   defaultLabel: LEAD_ACTIVITY_LABELS_AR.lead_created },
  stage_change:        { icon: ArrowRightCircle, tone: 'bg-indigo-500/10 text-indigo-600 dark:text-indigo-400', defaultLabel: LEAD_ACTIVITY_LABELS_AR.stage_change },
  note:                { icon: StickyNote,    tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',     defaultLabel: LEAD_ACTIVITY_LABELS_AR.note },
  call_logged:         { icon: Phone,         tone: 'bg-sky-500/10 text-sky-700 dark:text-sky-300',           defaultLabel: LEAD_ACTIVITY_LABELS_AR.call_logged },
  meeting_scheduled:   { icon: CalendarClock, tone: 'bg-purple-500/10 text-purple-700 dark:text-purple-300',  defaultLabel: LEAD_ACTIVITY_LABELS_AR.meeting_scheduled },
  whatsapp_inbound:    { icon: MessageCircle, tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', defaultLabel: LEAD_ACTIVITY_LABELS_AR.whatsapp_inbound },
  whatsapp_outbound:   { icon: MessageCircle, tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', defaultLabel: LEAD_ACTIVITY_LABELS_AR.whatsapp_outbound },
  email_sent:          { icon: Mail,          tone: 'bg-blue-500/10 text-blue-700 dark:text-blue-300',         defaultLabel: LEAD_ACTIVITY_LABELS_AR.email_sent },
  file_attached:       { icon: Paperclip,     tone: 'bg-stone-500/10 text-stone-700 dark:text-stone-300',     defaultLabel: LEAD_ACTIVITY_LABELS_AR.file_attached },
  field_updated:       { icon: Pencil,        tone: 'bg-muted text-muted-foreground',                          defaultLabel: LEAD_ACTIVITY_LABELS_AR.field_updated },
  assignment_changed:  { icon: UserCog,       tone: 'bg-muted text-muted-foreground',                          defaultLabel: LEAD_ACTIVITY_LABELS_AR.assignment_changed },
  closed_won_pending:  { icon: Hourglass,     tone: 'bg-yellow-500/15 text-yellow-700 dark:text-yellow-300',  defaultLabel: LEAD_ACTIVITY_LABELS_AR.closed_won_pending },
  closed_won_approved: { icon: CheckCircle2,  tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', defaultLabel: LEAD_ACTIVITY_LABELS_AR.closed_won_approved },
  closed_won_rejected: { icon: XCircle,       tone: 'bg-red-500/10 text-red-700 dark:text-red-300',           defaultLabel: LEAD_ACTIVITY_LABELS_AR.closed_won_rejected },
  follow_up_created:   { icon: BellRing,      tone: 'bg-orange-500/10 text-orange-600 dark:text-orange-400', defaultLabel: LEAD_ACTIVITY_LABELS_AR.follow_up_created },
  follow_up_completed: { icon: CheckCircle2,  tone: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', defaultLabel: LEAD_ACTIVITY_LABELS_AR.follow_up_completed },
  follow_up_overdue:   { icon: AlertTriangle, tone: 'bg-red-500/10 text-red-700 dark:text-red-300',           defaultLabel: LEAD_ACTIVITY_LABELS_AR.follow_up_overdue },
  idle_warning:        { icon: AlertTriangle, tone: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',     defaultLabel: LEAD_ACTIVITY_LABELS_AR.idle_warning },
};

const FALLBACK: VariantSpec = {
  icon: ActivityIcon,
  tone: 'bg-muted text-muted-foreground',
  defaultLabel: 'نشاط',
};

interface ActivityItemProps {
  activity: LeadActivity;
}

function metadataString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === 'string' || typeof v === 'number' ? String(v) : null;
}

export function ActivityItem({ activity }: ActivityItemProps) {
  const variant = VARIANTS[activity.activity_type as LeadActivityTypeNew] ?? FALLBACK;
  const Icon = variant.icon;
  const actor = activity.created_by_display_name ?? activity.created_by ?? 'النظام';

  // Derive a one-line title that's specific to the type when possible.
  const title = (() => {
    switch (activity.activity_type) {
      case 'stage_change': {
        const from = metadataString(activity.metadata, 'from_stage');
        const to = metadataString(activity.metadata, 'to_stage');
        const fromLabel = from ? PIPELINE_STAGE_LABELS_AR[from as PipelineStageId] ?? from : null;
        const toLabel = to ? PIPELINE_STAGE_LABELS_AR[to as PipelineStageId] ?? to : null;
        if (fromLabel && toLabel) return `انتقلت المرحلة من "${fromLabel}" إلى "${toLabel}"`;
        if (toLabel) return `انتقلت المرحلة إلى "${toLabel}"`;
        return variant.defaultLabel;
      }
      case 'field_updated': {
        const field = metadataString(activity.metadata, 'field');
        return field ? `تم تحديث: ${field}` : variant.defaultLabel;
      }
      case 'assignment_changed': {
        const to = metadataString(activity.metadata, 'to_user');
        return to ? `تم تعيين الـ Lead لـ ${to}` : variant.defaultLabel;
      }
      case 'closed_won_rejected': {
        const reason = metadataString(activity.metadata, 'reason');
        return reason ? `تم رفض إغلاق الصفقة — ${reason}` : variant.defaultLabel;
      }
      default:
        return variant.defaultLabel;
    }
  })();

  return (
    <li className="flex items-start gap-3 p-2 rounded-lg hover:bg-muted/40 transition-colors">
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
          {actor} · {formatRelativeDate(activity.created_at)}
        </p>
      </div>
    </li>
  );
}
