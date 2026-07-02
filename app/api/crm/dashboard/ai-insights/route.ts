import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLeadScopeFilter } from '@/lib/auth/lead-scope';
import { getDirectReports } from '@/lib/auth/team-scope';
import { hasPermission } from '@/lib/auth/rbac';
import { PIPELINE_ACTIVE_STAGES, PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';
import { dubaiDayKey } from '@/lib/utils/format';

/**
 * GET /api/crm/dashboard/ai-insights
 *
 * Permission: crm_reports.view
 * Scope: per user.
 *
 * Rule-based v1 (deferred ML to v2). Returns up to 3 insights, sorted by
 * severity (critical > high > medium > low).
 *
 * Severity scheme — see CLAUDE.md "CRM AI Insights — Severity Scheme":
 *   critical → blocking attention required
 *   high     → action needed soon
 *   medium   → awareness
 *   low      → positive trend (informational)
 *
 * Rules implemented (4 of 7 — see CRM-PROGRESS.md for the v1.1 backlog):
 *   1. idle_warning      — in-pipeline leads with no activity in 7+ days.
 *                          Severity: high when count >= 3.
 *   2. approvals_pending — only for users with leads.approve. Leads in
 *                          stg_contract_signed within the approver's scope
 *                          (admin sees all; manager sees direct reports').
 *                          Severity: critical when > 5, high when 1-5.
 *   3. overdue_followups — own pending follow-ups with due_at < now.
 *                          Severity: high when > 5 (strict), medium otherwise.
 *   4. followups_today   — own pending follow-ups due today (not yet overdue).
 *                          Severity: medium when count > 0.
 *
 * Deferred to v1.1 (require infrastructure not yet present):
 *   - conversion_dropped   (needs prior-period KPI comparison)
 *   - closed_won_streak    (needs streak definition)
 *   - target_exceeded      (needs target tracking schema)
 */

const SEVERITY_RANK: Record<'critical' | 'high' | 'medium' | 'low', number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
};

export async function GET() {
  try {
    const auth = await requireApiPermission('crm_reports.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const role = auth.pyraUser.role;
    const username = auth.pyraUser.username;
    const scope = getLeadScopeFilter(role, username);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    type Insight = {
      type: 'idle_warning' | 'approvals_pending' | 'overdue_followups' | 'followups_today';
      severity: 'critical' | 'high' | 'medium' | 'low';
      count: number;
      value?: number;
      message_ar: string;
      link?: string;
    };
    const insights: Insight[] = [];

    // ── Rule 1: idle deals ──
    const idleScopeQ = supabase
      .from('pyra_sales_leads')
      .select('id, expected_value, last_contact_at', { count: 'exact' })
      // IS NOT TRUE catches both false and legacy NULL rows.
      .in('stage_id', PIPELINE_ACTIVE_STAGES as readonly string[])
      .not('is_converted', 'is', true);
    const idleQ = scope ? idleScopeQ.eq(scope.column, scope.value) : idleScopeQ;
    const { data: candidateLeads } = await idleQ;
    if (candidateLeads && candidateLeads.length > 0) {
      const candidateIds = candidateLeads.map((l) => l.id);
      const { data: recentActs } = await supabase
        .from('pyra_lead_activities')
        .select('lead_id, created_at')
        .in('lead_id', candidateIds)
        .gte('created_at', sevenDaysAgo);
      const haveRecent = new Set((recentActs ?? []).map((a) => a.lead_id));
      // Idle = no recent activity AND last_contact_at older than 7d (or null).
      // Including last_contact_at aligns this with deals-at-risk (which uses the
      // greatest of last_contact_at and latest activity) so a lead phoned today
      // but not activity-logged isn't wrongly counted idle.
      const sevenDaysAgoMs = Date.parse(sevenDaysAgo);
      const idleLeads = candidateLeads.filter((l) => {
        if (haveRecent.has(l.id)) return false;
        const lc = (l as { last_contact_at: string | null }).last_contact_at;
        return !lc || new Date(lc).getTime() < sevenDaysAgoMs;
      });
      const idleCount = idleLeads.length;
      const idleValue = idleLeads.reduce((acc, l) => acc + (Number(l.expected_value) || 0), 0);
      // Phase 8 spec (CLAUDE.md "CRM AI Insights — Severity Scheme"):
      //   idle deals >= 3 → 'high' (single threshold; no medium tier)
      if (idleCount >= 3) {
        insights.push({
          type: 'idle_warning',
          severity: 'high',
          count: idleCount,
          value: idleValue,
          message_ar: `${idleCount} ${idleCount === 1 ? 'صفقة راكدة' : 'صفقات راكدة'} أكثر من ٧ أيام`,
          link: '/dashboard/crm?filter=at_risk',
        });
      }
    }

    // ── Rule 2: pending approvals (managers + admin) ──
    if (hasPermission(auth.pyraUser.rolePermissions, 'leads.approve')) {
      let pendingScopedIds: string[] | null = null;
      if (role !== 'admin') {
        const reports = await getDirectReports(supabase, username);
        pendingScopedIds = reports;
        if (pendingScopedIds.length === 0) {
          // no direct reports → no pending to approve
        }
      }
      let pq = supabase
        .from('pyra_sales_leads')
        .select('id', { count: 'exact', head: true })
        .eq('stage_id', PIPELINE_STAGE_IDS.CONTRACT_SIGNED);
      if (pendingScopedIds) pq = pq.in('assigned_to', pendingScopedIds);
      const { count: pendingCount } = await pq;
      const pCount = pendingCount ?? 0;
      if (pCount > 0) {
        // Phase 8 spec: > 5 → 'critical', 1-5 → 'high'
        insights.push({
          type: 'approvals_pending',
          severity: pCount > 5 ? 'critical' : 'high',
          count: pCount,
          message_ar: `${pCount} ${pCount === 1 ? 'صفقة بانتظار اعتمادك' : 'صفقات بانتظار اعتمادك'}`,
          link: '/dashboard/crm/approvals',
        });
      }
    }

    // ── Rule 3: overdue follow-ups (own only — non-admin) ──
    let fq = supabase
      .from('pyra_sales_follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lt('due_at', now);
    if (role !== 'admin') fq = fq.eq('assigned_to', username);
    const { count: overdueCount } = await fq;
    const oCount = overdueCount ?? 0;
    if (oCount > 0) {
      // Phase 8 spec: > 5 → 'high' (strict >), 1-5 → 'medium'
      insights.push({
        type: 'overdue_followups',
        severity: oCount > 5 ? 'high' : 'medium',
        count: oCount,
        message_ar: `${oCount} ${oCount === 1 ? 'متابعة متأخرة' : 'متابعات متأخرة'}`,
        link: '/dashboard/crm/follow-ups?status=overdue',
      });
    }

    // ── Rule 4 (Phase 8 NEW): follow-ups due TODAY ──
    // Count of own pending follow-ups whose due_at falls on the current calendar day.
    // Distinct from "overdue" — these are not yet past due, but warrant attention today.
    // Always emits at severity 'medium' when count > 0.
    // Dubai-day window (not server-local/UTC) — Phase 15.1 dubaiDayKey lock.
    // On the UTC Coolify server, setHours(0/23...) produced the UTC calendar
    // day, mis-bucketing every follow-up in the ±4h boundary window.
    const dubaiKey = dubaiDayKey();
    const dayStartIso = new Date(`${dubaiKey}T00:00:00.000+04:00`).toISOString();
    const dayEndIso = new Date(`${dubaiKey}T23:59:59.999+04:00`).toISOString();
    let tq = supabase
      .from('pyra_sales_follow_ups')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('due_at', dayStartIso)
      .lte('due_at', dayEndIso);
    if (role !== 'admin') tq = tq.eq('assigned_to', username);
    const { count: todayCount } = await tq;
    const tCount = todayCount ?? 0;
    if (tCount > 0) {
      insights.push({
        type: 'followups_today',
        severity: 'medium',
        count: tCount,
        message_ar: `${tCount} ${tCount === 1 ? 'متابعة اليوم' : 'متابعات اليوم'}`,
        link: '/dashboard/crm/follow-ups?status=today',
      });
    }

    insights.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    return apiSuccess({ insights: insights.slice(0, 3) });
  } catch (err) {
    console.error('GET /api/crm/dashboard/ai-insights threw:', err);
    return apiServerError();
  }
}
