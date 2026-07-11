'use client';

/**
 * Per-call table (V1.1-A) — row-level companion to CallsSummaryCards'
 * per-agent aggregates. Filters (direction / match status / agent) +
 * pagination live as local component state; the agent select only renders
 * when `scope === 'all'` (crm_reports.team_view holders) and reuses the
 * agent list already fetched by the parent's useCallsReport call — no new
 * endpoint for the dropdown options.
 */

import { useEffect, useState, type ComponentType } from 'react';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import {
  Phone,
  PhoneOutgoing,
  PhoneIncoming,
  PhoneMissed,
  ChevronLeft,
  ChevronRight,
  ListChecks,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils/cn';
import { useCallsList, type CallsListCall } from '@/hooks/useCallsList';
import { formatCallDuration } from '@/components/crm/calls/CallsSummaryCards';
import { formatDate, formatRelativeDate } from '@/lib/utils/format';
import type { Locale } from '@/lib/i18n/config';

const DIRECTION_ICON: Record<CallsListCall['direction'], ComponentType<{ className?: string }>> = {
  outgoing: PhoneOutgoing,
  incoming: PhoneIncoming,
  missed: PhoneMissed,
};

const DIRECTION_FILTERS = ['all', 'outgoing', 'incoming', 'missed'] as const;
const STATUS_FILTERS = ['all', 'matched', 'unmatched', 'ignored'] as const;

interface CallsTableProps {
  month: string;
  scope: 'all' | 'own';
  agentOptions: Array<{ username: string; display_name: string }>;
}

// Chip button shared by both filter rows (direction + status) — same pill
// idiom as the CRM follow-ups filter chips (app/dashboard/crm/follow-ups).
function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border transition-colors',
        active
          ? 'bg-foreground text-background border-foreground'
          : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted',
      )}
    >
      {children}
    </button>
  );
}

function CallStatusBadge({ status }: { status: CallsListCall['match_status'] }) {
  const t = useTranslations('calls');
  const tone =
    status === 'matched'
      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
      : status === 'unmatched'
        ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800/40'
        : 'bg-stone-500/10 text-stone-700 dark:text-stone-300 border-stone-200 dark:border-stone-700/40';
  return (
    <Badge variant="outline" className={cn('text-xs', tone)}>
      {t(status)}
    </Badge>
  );
}

export function CallsTable({ month, scope, agentOptions }: CallsTableProps) {
  const t = useTranslations('calls');
  const locale = useLocale() as Locale;

  const [page, setPage] = useState(1);
  const [direction, setDirection] = useState<string>('all');
  const [status, setStatus] = useState<string>('all');
  const [agent, setAgent] = useState<string>('all');

  // Month is owned by the page (shared with the cards/chart) — reset to
  // page 1 whenever it changes so a stale deep page number from a prior
  // month doesn't silently request an out-of-range page.
  useEffect(() => {
    setPage(1);
  }, [month]);

  const { data, isLoading } = useCallsList({
    month,
    page,
    agent: scope === 'all' && agent !== 'all' ? agent : undefined,
    direction: direction !== 'all' ? direction : undefined,
    status: status !== 'all' ? status : undefined,
  });

  const calls = data?.calls ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 50;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  function setDirectionFilter(v: string) {
    setDirection(v);
    setPage(1);
  }
  function setStatusFilter(v: string) {
    setStatus(v);
    setPage(1);
  }
  function setAgentFilter(v: string) {
    setAgent(v);
    setPage(1);
  }

  const showAgentColumn = scope === 'all';

  return (
    <div className="rounded-2xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-border/40">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 flex items-center justify-center shadow-md shadow-orange-500/15">
          <ListChecks className="h-4 w-4 text-white" aria-hidden />
        </div>
        <h3 className="font-bold text-sm">{t('table.heading')}</h3>
      </div>

      {/* Filter chips row */}
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-border/40">
        <div className="flex flex-wrap gap-1.5">
          {DIRECTION_FILTERS.map((key) => (
            <FilterChip key={key} active={direction === key} onClick={() => setDirectionFilter(key)}>
              {key === 'all' ? t('filters.all') : t(key)}
            </FilterChip>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_FILTERS.map((key) => (
            <FilterChip key={key} active={status === key} onClick={() => setStatusFilter(key)}>
              {key === 'all' ? t('filters.all') : t(key)}
            </FilterChip>
          ))}
        </div>
        {showAgentColumn && agentOptions.length > 0 && (
          <Select value={agent} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-40 h-8 text-xs ms-auto">
              <SelectValue placeholder={t('filters.allAgents')} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t('filters.allAgents')}</SelectItem>
              {agentOptions.map((a) => (
                <SelectItem key={a.username} value={a.username}>
                  {a.display_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="p-5">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <Phone className="h-8 w-8 text-muted-foreground/40 mb-2" aria-hidden />
            <p className="text-sm text-muted-foreground">{t('table.emptyTitle')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-muted-foreground">
                  {showAgentColumn && (
                    <th scope="col" className="text-start pb-3 pe-3 font-medium">
                      {t('table.columnAgent')}
                    </th>
                  )}
                  <th scope="col" className="text-start pb-3 pe-3 font-medium">
                    {t('table.columnPhone')}
                  </th>
                  <th scope="col" className="text-start pb-3 pe-3 font-medium">
                    {t('table.columnDirection')}
                  </th>
                  <th scope="col" className="text-end pb-3 pe-3 font-medium">
                    {t('table.columnDuration')}
                  </th>
                  <th scope="col" className="text-start pb-3 pe-3 font-medium">
                    {t('table.columnTime')}
                  </th>
                  <th scope="col" className="text-start pb-3 pe-3 font-medium">
                    {t('table.columnStatus')}
                  </th>
                  <th scope="col" className="text-start pb-3 font-medium">
                    {t('table.columnClient')}
                  </th>
                </tr>
              </thead>
              <tbody>
                {calls.map((call) => {
                  const DirectionIcon = DIRECTION_ICON[call.direction];
                  return (
                    <tr
                      key={call.id}
                      className="border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
                    >
                      {showAgentColumn && (
                        <td className="py-2.5 pe-3 text-foreground">{call.agent_display_name}</td>
                      )}
                      <td className="py-2.5 pe-3">
                        <span dir="ltr" className="tabular-nums">
                          {call.phone}
                        </span>
                      </td>
                      <td className="py-2.5 pe-3">
                        <span className="inline-flex items-center gap-1.5">
                          <DirectionIcon
                            className={cn('size-3.5', call.direction === 'missed' && 'text-red-500')}
                            aria-hidden
                          />
                          {t(call.direction)}
                        </span>
                      </td>
                      <td className="py-2.5 pe-3 text-end tabular-nums text-foreground">
                        {formatCallDuration(call.duration_seconds)}
                      </td>
                      <td className="py-2.5 pe-3 text-muted-foreground">
                        <span
                          className="tabular-nums"
                          title={formatDate(call.called_at, 'dd-MM-yyyy HH:mm', locale)}
                        >
                          {formatRelativeDate(call.called_at, locale)}
                        </span>
                      </td>
                      <td className="py-2.5 pe-3">
                        <CallStatusBadge status={call.match_status} />
                      </td>
                      <td className="py-2.5">
                        {call.match_status === 'matched' && call.lead_id ? (
                          <Link
                            href={`/dashboard/crm/leads/${call.lead_id}`}
                            className="text-orange-600 dark:text-orange-400 hover:underline font-medium"
                          >
                            {call.lead_name ?? call.lead_id}
                          </Link>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isLoading && total > 0 && (
        <div className="flex items-center justify-between gap-3 border-t border-border/40 px-5 py-3">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="gap-1.5"
          >
            <ChevronLeft className="size-3.5 rtl:rotate-180" aria-hidden />
            {t('pagination.previous')}
          </Button>
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('pagination.pageOf', { page, totalPages })}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="gap-1.5"
          >
            {t('pagination.next')}
            <ChevronRight className="size-3.5 rtl:rotate-180" aria-hidden />
          </Button>
        </div>
      )}
    </div>
  );
}
