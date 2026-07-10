import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';
import { dubaiDayKey } from '@/lib/utils/format';

/**
 * Dubai-offset (UTC+4, no DST) half-open [start, end) bounds for the current
 * month key (Phase 15.1 `dubaiDayKey` doctrine — never UTC-slice "this month").
 */
function currentDubaiMonthBounds(): { start: string; end: string } {
  const [y, m] = dubaiDayKey(new Date()).slice(0, 7).split('-').map(Number);
  const nextY = m === 12 ? y + 1 : y;
  const nextM = m === 12 ? 1 : m + 1;
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    start: `${y}-${pad(m)}-01T00:00:00+04:00`,
    end: `${nextY}-${pad(nextM)}-01T00:00:00+04:00`,
  };
}

/**
 * GET /api/crm/dashboard/team-performance
 *
 * Permission: crm_reports.team_view (manager + admin only).
 *
 * Per-agent breakdown of pipeline activity:
 *   - total_leads (active in pipeline)
 *   - won_count   (stage_id = stg_closed_won)
 *   - pipeline_value (sum expected_value of leads NOT in closed_won/closed_lost)
 *   - won_value      (sum expected_value of leads in closed_won)
 *   - conversion_pct (won_count / (active + won))
 *   - calls_month    (Task 6 — count of pyra_agent_calls this Dubai month)
 */
export async function GET() {
  try {
    const auth = await requireApiPermission('crm_reports.team_view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    const { data, error } = await supabase
      .from('pyra_sales_leads')
      .select('assigned_to, stage_id, expected_value, is_converted');
    if (error) {
      console.error('GET /api/crm/dashboard/team-performance error:', error.message);
      return apiServerError();
    }

    type Bucket = {
      username: string;
      total_leads: number;
      active_leads: number;
      won_count: number;
      lost_count: number;
      pipeline_value: number;
      won_value: number;
      conversion_pct: number;
      calls_month: number;
    };

    const emptyBucket = (username: string): Bucket => ({
      username,
      total_leads: 0,
      active_leads: 0,
      won_count: 0,
      lost_count: 0,
      pipeline_value: 0,
      won_value: 0,
      conversion_pct: 0,
      calls_month: 0,
    });

    const map = new Map<string, Bucket>();
    for (const row of data ?? []) {
      const u = row.assigned_to;
      if (!u) continue;
      if (!map.has(u)) map.set(u, emptyBucket(u));
      const b = map.get(u)!;
      b.total_leads += 1;
      const value = Number(row.expected_value) || 0;
      if (row.stage_id === PIPELINE_STAGE_IDS.CLOSED_WON) {
        b.won_count += 1;
        b.won_value += value;
      } else if (row.stage_id === PIPELINE_STAGE_IDS.CLOSED_LOST) {
        b.lost_count += 1;
      } else {
        b.active_leads += 1;
        b.pipeline_value += value;
      }
    }

    // Task 6 — calls_month: one grouped query over pyra_agent_calls for the
    // current Dubai month, counted per agent in JS (service-role-only table,
    // Gap #3 doctrine — no separate permission gate needed here since this
    // whole route is already crm_reports.team_view-gated above).
    const { start: callsStart, end: callsEnd } = currentDubaiMonthBounds();
    const { data: callRows, error: callsError } = await supabase
      .from('pyra_agent_calls')
      .select('agent_username')
      .gte('called_at', callsStart)
      .lt('called_at', callsEnd);
    if (callsError) {
      console.error('GET /api/crm/dashboard/team-performance calls error:', callsError.message);
      return apiServerError();
    }
    for (const row of callRows ?? []) {
      const u = row.agent_username;
      if (!u) continue;
      if (!map.has(u)) map.set(u, emptyBucket(u));
      map.get(u)!.calls_month += 1;
    }

    // Conversion rate + display name enrichment
    const usernames = Array.from(map.keys());
    const { data: users } = usernames.length
      ? await supabase
          .from('pyra_users')
          .select('username, display_name, role')
          .in('username', usernames)
      : { data: [] as Array<{ username: string; display_name: string; role: string }> };
    const userMap = new Map((users ?? []).map((u) => [u.username, u]));

    const team = Array.from(map.values())
      .map((b) => {
        const denom = b.active_leads + b.won_count + b.lost_count;
        const pct = denom > 0 ? (b.won_count / denom) * 100 : 0;
        return {
          ...b,
          conversion_pct: Math.round(pct * 10) / 10,
          display_name: userMap.get(b.username)?.display_name ?? b.username,
          role: userMap.get(b.username)?.role ?? null,
        };
      })
      .sort((a, b) => b.pipeline_value - a.pipeline_value);

    return apiSuccess({ team });
  } catch (err) {
    console.error('GET /api/crm/dashboard/team-performance threw:', err);
    return apiServerError();
  }
}
