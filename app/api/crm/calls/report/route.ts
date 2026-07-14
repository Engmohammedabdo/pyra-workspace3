import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { dubaiDayKey } from '@/lib/utils/format';
import { computeCallsReport } from '@/lib/calls/report';
import { logError } from '@/lib/observability/log-error';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Dubai-offset (UTC+4, no DST) half-open [start, end) bounds for a given
 * YYYY-MM month key. Mirrors the Phase 15.1 `dubaiDayKey`/`toDubaiIso`
 * doctrine — never derive "this month in Dubai" via `.toISOString()` UTC
 * slicing.
 */
function dubaiMonthBounds(month: string): { start: string; end: string } {
  const [y, m] = month.split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${y}-${pad(m)}-01T00:00:00+04:00`,
    end: `${nextY}-${pad(nextM)}-01T00:00:00+04:00`,
  };
}

/**
 * GET /api/crm/calls/report?month=YYYY-MM
 *
 * Permission: calls.view (BASE for sales_agent via ROLE_EXTRAS; admin via '*').
 * Scope: crm_reports.team_view holders (manager/admin) see ALL agents;
 * everyone else is scoped to their own agent_username rows.
 *
 * pyra_agent_calls is service-role-only (Gap #3 doctrine) — gate THEN
 * service-role client, never a session client on this table.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('calls.view');
    if (isApiError(auth)) return auth;

    const monthParam = request.nextUrl.searchParams.get('month');
    const month = monthParam && MONTH_RE.test(monthParam)
      ? monthParam
      : dubaiDayKey(new Date()).slice(0, 7);
    const { start, end } = dubaiMonthBounds(month);

    // admins / report-holders see all agents; agents see their own rows
    const seeAll = hasPermission(auth.pyraUser.rolePermissions, 'crm_reports.team_view');

    const supabase = createServiceRoleClient();
    let query = supabase
      .from('pyra_agent_calls')
      .select('*')
      .gte('called_at', start)
      .lt('called_at', end);
    if (!seeAll) query = query.eq('agent_username', auth.pyraUser.username);
    // Explicit .order + .range so the aggregation below sees EVERY call in the
    // month. Without .range the implicit PostgREST 1000-row default truncated a
    // busy team month; and with no ORDER BY, WHICH 1000 rows survived was
    // nondeterministic, so the report shifted between reloads.
    const { data: rows, error } = await query
      .order('called_at', { ascending: true })
      .range(0, 99999);
    if (error) throw error;

    const agg = computeCallsReport(rows ?? [], dubaiDayKey(new Date()));

    const usernames = Object.keys(agg.per_agent);
    const { data: users } = usernames.length
      ? await supabase.from('pyra_users').select('username, display_name').in('username', usernames)
      : { data: [] };
    const nameMap = new Map((users ?? []).map((u) => [u.username, u.display_name]));

    return apiSuccess({
      month,
      scope: seeAll ? 'all' : 'own',
      agents: usernames.map((u) => ({
        username: u,
        display_name: nameMap.get(u) ?? u,
        ...agg.per_agent[u],
      })),
      per_day: agg.per_day,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'calls_report' } });
    return apiServerError();
  }
}
