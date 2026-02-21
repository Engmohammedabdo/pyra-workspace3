import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';

// =============================================================
// GET /api/dashboard/kpis
// Main KPI data with current-month vs previous-month comparison.
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();

    const now = new Date();
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .split('T')[0];
    const currentMonthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      .toISOString()
      .split('T')[0];
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      .toISOString()
      .split('T')[0];
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0)
      .toISOString()
      .split('T')[0];

    const [
      currentRevenueRes,
      prevRevenueRes,
      activeProjectsRes,
      prevActiveProjectsRes,
      pendingInvoicesRes,
      overdueInvoicesRes,
      storageRes,
      storageSettingRes,
    ] = await Promise.all([
      // Current month revenue (payments)
      supabase
        .from('pyra_payments')
        .select('amount')
        .gte('payment_date', currentMonthStart)
        .lte('payment_date', currentMonthEnd),

      // Previous month revenue (payments)
      supabase
        .from('pyra_payments')
        .select('amount')
        .gte('payment_date', prevMonthStart)
        .lte('payment_date', prevMonthEnd),

      // Current active projects
      supabase
        .from('pyra_projects')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'in_progress', 'review']),

      // Previous month active projects snapshot — use created_at as proxy
      supabase
        .from('pyra_projects')
        .select('id', { count: 'exact', head: true })
        .in('status', ['active', 'in_progress', 'review', 'completed'])
        .lte('created_at', prevMonthEnd + 'T23:59:59'),

      // Pending invoices (status = sent)
      supabase
        .from('pyra_invoices')
        .select('id, amount_due')
        .eq('status', 'sent'),

      // Overdue invoices
      supabase
        .from('pyra_invoices')
        .select('id, amount_due')
        .eq('status', 'overdue'),

      // Total storage bytes
      supabase
        .from('pyra_file_index')
        .select('file_size'),

      // Max storage setting
      supabase
        .from('pyra_settings')
        .select('value')
        .eq('key', 'max_storage_gb')
        .maybeSingle(),
    ]);

    // Revenue calculations
    const currentRevenue = (currentRevenueRes.data || []).reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );
    const prevRevenue = (prevRevenueRes.data || []).reduce(
      (sum, p) => sum + (p.amount || 0),
      0
    );
    const revenueChangePercent = prevRevenue > 0
      ? parseFloat((((currentRevenue - prevRevenue) / prevRevenue) * 100).toFixed(1))
      : currentRevenue > 0 ? 100 : 0;

    // Active projects
    const activeProjectsCurrent = activeProjectsRes.count ?? 0;
    const activeProjectsPrev = prevActiveProjectsRes.count ?? 0;
    const projectsChangePercent = activeProjectsPrev > 0
      ? parseFloat((((activeProjectsCurrent - activeProjectsPrev) / activeProjectsPrev) * 100).toFixed(1))
      : activeProjectsCurrent > 0 ? 100 : 0;

    // Pending invoices
    const pendingInvoices = pendingInvoicesRes.data || [];
    const pendingAmount = pendingInvoices.reduce(
      (sum, inv) => sum + (inv.amount_due || 0),
      0
    );

    // Overdue invoices
    const overdueInvoices = overdueInvoicesRes.data || [];
    const overdueAmount = overdueInvoices.reduce(
      (sum, inv) => sum + (inv.amount_due || 0),
      0
    );

    // Storage percentage
    const totalStorageBytes = (storageRes.data || []).reduce(
      (sum, f) => sum + (f.file_size || 0),
      0
    );
    const maxStorageGb = storageSettingRes.data?.value
      ? parseFloat(storageSettingRes.data.value)
      : 50;
    const maxStorageBytes = maxStorageGb * 1024 * 1024 * 1024;
    const storagePercent = maxStorageBytes > 0
      ? parseFloat(((totalStorageBytes / maxStorageBytes) * 100).toFixed(1))
      : 0;

    return apiSuccess({
      revenue: {
        current: currentRevenue,
        previous: prevRevenue,
        change_percent: revenueChangePercent,
      },
      active_projects: {
        current: activeProjectsCurrent,
        previous: activeProjectsPrev,
        change_percent: projectsChangePercent,
      },
      pending_invoices: {
        current: pendingInvoices.length,
        amount: pendingAmount,
      },
      overdue_invoices: {
        current: overdueInvoices.length,
        amount: overdueAmount,
      },
      storage_percent: storagePercent,
    });
  } catch (err) {
    console.error('GET /api/dashboard/kpis error:', err);
    return apiServerError();
  }
}
