'use client';

import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { useMyWork } from '@/hooks/useMyWork';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CheckSquare,
  ClipboardCheck,
  MessageSquare,
  Users,
  Phone,
  Calendar,
  Receipt,
  Clock,
  ArrowLeft,
  AlertTriangle,
  Inbox,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { formatRelativeDate, dubaiDayKey } from '@/lib/utils/format';
import { useStatusLabels } from '@/lib/i18n/status-labels';

interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count: number;
  href?: string;
  gradient: string;
  urgent?: boolean;
}

function SectionHeader({ icon: Icon, title, count, href, gradient, urgent }: SectionHeaderProps) {
  const t = useTranslations('mywork.inbox');
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-border/40">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            'w-9 h-9 rounded-xl bg-gradient-to-br flex items-center justify-center shadow-md',
            gradient
          )}
        >
          <Icon className="h-4 w-4 text-white" />
        </div>
        <h2 className="font-bold text-sm">{title}</h2>
        {count > 0 && (
          <Badge
            variant={urgent ? 'destructive' : 'secondary'}
            className="text-[11px] px-2 py-0 rounded-full"
          >
            {count}
          </Badge>
        )}
      </div>
      {href && count > 0 && (
        <Link
          href={href}
          className="text-xs text-orange-600 hover:text-orange-700 dark:text-orange-400 flex items-center gap-1 font-medium"
        >
          {t('viewAll')} <ArrowLeft className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}

function InboxRow({
  icon: Icon,
  iconClass,
  href,
  title,
  subtitle,
  meta,
  urgent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  iconClass?: string;
  href: string;
  title: string;
  subtitle?: string | null;
  meta?: string | null;
  urgent?: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-card/50 p-3 transition-colors hover:border-orange-300 hover:bg-orange-50/30 dark:hover:bg-orange-950/10 dark:hover:border-orange-700',
        urgent
          ? 'border-red-300/60 bg-red-50/40 dark:border-red-800/40 dark:bg-red-950/15'
          : 'border-border/30'
      )}
    >
      <div
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
          iconClass || 'bg-muted'
        )}
      >
        <Icon className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{title}</p>
        {subtitle && (
          <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>
        )}
      </div>
      {meta && (
        <span
          className={cn(
            'text-xs shrink-0 font-medium',
            urgent ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'
          )}
        >
          {meta}
        </span>
      )}
    </Link>
  );
}

function formatDueDate(
  dueDate: string | null,
  // Scoped to the 'mywork.inbox' namespace (the only caller's `t`) rather
  // than the unscoped `ReturnType<typeof useTranslations>` — the unscoped
  // form forces TS to resolve a translator type across the ENTIRE global
  // Messages tree, which tips into "type instantiation is excessively deep"
  // once enough namespaces/keys accumulate (surfaced by Phase 2 Task 4
  // filling in the calendar catalog).
  t: ReturnType<typeof useTranslations<'mywork.inbox'>>,
): { label: string; urgent: boolean } {
  if (!dueDate) return { label: '', urgent: false };
  // dubaiDayKey() — Dubai-day comparison, NOT the UTC day (Phase 15.1 lock).
  const today = dubaiDayKey();
  if (dueDate < today) {
    const daysAgo = Math.floor(
      (Date.now() - new Date(dueDate).getTime()) / (1000 * 60 * 60 * 24)
    );
    return { label: t('dueDate.overdueDays', { count: daysAgo }), urgent: true };
  }
  if (dueDate === today) return { label: t('dueDate.today'), urgent: true };
  const days = Math.ceil(
    (new Date(dueDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );
  return { label: t('dueDate.inDays', { count: days }), urgent: false };
}

export function MyWorkInbox() {
  const { data, isLoading } = useMyWork();
  const t = useTranslations('mywork.inbox');
  const locale = useLocale();
  const leaveTypeLabel = useStatusLabels('leaveType');

  if (isLoading) {
    return (
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-2xl" />
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    );
  }

  if (!data) {
    return (
      <Card className="overflow-hidden">
        <EmptyState
          icon={Inbox}
          title={t('error.title')}
          description={t('error.description')}
        />
      </Card>
    );
  }

  const tasksAll = [...data.tasks.overdue, ...data.tasks.today, ...data.tasks.this_week];
  const totalAll =
    data.counts.tasks_total +
    data.counts.approvals_total +
    data.counts.conversations_unread +
    data.counts.leads_action +
    data.counts.follow_ups_due;

  if (totalAll === 0) {
    return (
      <Card className="overflow-hidden">
        <EmptyState
          icon={CheckSquare}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      </Card>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* TASKS — left column, full height */}
      {data.counts.tasks_total > 0 && (
        <Card className="overflow-hidden">
          <SectionHeader
            icon={CheckSquare}
            title={t('sections.tasks.title')}
            count={data.counts.tasks_total}
            href="/dashboard/my-tasks"
            gradient={
              data.tasks.overdue.length > 0
                ? 'from-red-500 to-rose-600'
                : 'from-emerald-500 to-teal-600'
            }
            urgent={data.tasks.overdue.length > 0}
          />
          <div className="p-3 space-y-2">
            {tasksAll.slice(0, 6).map((task) => {
              const due = formatDueDate(task.due_date, t);
              return (
                <InboxRow
                  key={task.id}
                  icon={due.urgent ? AlertTriangle : CheckSquare}
                  iconClass={
                    due.urgent
                      ? 'bg-gradient-to-br from-red-500 to-rose-600'
                      : 'bg-gradient-to-br from-emerald-500 to-teal-600'
                  }
                  href={`/dashboard/boards/${task.board_id}?task=${task.id}`}
                  title={task.title}
                  subtitle={`${task.board_name} • ${task.column_name}`}
                  meta={due.label || null}
                  urgent={due.urgent}
                />
              );
            })}
          </div>
        </Card>
      )}

      {/* APPROVALS — right column */}
      {data.approvals_waiting.total > 0 && (
        <Card className="overflow-hidden">
          <SectionHeader
            icon={ClipboardCheck}
            title={t('sections.approvals.title')}
            count={data.approvals_waiting.total}
            href="/dashboard/approvals"
            gradient="from-orange-500 to-amber-600"
            urgent
          />
          <div className="p-3 space-y-2">
            {data.approvals_waiting.leave.slice(0, 3).map((l) => (
              <InboxRow
                key={l.id}
                icon={Calendar}
                iconClass="bg-gradient-to-br from-blue-500 to-indigo-600"
                href="/dashboard/approvals"
                title={t('sections.approvals.leaveTitle', {
                  // Server-resolved name_ar first (T3 lock: DB name_ar →
                  // accessor → raw); the accessor covers legacy rows only.
                  type: l.type_name || leaveTypeLabel(l.type),
                  name: l.display_name,
                })}
                subtitle={t('sections.approvals.leaveSubtitle', {
                  days: l.days_count,
                  startDate: l.start_date,
                })}
                meta={t('sections.approvals.reviewMeta')}
              />
            ))}
            {data.approvals_waiting.expense.slice(0, 3).map((e) => (
              <InboxRow
                key={e.id}
                icon={Receipt}
                iconClass="bg-gradient-to-br from-violet-500 to-purple-600"
                href="/dashboard/approvals"
                title={t('sections.approvals.expenseTitle', {
                  currency: e.currency,
                  amount: e.amount,
                })}
                subtitle={
                  e.description ||
                  e.vendor ||
                  t('sections.approvals.expenseSubtitleFrom', { name: e.submitted_by })
                }
                meta={t('sections.approvals.reviewMeta')}
              />
            ))}
            {data.approvals_waiting.timesheet.slice(0, 2).map((ts) => (
              <InboxRow
                key={ts.id}
                icon={Clock}
                iconClass="bg-gradient-to-br from-cyan-500 to-blue-600"
                href="/dashboard/approvals"
                title={t('sections.approvals.timesheetTitle', { name: ts.display_name })}
                subtitle={t('sections.approvals.timesheetSubtitle', {
                  startDate: ts.period_start,
                  endDate: ts.period_end,
                  hours: ts.total_hours ?? 0,
                })}
                meta={t('sections.approvals.reviewMeta')}
              />
            ))}
          </div>
        </Card>
      )}

      {/* CONVERSATIONS */}
      {data.counts.conversations_unread > 0 && (
        <Card className="overflow-hidden">
          <SectionHeader
            icon={MessageSquare}
            title={t('sections.conversations.title')}
            count={data.counts.conversations_unread}
            href="/dashboard/sales/chat"
            gradient="from-green-500 to-emerald-600"
          />
          <div className="p-3 space-y-2">
            {data.conversations.unread.slice(0, 5).map((c) => (
              <InboxRow
                key={c.id}
                icon={MessageSquare}
                iconClass="bg-gradient-to-br from-green-500 to-emerald-600"
                href={`/dashboard/sales/chat?conversation=${c.id}`}
                title={c.contact_name || c.contact_phone}
                subtitle={c.contact_phone}
                meta={c.last_message_at ? formatRelativeDate(c.last_message_at, locale) : null}
              />
            ))}
          </div>
        </Card>
      )}

      {/* LEADS */}
      {data.counts.leads_action > 0 && (
        <Card className="overflow-hidden">
          <SectionHeader
            icon={Users}
            title={t('sections.leads.title')}
            count={data.counts.leads_action}
            href="/dashboard/crm/pipeline"
            gradient="from-indigo-500 to-blue-600"
          />
          <div className="p-3 space-y-2">
            {data.leads.needs_action.slice(0, 5).map((l) => (
              <InboxRow
                key={l.id}
                icon={Users}
                iconClass="bg-gradient-to-br from-indigo-500 to-blue-600"
                href={`/dashboard/crm/leads/${l.id}`}
                title={l.name}
                subtitle={l.phone || ''}
                meta={
                  l.last_contact_at
                    ? t('sections.leads.lastContact', {
                        relative: formatRelativeDate(l.last_contact_at, locale),
                      })
                    : t('sections.leads.noContact')
                }
              />
            ))}
          </div>
        </Card>
      )}

      {/* FOLLOW-UPS */}
      {data.counts.follow_ups_due > 0 && (
        <Card className="overflow-hidden">
          <SectionHeader
            icon={Phone}
            title={t('sections.followUps.title')}
            count={data.counts.follow_ups_due}
            href="/dashboard/crm/follow-ups"
            gradient="from-pink-500 to-rose-600"
            urgent
          />
          <div className="p-3 space-y-2">
            {data.follow_ups.due.slice(0, 5).map((f) => (
              <InboxRow
                key={f.id}
                icon={Phone}
                iconClass="bg-gradient-to-br from-pink-500 to-rose-600"
                href={
                  f.lead_id
                    ? `/dashboard/crm/leads/${f.lead_id}`
                    : '/dashboard/crm/follow-ups'
                }
                title={f.title}
                subtitle={f.lead_name || ''}
                meta={formatRelativeDate(f.due_at, locale)}
                urgent
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
