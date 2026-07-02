import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLeadScopeFilter } from '@/lib/auth/lead-scope';
import { PIPELINE_ACTIVE_STAGES } from '@/lib/constants/statuses';

/**
 * GET /api/crm/dashboard/deals-at-risk
 *
 * Permission: crm_reports.view
 * Scope: scoped per user.
 *
 * "At risk" = lead in active pipeline + no activity in N days.
 *
 * Heuristic for "no activity":
 *   most_recent = greatest(last_contact_at, latest pyra_lead_activities.created_at)
 *   stale_if   = most_recent < NOW() - INTERVAL 'N days' (or null)
 *
 * Query: ?days=7 (default 7, max 60)
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('crm_reports.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;
    const daysParam = parseInt(sp.get('days') || '7', 10);
    const days = Math.min(Math.max(Number.isFinite(daysParam) ? daysParam : 7, 1), 60);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const scope = getLeadScopeFilter(auth.pyraUser.role, auth.pyraUser.username);

    let q = supabase
      .from('pyra_sales_leads')
      .select('id, name, phone, company, stage_id, expected_value, expected_value_currency, deal_type, last_contact_at, assigned_to, priority')
      .in('stage_id', PIPELINE_ACTIVE_STAGES as readonly string[])
      // IS NOT TRUE catches both false and legacy NULL rows (migrations 010/011
      // treat NULL as not-converted; a bare .eq(false) drops NULLs → the deal
      // silently disappears from the at-risk surface).
      .not('is_converted', 'is', true);
    if (scope) q = q.eq(scope.column, scope.value);
    const { data: leads, error } = await q;
    if (error) {
      console.error('GET /api/crm/dashboard/deals-at-risk error:', error.message);
      return apiServerError();
    }

    const ids = (leads ?? []).map((l) => l.id);
    const lastActMap = new Map<string, string>();
    if (ids.length > 0) {
      const { data: acts } = await supabase
        .from('pyra_lead_activities')
        .select('lead_id, created_at')
        .in('lead_id', ids)
        .order('created_at', { ascending: false });
      for (const a of acts ?? []) {
        if (!lastActMap.has(a.lead_id)) lastActMap.set(a.lead_id, a.created_at);
      }
    }

    const atRisk = (leads ?? [])
      .map((l) => {
        const lastAct = lastActMap.get(l.id);
        const lastTimes = [l.last_contact_at, lastAct].filter((x): x is string => !!x).map((x) => new Date(x).getTime());
        const mostRecent = lastTimes.length ? new Date(Math.max(...lastTimes)) : null;
        const daysIdle = mostRecent
          ? Math.floor((Date.now() - mostRecent.getTime()) / (24 * 60 * 60 * 1000))
          : null;
        return { ...l, last_activity_at: mostRecent?.toISOString() ?? null, days_idle: daysIdle };
      })
      .filter((l) => {
        if (l.last_activity_at === null) return true;
        return new Date(l.last_activity_at) < cutoff;
      })
      .sort((a, b) => (b.days_idle ?? Infinity) - (a.days_idle ?? Infinity));

    return apiSuccess({ deals_at_risk: atRisk, days_threshold: days });
  } catch (err) {
    console.error('GET /api/crm/dashboard/deals-at-risk threw:', err);
    return apiServerError();
  }
}
