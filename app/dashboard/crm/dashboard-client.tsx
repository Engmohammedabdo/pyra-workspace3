'use client';

/**
 * Sales Dashboard — page assembly (Phase 8 Step 5).
 *
 * Final layout for /dashboard/crm. Orchestrates the 9 dashboard widgets
 * built in Step 4 (Clusters 1-4) plus a small toolbar row.
 *
 * Order (top → bottom):
 *   1. <DashboardGreeting />              greeting + subtitle (Cluster 1)
 *   2. <DashboardAiInsight />             gold AI banner (Cluster 1)
 *   3. Toolbar: PeriodSelector + TeamFilter (managers only)
 *   4. <DashboardKpiCards period={...} /> 4-card KPI grid (Cluster 2)
 *   5. <DashboardFunnel />                stage funnel viz (Cluster 2)
 *   6. 2-col: <DashboardDealsAtRisk /> + <DashboardActivityFeed />
 *   7. <DashboardActionCards />           3 quick-action cards (2 for sales agents)
 *   8. <DashboardTeamPerformance />       team table (renders null for non-managers)
 *   9. <DashboardDataSources />           transparency footer (Cluster 1)
 *
 * Period selector: state-only here, propagated to <DashboardKpiCards>
 * (the only widget whose backend honours `?period=`). Default
 * 'this_month' per Phase 8 Q2.
 *
 * Team filter: UI-only stub for v1 per Phase 8 Q1 decision. The dropdown
 * renders for users with `crm_reports.team_view`, accepts selection, but
 * does NOT propagate the value to data hooks. Backend `?as_user=` plumbing
 * is deferred to v1.1 (documented in CRM-PROGRESS.md). Italic disclaimer
 * is in-line so the user is never confused about what the dropdown does.
 */

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useTeamPerformance, type CRMPeriod } from '@/hooks/useCRMDashboard';
import { hasPermission } from '@/lib/auth/rbac';
import { Users } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

import { DashboardGreeting } from '@/components/crm/dashboard/dashboard-greeting';
import { DashboardAiInsight } from '@/components/crm/dashboard/dashboard-ai-insight';
import { DashboardKpiCards } from '@/components/crm/dashboard/dashboard-kpi-cards';
import { DashboardFunnel } from '@/components/crm/dashboard/dashboard-funnel';
import { DashboardDealsAtRisk } from '@/components/crm/dashboard/dashboard-deals-at-risk';
import { DashboardActivityFeed } from '@/components/crm/dashboard/dashboard-activity-feed';
import { DashboardActionCards } from '@/components/crm/dashboard/dashboard-action-cards';
import { DashboardTeamPerformance } from '@/components/crm/dashboard/dashboard-team-performance';
import { DashboardDataSources } from '@/components/crm/dashboard/dashboard-data-sources';

const PERIOD_VALUES: CRMPeriod[] = ['this_month', 'last_30d', 'quarter'];
const PERIOD_KEY: Record<CRMPeriod, string> = {
  this_month: 'thisMonth',
  last_30d: 'last30d',
  quarter: 'quarter',
};

export function DashboardClient() {
  const [period, setPeriod] = useState<CRMPeriod>('this_month');
  // v1: state-only, doesn't propagate. v1.1 wires this through to data
  // hooks once each scoped endpoint accepts an `as_user` query param.
  const [agentFilter, setAgentFilter] = useState<string>('');

  const { data: user } = useCurrentUser();
  const canViewTeam = !!user && hasPermission(user.rolePermissions, 'crm_reports.team_view');

  // Reuses the same React Query cache key as <DashboardTeamPerformance>'s
  // own useTeamPerformance call → zero extra HTTP, both consumers share
  // one fetch.
  const { data: teamData } = useTeamPerformance({ enabled: canViewTeam });
  const teamAgents = teamData?.team ?? [];

  return (
    <div className="space-y-6">
      <DashboardGreeting />
      <DashboardAiInsight />

      {/* Toolbar — period selector (everyone) + team filter (managers only) */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <PeriodSelector value={period} onChange={setPeriod} />
        {canViewTeam && (
          <TeamFilter
            value={agentFilter}
            onChange={setAgentFilter}
            agents={teamAgents}
          />
        )}
      </div>

      <DashboardKpiCards period={period} />
      <DashboardFunnel />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <DashboardDealsAtRisk />
        <DashboardActivityFeed />
      </div>

      <DashboardActionCards />
      <DashboardTeamPerformance />
      <DashboardDataSources />
    </div>
  );
}

// ── Toolbar widgets ──────────────────────────────────────────────────────────

function PeriodSelector({
  value,
  onChange,
}: {
  value: CRMPeriod;
  onChange: (v: CRMPeriod) => void;
}) {
  const t = useTranslations('crm.dashboard');
  return (
    <div
      role="tablist"
      aria-label={t('toolbar.periodAria')}
      className="inline-flex items-center gap-1 p-1 rounded-lg bg-muted/50 border border-border self-start"
    >
      {PERIOD_VALUES.map((opt) => {
        const isActive = value === opt;
        return (
          <button
            key={opt}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(opt)}
            className={cn(
              'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
              'focus:outline-none focus:ring-2 focus:ring-orange-500/40',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`periodOptions.${PERIOD_KEY[opt]}` as Parameters<typeof t>[0])}
          </button>
        );
      })}
    </div>
  );
}

function TeamFilter({
  value,
  onChange,
  agents,
}: {
  value: string;
  onChange: (v: string) => void;
  agents: Array<{ username: string; display_name: string }>;
}) {
  const t = useTranslations('crm.dashboard');
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Users className="size-4 text-muted-foreground shrink-0" aria-hidden />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t('toolbar.agentFilterAria')}
        className={cn(
          'text-xs px-3 py-1.5 rounded-md border border-border bg-background text-foreground',
          'focus:outline-none focus:ring-2 focus:ring-orange-500/40',
        )}
      >
        <option value="">{t('toolbar.allTeam')}</option>
        {agents.map((a) => (
          <option key={a.username} value={a.username}>
            {a.display_name}
          </option>
        ))}
      </select>
      {/* Honest disclaimer — selection state lives here but doesn't
          propagate to the data hooks in v1. v1.1 will wire it through
          once each scoped endpoint accepts an as_user param. */}
      <span className="text-[10px] italic text-muted-foreground">
        {t('toolbar.agentFilterDisclaimer')}
      </span>
    </div>
  );
}
