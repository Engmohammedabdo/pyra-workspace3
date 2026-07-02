import { getPortalSession } from '@/lib/portal/auth';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';

type RecurringItem = { description?: string; quantity?: number; rate?: number };

/**
 * GET /api/portal/recurring-invoices
 * List recurring-invoice schedules belonging to the client.
 *
 * Finance audit 2026-07-02 (F-PORTAL-REC): the previous select referenced
 * columns that do not exist on pyra_recurring_invoices (start_date, end_date,
 * total) — PostgREST 42703 → the portal page silently showed empty forever.
 * The per-cycle amount is DERIVED from the items jsonb (sum of qty × rate),
 * and the generated-invoice count is resolved via the linked contract.
 */
export async function GET() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();

    const { data: recurring, error } = await supabase
      .from('pyra_recurring_invoices')
      .select('id, title, status, billing_cycle, next_generation_date, last_generated_at, contract_id, items, currency, created_at')
      .eq('client_id', client.id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Enrich with contract/project names and generated invoice count
    const enriched = [];
    for (const ri of recurring || []) {
      let contract_title: string | null = null;
      let project_name: string | null = null;
      let generatedCount = 0;

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

        // Generated invoices carry the contract link (there is no
        // recurring_invoice_id column on pyra_invoices)
        const { count } = await supabase
          .from('pyra_invoices')
          .select('id', { count: 'exact', head: true })
          .eq('contract_id', ri.contract_id)
          .neq('status', 'draft');
        generatedCount = count || 0;
      }

      // Per-cycle amount = sum of template items (qty × rate)
      const itemsArr: RecurringItem[] = Array.isArray(ri.items) ? ri.items : [];
      const total = Math.round(
        itemsArr.reduce((sum, it) => sum + (Number(it.quantity) || 1) * (Number(it.rate) || 0), 0) * 100
      ) / 100;

      enriched.push({
        id: ri.id,
        title: ri.title,
        status: ri.status,
        billing_cycle: ri.billing_cycle,
        next_generation_date: ri.next_generation_date,
        last_generated_at: ri.last_generated_at,
        contract_id: ri.contract_id,
        currency: ri.currency,
        created_at: ri.created_at,
        total,
        contract_title,
        project_name,
        generated_count: generatedCount,
      });
    }

    return apiSuccess(enriched);
  } catch (err) {
    console.error('GET /api/portal/recurring-invoices error:', err);
    return apiServerError();
  }
}
