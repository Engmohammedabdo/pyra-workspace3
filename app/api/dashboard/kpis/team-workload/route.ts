import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';

// =============================================================
// GET /api/dashboard/kpis/team-workload
// Team workload: actions this month per user from activity log.
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];

    // Fetch activity logs for this month
    const { data: logs, error } = await supabase
      .from('pyra_activity_log')
      .select('username, display_name')
      .gte('created_at', monthStart)
      .lte('created_at', monthEnd + 'T23:59:59');

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
