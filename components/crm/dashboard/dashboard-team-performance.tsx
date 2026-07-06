'use client';

/**
 * Per-agent team performance table.
 *
 * Per CRM Phase 8 spec (Cluster 4) and PRD §03 line 548:
 *   "Per-agent breakdown" — manager + admin only, gated by
 *   `crm_reports.team_view`.
 *
 * Columns: agent display_name + total / active / won / lost counts +
 * conversion % + pipeline value (AED).
 *
 * Permission strategy:
 *   - Read user permissions via `useCurrentUser()`
 *   - Pass `enabled` to `useTeamPerformance({ enabled: canViewTeam })` so
 *     the request only fires when the user can actually see the data
 *     (no 403 roundtrip for sales agents)
 *   - Render null entirely if the user lacks the permission — Step 5's
 *     `<dashboard-client.tsx>` may also gate the parent slot for the
 *     "team filter" dropdown UX, but the component is defensive on its own.
 */

import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTeamPerformance } from '@/hooks/useCRMDashboard';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Users } from 'lucide-react';
import { hasPermission } from '@/lib/auth/rbac';
import { formatCurrency } from '@/lib/utils/format';
import { cn } from '@/lib/utils/cn';

export function DashboardTeamPerformance() {
  const t = useTranslations('crm.dashboard.teamPerformance');
  const { data: user, isLoading: userLoading } = useCurrentUser();
  const canViewTeam = !!user && hasPermission(user.rolePermissions, 'crm_reports.team_view');
  const { data, isLoading: teamLoading } = useTeamPerformance({ enabled: canViewTeam });

  // Hide entirely for users without team_view permission. Done after
  // both hooks are called (Rules of Hooks) but BEFORE rendering anything.
  if (!userLoading && !canViewTeam) {
    return null;
  }

  if (userLoading || teamLoading) {
    return (
      <Card className="p-5">
        <Skeleton className="h-5 w-40 mb-4" />
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="h-4 w-32" />
              <div className="flex-1 flex items-center justify-end gap-3">
                {Array.from({ length: 6 }).map((__, j) => (
                  <Skeleton key={j} className="h-4 w-12" />
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  const team = data?.team ?? [];

  if (team.length === 0) {
    return (
      <Card className="p-5">
        <h2 className="text-base font-semibold mb-2 flex items-center gap-2">
          <Users className="size-4 text-muted-foreground" />
          {t('heading')}
        </h2>
        <EmptyState
          icon={Users}
          title={t('empty.title')}
          description={t('empty.description')}
        />
      </Card>
    );
  }

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold mb-3 flex items-center gap-2">
        <Users className="size-4 text-muted-foreground" />
        {t('heading')}
        <span className="text-xs font-normal text-muted-foreground tabular-nums">
          ({t('staffCount', { count: team.length })})
        </span>
      </h2>
      <div className="overflow-x-auto -mx-1.5">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-start font-medium pb-2 ps-2">{t('th.employee')}</th>
              <th className="text-end font-medium pb-2 px-2">{t('th.total')}</th>
              <th className="text-end font-medium pb-2 px-2 hidden sm:table-cell">{t('th.active')}</th>
              <th className="text-end font-medium pb-2 px-2">{t('th.won')}</th>
              <th className="text-end font-medium pb-2 px-2 hidden md:table-cell">{t('th.lost')}</th>
              <th className="text-end font-medium pb-2 px-2">{t('th.conversion')}</th>
              <th className="text-end font-medium pb-2 pe-2">{t('th.pipelineValue')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {team.map((agent) => (
              <tr
                key={agent.username}
                className="group hover:bg-muted/30 transition-colors"
              >
                <td className="text-start py-2.5 ps-2">
                  <div className="font-medium truncate">{agent.display_name}</div>
                  <div className="text-xs text-muted-foreground truncate">@{agent.username}</div>
                </td>
                <td className="text-end py-2.5 px-2 tabular-nums">
                  {agent.total_leads}
                </td>
                <td className="text-end py-2.5 px-2 tabular-nums hidden sm:table-cell">
                  {agent.active_leads}
                </td>
                <td className={cn(
                  'text-end py-2.5 px-2 tabular-nums font-medium',
                  agent.won_count > 0 && 'text-emerald-600 dark:text-emerald-400',
                )}>
                  {agent.won_count}
                </td>
                <td className="text-end py-2.5 px-2 tabular-nums text-muted-foreground hidden md:table-cell">
                  {agent.lost_count}
                </td>
                <td className="text-end py-2.5 px-2 tabular-nums">
                  <ConversionBadge pct={agent.conversion_pct} />
                </td>
                <td className="text-end py-2.5 pe-2 tabular-nums font-medium whitespace-nowrap">
                  {formatCurrency(agent.pipeline_value, 'AED')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function ConversionBadge({ pct }: { pct: number }) {
  // Subtle color cue without being noisy. Manager-facing widget — give a
  // glance-readable sense of who's converting well vs. who needs help.
  const tone =
    pct >= 30 ? 'text-emerald-600 dark:text-emerald-400'
    : pct >= 15 ? 'text-amber-600 dark:text-amber-400'
    : 'text-muted-foreground';
  return <span className={tone}>{pct}%</span>;
}
