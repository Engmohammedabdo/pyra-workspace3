import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/dashboard
 *
 * Returns the client's dashboard data:
 *  - client info (name, company, last_login_at)
 *  - stats: { activeProjects, pendingApprovals, unreadNotifications, totalFiles }
 *  - recentProjects (last 5)
 *  - recentNotifications (last 5)
 */
export async function GET() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();

    // ── Active projects count ─────────────────────────
    const { count: activeProjectsCount } = await supabase
      .from('pyra_projects')
      .select('id', { count: 'exact', head: true })
      .eq('client_company', client.company)
      .in('status', ['active', 'in_progress', 'review']);

    // ── Project IDs for this client ────────────────────
    const { data: clientProjects } = await supabase
      .from('pyra_projects')
      .select('id')
      .eq('client_company', client.company);

    const projectIds = (clientProjects || []).map((p) => p.id);

    // ── Pending approvals count ───────────────────────
    let pendingApprovalsCount = 0;
    let totalFilesCount = 0;
    if (projectIds.length > 0) {
      // Get file IDs belonging to this client's projects
      const { data: projectFiles } = await supabase
        .from('pyra_project_files')
        .select('id')
        .in('project_id', projectIds);

      const fileIds = (projectFiles || []).map((f) => f.id);
      totalFilesCount = fileIds.length;

      if (fileIds.length > 0) {
        const { count } = await supabase
          .from('pyra_file_approvals')
          .select('id', { count: 'exact', head: true })
          .in('file_id', fileIds)
          .eq('status', 'pending');

        pendingApprovalsCount = count || 0;
      }
    }

    // ── Unread notifications count ────────────────────
    const { count: unreadNotificationsCount } = await supabase
      .from('pyra_client_notifications')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('is_read', false);

    // ── Recent projects (last 5) ──────────────────────
    const { data: recentProjects } = await supabase
      .from('pyra_projects')
      .select('id, name, status, updated_at')
      .eq('client_company', client.company)
      .order('updated_at', { ascending: false })
      .limit(5);

    // ── Recent notifications (last 5) ─────────────────
    const { data: recentNotifications } = await supabase
      .from('pyra_client_notifications')
      .select('id, type, message, is_read, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(5);

    return apiSuccess({
      client: {
        name: client.name,
        company: client.company,
        last_login_at: client.last_login_at,
      },
      stats: {
        activeProjects: activeProjectsCount || 0,
        pendingApprovals: pendingApprovalsCount,
        unreadNotifications: unreadNotificationsCount || 0,
        totalFiles: totalFilesCount,
      },
      recentProjects: recentProjects || [],
      recentNotifications: recentNotifications || [],
    });
  } catch (err) {
    console.error('GET /api/portal/dashboard error:', err);
    return apiServerError();
  }
}
