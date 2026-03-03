import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiServerError } from '@/lib/api/response';

// =============================================================
// Alert item — detail row inside an expandable alert card.
// =============================================================
interface AlertItem {
  id: string;
  title: string;
  subtitle?: string;
  href: string;
}

// =============================================================
// GET /api/dashboard/kpis/alerts
// Smart alerts for the admin dashboard with rich item details.
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const auth = await requireApiPermission('dashboard.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const now = new Date();
    const nowISO = now.toISOString();

    const [
      overdueRes,
      storageRes,
      storageSettingRes,
      lateProjectsRes,
      pendingApprovalsRes,
    ] = await Promise.all([
      // Overdue invoices — fetch top 5 with details
      supabase
        .from('pyra_invoices')
        .select('id, invoice_number, client_name, client_company, total, due_date, currency', { count: 'exact' })
        .eq('status', 'overdue')
        .order('due_date', { ascending: true })
        .limit(5),

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

      // Projects past deadline — fetch top 5 with details
      supabase
        .from('pyra_projects')
        .select('id, name, deadline, status', { count: 'exact' })
        .lt('deadline', nowISO)
        .not('status', 'in', '("completed","archived")')
        .order('deadline', { ascending: true })
        .limit(5),

      // Pending approvals (table may not exist yet — handle gracefully)
      supabase
        .from('pyra_approvals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending')
        .then((res) => (res.error ? { count: 0, data: null, error: null } : res)),
    ]);

    const alerts: { type: 'warning' | 'danger' | 'info'; message: string; link: string; items?: AlertItem[] }[] = [];

    // 1. Overdue invoices → danger (with item details)
    const overdueCount = overdueRes.count ?? 0;
    if (overdueCount > 0) {
      const overdueItems: AlertItem[] = (overdueRes.data || []).map((inv) => {
        const clientLabel = inv.client_name || inv.client_company || '';
        const totalFormatted = new Intl.NumberFormat('ar-SA', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(inv.total || 0);
        const currencyLabel = inv.currency === 'USD' ? '$' : inv.currency === 'EUR' ? '€' : 'د.إ';
        return {
          id: inv.id,
          title: `فاتورة #${inv.invoice_number}`,
          subtitle: clientLabel ? `${clientLabel} — ${totalFormatted} ${currencyLabel}` : `${totalFormatted} ${currencyLabel}`,
          href: `/dashboard/invoices/${inv.id}`,
        };
      });

      alerts.push({
        type: 'danger',
        message: overdueCount === 1
          ? 'لديك فاتورة متأخرة'
          : overdueCount === 2
            ? 'لديك فاتورتان متأخرتان'
            : `لديك ${overdueCount} فواتير متأخرة`,
        link: '/dashboard/invoices?status=overdue',
        items: overdueItems,
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
        link: '/dashboard/storage',
      });
    }

    // 3. Projects past deadline → warning (with item details)
    const lateProjectsCount = lateProjectsRes.count ?? 0;
    if (lateProjectsCount > 0) {
      const lateItems: AlertItem[] = (lateProjectsRes.data || []).map((proj) => {
        const deadlineDate = new Date(proj.deadline);
        const diffMs = now.getTime() - deadlineDate.getTime();
        const daysLate = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
        return {
          id: proj.id,
          title: proj.name,
          subtitle: daysLate === 1
            ? 'متأخر يوم واحد'
            : daysLate === 2
              ? 'متأخر يومين'
              : `متأخر ${daysLate} يوم`,
          href: `/dashboard/projects/${proj.id}`,
        };
      });

      alerts.push({
        type: 'warning',
        message: lateProjectsCount === 1
          ? 'مشروع متأخر'
          : lateProjectsCount === 2
            ? 'مشروعان متأخران'
            : `${lateProjectsCount} مشاريع متأخرة`,
        link: '/dashboard/projects?status=overdue',
        items: lateItems,
      });
    }

    // 4. Pending approvals → info
    const pendingApprovalsCount = pendingApprovalsRes.count ?? 0;
    if (pendingApprovalsCount > 0) {
      alerts.push({
        type: 'info',
        message: pendingApprovalsCount === 1
          ? 'موافقة معلقة'
          : pendingApprovalsCount === 2
            ? 'موافقتان معلقتان'
            : `${pendingApprovalsCount} موافقات معلقة`,
        link: '/dashboard/reviews',
      });
    }

    return apiSuccess(alerts);
  } catch (err) {
    console.error('GET /api/dashboard/kpis/alerts error:', err);
    return apiServerError();
  }
}
