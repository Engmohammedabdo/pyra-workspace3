import { NextRequest } from 'next/server';
import { getApiAdmin } from '@/lib/api/auth';
import { apiSuccess, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// =============================================================
// GET /api/reports/clients
// Client analytics report with date range filtering.
// Admin only.
// =============================================================
export async function GET(request: NextRequest) {
  try {
    const admin = await getApiAdmin();
    if (!admin) return apiForbidden();

    const supabase = createServiceRoleClient();
    const url = new URL(request.url);

    const from = url.searchParams.get('from') || new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];
    const to = url.searchParams.get('to') || new Date().toISOString().split('T')[0];
    const toEnd = to + 'T23:59:59';

    const [
      totalClientsRes,
      activeClientsRes,
      newClientsRes,
      allClientsRes,
      invoicesRes,
      projectsRes,
    ] = await Promise.all([
      // Total clients
      supabase
        .from('pyra_clients')
        .select('id', { count: 'exact', head: true }),

      // Active clients
      supabase
        .from('pyra_clients')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true),

      // New clients in period
      supabase
        .from('pyra_clients')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', from)
        .lte('created_at', toEnd),

      // All clients for top clients and distribution
      supabase
        .from('pyra_clients')
        .select('id, name, company')
        .limit(1000),

      // All invoices (non-draft, non-cancelled) for revenue calculation
      supabase
        .from('pyra_invoices')
        .select('client_id, total')
        .not('status', 'in', '("draft","cancelled")'),

      // All projects for projects_count per client
      supabase
        .from('pyra_projects')
        .select('client_id')
        .not('client_id', 'is', null),
    ]);

    const allClients = allClientsRes.data || [];
    const invoices = invoicesRes.data || [];
    const projects = projectsRes.data || [];

    // Build per-client invoice totals
    const clientInvoiceMap: Record<string, { count: number; total: number }> = {};
    for (const inv of invoices) {
      if (!inv.client_id) continue;
      if (!clientInvoiceMap[inv.client_id]) {
        clientInvoiceMap[inv.client_id] = { count: 0, total: 0 };
      }
      clientInvoiceMap[inv.client_id].count += 1;
      clientInvoiceMap[inv.client_id].total += inv.total || 0;
    }

    // Build per-client project counts
    const clientProjectMap: Record<string, number> = {};
    for (const p of projects) {
      if (!p.client_id) continue;
      clientProjectMap[p.client_id] = (clientProjectMap[p.client_id] || 0) + 1;
    }

    // Top 10 clients by total invoice amount
    const clientsWithRevenue = allClients.map((c: { id: string; name: string; company: string }) => ({
      id: c.id,
      name: c.name,
      company: c.company,
      total_invoices: clientInvoiceMap[c.id]?.count || 0,
      total_revenue: clientInvoiceMap[c.id]?.total || 0,
      projects_count: clientProjectMap[c.id] || 0,
    }));

    clientsWithRevenue.sort(
      (a: { total_revenue: number }, b: { total_revenue: number }) => b.total_revenue - a.total_revenue
    );
    const topClients = clientsWithRevenue.slice(0, 10);

    // Client distribution by company
    const companyMap: Record<string, number> = {};
    for (const c of allClients) {
      const company = (c as { company: string }).company || 'غير محدد';
      companyMap[company] = (companyMap[company] || 0) + 1;
    }
    const clientDistribution = Object.entries(companyMap)
      .map(([company, count]) => ({ company, count }))
      .sort((a, b) => b.count - a.count);

    return apiSuccess({
      total_clients: totalClientsRes.count ?? 0,
      active_clients: activeClientsRes.count ?? 0,
      new_clients_this_period: newClientsRes.count ?? 0,
      top_clients: topClients,
      client_distribution: clientDistribution,
    });
  } catch (err) {
    console.error('GET /api/reports/clients error:', err);
    return apiServerError();
  }
}
