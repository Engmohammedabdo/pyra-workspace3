import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiNotFound, apiForbidden, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { canAccessLead } from '@/lib/auth/lead-scope';

/**
 * GET /api/crm/leads/[id]
 *
 * Permission: leads.view
 * Scope: canAccessLead — admin or assigned_to == self.
 *
 * Returns: { lead, contracts, invoices, payments_summary, activity_count,
 *           follow_ups_pending, files_count }
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireApiPermission('leads.view');
    if (isApiError(auth)) return auth;

    const { id } = await params;
    const supabase = createServiceRoleClient();

    const allowed = await canAccessLead(supabase, auth.pyraUser.username, auth.pyraUser.role, id);
    if (!allowed) return apiForbidden('لا تملك صلاحية الوصول لهذا الـ Lead');

    const { data: lead, error } = await supabase
      .from('pyra_sales_leads')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('GET /api/crm/leads/[id] error:', error.message);
      return apiServerError();
    }
    if (!lead) return apiNotFound('Lead غير موجود');

    // Fan out the dependent reads in parallel.
    const [contractsRes, activityRes, followUpsRes] = await Promise.all([
      supabase
        .from('pyra_contracts')
        .select('id, title, status, contract_type, total_value, currency, start_date, end_date, retainer_amount, retainer_cycle, amount_billed, amount_collected')
        .eq('lead_id', id)
        .order('created_at', { ascending: false }),
      supabase
        .from('pyra_lead_activities')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', id),
      supabase
        .from('pyra_sales_follow_ups')
        .select('id', { count: 'exact', head: true })
        .eq('lead_id', id)
        .eq('status', 'pending'),
    ]);

    const contracts = contractsRes.data ?? [];
    const contractIds = contracts.map((c) => c.id);

    let invoices: Array<{ id: string; contract_id: string | null; client_id: string | null; total: number; status: string; due_date: string | null }> = [];
    let totalPaid = 0;
    if (contractIds.length > 0) {
      const { data: invs } = await supabase
        .from('pyra_invoices')
        .select('id, contract_id, client_id, total, status, due_date')
        .in('contract_id', contractIds);
      invoices = invs ?? [];

      // Cash-basis: total paid via pyra_payments joined by invoice_id.
      const invoiceIds = invoices.map((i) => i.id);
      if (invoiceIds.length > 0) {
        const { data: payments } = await supabase
          .from('pyra_payments')
          .select('amount, invoice_id')
          .in('invoice_id', invoiceIds);
        for (const p of payments ?? []) totalPaid += Number(p.amount) || 0;
      }
    }

    return apiSuccess({
      lead,
      contracts,
      invoices,
      payments_summary: {
        total_paid: totalPaid,
        currency: lead.expected_value_currency || 'AED',
      },
      activity_count: activityRes.count ?? 0,
      follow_ups_pending: followUpsRes.count ?? 0,
      files_count: 0, // v1 — files surfaced via the dedicated file-index hook elsewhere
    });
  } catch (err) {
    console.error('GET /api/crm/leads/[id] threw:', err);
    return apiServerError();
  }
}
