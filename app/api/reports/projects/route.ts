import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/reports/projects
// Project performance report with date range filtering.
// Admin only.
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
      allProjectsRes,
      completedRes,
      completedInRangeRes,
      overdueRes,
      recentCompletionsRes,
    ] = await Promise.all([
      // All projects (for grouping by status)
      supabase
        .from('pyra_projects')
        .select('id, status'),

      // Completed projects (for avg completion days)
      supabase
        .from('pyra_projects')
        .select('id, created_at, updated_at')
        .eq('status', 'completed'),

      // Completed in date range
      supabase
        .from('pyra_projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('updated_at', from)
        .lte('updated_at', toEnd),

      // Overdue projects (past deadline, not completed)
      supabase
        .from('pyra_projects')
        .select('id', { count: 'exact', head: true })
        .not('status', 'eq', 'completed')
        .not('status', 'eq', 'archived')
        .lt('deadline', new Date().toISOString().split('T')[0]),

      // Recent completions (last 5)
      supabase
        .from('pyra_projects')
        .select('id, name, client_company, updated_at')
        .eq('status', 'completed')
        .order('updated_at', { ascending: false })
        .limit(5),
    ]);

    // Total projects
    const allProjects = allProjectsRes.data || [];
    const totalProjects = allProjects.length;

    // Group by status
    const statusMap: Record<string, number> = {};
    for (const p of allProjects) {
      statusMap[p.status] = (statusMap[p.status] || 0) + 1;
    }
    const byStatus = Object.entries(statusMap).map(([status, count]) => ({
      status,
      count,
    }));

    // Average completion days
    const completedProjects = completedRes.data || [];
    let avgCompletionDays = 0;
    if (completedProjects.length > 0) {
      const totalDays = completedProjects.reduce((sum: number, p: { created_at: string; updated_at: string }) => {
        const created = new Date(p.created_at).getTime();
        const updated = new Date(p.updated_at).getTime();
        return sum + (updated - created) / 86400000;
      }, 0);
      avgCompletionDays = Math.round((totalDays / completedProjects.length) * 10) / 10;
    }

    // Recent completions formatted
    const recentCompletions = (recentCompletionsRes.data || []).map(
      (p: { id: string; name: string; client_company: string; updated_at: string }) => ({
        id: p.id,
        name: p.name,
        client_company: p.client_company,
        completed_at: p.updated_at,
      })
    );

    return apiSuccess({
      total_projects: totalProjects,
      by_status: byStatus,
      completed_this_period: completedInRangeRes.count ?? 0,
      avg_completion_days: avgCompletionDays,
      overdue_projects: overdueRes.count ?? 0,
      recent_completions: recentCompletions,
    });
  } catch (err) {
    console.error('GET /api/reports/projects error:', err);
    return apiServerError();
  }
}
