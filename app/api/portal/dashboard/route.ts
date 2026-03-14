import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { buildClientProjectScope } from '@/lib/supabase/scopes';
import { escapePostgrestValue } from '@/lib/utils/path';

/**
 * GET /api/portal/dashboard
 *
 * Returns the client's dashboard data:
 *  - client info (name, company, last_login_at)
 *  - stats: { activeProjects, pendingApprovals, unreadNotifications, totalFiles }
 *  - recentProjects (last 5)
 *  - recentNotifications (last 5)
 *  - recentActivity (last 10 from activity log)
 *  - chartData (weekly activity grouped by day)
 *  - projectProgress (approved files / total files per project)
 */
export async function GET() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();

    // Client project scope: client_id match OR legacy (null client_id + company match)
    const projectScope = buildClientProjectScope(client.id, client.company);

    // ── Active projects count ─────────────────────────
    const { count: activeProjectsCount } = await supabase
      .from('pyra_projects')
      .select('id', { count: 'exact', head: true })
      .or(projectScope)
      .in('status', ['active', 'in_progress', 'review']);

    // ── Project IDs for this client ────────────────────
    const { data: clientProjects } = await supabase
      .from('pyra_projects')
      .select('id, name, status')
      .or(projectScope);

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
      .or(projectScope)
      .order('updated_at', { ascending: false })
      .limit(5);

    // ── Recent notifications (last 5) ─────────────────
    const { data: recentNotifications } = await supabase
      .from('pyra_client_notifications')
      .select('id, type, message, is_read, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false })
      .limit(5);

    // ── Recent activity (last 10 from activity log) ───
    const { data: recentActivity } = await supabase
      .from('pyra_activity_log')
      .select('id, action_type, display_name, target_path, details, created_at')
      .or(`username.eq.${escapePostgrestValue(`client:${client.id}`)},username.eq.${escapePostgrestValue(client.name)}`)
      .order('created_at', { ascending: false })
      .limit(10);

    // ── Weekly activity chart data (last 7 days) ──────
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: weeklyActivity } = await supabase
      .from('pyra_activity_log')
      .select('created_at')
      .or(`username.eq.${escapePostgrestValue(`client:${client.id}`)},username.eq.${escapePostgrestValue(client.name)}`)
      .gte('created_at', sevenDaysAgo.toISOString());

    // Group by day
    const dayNames = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const chartData = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      const dayEnd = new Date(dayStart.getTime() + 86400000);
      const count = (weeklyActivity || []).filter((a) => {
        const t = new Date(a.created_at).getTime();
        return t >= dayStart.getTime() && t < dayEnd.getTime();
      }).length;
      chartData.push({
        day: dayNames[date.getDay()],
        count,
      });
    }

    // ── Financial summary (invoices) ──────────────────
    const { data: clientInvoices } = await supabase
      .from('pyra_invoices')
      .select('total_amount, amount_paid, status')
      .eq('client_id', client.id)
      .neq('status', 'draft');

    const financialSummary = {
      totalInvoiced: 0,
      totalPaid: 0,
      totalRemaining: 0,
      invoiceCount: (clientInvoices || []).length,
      pendingCount: 0,
    };

    for (const inv of clientInvoices || []) {
      const total = Number(inv.total_amount) || 0;
      const paid = Number(inv.amount_paid) || 0;
      financialSummary.totalInvoiced += total;
      financialSummary.totalPaid += paid;
      financialSummary.totalRemaining += total - paid;
      if (inv.status === 'pending' || inv.status === 'sent' || inv.status === 'overdue') {
        financialSummary.pendingCount++;
      }
    }

    // ── Project progress (approved / total files) ─────
    // If project status is "completed" → progress = 100%
    // Otherwise, calculate based on approved file approvals
    const projectProgress: Array<{
      id: string;
      name: string;
      status: string;
      totalFiles: number;
      approvedFiles: number;
      progress: number;
    }> = [];

    if (projectIds.length > 0) {
      for (const pid of projectIds.slice(0, 5)) {
        const project = clientProjects?.find((p) => p.id === pid);
        if (!project) continue;

        const { count: totalCount } = await supabase
          .from('pyra_project_files')
          .select('id', { count: 'exact', head: true })
          .eq('project_id', pid)
          .eq('client_visible', true);

        const total = totalCount || 0;
        const projectStatus = (project as { status?: string }).status || 'active';

        // Completed projects → 100% progress
        if (projectStatus === 'completed') {
          projectProgress.push({
            id: pid,
            name: project.name,
            status: projectStatus,
            totalFiles: total,
            approvedFiles: total,
            progress: 100,
          });
          continue;
        }

        // Active/in_progress projects → calculate from file approvals
        const { data: pidFiles } = await supabase
          .from('pyra_project_files')
          .select('id')
          .eq('project_id', pid)
          .eq('client_visible', true);

        const pidFileIds = (pidFiles || []).map((f) => f.id);

        let approvedCount = 0;
        if (pidFileIds.length > 0) {
          const { count } = await supabase
            .from('pyra_file_approvals')
            .select('id', { count: 'exact', head: true })
            .in('file_id', pidFileIds)
            .eq('status', 'approved');
          approvedCount = count || 0;
        }

        projectProgress.push({
          id: pid,
          name: project.name,
          status: projectStatus,
          totalFiles: total,
          approvedFiles: approvedCount,
          progress: total ? Math.round((approvedCount / total) * 100) : 0,
        });
      }
    }

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
      financialSummary,
      recentProjects: recentProjects || [],
      recentNotifications: recentNotifications || [],
      recentActivity: recentActivity || [],
      chartData,
      projectProgress,
    });
  } catch (err) {
    console.error('GET /api/portal/dashboard error:', err);
    return apiServerError();
  }
}
