import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { resolveUserScope } from '@/lib/auth/scope';

// =============================================================
// GET /api/reports
// Overview summary combining key metrics (last 30 days)
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('reports.view');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const supabase = createServiceRoleClient();

    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    // Non-admin with no accessible resources → return zeroed metrics
    if (!scope.isAdmin && scope.clientIds.length === 0 && scope.projectIds.length === 0) {
      return apiSuccess({
        projects: { total: 0, active: 0, completed_this_month: 0 },
        clients: { total: 0, active: 0, new_this_month: 0 },
        revenue: { total: 0, outstanding: 0, overdue: 0 },
        storage: { total_files: 0, total_size_bytes: 0 },
        team: { total_members: 0 },
      });
    }

    // --- Build scoped queries ---

    // Projects: total
    let projectsTotalQ = supabase
      .from('pyra_projects')
      .select('id', { count: 'exact', head: true });
    if (!scope.isAdmin) {
      projectsTotalQ = projectsTotalQ.in('id', scope.projectIds);
    }

    // Projects: active (status = 'active' or 'in_progress')
    let projectsActiveQ = supabase
      .from('pyra_projects')
      .select('id', { count: 'exact', head: true })
      .in('status', ['active', 'in_progress']);
    if (!scope.isAdmin) {
      projectsActiveQ = projectsActiveQ.in('id', scope.projectIds);
    }

    // Projects: completed this month
    let projectsCompletedQ = supabase
      .from('pyra_projects')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('updated_at', monthStart);
    if (!scope.isAdmin) {
      projectsCompletedQ = projectsCompletedQ.in('id', scope.projectIds);
    }

    // Clients: total
    let clientsTotalQ = supabase
      .from('pyra_clients')
      .select('id', { count: 'exact', head: true });
    if (!scope.isAdmin) {
      clientsTotalQ = clientsTotalQ.in('id', scope.clientIds);
    }

    // Clients: active
    let clientsActiveQ = supabase
      .from('pyra_clients')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true);
    if (!scope.isAdmin) {
      clientsActiveQ = clientsActiveQ.in('id', scope.clientIds);
    }

    // Clients: new this month
    let clientsNewQ = supabase
      .from('pyra_clients')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', monthStart);
    if (!scope.isAdmin) {
      clientsNewQ = clientsNewQ.in('id', scope.clientIds);
    }

    // Outstanding invoices (sent/partially_paid/overdue)
    let outstandingQ = supabase
      .from('pyra_invoices')
      .select('amount_due')
      .in('status', ['sent', 'partially_paid', 'overdue']);
    if (!scope.isAdmin) {
      outstandingQ = outstandingQ.in('client_id', scope.clientIds);
    }

    // Overdue invoices
    let overdueQ = supabase
      .from('pyra_invoices')
      .select('amount_due')
      .eq('status', 'overdue');
    if (!scope.isAdmin) {
      overdueQ = overdueQ.in('client_id', scope.clientIds);
    }

    const [
      projectsTotalRes,
      projectsActiveRes,
      projectsCompletedRes,
      clientsTotalRes,
      clientsActiveRes,
      clientsNewRes,
      outstandingRes,
      overdueRes,
      filesRes,
      storageSizeRes,
      teamRes,
    ] = await Promise.all([
      projectsTotalQ,
      projectsActiveQ,
      projectsCompletedQ,
      clientsTotalQ,
      clientsActiveQ,
      clientsNewQ,
      outstandingQ,
      overdueQ,

      // Storage: total files (unscoped — storage-stats handles its own scoping)
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

    // Revenue: payments this month — requires scoped invoice IDs for non-admins
    let totalRevenue = 0;
    if (!scope.isAdmin && scope.clientIds.length > 0) {
      // First get scoped invoice IDs for this month
      const { data: scopedInvoices } = await supabase
        .from('pyra_invoices')
        .select('id')
        .in('client_id', scope.clientIds);

      const scopedInvoiceIds = (scopedInvoices || []).map((inv) => inv.id);
      if (scopedInvoiceIds.length > 0) {
        const { data: payments } = await supabase
          .from('pyra_payments')
          .select('amount')
          .gte('payment_date', monthStart.split('T')[0])
          .in('invoice_id', scopedInvoiceIds);

        totalRevenue = (payments || []).reduce(
          (sum: number, p: { amount: number }) => sum + (p.amount || 0),
          0
        );
      }
    } else if (scope.isAdmin) {
      const { data: payments } = await supabase
        .from('pyra_payments')
        .select('amount')
        .gte('payment_date', monthStart.split('T')[0]);

      totalRevenue = (payments || []).reduce(
        (sum: number, p: { amount: number }) => sum + (p.amount || 0),
        0
      );
    }

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
