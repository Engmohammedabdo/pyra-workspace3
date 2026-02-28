import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiUnauthorized, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { INVOICE_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portal/invoices/[id]
 * Get a single invoice with items and payments for the authenticated portal client.
 * Draft invoices are excluded.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: invoice, error } = await supabase
      .from('pyra_invoices')
      .select(INVOICE_FIELDS)
      .eq('id', id)
      .eq('client_id', client.id)
      .neq('status', 'draft')
      .maybeSingle();

    if (error) {
      console.error('Portal invoice detail error:', error);
      return apiServerError();
    }
    if (!invoice) return apiNotFound('الفاتورة غير موجودة');

    // Get items
    const { data: items } = await supabase
      .from('pyra_invoice_items')
      .select('id, invoice_id, sort_order, description, quantity, rate, amount, created_at')
      .eq('invoice_id', id)
      .order('sort_order', { ascending: true });

    // Get payments (limited fields for portal)
    const { data: payments } = await supabase
      .from('pyra_payments')
      .select('id, amount, payment_date, method, created_at')
      .eq('invoice_id', id)
      .order('payment_date', { ascending: false });

    // Get contract context if invoice is linked to a milestone
    let contract_summary = null;
    const { data: milestone } = await supabase
      .from('pyra_contract_milestones')
      .select('contract_id, title')
      .eq('invoice_id', id)
      .maybeSingle();

    if (milestone?.contract_id) {
      const { data: contract } = await supabase
        .from('pyra_contracts')
        .select('id, title, total_value, currency, amount_billed, amount_collected')
        .eq('id', milestone.contract_id)
        .maybeSingle();

      if (contract) {
        // Fetch all milestones for this contract
        const { data: allMilestones } = await supabase
          .from('pyra_contract_milestones')
          .select('id, title, amount, status, invoice_id')
          .eq('contract_id', contract.id)
          .order('sort_order', { ascending: true });

        // Get invoice numbers for invoiced milestones
        const invoicedMilestoneIds = (allMilestones || [])
          .filter((m: { invoice_id: string | null }) => m.invoice_id)
          .map((m: { invoice_id: string | null }) => m.invoice_id as string);

        let invoiceNumbers: Record<string, string> = {};
        if (invoicedMilestoneIds.length > 0) {
          const { data: linkedInvoices } = await supabase
            .from('pyra_invoices')
            .select('id, invoice_number')
            .in('id', invoicedMilestoneIds);
          if (linkedInvoices) {
            invoiceNumbers = Object.fromEntries(
              linkedInvoices.map((inv: { id: string; invoice_number: string }) => [inv.id, inv.invoice_number])
            );
          }
        }

        contract_summary = {
          contract_id: contract.id,
          contract_title: contract.title,
          contract_total: contract.total_value,
          contract_currency: contract.currency || 'AED',
          total_billed: contract.amount_billed || 0,
          total_collected: contract.amount_collected || 0,
          remaining: (contract.total_value || 0) - (contract.amount_billed || 0),
          milestones: (allMilestones || []).map((m: { id: string; title: string; amount: number; status: string; invoice_id: string | null }) => ({
            id: m.id,
            title: m.title,
            amount: m.amount,
            status: m.status,
            invoice_id: m.invoice_id,
            invoice_number: m.invoice_id ? invoiceNumbers[m.invoice_id] || null : null,
          })),
        };
      }
    }

    return apiSuccess({ ...invoice, items: items || [], payments: payments || [], contract_summary });
  } catch (err) {
    console.error('GET /api/portal/invoices/[id] error:', err);
    return apiServerError();
  }
}
