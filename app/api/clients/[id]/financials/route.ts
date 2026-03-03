import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

/**
 * GET /api/clients/[id]/financials
 * Aggregated financial summary for a client.
 * Includes invoices, quotes, projects, and contracts counts + totals.
 * Admin only.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireApiPermission('clients.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    // ── Fetch client to get company name ────────────
    const { data: client, error: clientError } = await supabase
      .from('pyra_clients')
      .select('id, company')
      .eq('id', id)
      .maybeSingle();

    if (clientError) {
      console.error('Client fetch error:', clientError);
      return apiServerError();
    }

    if (!client) {
      return apiNotFound('العميل غير موجود');
    }

    // ── Run all financial queries in parallel ───────
    const [invoicesRes, quotesRes, projectsRes, contractsRes] = await Promise.all([
      // 1. Invoices summary
      supabase
        .from('pyra_invoices')
        .select('id, total, status, currency')
        .eq('client_id', id),

      // 2. Quotes summary
      supabase
        .from('pyra_quotes')
        .select('id, total')
        .eq('client_id', id),

      // 3. Projects (match by company name)
      supabase
        .from('pyra_projects')
        .select('id, status')
        .eq('client_company', client.company),

      // 4. Contracts (table may not exist yet — handle gracefully)
      supabase
        .from('pyra_contracts')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', id)
        .then((res) => (res.error ? { count: 0, data: null, error: null } : res)),
    ]);

    // ── Calculate invoice totals ────────────────────
    const invoices = invoicesRes.data || [];
    const totalInvoiced = invoices.reduce((sum, inv) => sum + (inv.total || 0), 0);
    const totalPaid = invoices
      .filter((inv) => inv.status === 'paid')
      .reduce((sum, inv) => sum + (inv.total || 0), 0);
    const outstanding = totalInvoiced - totalPaid;

    // ── Calculate quote totals ──────────────────────
    const quotes = quotesRes.data || [];
    const quotesTotal = quotes.reduce((sum, q) => sum + (q.total || 0), 0);

    // ── Calculate project counts ────────────────────
    const projects = projectsRes.data || [];
    const activeProjects = projects.filter(
      (p) => !['completed', 'archived'].includes(p.status)
    ).length;

    // ── Build response ──────────────────────────────
    return apiSuccess({
      invoices: {
        count: invoices.length,
        total_invoiced: totalInvoiced,
        total_paid: totalPaid,
        outstanding,
      },
      quotes: {
        count: quotes.length,
        total: quotesTotal,
      },
      projects: {
        count: projects.length,
        active_count: activeProjects,
      },
      contracts: {
        count: contractsRes.count ?? 0,
      },
    });
  } catch (err) {
    console.error('GET /api/clients/[id]/financials error:', err);
    return apiServerError();
  }
}
