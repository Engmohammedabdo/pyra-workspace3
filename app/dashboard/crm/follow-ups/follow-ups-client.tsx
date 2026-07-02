'use client';

/**
 * /dashboard/crm/follow-ups — list view (Phase 6 follow-up).
 *
 * Driven by useFollowUps. Default filter = pending. Filter chips switch
 * between pending / completed / all. Each row shows the lead it belongs
 * to (linked), title, due_at relative time, optional notes, and a
 * "تمّت المتابعة" button on pending rows that calls useCompleteFollowUp.
 *
 * Optimistic update on complete uses the same cancelQueries / snapshot /
 * setQueriesData / rollback pattern as the sidebar mark-complete button
 * (commit 85afea1) so the row vanishes immediately and rolls back on
 * server error.
 */

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import {
  CalendarClock, BellRing, Phone, MessageCircle, Check, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { useFollowUps, useCompleteFollowUp, type FollowUp, type FollowUpsResponse } from '@/hooks/useFollowUps';
import { formatRelativeDate, formatDate } from '@/lib/utils/format';
import { FOLLOW_UP_STATUS_LABELS, type FollowUpStatus } from '@/lib/constants/statuses';

type FilterKey = 'pending' | 'overdue' | 'completed' | 'all';

const FILTERS: Array<{ key: FilterKey; label: string }> = [
  { key: 'pending',   label: 'قيد الانتظار' },
  { key: 'overdue',   label: 'متأخرة' },
  { key: 'completed', label: 'مكتملة' },
  { key: 'all',       label: 'الكل' },
];

export function FollowUpsClient() {
  const [filter, setFilter] = useState<FilterKey>('pending');

  const queryParams = useMemo(() => {
    const p: Record<string, string | undefined> = { limit: '200' };
    if (filter !== 'all') p.status = filter;
    return p;
  }, [filter]);

  const { data, isLoading } = useFollowUps(queryParams);
  const followUps = data?.follow_ups ?? [];

  return (
    <div className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BellRing className="size-6 text-orange-500" /> المتابعات
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            متابعات الـ Leads المسندة إليك. اضغط "تمّت" بعد إتمام المتابعة لتسجيلها في تايم لاين الـ Lead.
          </p>
        </div>
      </header>

      {/* Filter chips */}
      <div className="flex flex-wrap gap-1.5">
        {FILTERS.map((f) => {
          const isActive = f.key === filter;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors',
                isActive
                  ? 'bg-foreground text-background border-foreground'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
              )}
            >
              {f.label}
              {isActive && data?.total !== undefined && (
                <span className="ms-1.5 rounded-full bg-background/20 px-1.5 text-[10px] tabular-nums">
                  {data.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : followUps.length === 0 ? (
        <EmptyState
          icon={BellRing}
          title={
            filter === 'pending'
              ? 'لا توجد متابعات قيد الانتظار'
              : filter === 'completed'
                ? 'لا توجد متابعات مكتملة بعد'
                : 'لا توجد متابعات'
          }
          description={
            filter === 'pending'
              ? 'تقدر تجدول متابعة من زر "متابعة" في صفحة أي Lead.'
              : 'استخدم الفلاتر بالأعلى للتنقل بين الحالات.'
          }
        />
      ) : (
        <ul className="space-y-2">
          {followUps.map((fu) => (
            <FollowUpRow key={fu.id} followUp={fu} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Single row with optimistic complete ────────────────────────────────

function FollowUpRow({ followUp }: { followUp: FollowUp }) {
  const qc = useQueryClient();
  const complete = useCompleteFollowUp();
  // 'overdue' is a live not-done state (the check-due cron flips due-past
  // pending → overdue) — treat it like pending so the row stays completable.
  const isPending = followUp.status === 'pending' || followUp.status === 'overdue';
  const isOverdue = isPending && (followUp.status === 'overdue' || new Date(followUp.due_at) < new Date());

  // Same optimistic-update pattern as components/crm/lead-detail/lead-sidebar.tsx
  // (Phase 6 follow-up commit). Cancel in-flight queries → snapshot every
  // ['crm','follow-ups',…] entry → mutator removes this row from each →
  // call API → on error, walk snapshots and restore each verbatim.
  async function handleComplete() {
    const id = followUp.id;
    await qc.cancelQueries({ queryKey: ['crm', 'follow-ups'] });

    const snapshots = qc.getQueriesData<FollowUpsResponse>({ queryKey: ['crm', 'follow-ups'] });

    qc.setQueriesData<FollowUpsResponse>({ queryKey: ['crm', 'follow-ups'] }, (old) => {
      if (!old || !Array.isArray(old.follow_ups)) return old;
      const next = old.follow_ups.filter((f) => f.id !== id);
      if (next.length === old.follow_ups.length) return old;
      return { ...old, follow_ups: next, total: Math.max(0, (old.total ?? 0) - 1) };
    });

    try {
      await complete.mutateAsync({ id });
      toast.success('تمّت المتابعة');
    } catch (err) {
      console.error('Complete follow-up failed:', err);
      for (const [key, data] of snapshots) qc.setQueryData(key, data);
      toast.error('فشل إكمال المتابعة');
    }
  }

  return (
    <li>
      {/* Phase 13 Q-003a — subtle hover state for visual consistency
          with other interactive card surfaces (pipeline cards, action
          cards, customer list rows). Card isn't a link, but the row is
          a discrete unit with interactive buttons inside. */}
      <Card className="p-4 hover:bg-muted/30 transition-colors">
        <div className="flex flex-col md:flex-row md:items-start md:gap-4">
          <div className="flex-1 min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-semibold leading-5">{followUp.title ?? 'متابعة'}</h3>
              <FollowUpStatusBadge status={followUp.status} overdue={isOverdue} />
            </div>

            {followUp.lead_id && (
              <p className="text-xs text-muted-foreground">
                <Link
                  href={`/dashboard/crm/leads/${followUp.lead_id}`}
                  className="text-orange-600 dark:text-orange-400 hover:underline font-medium"
                >
                  {followUp.lead_name ?? 'Lead'}
                </Link>
                {followUp.lead_company && <span> · {followUp.lead_company}</span>}
                {followUp.assigned_display_name && (
                  <span className="ms-2 text-muted-foreground/70">للـ {followUp.assigned_display_name}</span>
                )}
              </p>
            )}

            <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
              <CalendarClock className="size-3.5" />
              <span title={formatDate(followUp.due_at, 'eeee dd-MM-yyyy HH:mm')}>
                {formatRelativeDate(followUp.due_at)}
              </span>
            </div>

            {followUp.notes && (
              <p className="text-xs text-muted-foreground leading-5 mt-1 whitespace-pre-wrap break-words">
                {followUp.notes}
              </p>
            )}
          </div>

          <div className="mt-3 md:mt-0 flex items-center gap-2 shrink-0">
            {followUp.lead_phone && (
              <>
                <Button asChild variant="outline" size="sm" className="size-8 p-0" title="اتصال">
                  <a href={`tel:${followUp.lead_phone}`}><Phone className="size-3.5" /></a>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="size-8 p-0 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
                  title="WhatsApp"
                >
                  <a
                    href={`https://wa.me/${followUp.lead_phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <MessageCircle className="size-3.5" />
                  </a>
                </Button>
              </>
            )}
            {isPending && (
              <Button
                size="sm"
                onClick={() => void handleComplete()}
                disabled={complete.isPending}
                className="bg-orange-500 hover:bg-orange-600 text-white gap-1.5"
              >
                {complete.isPending ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Check className="size-3.5" />
                )}
                تمّت المتابعة
              </Button>
            )}
          </div>
        </div>
      </Card>
    </li>
  );
}

function FollowUpStatusBadge({ status, overdue }: { status: FollowUp['status']; overdue: boolean }) {
  if (overdue) {
    return (
      <Badge variant="outline" className="bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800/40">
        متأخرة
      </Badge>
    );
  }
  const tone =
    status === 'completed' ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
    : status === 'cancelled' ? 'bg-stone-500/10 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700/40'
    : 'bg-orange-500/10 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800/40';

  const label =
    FOLLOW_UP_STATUS_LABELS[status as FollowUpStatus] ?? status;

  return <Badge variant="outline" className={tone}>{label}</Badge>;
}
