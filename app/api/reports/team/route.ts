import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/reports/team
// Team productivity report with date range filtering.
// Admin only.
//
// Query params:
//   ?from=YYYY-MM-DD  (default: 30 days ago)
//   ?to=YYYY-MM-DD    (default: today)
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();
    const url = new URL(request.url);

    const from = url.searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];
    const toEnd = to + 'T23:59:59';

    const [
      usersRes,
      activityRes,
    ] = await Promise.all([
      // All team members
      supabase
        .from('pyra_users')
        .select('username, display_name, role'),

      // Activity log in range
      supabase
        .from('pyra_activity_log')
        .select('username, action_type, created_at')
        .gte('created_at', from)
        .lte('created_at', toEnd)
        .limit(10000),
    ]);

    const users = usersRes.data || [];
    const activities = activityRes.data || [];

    // Build per-user activity stats
    const userStatsMap: Record<string, {
      actions_count: number;
      files_uploaded: number;
      last_active: string;
    }> = {};

    for (const act of activities) {
      const username = (act as { username: string }).username;
      if (!username) continue;

      if (!userStatsMap[username]) {
        userStatsMap[username] = {
          actions_count: 0,
          files_uploaded: 0,
          last_active: '',
        };
      }

      userStatsMap[username].actions_count += 1;

      // Count uploads
      const actionType = (act as { action_type: string }).action_type;
      if (actionType === 'upload' || actionType === 'file_uploaded') {
        userStatsMap[username].files_uploaded += 1;
      }

      // Track last active
      const createdAt = (act as { created_at: string }).created_at;
      if (!userStatsMap[username].last_active || createdAt > userStatsMap[username].last_active) {
        userStatsMap[username].last_active = createdAt;
      }
    }

    // Merge users with their activity stats
    const activitySummary = users.map(
      (u: { username: string; display_name: string; role: string }) => {
        const stats = userStatsMap[u.username];
        return {
          username: u.username,
          display_name: u.display_name,
          role: u.role,
          actions_count: stats?.actions_count || 0,
          files_uploaded: stats?.files_uploaded || 0,
          last_active: stats?.last_active || null,
        };
      }
    );

    // Sort by actions_count descending
    activitySummary.sort(
      (a: { actions_count: number }, b: { actions_count: number }) => b.actions_count - a.actions_count
    );

    return apiSuccess({
      summary: {
        total_members: users.length,
      },
      activity: activitySummary.slice(0, 20).map(
        (u: { display_name: string; actions_count: number }) => ({
          name: u.display_name,
          actions: u.actions_count,
        })
      ),
      activity_summary: activitySummary.map(
        (u: {
          username: string;
          display_name: string;
          role: string;
          actions_count: number;
          files_uploaded: number;
          last_active: string | null;
        }) => ({
          username: u.username,
          display_name: u.display_name,
          role: u.role,
          actions: u.actions_count,
          files_uploaded: u.files_uploaded,
          last_active: u.last_active,
        })
      ),
    });
  } catch (err) {
    console.error('GET /api/reports/team error:', err);
    return apiServerError();
  }
}
