import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { escapeLike, escapePostgrestValue } from '@/lib/utils/path';

// =============================================================
// GET /api/dashboard
// Dashboard summary stats based on user role
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();

    const supabase = await createServerSupabaseClient();
    const isAdmin = auth.pyraUser.role === 'admin';

    if (isAdmin) {
      return await getAdminDashboard(supabase, auth.pyraUser.username);
    } else {
      return await getEmployeeDashboard(supabase, auth.pyraUser);
    }
  } catch (err) {
    console.error('GET /api/dashboard error:', err);
    return apiServerError();
  }
}

// =============================================================
// Admin dashboard: full system stats
// =============================================================
async function getAdminDashboard(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  username: string
) {
  // Use v_dashboard_stats view for all KPIs in ONE query
  // + separate queries for activity & notifications (user-specific)
  const [statsResult, activityResult, notificationsResult, storageSettingResult] = await Promise.all([
    // All dashboard stats from a single view (replaces 7 separate queries)
    supabase
      .from('v_dashboard_stats')
      .select('*')
      .single(),

    // Recent activity (last 10)
    supabase
      .from('pyra_activity_log')
      .select('id, action_type, username, display_name, target_path, details, created_at')
      .order('created_at', { ascending: false })
      .limit(10),

    // Unread notifications count (user-specific, can't be in view)
    supabase
      .from('pyra_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_username', username)
      .eq('is_read', false),

    // Max storage setting
    supabase
      .from('pyra_settings')
      .select('value')
      .eq('key', 'max_storage_gb')
      .maybeSingle(),
  ]);

  const stats = statsResult.data;

  const maxStorageGb = storageSettingResult.data?.value
    ? parseFloat(storageSettingResult.data.value)
    : 50; // default fallback

  return apiSuccess({
    total_files: stats?.total_files ?? 0,
    total_users: stats?.total_users ?? 0,
    total_clients: stats?.total_clients ?? 0,
    total_projects: stats?.total_projects ?? 0,
    active_projects: stats?.active_projects ?? 0,
    completed_projects: stats?.completed_projects ?? 0,
    total_teams: stats?.total_teams ?? 0,
    total_quotes: stats?.total_quotes ?? 0,
    signed_quotes: stats?.signed_quotes ?? 0,
    pending_approvals: stats?.pending_approvals ?? 0,
    trash_count: stats?.trash_count ?? 0,
    active_shares: stats?.active_shares ?? 0,
    recent_activity: activityResult.data || [],
    unread_notifications: notificationsResult.count ?? 0,
    storage_used: stats?.total_storage_bytes ?? 0,
    max_storage_gb: maxStorageGb,
  });
}

// =============================================================
// Employee dashboard: scoped to their permissions
// =============================================================
async function getEmployeeDashboard(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>,
  pyraUser: { username: string; permissions: import('@/types/database').UserPermissions }
) {
  // Get permitted paths from user permissions
  const permissions = pyraUser.permissions as {
    allowed_paths?: string[];
    paths?: Record<string, string>;
  };
  const allowedPaths = permissions?.allowed_paths || [];
  const pathKeys = permissions?.paths ? Object.keys(permissions.paths) : [];
  const allPaths = [...new Set([...allowedPaths, ...pathKeys])];

  // Run queries in parallel
  const [activityResult, notificationsResult, filesResult] = await Promise.all([
    // Their recent activity
    supabase
      .from('pyra_activity_log')
      .select('id, action_type, username, display_name, target_path, details, created_at')
      .eq('username', pyraUser.username)
      .order('created_at', { ascending: false })
      .limit(10),

    // Unread notifications
    supabase
      .from('pyra_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_username', pyraUser.username)
      .eq('is_read', false),

    // Files in their permitted paths
    allPaths.length > 0
      ? supabase
          .from('pyra_file_index')
          .select('id', { count: 'exact', head: true })
          .or(allPaths.map((p) => `file_path.like.${escapePostgrestValue(escapeLike(p) + '%')}`).join(','))
      : Promise.resolve({ count: 0, data: null, error: null }),
  ]);

  return apiSuccess({
    recent_activity: activityResult.data || [],
    unread_notifications: notificationsResult.count ?? 0,
    accessible_files: filesResult.count ?? 0,
    permitted_paths: allPaths,
  });
}
