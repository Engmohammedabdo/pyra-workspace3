import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLeadScopeFilter } from '@/lib/auth/lead-scope';
import { PIPELINE_STAGE_ORDER, PIPELINE_STAGE_LABELS_AR } from '@/lib/constants/statuses';

/**
 * GET /api/crm/dashboard/funnel
 *
 * Permission: crm_reports.view
 * Scope: per user (admin sees all; sales agent sees own).
 *
 * Returns one row per stg_* stage with count + total_value (sum expected_value).
 */
export async function GET() {
  try {
    const auth = await requireApiPermission('crm_reports.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const scope = getLeadScopeFilter(auth.pyraUser.role, auth.pyraUser.username);

    let q = supabase
      .from('pyra_sales_leads')
      .select('stage_id, expected_value, expected_value_currency');
    if (scope) q = q.eq(scope.column, scope.value);
    const { data, error } = await q;
    if (error) {
      console.error('GET /api/crm/dashboard/funnel error:', error.message);
      return apiServerError();
    }

    const buckets = new Map<string, { count: number; total_value: number }>();
    for (const stg of PIPELINE_STAGE_ORDER) buckets.set(stg, { count: 0, total_value: 0 });

    // Dominant currency (by summed expected_value) to label total_value honestly
    // instead of a hardcoded 'AED' in the UI.
    const currencyTotals: Record<string, number> = {};
    for (const row of data ?? []) {
      const val = Number(row.expected_value) || 0;
      const cur = (row as { expected_value_currency?: string | null }).expected_value_currency || 'AED';
      currencyTotals[cur] = (currencyTotals[cur] || 0) + val;
      const sid = row.stage_id as string | null;
      if (!sid || !buckets.has(sid)) continue;
      const b = buckets.get(sid)!;
      b.count += 1;
      b.total_value += val;
    }
    const currency = Object.entries(currencyTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'AED';

    const stages = PIPELINE_STAGE_ORDER.map((id) => ({
      stage_id: id,
      label_ar: PIPELINE_STAGE_LABELS_AR[id],
      count: buckets.get(id)!.count,
      total_value: buckets.get(id)!.total_value,
    }));

    return apiSuccess({ stages, currency });
  } catch (err) {
    console.error('GET /api/crm/dashboard/funnel threw:', err);
    return apiServerError();
  }
}
