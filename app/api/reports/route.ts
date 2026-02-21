import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/reports
// Overview summary combining key metrics (last 30 days)
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();

    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 86400000).toISOString();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [
      projectsTotalRes,
      projectsActiveRes,
      projectsCompletedRes,
      clientsTotalRes,
      clientsActiveRes,
      clientsNewRes,
      revenueRes,
      outstandingRes,
      overdueRes,
      filesRes,
      storageSizeRes,
      teamRes,
    ] = await Promise.all([
      // Projects: total
      supabase
        .from('pyra_projects')
        .select('id', { count: 'exact', head: true }),

      // Projects: active (status = 'active' or 'in_progress')
      supabase
        .from('pyra_projects')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'in_progress']),

      // Projects: completed this month
      supabase
        .from('pyra_projects')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed')
        .gte('updated_at', monthStart),

      // Clients: total
      supabase
        .from('pyra_clients')
        .select('id', { count: 'exact', head: true }),

      // Clients: active
      supabase
        .from('pyra_clients')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),

      // Clients: new this month
      supabase
        .from('pyra_clients')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart),

      // Revenue: total payments this month
      supabase
        .from('pyra_payments')
        .select('amount')
        .gte('payment_date', monthStart.split('T')[0]),

      // Outstanding invoices (sent/partially_paid/overdue)
      supabase
        .from('pyra_invoices')
        .select('amount_due')
        .in('status', ['sent', 'partially_paid', 'overdue']),

      // Overdue invoices
      supabase
        .from('pyra_invoices')
        .select('amount_due')
        .eq('status', 'overdue'),

      // Storage: total files
      supabase
        .from('pyra_file_index')
        .select('id', { count: 'exact', head: true })
        .eq('is_folder', false),

      // Storage: total size
      supabase
        .from('pyra_file_index')
        .select('file_size')
        .eq('is_folder', false),

      // Team: total members
      supabase
        .from('pyra_users')
        .select('id', { count: 'exact', head: true }),
    ]);

    const totalRevenue = (revenueRes.data || []).reduce(
      (sum: number, p: { amount: number }) => sum + (p.amount || 0),
      0
    );
    const totalOutstanding = (outstandingRes.data || []).reduce(
      (sum: number, i: { amount_due: number }) => sum + (i.amount_due || 0),
      0
    );
    const totalOverdue = (overdueRes.data || []).reduce(
      (sum: number, i: { amount_due: number }) => sum + (i.amount_due || 0),
      0
    );
    const totalSizeBytes = (storageSizeRes.data || []).reduce(
      (sum: number, f: { file_size: number }) => sum + (f.file_size || 0),
      0
    );

    return apiSuccess({
      projects: {
        total: projectsTotalRes.count ?? 0,
        active: projectsActiveRes.count ?? 0,
        completed_this_month: projectsCompletedRes.count ?? 0,
      },
      clients: {
        total: clientsTotalRes.count ?? 0,
        active: clientsActiveRes.count ?? 0,
        new_this_month: clientsNewRes.count ?? 0,
      },
      revenue: {
        total: totalRevenue,
        outstanding: totalOutstanding,
        overdue: totalOverdue,
      },
      storage: {
        total_files: filesRes.count ?? 0,
        total_size_bytes: totalSizeBytes,
      },
      team: {
        total_members: teamRes.count ?? 0,
      },
    });
  } catch (err) {
    console.error('GET /api/reports error:', err);
    return apiServerError();
  }
}
