import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { toAED } from '@/lib/utils/currency';
import { EXPENSE_STATUS } from '@/lib/constants/statuses';

/* ── GET /api/finance/reports/project-profitability ── */

export async function GET(req: NextRequest) {
  const auth = await requireApiPermission('finance.view');
  if (isApiError(auth)) return auth;

  const supabase = createServiceRoleClient();
  const params = req.nextUrl.searchParams;

  const from = params.get('from') || '';
  const to = params.get('to') || '';

  try {
    // 1. Fetch all projects with budget
    const { data: allProjects, error: projErr } = await supabase
      .from('pyra_projects')
      .select('id, name, budget, client_id');

    if (projErr) throw projErr;
    if (!allProjects || allProjects.length === 0) {
      return apiSuccess({ projects: [], totals: { revenue: 0, expenses: 0, profit: 0, margin: 0 } });
    }

    // 1b. Fetch client names for display
    const clientIds = [...new Set(allProjects.map((p) => p.client_id).filter(Boolean))];
    const clientMap = new Map<string, string>();
    if (clientIds.length > 0) {
      const { data: clients } = await supabase
        .from('pyra_clients')
        .select('id, name')
        .in('id', clientIds);
      for (const c of clients || []) {
        clientMap.set(c.id, c.name);
      }
    }

    // 2. Fetch expenses (approved only, optionally date-filtered)
    let expQuery = supabase
      .from('pyra_expenses')
      .select('project_id, amount, vat_amount, currency, expense_date')
      .eq('status', EXPENSE_STATUS.APPROVED)
      .not('project_id', 'is', null);

    if (from) expQuery = expQuery.gte('expense_date', from);
    if (to) expQuery = expQuery.lte('expense_date', to);

    const { data: expenses, error: expErr } = await expQuery;
    if (expErr) throw expErr;

    // 3. Fetch payments (cash-basis: revenue by payment_date)
    let payQuery = supabase
      .from('pyra_payments')
      .select('amount, invoice_id, payment_date');

    if (from) payQuery = payQuery.gte('payment_date', from);
    if (to) payQuery = payQuery.lte('payment_date', to);

    const { data: paymentsRaw, error: payErr } = await payQuery;
    if (payErr) throw payErr;

    // Get project_id/project_name + currency for each payment's invoice
    // (Batch 4: payments carry no currency — convert per invoice currency)
    const payInvoiceIds = [...new Set((paymentsRaw || []).map((p: { invoice_id: string }) => p.invoice_id).filter(Boolean))];
    const invoiceProjectMap: Record<string, { project_id: string | null; project_name: string | null; currency: string }> = {};
    if (payInvoiceIds.length > 0) {
      const { data: invProjects } = await supabase
        .from('pyra_invoices')
        .select('id, project_id, project_name, currency')
        .in('id', payInvoiceIds);
      for (const inv of invProjects || []) {
        invoiceProjectMap[inv.id] = {
          project_id: inv.project_id,
          project_name: inv.project_name,
          currency: inv.currency || 'AED',
        };
      }
    }

    // 3b. Fetch timesheets for labor cost calculation
    let tsQuery = supabase
      .from('pyra_timesheets')
      .select('project_id, hours, hourly_rate, date')
      .not('project_id', 'is', null);

    if (from) tsQuery = tsQuery.gte('date', from);
    if (to) tsQuery = tsQuery.lte('date', to);

    const { data: timesheets, error: tsErr } = await tsQuery;
    if (tsErr) throw tsErr;

    // 4. Build lookup maps
    // Expenses by project_id (converted to AED)
    const expByProject: Record<string, number> = {};
    for (const exp of expenses || []) {
      const pid = exp.project_id as string;
      expByProject[pid] = (expByProject[pid] || 0) + toAED(Number(exp.amount) + Number(exp.vat_amount), exp.currency as string);
    }

    // Labor cost by project_id from timesheets
    const laborByProject: Record<string, number> = {};
    for (const ts of timesheets || []) {
      const pid = ts.project_id as string;
      const cost = Number(ts.hours || 0) * Number(ts.hourly_rate || 0);
      laborByProject[pid] = (laborByProject[pid] || 0) + cost;
    }

    // Revenue by project_id (preferred) and project_name (fallback)
    // Build a name→id map for fallback matching
    const nameToId = new Map<string, string>();
    for (const proj of allProjects) {
      nameToId.set(proj.name, proj.id);
    }

    const revByProject: Record<string, number> = {};
    for (const pay of paymentsRaw || []) {
      const invInfo = invoiceProjectMap[(pay as { invoice_id: string }).invoice_id];
      if (!invInfo) continue;
      let pid: string | null = invInfo.project_id;
      // Fallback: match project_name to project.name
      if (!pid && invInfo.project_name) {
        pid = nameToId.get(invInfo.project_name) || null;
      }
      if (pid) {
        revByProject[pid] =
          (revByProject[pid] || 0) +
          toAED(Number((pay as { amount: number }).amount || 0), invInfo.currency);
      }
    }

    // 5. Build per-project profitability
    // Only include projects that have expenses, invoices, or labor
    const projectResults: {
      project_id: string;
      project_name: string;
      client_name: string | null;
      budget: number | null;
      revenue: number;
      expenses: number;
      labor_cost: number;
      profit: number;
      margin: number;
      budget_utilization: number | null;
    }[] = [];

    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const proj of allProjects) {
      const projExpenses = expByProject[proj.id] || 0;
      const projLabor = laborByProject[proj.id] || 0;
      const projRevenue = revByProject[proj.id] || 0;

      // Skip projects with no financial activity
      if (projExpenses === 0 && projRevenue === 0 && projLabor === 0) continue;

      const totalCost = projExpenses + projLabor;
      const profit = projRevenue - totalCost;
      const margin = projRevenue > 0 ? Math.round((profit / projRevenue) * 10000) / 100 : 0;
      const budget = proj.budget ? Number(proj.budget) : null;
      const budgetUtilization = budget && budget > 0
        ? Math.round((totalCost / budget) * 10000) / 100
        : null;

      totalRevenue += projRevenue;
      totalExpenses += totalCost;

      projectResults.push({
        project_id: proj.id,
        project_name: proj.name,
        client_name: proj.client_id ? clientMap.get(proj.client_id) || null : null,
        budget,
        revenue: Math.round(projRevenue * 100) / 100,
        expenses: Math.round(projExpenses * 100) / 100,
        labor_cost: Math.round(projLabor * 100) / 100,
        profit: Math.round(profit * 100) / 100,
        margin,
        budget_utilization: budgetUtilization,
      });
    }

    // Sort by profit descending
    projectResults.sort((a, b) => b.profit - a.profit);

    const totalProfit = totalRevenue - totalExpenses;
    const totalMargin = totalRevenue > 0
      ? Math.round((totalProfit / totalRevenue) * 10000) / 100
      : 0;

    return apiSuccess({
      projects: projectResults,
      totals: {
        revenue: Math.round(totalRevenue * 100) / 100,
        expenses: Math.round(totalExpenses * 100) / 100,
        profit: Math.round(totalProfit * 100) / 100,
        margin: totalMargin,
      },
    });
  } catch (err) {
    console.error('Project profitability report error:', err);
    return apiServerError();
  }
}
