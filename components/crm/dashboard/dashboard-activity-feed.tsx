'use client';

/**
 * Recent CRM activity feed — top 8 of the latest 20 events from
 * `pyra_lead_activities`, scoped to leads the user can see.
 *
 * Per CRM Phase 8 spec (Cluster 3) and PRD §03 line 554:
 *   "Activity feed (top 20 events). Scope: scoped to own leads' activities
 *    if not admin."
 *
 * Each row: type-specific icon + lead name (linked) + localized activity
 * label + actor + relative time. Activity-type labels come from
 * `useStatusLabels('leadActivity')` (statuses.leadActivity catalog entity)
 * so the dashboard reads identical to the lead-detail timeline.
 *
 * Visible items capped at 8 to keep the dashboard scannable. The hook
 * fetches 20 by default; remaining 12 are simply not rendered (no "view
 * all" link in v1 — there's no dedicated activity page yet).
 */

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { useCRMRecentActivity, type CRMRecentActivity } from '@/hooks/useCRMDashboard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  Activity,
  Plus,
  GitBranch,
  StickyNote,
  Phone,
  Calendar,
  MessageCircle,
  Mail,
  Paperclip,
  Edit3,
  UserCheck,
  Trophy,
  XCircle,
  CalendarCheck,
  Clock,
  AlertTriangle,
} from 'lucide-react';
import { formatRelativeDate } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';
import type { LeadActivityTypeNew } from '@/lib/constants/statuses';
import type { Locale } from '@/lib/i18n/config';
import { cn } from '@/lib/utils/cn';

const VISIBLE_LIMIT = 8;

const ACTIVITY_ICON: Record<LeadActivityTypeNew, React.ComponentType<{ className?: string }>> = {
  lead_created:        Plus,
  stage_change:        GitBranch,
  note:                StickyNote,
  call_logged:         Phone,
  meeting_scheduled:   Calendar,
  whatsapp_inbound:    MessageCircle,
  whatsapp_outbound:   MessageCircle,
  email_sent:          Mail,
  file_attached:       Paperclip,
  field_updated:       Edit3,
  assignment_changed:  UserCheck,
  closed_won_pending:  Clock,
  closed_won_approved: Trophy,
  closed_won_rejected: XCircle,
  follow_up_created:   CalendarCheck,
  follow_up_completed: CalendarCheck,
  follow_up_overdue:   AlertTriangle,
  idle_warning:        AlertTriangle,
};

const ACTIVITY_TONE: Partial<Record<LeadActivityTypeNew, string>> = {
  lead_created:        'text-sky-600 dark:text-sky-400 bg-sky-500/10',
  stage_change:        'text-orange-600 dark:text-orange-400 bg-orange-500/10',
  note:                'text-muted-foreground bg-muted',
  call_logged:         'text-indigo-600 dark:text-indigo-400 bg-indigo-500/10',
  whatsapp_inbound:    'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  whatsapp_outbound:   'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  closed_won_approved: 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10',
  closed_won_rejected: 'text-red-600 dark:text-red-400 bg-red-500/10',
  closed_won_pending:  'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  idle_warning:        'text-amber-600 dark:text-amber-400 bg-amber-500/10',
  follow_up_overdue:   'text-red-600 dark:text-red-400 bg-red-500/10',
};
const ACTIVITY_TONE_DEFAULT = 'text-muted-foreground bg-muted';

export function DashboardActivityFeed() {
  const t = useTranslations('crm.dashboard.activityFeed');
  const { data, isLoading } = useCRMRecentActivity(20);

  if (isLoading) {
    return (
      <Card className="p-5 space-y-3">
        <Skeleton className="h-5 w-32" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-start gap-3">
              <Skeleton className="size-8 rounded-lg shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const activities = data?.activities ?? [];
  if (activities.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-base font-semibold mb-2 flex items-center gap-2">
          <Activity className="size-4 text-muted-foreground" />
          {t('heading')}
        </h2>
        <EmptyState
          icon={Activity}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      </Card>
    );
  }

  const visible = activities.slice(0, VISIBLE_LIMIT);

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
        <Activity className="size-4 text-muted-foreground" />
        {t('heading')}
      </h2>
      <ul className="space-y-3">
        {visible.map((act) => (
          <ActivityRow key={act.id} activity={act} />
        ))}
      </ul>
    </Card>
  );
}

function ActivityRow({ activity }: { activity: CRMRecentActivity }) {
  const t = useTranslations('crm.dashboard.activityFeed');
  const locale = useLocale() as Locale;
  const activityLabel = useStatusLabels('leadActivity');
  const type = activity.activity_type as LeadActivityTypeNew;
  const Icon = ACTIVITY_ICON[type] ?? Activity;
  const tone = ACTIVITY_TONE[type] ?? ACTIVITY_TONE_DEFAULT;
  const label = activityLabel(activity.activity_type);
  const actor = activity.created_by_display_name ?? activity.created_by ?? t('actorFallback');
  const relativeTime = formatRelativeDate(activity.created_at, locale);
  const leadFallback = t('leadFallback');

  // Lead name + link, falling back to a non-link span when lead_id is null
  // (system-emitted activities like idle_warning may detach over time).
  const leadEl = activity.lead_id ? (
    <Link
      href={`/dashboard/crm/leads/${activity.lead_id}`}
      className="font-medium hover:text-orange-600 dark:hover:text-orange-400 transition-colors"
    >
      {activity.lead_name ?? leadFallback}
    </Link>
  ) : (
    <span className="font-medium">{activity.lead_name ?? leadFallback}</span>
  );

  return (
    <li className="flex items-start gap-3">
      <div className={cn('size-8 rounded-lg flex items-center justify-center shrink-0', tone)}>
        <Icon className="size-4" aria-hidden />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm leading-snug truncate">
          {leadEl} <span className="text-muted-foreground">— {label}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">
          {actor} · <span className="tabular-nums">{relativeTime}</span>
        </div>
      </div>
    </li>
  );
}
