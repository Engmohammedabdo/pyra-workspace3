import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { dubaiDayKey } from '@/lib/utils/format';

// =============================================================
// GET /api/dashboard/kpis/team-workload
// Team workload: actions this month per user from activity log.
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('dashboard.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();

    // Dubai-anchored current-month window (Asia/Dubai = UTC+4, no DST). The old
    // `.toISOString().split('T')[0]` built a UTC calendar month from server-local
    // midnight — mis-attributing activity in the ~4h Dubai/UTC boundary band and
    // fragile on non-UTC hosts. Using the mandated `dubaiDayKey` helper + explicit
    // +04:00 offsets makes the window a true Dubai month regardless of DB/server TZ.
    const [y, m] = dubaiDayKey(new Date()).split('-').map(Number);
    const pad = (n: number) => String(n).padStart(2, '0');
    const monthStartUtc = `${y}-${pad(m)}-01T00:00:00+04:00`;
    const nextY = m === 12 ? y + 1 : y;
    const nextM = m === 12 ? 1 : m + 1;
    const nextMonthStartUtc = `${nextY}-${pad(nextM)}-01T00:00:00+04:00`; // exclusive upper bound

    // Fetch activity logs for this (Dubai) month.
    // Explicit .range so the per-user counting below sees EVERY row: without it
    // PostgREST caps the result at its implicit 1000-row default, and this month
    // already exceeds that (the log grows unbounded), which silently under-counted
    // every user's monthly total and could drop users entirely. Only 2 short
    // columns are projected, so loading all month rows is cheap.
    const { data: logs, error } = await supabase
      .from('pyra_activity_log')
      .select('username, display_name')
      .gte('created_at', monthStartUtc)
      .lt('created_at', nextMonthStartUtc)
      .range(0, 199999);

    if (error) {
      console.error('Team workload query error:', error);
      return apiServerError();
    }

    // Group by username and count actions
    const userMap: Record<string, { username: string; display_name: string; actions: number }> = {};

    for (const log of logs || []) {
      const username = log.username || 'unknown';
      if (!userMap[username]) {
        userMap[username] = {
          username,
          display_name: log.display_name || username,
          actions: 0,
        };
      }
      userMap[username].actions += 1;
    }

    // Sort by actions descending
    const sorted = Object.values(userMap).sort((a, b) => b.actions - a.actions);

    return apiSuccess(sorted);
  } catch (err) {
    console.error('GET /api/dashboard/kpis/team-workload error:', err);
    return apiServerError();
  }
}
