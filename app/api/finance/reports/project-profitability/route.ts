import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { toAED } from '@/lib/utils/currency';

/* ── GET /api/finance/reports/project-profitability ── */

export async function GET(req: NextRequest) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

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

    // 2. Fetch expenses (optionally date-filtered)
    let expQuery = supabase
      .from('pyra_expenses')
      .select('project_id, amount, vat_amount, currency, expense_date')
      .not('project_id', 'is', null);

    if (from) expQuery = expQuery.gte('expense_date', from);
    if (to) expQuery = expQuery.lte('expense_date', to);

    const { data: expenses, error: expErr } = await expQuery;
    if (expErr) throw expErr;

    // 3. Fetch paid/partially-paid invoices (optionally date-filtered)
    //    Invoices link to projects by project_name matching project.name
    let invQuery = supabase
      .from('pyra_invoices')
      .select('project_name, client_id, amount_paid, issue_date')
      .in('status', ['paid', 'partially_paid']);

    if (from) invQuery = invQuery.gte('issue_date', from);
    if (to) invQuery = invQuery.lte('issue_date', to);

    const { data: invoices, error: invErr } = await invQuery;
    if (invErr) throw invErr;

    // 4. Build lookup maps
    // Expenses by project_id (converted to AED)
    const expByProject: Record<string, number> = {};
    for (const exp of expenses || []) {
      const pid = exp.project_id as string;
      expByProject[pid] = (expByProject[pid] || 0) + toAED(Number(exp.amount) + Number(exp.vat_amount), exp.currency as string);
    }

    // Revenue by project name (invoices use project_name string)
    const revByProjectName: Record<string, number> = {};
    for (const inv of invoices || []) {
      const pname = (inv.project_name || '') as string;
      if (pname) {
        revByProjectName[pname] = (revByProjectName[pname] || 0) + Number(inv.amount_paid);
      }
    }

    // 5. Build per-project profitability
    // Only include projects that have expenses or invoices
    const projectResults: {
      project_id: string;
      project_name: string;
      budget: number | null;
      revenue: number;
      expenses: number;
      profit: number;
      margin: number;
      budget_utilization: number | null;
    }[] = [];

    let totalRevenue = 0;
    let totalExpenses = 0;

    for (const proj of allProjects) {
      const projExpenses = expByProject[proj.id] || 0;
      const projRevenue = revByProjectName[proj.name] || 0;

      // Skip projects with no financial activity
      if (projExpenses === 0 && projRevenue === 0) continue;

      const profit = projRevenue - projExpenses;
      const margin = projRevenue > 0 ? Math.round((profit / projRevenue) * 10000) / 100 : 0;
      const budget = proj.budget ? Number(proj.budget) : null;
      const budgetUtilization = budget && budget > 0
        ? Math.round((projExpenses / budget) * 10000) / 100
        : null;

      totalRevenue += projRevenue;
      totalExpenses += projExpenses;

      projectResults.push({
        project_id: proj.id,
        project_name: proj.name,
        budget,
        revenue: Math.round(projRevenue * 100) / 100,
        expenses: Math.round(projExpenses * 100) / 100,
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
