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
    const { hasPermission } = await import('@/lib/auth/rbac');
    const canViewAll = hasPermission(auth.pyraUser.rolePermissions, 'dashboard.view') &&
      (hasPermission(auth.pyraUser.rolePermissions, 'users.view') || auth.pyraUser.role === 'admin');

    if (canViewAll) {
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

  // Week boundaries for timesheet
  const now = new Date();
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday
  startOfWeek.setHours(0, 0, 0, 0);
  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setDate(startOfWeek.getDate() + 6);
  endOfWeek.setHours(23, 59, 59, 999);
  const weekStart = startOfWeek.toISOString().split('T')[0];
  const weekEnd = endOfWeek.toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];

  // Run queries in parallel
  const [
    activityResult,
    notificationsResult,
    filesResult,
    myTasksResult,
    overdueTasksResult,
    weekTimesheetResult,
    unreadAnnouncementsResult,
    leaveBalanceResult,
    pendingLeaveResult,
  ] = await Promise.all([
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

    // My assigned tasks (total)
    supabase
      .from('pyra_task_assignees')
      .select('id', { count: 'exact', head: true })
      .eq('username', pyraUser.username),

    // Overdue tasks
    supabase
      .from('pyra_task_assignees')
      .select('task_id, pyra_tasks!inner(due_date, column_id, pyra_board_columns!inner(is_done_column))')
      .eq('username', pyraUser.username)
      .lt('pyra_tasks.due_date', today)
      .eq('pyra_tasks.pyra_board_columns.is_done_column', false),

    // Timesheet hours this week
    supabase
      .from('pyra_timesheets')
      .select('hours')
      .eq('username', pyraUser.username)
      .gte('date', weekStart)
      .lte('date', weekEnd),

    // Unread announcements
    supabase
      .from('pyra_announcements')
      .select('id', { count: 'exact', head: true })
      .or(`expires_at.is.null,expires_at.gt.${now.toISOString()}`),

    // Leave balance (current year)
    supabase
      .from('pyra_leave_balances')
      .select('annual_total, annual_used, sick_total, sick_used, personal_total, personal_used')
      .eq('username', pyraUser.username)
      .eq('year', now.getFullYear())
      .maybeSingle(),

    // Pending leave requests count
    supabase
      .from('pyra_leave_requests')
      .select('id', { count: 'exact', head: true })
      .eq('username', pyraUser.username)
      .eq('status', 'pending'),
  ]);

  // Calculate read announcements
  const totalAnnouncements = unreadAnnouncementsResult.count ?? 0;
  let unreadAnnouncements = totalAnnouncements;
  if (totalAnnouncements > 0) {
    const { count: readCount } = await supabase
      .from('pyra_announcement_reads')
      .select('announcement_id', { count: 'exact', head: true })
      .eq('username', pyraUser.username);
    unreadAnnouncements = Math.max(0, totalAnnouncements - (readCount ?? 0));
  }

  // Sum timesheet hours
  const weekHours = (weekTimesheetResult.data || []).reduce(
    (sum, entry) => sum + (parseFloat(String(entry.hours)) || 0),
    0
  );

  // Leave balance with defaults
  const lb = leaveBalanceResult.data || {
    annual_total: 30, annual_used: 0,
    sick_total: 15, sick_used: 0,
    personal_total: 5, personal_used: 0,
  };

  return apiSuccess({
    recent_activity: activityResult.data || [],
    unread_notifications: notificationsResult.count ?? 0,
    accessible_files: filesResult.count ?? 0,
    permitted_paths: allPaths,
    // Employee-specific stats
    my_tasks_count: myTasksResult.count ?? 0,
    my_tasks_overdue: overdueTasksResult.data?.length ?? 0,
    my_hours_this_week: Math.round(weekHours * 10) / 10,
    unread_announcements: unreadAnnouncements,
    leave_balance: {
      annual_remaining: (lb.annual_total ?? 30) - (lb.annual_used ?? 0),
      sick_remaining: (lb.sick_total ?? 15) - (lb.sick_used ?? 0),
      personal_remaining: (lb.personal_total ?? 5) - (lb.personal_used ?? 0),
    },
    pending_leave_count: pendingLeaveResult.count ?? 0,
  });
}
