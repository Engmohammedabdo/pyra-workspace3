import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  active: { label: 'نشط', color: '#22c55e' },
  in_progress: { label: 'قيد التنفيذ', color: '#3b82f6' },
  review: { label: 'مراجعة', color: '#f59e0b' },
  completed: { label: 'مكتمل', color: '#10b981' },
  archived: { label: 'مؤرشف', color: '#6b7280' },
};

// =============================================================
// GET /api/dashboard/kpis/project-pipeline
// Project distribution by status for pipeline chart.
// Admin only.
// =============================================================
export async function GET(_request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();

    const statuses = Object.keys(STATUS_CONFIG);

    const results = await Promise.all(
      statuses.map(async (status) => {
        const { count } = await supabase
          .from('pyra_projects')
          .select('id', { count: 'exact', head: true })
          .eq('status', status);

        return {
          status,
          label: STATUS_CONFIG[status].label,
          count: count || 0,
          color: STATUS_CONFIG[status].color,
        };
      })
    );

    // Only return statuses with at least 1 project
    const filtered = results.filter((r) => r.count > 0);

    return apiSuccess(filtered);
  } catch (err) {
    console.error('GET /api/dashboard/kpis/project-pipeline error:', err);
    return apiServerError();
  }
}
