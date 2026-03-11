import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiUnauthorized, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CONTRACT_FIELDS, CONTRACT_ITEM_FIELDS, RECURRING_INVOICE_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portal/contracts/[id]
 * Get a single contract with billing history for retainer contracts.
 * Only returns non-draft contracts belonging to the portal client.
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // 1. Fetch contract
    const { data: contract, error } = await supabase
      .from('pyra_contracts')
      .select(CONTRACT_FIELDS)
      .eq('id', id)
      .eq('client_id', client.id)
      .neq('status', 'draft')
      .maybeSingle();

    if (error) {
      console.error('Portal contract detail error:', error);
      return apiServerError();
    }
    if (!contract) return apiNotFound('العقد غير موجود');

    // 2. Enrich with project name
    let project_name: string | null = null;
    if (contract.project_id) {
      const { data: project } = await supabase
        .from('pyra_projects')
        .select('name')
        .eq('id', contract.project_id)
        .single();
      if (project) project_name = project.name;
    }

    // 3. Fetch contract items (scope of work)
    const { data: allItems } = await supabase
      .from('pyra_contract_items')
      .select(CONTRACT_ITEM_FIELDS)
      .eq('contract_id', id)
      .order('sort_order', { ascending: true });

    const parentItems = (allItems || []).filter((i: { parent_id: string | null }) => !i.parent_id);
    const contractItems = parentItems.map((parent: { id: string }) => ({
      ...parent,
      children: (allItems || [])
        .filter((i: { parent_id: string | null }) => i.parent_id === parent.id)
        .sort((a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order),
    }));

    // 4. For retainer contracts, include billing history
    let billing_history = null;

    if (contract.contract_type === 'retainer') {
      const { data: recurringInvoice } = await supabase
        .from('pyra_recurring_invoices')
        .select(RECURRING_INVOICE_FIELDS)
        .eq('contract_id', id)
        .maybeSingle();

      const { data: invoices } = await supabase
        .from('pyra_invoices')
        .select('id, invoice_number, status, issue_date, due_date, total, amount_paid, amount_due, currency')
        .eq('contract_id', id)
        .neq('status', 'draft')
        .order('issue_date', { ascending: false });

      const invoiceList = invoices || [];
      const totalBilled = invoiceList.reduce((sum, inv) => sum + (inv.total || 0), 0);
      const totalPaid = invoiceList.reduce((sum, inv) => sum + (inv.amount_paid || 0), 0);

      billing_history = {
        recurring_invoice: recurringInvoice ? {
          status: recurringInvoice.status,
          billing_cycle: recurringInvoice.billing_cycle,
          next_generation_date: recurringInvoice.next_generation_date,
        } : null,
        invoices: invoiceList,
        summary: {
          total_billed: totalBilled,
          total_paid: totalPaid,
          total_remaining: totalBilled - totalPaid,
          invoice_count: invoiceList.length,
        },
      };
    }

    return apiSuccess({
      ...contract,
      project_name,
      items: contractItems,
      billing_history,
    });
  } catch {
    return apiServerError();
  }
}
