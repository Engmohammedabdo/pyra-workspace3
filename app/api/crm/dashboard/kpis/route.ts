import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLeadScopeFilter } from '@/lib/auth/lead-scope';
import { PIPELINE_ACTIVE_STAGES, PIPELINE_STAGE_IDS } from '@/lib/constants/statuses';

/**
 * GET /api/crm/dashboard/kpis
 *
 * Permission: crm_reports.view
 * Scope: scoped per user (admin sees all; sales agent sees own).
 *
 * Query: period = 'this_month' (default) | 'last_30d' | 'quarter'
 *
 * Cash-basis: closed_won.total_aed comes from pyra_payments.payment_date,
 * not invoice issue date. (Existing repo accounting rule.)
 */
function periodWindow(period: string | null): { start: Date; end: Date; label: string } {
  const now = new Date();
  const end = now;
  if (period === 'last_30d') {
    const start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return { start, end, label: 'last_30d' };
  }
  if (period === 'quarter') {
    const start = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
    return { start, end, label: 'quarter' };
  }
  // default: this_month
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  return { start, end, label: 'this_month' };
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('crm_reports.view');
    if (isApiError(auth)) return auth;

    const supabase = createServiceRoleClient();
    const sp = request.nextUrl.searchParams;
    const { start, end, label } = periodWindow(sp.get('period'));
    const startISO = start.toISOString();
    const endISO = end.toISOString();

    const scope = getLeadScopeFilter(auth.pyraUser.role, auth.pyraUser.username);

    // Base query for "leads I can see"
    const scopedLeadIdsPromise = (async () => {
      let q = supabase.from('pyra_sales_leads').select('id, stage_id, expected_value, expected_value_currency, win_probability, is_converted, converted_at');
      if (scope) q = q.eq(scope.column, scope.value);
      const { data } = await q;
      return data ?? [];
    })();

    const allLeads = await scopedLeadIdsPromise;

    // Dominant currency across the scoped leads (by summed expected_value) — used
    // to label the money KPIs honestly instead of a hardcoded 'AED'. (v1.1: full
    // per-currency breakdown once mixed-currency pipelines exist — all data is
    // AED today, so the single-total-with-dominant-label is exact.)
    const currencyTotals: Record<string, number> = {};
    for (const l of allLeads) {
      const cur = (l as { expected_value_currency?: string | null }).expected_value_currency || 'AED';
      currencyTotals[cur] = (currencyTotals[cur] || 0) + (Number(l.expected_value) || 0);
    }
    const currency = Object.entries(currencyTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'AED';

    // ── Pipeline value: active stages, my leads
    const activeLeads = allLeads.filter(
      (l): l is typeof l & { expected_value: number | null } =>
        PIPELINE_ACTIVE_STAGES.includes(l.stage_id as (typeof PIPELINE_ACTIVE_STAGES)[number]),
    );
    const pipelineTotal = activeLeads.reduce((acc, l) => acc + (Number(l.expected_value) || 0), 0);

    // ── Closed Won (count) in period (using converted_at)
    const closedWonInPeriod = allLeads.filter(
      (l) =>
        l.stage_id === PIPELINE_STAGE_IDS.CLOSED_WON &&
        l.converted_at &&
        new Date(l.converted_at) >= start &&
        new Date(l.converted_at) <= end,
    );
    const closedWonCount = closedWonInPeriod.length;

    // ── Closed Won (cash basis): payments received in period for invoices linked
    //   to contracts whose lead is mine and is_converted=true.
    let closedWonTotal = 0;
    const myLeadIds = allLeads.map((l) => l.id);
    if (myLeadIds.length > 0) {
      const { data: contracts } = await supabase
        .from('pyra_contracts')
        .select('id')
        .in('lead_id', myLeadIds);
      const contractIds = (contracts ?? []).map((c) => c.id);
      if (contractIds.length > 0) {
        const { data: invs } = await supabase
          .from('pyra_invoices')
          .select('id')
          .in('contract_id', contractIds);
        const invoiceIds = (invs ?? []).map((i) => i.id);
        if (invoiceIds.length > 0) {
          const { data: payments } = await supabase
            .from('pyra_payments')
            .select('amount, payment_date')
            .in('invoice_id', invoiceIds)
            .gte('payment_date', startISO)
            .lte('payment_date', endISO);
          for (const p of payments ?? []) closedWonTotal += Number(p.amount) || 0;
        }
      }
    }

    // ── Conversion rate
    const totalSeen = allLeads.length || 1; // avoid /0
    const totalConverted = allLeads.filter((l) => l.is_converted).length;
    const conversionRate = (totalConverted / totalSeen) * 100;

    // ── Avg deal size (excluding 0/null expected values)
    const dealsWithValue = allLeads.filter((l) => Number(l.expected_value) > 0);
    const avgDealSize = dealsWithValue.length
      ? dealsWithValue.reduce((acc, l) => acc + Number(l.expected_value), 0) / dealsWithValue.length
      : 0;

    // ── MRR: active retainer contracts (status=active, retainer_amount > 0)
    let mrr = 0;
    if (myLeadIds.length > 0) {
      const { data: retainers } = await supabase
        .from('pyra_contracts')
        .select('retainer_amount, retainer_cycle, status')
        .in('lead_id', myLeadIds)
        .eq('status', 'active');
      for (const c of retainers ?? []) {
        const amt = Number(c.retainer_amount) || 0;
        if (!amt) continue;
        const cycle = (c.retainer_cycle || 'monthly').toLowerCase();
        if (cycle === 'monthly') mrr += amt;
        else if (cycle === 'quarterly') mrr += amt / 3;
        else if (cycle === 'yearly' || cycle === 'annual') mrr += amt / 12;
      }
    }

    // ── Forecast close value
    const forecastValue = activeLeads.reduce((acc, l) => {
      const v = Number(l.expected_value) || 0;
      const p = Number(l.win_probability) || 0;
      return acc + (v * p) / 100;
    }, 0);

    return apiSuccess(
      {
        // `currency` labels every money KPI below (was hardcoded 'AED' in the UI).
        currency,
        pipeline_value: { total_aed: pipelineTotal, count: activeLeads.length, trend_pct: 0 },
        closed_won: { total_aed: closedWonTotal, count: closedWonCount, vs_target_pct: 0 },
        conversion_rate: { current_pct: Math.round(conversionRate * 10) / 10, vs_prior_pct: 0 },
        avg_deal_size: { aed: Math.round(avgDealSize), trend: 'flat' as const },
        monthly_recurring_revenue: Math.round(mrr),
        forecast_close_value: Math.round(forecastValue),
      },
      { period: label, start: startISO, end: endISO },
    );
  } catch (err) {
    console.error('GET /api/crm/dashboard/kpis threw:', err);
    return apiServerError();
  }
}
