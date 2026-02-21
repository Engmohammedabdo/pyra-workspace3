import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';

// =============================================================
// GET /api/dashboard/kpis/alerts
// Smart alerts for the admin dashboard.
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();
    const now = new Date().toISOString();

    const [
      overdueRes,
      storageRes,
      storageSettingRes,
      lateProjectsRes,
      pendingApprovalsRes,
    ] = await Promise.all([
      // Overdue invoices
      supabase
        .from('pyra_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'overdue'),

      // Total storage
      supabase
        .from('pyra_file_index')
        .select('file_size'),

      // Max storage setting
      supabase
        .from('pyra_settings')
        .select('value')
        .eq('key', 'max_storage_gb')
        .maybeSingle(),

      // Projects past deadline (deadline passed, not completed/archived)
      supabase
        .from('pyra_projects')
        .select('id', { count: 'exact', head: true })
        .lt('deadline', now)
        .not('status', 'in', '("completed","archived")'),

      // Pending approvals (table may not exist yet — handle gracefully)
      supabase
        .from('pyra_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then((res) => (res.error ? { count: 0, data: null, error: null } : res)),
    ]);

    const alerts: { type: 'warning' | 'danger' | 'info'; message: string; link: string }[] = [];

    // 1. Overdue invoices → danger
    const overdueCount = overdueRes.count ?? 0;
    if (overdueCount > 0) {
      alerts.push({
        type: 'danger',
        message: `لديك ${overdueCount} فواتير متأخرة`,
        link: '/dashboard/invoices?status=overdue',
      });
    }

    // 2. Storage > 80% → warning
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

    if (storagePercent > 80) {
      alerts.push({
        type: 'warning',
        message: `مساحة التخزين ${storagePercent}%`,
        link: '/dashboard/files',
      });
    }

    // 3. Projects past deadline → warning
    const lateProjectsCount = lateProjectsRes.count ?? 0;
    if (lateProjectsCount > 0) {
      alerts.push({
        type: 'warning',
        message: `${lateProjectsCount} مشاريع متأخرة`,
        link: '/dashboard/projects',
      });
    }

    // 4. Pending approvals → info
    const pendingApprovalsCount = pendingApprovalsRes.count ?? 0;
    if (pendingApprovalsCount > 0) {
      alerts.push({
        type: 'info',
        message: `${pendingApprovalsCount} موافقات معلقة`,
        link: '/dashboard/approvals',
      });
    }

    return apiSuccess(alerts);
  } catch (err) {
    console.error('GET /api/dashboard/kpis/alerts error:', err);
    return apiServerError();
  }
}
