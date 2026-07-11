import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { hasPermission } from '@/lib/auth/rbac';
import { dubaiDayKey } from '@/lib/utils/format';
import { logError } from '@/lib/observability/log-error';
import type { AgentCall } from '@/types/database';

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const PAGE_SIZE = 50;
const DIRECTIONS = new Set(['outgoing', 'incoming', 'missed']);
const MATCH_STATUSES = new Set(['matched', 'unmatched', 'ignored']);

/**
 * Dubai-offset (UTC+4, no DST) half-open [start, end) bounds for a given
 * YYYY-MM month key. Twin of the identical helper in
 * app/api/crm/calls/report/route.ts (and app/api/crm/dashboard/
 * team-performance/route.ts) — Phase 15.1 doctrine: never derive "this
 * month in Dubai" via `.toISOString()` UTC slicing. Kept as a local copy
 * rather than a shared import per the existing team-performance precedent.
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
 * GET /api/crm/calls?month=YYYY-MM&page=1&agent=&direction=&status=
 *
 * Row-level companion to /api/crm/calls/report — one row per synced call
 * instead of per-agent aggregates. Same permission + scope doctrine:
 *
 * Permission: calls.view (BASE for sales_agent via ROLE_EXTRAS; admin via '*').
 * Scope: crm_reports.team_view holders (manager/admin) see ALL agents and
 * may filter by `agent`; everyone else is FORCED to their own
 * agent_username rows — a non-team_view caller's `agent` param is IGNORED
 * (never client-controlled scope).
 *
 * pyra_agent_calls is service-role-only (Gap #3 doctrine) — gate THEN
 * service-role client, never a session client on this table.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('calls.view');
    if (isApiError(auth)) return auth;

    const sp = request.nextUrl.searchParams;

    const monthParam = sp.get('month');
    const month = monthParam && MONTH_RE.test(monthParam)
      ? monthParam
      : dubaiDayKey(new Date()).slice(0, 7);
    const { start, end } = dubaiMonthBounds(month);

    const pageParam = Number.parseInt(sp.get('page') ?? '1', 10);
    const page = Number.isFinite(pageParam) && pageParam > 0 ? pageParam : 1;
    const from = (page - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const directionParam = sp.get('direction');
    const direction = directionParam && DIRECTIONS.has(directionParam) ? directionParam : null;

    const statusParam = sp.get('status');
    const matchStatus = statusParam && MATCH_STATUSES.has(statusParam) ? statusParam : null;

    // crm_reports.team_view holders (manager/admin) see all agents + may
    // filter by ?agent=; everyone else is scoped to their own rows and the
    // ?agent= param is silently ignored — never client-controlled scope.
    const seeAll = hasPermission(auth.pyraUser.rolePermissions, 'crm_reports.team_view');
    const agentParam = sp.get('agent');

    const supabase = createServiceRoleClient();
    let query = supabase
      .from('pyra_agent_calls')
      .select('*', { count: 'exact' })
      .gte('called_at', start)
      .lt('called_at', end);

    if (seeAll) {
      if (agentParam) query = query.eq('agent_username', agentParam);
    } else {
      query = query.eq('agent_username', auth.pyraUser.username);
    }
    if (direction) query = query.eq('direction', direction);
    if (matchStatus) query = query.eq('match_status', matchStatus);

    query = query.order('called_at', { ascending: false }).range(from, to);

    const { data: rows, error, count } = await query;
    if (error) throw error;

    const calls = (rows ?? []) as AgentCall[];

    // Batched enrichment — no N+1. At most PAGE_SIZE (50) distinct agents/
    // leads per page, so two `.in()` lookups regardless of page size.
    const usernames = Array.from(new Set(calls.map((c) => c.agent_username)));
    const { data: users } = usernames.length
      ? await supabase.from('pyra_users').select('username, display_name').in('username', usernames)
      : { data: [] as Array<{ username: string; display_name: string }> };
    const nameMap = new Map((users ?? []).map((u) => [u.username, u.display_name]));

    const leadIds = Array.from(
      new Set(calls.map((c) => c.lead_id).filter((id): id is string => !!id)),
    );
    const { data: leads } = leadIds.length
      ? await supabase.from('pyra_sales_leads').select('id, name').in('id', leadIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const leadMap = new Map((leads ?? []).map((l) => [l.id, l.name]));

    return apiSuccess({
      calls: calls.map((c) => ({
        id: c.id,
        agent_username: c.agent_username,
        agent_display_name: nameMap.get(c.agent_username) ?? c.agent_username,
        phone: c.phone_raw,
        direction: c.direction,
        duration_seconds: c.duration_seconds,
        called_at: c.called_at,
        match_status: c.match_status,
        lead_id: c.lead_id,
        lead_name: c.lead_id ? leadMap.get(c.lead_id) ?? null : null,
      })),
      page,
      page_size: PAGE_SIZE,
      total: count ?? 0,
      scope: seeAll ? 'all' : 'own',
    });
  } catch (err) {
    logError({ error: err, request, metadata: { action: 'calls_list' } });
    return apiServerError();
  }
}
