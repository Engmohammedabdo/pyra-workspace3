import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLeadScopeFilter } from '@/lib/auth/lead-scope';
import { getDirectReports } from '@/lib/auth/team-scope';
import { hasPermission } from '@/lib/auth/rbac';
import { PIPELINE_ACTIVE_STAGES, PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';

/**
 * GET /api/crm/dashboard/ai-insights
 *
 * Permission: crm_reports.view
 * Scope: per user.
 *
 * Rule-based v1 (deferred ML to v2). Returns up to 3 insights, sorted by
 * severity (high > medium > low).
 *
 * Rules:
 *   1. idle deals — count of in-pipeline leads with no activity in 7+ days.
 *      Severity: high if >= 5, medium if >= 3.
 *   2. pending approvals — only for users with leads.approve. Count of leads
 *      in stg_contract_signed within the approver's scope (admin sees all;
 *      manager sees direct reports' leads).
 *      Severity: medium when > 0.
 *   3. overdue follow-ups — count of own pending follow-ups with due_at < now.
 *      Severity: high if >= 5, medium otherwise.
 */

const SEVERITY_RANK: Record<'high' | 'medium' | 'low', number> = { high: 3, medium: 2, low: 1 };

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
      type: 'idle_warning' | 'approvals_pending' | 'overdue_followups';
      severity: 'high' | 'medium' | 'low';
      count: number;
      value?: number;
      message_ar: string;
      link?: string;
    };
    const insights: Insight[] = [];

    // ── Rule 1: idle deals ──
    const idleScopeQ = supabase
      .from('pyra_sales_leads')
      .select('id, expected_value', { count: 'exact' })
      .in('stage_id', PIPELINE_ACTIVE_STAGES as readonly string[])
      .eq('is_converted', false);
    const idleQ = scope ? idleScopeQ.eq(scope.column, scope.value) : idleScopeQ;
    // last_contact_at older than 7d (or null)
    const { data: candidateLeads } = await idleQ;
    if (candidateLeads && candidateLeads.length > 0) {
      const candidateIds = candidateLeads.map((l) => l.id);
      const { data: recentActs } = await supabase
        .from('pyra_lead_activities')
        .select('lead_id, created_at')
        .in('lead_id', candidateIds)
        .gte('created_at', sevenDaysAgo);
      const haveRecent = new Set((recentActs ?? []).map((a) => a.lead_id));
      const idleLeads = candidateLeads.filter((l) => !haveRecent.has(l.id));
      const idleCount = idleLeads.length;
      const idleValue = idleLeads.reduce((acc, l) => acc + (Number(l.expected_value) || 0), 0);
      if (idleCount >= 3) {
        insights.push({
          type: 'idle_warning',
          severity: idleCount >= 5 ? 'high' : 'medium',
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
      if ((pendingCount ?? 0) > 0) {
        insights.push({
          type: 'approvals_pending',
          severity: 'medium',
          count: pendingCount ?? 0,
          message_ar: `${pendingCount} ${pendingCount === 1 ? 'صفقة بانتظار اعتمادك' : 'صفقات بانتظار اعتمادك'}`,
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
    if ((overdueCount ?? 0) > 0) {
      insights.push({
        type: 'overdue_followups',
        severity: (overdueCount ?? 0) >= 5 ? 'high' : 'medium',
        count: overdueCount ?? 0,
        message_ar: `${overdueCount} ${overdueCount === 1 ? 'متابعة متأخرة' : 'متابعات متأخرة'}`,
        link: '/dashboard/crm/follow-ups?status=overdue',
      });
    }

    insights.sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    return apiSuccess({ insights: insights.slice(0, 3) });
  } catch (err) {
    console.error('GET /api/crm/dashboard/ai-insights threw:', err);
    return apiServerError();
  }
}
