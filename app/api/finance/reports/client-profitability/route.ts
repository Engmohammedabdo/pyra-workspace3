import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/* ── Helpers ────────────────────────────────────────── */

function startOfYear(): string {
  const d = new Date();
  return `${d.getFullYear()}-01-01`;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

/* ── GET /api/finance/reports/client-profitability ─── */

export async function GET(req: NextRequest) {
  const admin = await getApiAdmin();
  if (!admin) return apiForbidden();

  const supabase = createServiceRoleClient();
  const params = req.nextUrl.searchParams;

  const from = params.get('from') || startOfYear();
  const to = params.get('to') || today();

  try {
    // 1. Get all clients
    const { data: clients, error: clientErr } = await supabase
      .from('pyra_clients')
      .select('id, name, company');

    if (clientErr) throw clientErr;
    if (!clients || clients.length === 0) {
      return apiSuccess([]);
    }

    // 2. Get all paid invoices in range (with client_id)
    const { data: invoices, error: invErr } = await supabase
      .from('pyra_invoices')
      .select('client_id, amount_paid')
      .in('status', ['paid', 'partially_paid'])
      .gte('issue_date', from)
      .lte('issue_date', to);

    if (invErr) throw invErr;

    // 3. Get all projects (to map project -> client)
    const { data: projects, error: projErr } = await supabase
      .from('pyra_projects')
      .select('id, client_id');

    if (projErr) throw projErr;

    // Build a map: project_id -> client_id
    const projectToClient: Record<string, string> = {};
    (projects || []).forEach((p: { id: string; client_id: string | null }) => {
      if (p.client_id) {
        projectToClient[p.id] = p.client_id;
      }
    });

    // 4. Get all expenses in range (with project_id)
    const { data: expenses, error: expErr } = await supabase
      .from('pyra_expenses')
      .select('project_id, amount, vat_amount')
      .gte('expense_date', from)
      .lte('expense_date', to);

    if (expErr) throw expErr;

    // 5. Get contract counts per client
    const { data: contracts, error: ctrErr } = await supabase
      .from('pyra_contracts')
      .select('client_id');

    if (ctrErr) throw ctrErr;

    // Build contract count map
    const contractCounts: Record<string, number> = {};
    (contracts || []).forEach((c: { client_id: string | null }) => {
      if (c.client_id) {
        contractCounts[c.client_id] = (contractCounts[c.client_id] || 0) + 1;
      }
    });

    // 6. Aggregate revenue per client
    const revenueByClient: Record<string, number> = {};
    (invoices || []).forEach((inv: { client_id: string | null; amount_paid: number }) => {
      if (inv.client_id) {
        revenueByClient[inv.client_id] = (revenueByClient[inv.client_id] || 0) + Number(inv.amount_paid);
      }
    });

    // 7. Aggregate expenses per client (via project -> client mapping)
    const expensesByClient: Record<string, number> = {};
    (expenses || []).forEach((exp: { project_id: string | null; amount: number; vat_amount: number }) => {
      if (exp.project_id) {
        const clientId = projectToClient[exp.project_id];
        if (clientId) {
          expensesByClient[clientId] =
            (expensesByClient[clientId] || 0) + Number(exp.amount) + Number(exp.vat_amount);
        }
      }
    });

    // 8. Build result for each client with activity
    const result = clients
      .map((client: { id: string; name: string; company: string | null }) => {
        const revenue = revenueByClient[client.id] || 0;
        const clientExpenses = expensesByClient[client.id] || 0;
        const profit = revenue - clientExpenses;
        const margin = revenue > 0 ? Math.round((profit / revenue) * 10000) / 100 : 0;

        return {
          client_id: client.id,
          client_name: client.name,
          company: client.company,
          revenue: Math.round(revenue * 100) / 100,
          expenses: Math.round(clientExpenses * 100) / 100,
          profit: Math.round(profit * 100) / 100,
          margin,
          contract_count: contractCounts[client.id] || 0,
        };
      })
      .filter((c: { revenue: number; expenses: number }) => c.revenue > 0 || c.expenses > 0)
      .sort((a: { profit: number }, b: { profit: number }) => b.profit - a.profit);

    return apiSuccess(result);
  } catch (err) {
    console.error('Client profitability error:', err);
    return apiServerError();
  }
}
