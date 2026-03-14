import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';

/**
 * GET /api/portal/recurring-invoices
 * List recurring invoices belonging to the client.
 * Shows schedule, next generation date, and linked invoices count.
 */
export async function GET() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();

    // Fetch recurring invoices for this client
    const { data: recurring, error } = await supabase
      .from('pyra_recurring_invoices')
      .select('id, status, billing_cycle, next_generation_date, start_date, end_date, contract_id, total, currency, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich with contract name and generated invoice count
    const enriched = [];
    for (const ri of recurring || []) {
      let contract_title: string | null = null;
      let project_name: string | null = null;

      if (ri.contract_id) {
        const { data: contract } = await supabase
          .from('pyra_contracts')
          .select('title, project_id')
          .eq('id', ri.contract_id)
          .maybeSingle();
        if (contract) {
          contract_title = contract.title;
          if (contract.project_id) {
            const { data: project } = await supabase
              .from('pyra_projects')
              .select('name')
              .eq('id', contract.project_id)
              .maybeSingle();
            project_name = project?.name || null;
          }
        }
      }

      // Count generated invoices
      const { count: invoiceCount } = await supabase
        .from('pyra_invoices')
        .select('id', { count: 'exact', head: true })
        .eq('recurring_invoice_id', ri.id)
        .neq('status', 'draft');

      enriched.push({
        ...ri,
        contract_title,
        project_name,
        generated_count: invoiceCount || 0,
      });
    }

    return apiSuccess(enriched);
  } catch (err) {
    console.error('GET /api/portal/recurring-invoices error:', err);
    return apiServerError();
  }
}
