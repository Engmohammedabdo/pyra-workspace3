import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLeadScopeFilter } from '@/lib/auth/lead-scope';
import { isCrmPipelineStageId } from '@/lib/crm/pipeline-stages';

/**
 * GET /api/crm/dashboard/funnel
 *
 * Permission: crm_reports.view
 * Scope: per user (admin sees all; sales agent sees own).
 *
 * Returns one row per ACTIVE CRM stage (canonical stg_* AND custom ps_* created
 * from settings), in the admin's configured sort_order, with count + total_value
 * (sum expected_value). Previously the funnel bucketed against a HARDCODED stage
 * list (PIPELINE_STAGE_ORDER), so custom stages — and any leads sitting in them —
 * were silently dropped from the viz. It now mirrors the pipeline board's stage
 * source so a newly-added stage shows up here too.
 */
export async function GET() {
  try {
    const auth = await requireApiPermission('crm_reports.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const scope = getLeadScopeFilter(auth.pyraUser.role, auth.pyraUser.username);

    // Actual CRM stages (same source + filter as /api/crm/pipeline-stages), in
    // the admin-configured order. Custom ps_* stages land wherever their
    // sort_order puts them (new ones default to 99 → the end).
    const { data: stageRows, error: stageErr } = await supabase
      .from('pyra_sales_pipeline_stages')
      .select('id, name, name_ar, color, sort_order')
      .order('sort_order', { ascending: true });
    if (stageErr) {
      console.error('GET /api/crm/dashboard/funnel stages error:', stageErr.message);
      return apiServerError();
    }
    const stageDefs = (stageRows ?? []).filter((s) => isCrmPipelineStageId(s.id));

    let q = supabase
      .from('pyra_sales_leads')
      .select('stage_id, expected_value, expected_value_currency')
      // Exclude archived (soft-deleted) leads — matches the pipeline + KPIs
      // surfaces; without it the funnel silently counted archived leads.
      .is('archived_at', null);
    if (scope) q = q.eq(scope.column, scope.value);
    // Explicit .range so the per-stage count/sum below sees EVERY matching row:
    // the implicit PostgREST 1000-row default would silently truncate the funnel
    // as lead volume grows. Only 3 short columns are projected → cheap.
    const { data, error } = await q.range(0, 99999);
    if (error) {
      console.error('GET /api/crm/dashboard/funnel error:', error.message);
      return apiServerError();
    }

    const buckets = new Map<string, { count: number; total_value: number }>();
    for (const s of stageDefs) buckets.set(s.id, { count: 0, total_value: 0 });

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

    const stages = stageDefs.map((s) => ({
      stage_id: s.id,
      name: s.name as string,
      name_ar: s.name_ar as string,
      color: (s.color as string) || 'gray',
      // Back-compat: keep label_ar (older cached clients read it).
      label_ar: s.name_ar as string,
      count: buckets.get(s.id)!.count,
      total_value: buckets.get(s.id)!.total_value,
    }));

    return apiSuccess({ stages, currency });
  } catch (err) {
    console.error('GET /api/crm/dashboard/funnel threw:', err);
    return apiServerError();
  }
}
