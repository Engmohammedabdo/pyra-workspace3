import { NextRequest } from 'next/server';
import { getApiAuth } from '@/lib/api/auth';
import {
  apiSuccess,
  apiUnauthorized,
  apiServerError,
} from '@/lib/api/response';
import { createServerSupabaseClient } from '@/lib/supabase/server';

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
  // Run all queries in parallel
  const [
    filesResult,
    usersResult,
    clientsResult,
    projectsResult,
    activityResult,
    notificationsResult,
    storageResult,
  ] = await Promise.all([
    // Total files
    supabase
      .from('pyra_file_index')
      .select('id', { count: 'exact', head: true }),

    // Total users
    supabase
      .from('pyra_users')
      .select('id', { count: 'exact', head: true }),

    // Total clients
    supabase
      .from('pyra_clients')
      .select('id', { count: 'exact', head: true }),

    // Total projects
    supabase
      .from('pyra_projects')
      .select('id', { count: 'exact', head: true }),

    // Recent activity (last 10)
    supabase
      .from('pyra_activity_log')
      .select('id, action_type, username, display_name, target_path, details, created_at')
      .order('created_at', { ascending: false })
      .limit(10),

    // Unread notifications count
    supabase
      .from('pyra_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('recipient_username', username)
      .eq('is_read', false),

    // Storage used — only fetch file_size column (lightweight)
    supabase
      .from('pyra_file_index')
      .select('file_size')
      .not('file_size', 'is', null)
      .limit(10000),
  ]);

  // Calculate total storage from the lightweight query
  let storageUsed = 0;
  if (storageResult.data) {
    for (const file of storageResult.data) {
      storageUsed += file.file_size || 0;
    }
  }

  return apiSuccess({
    total_files: filesResult.count ?? 0,
    total_users: usersResult.count ?? 0,
    total_clients: clientsResult.count ?? 0,
    total_projects: projectsResult.count ?? 0,
    recent_activity: activityResult.data || [],
    unread_notifications: notificationsResult.count ?? 0,
    storage_used: storageUsed,
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
          .or(allPaths.map((p) => `file_path.like.${p}%`).join(','))
      : Promise.resolve({ count: 0, data: null, error: null }),
  ]);

  return apiSuccess({
    recent_activity: activityResult.data || [],
    unread_notifications: notificationsResult.count ?? 0,
    accessible_files: filesResult.count ?? 0,
    permitted_paths: allPaths,
  });
}
