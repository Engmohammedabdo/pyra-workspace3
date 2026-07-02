import { getPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiUnauthorized, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';

// Safe subset of pyra_credit_notes columns for the portal list —
// internal fields (created_by, company branding, client contact copies) are never exposed.
const PORTAL_CREDIT_NOTE_LIST_FIELDS =
  'id, credit_note_number, invoice_id, reason, status, issue_date, currency, total, applied_amount, created_at';

/**
 * GET /api/portal/credit-notes
 * List all credit notes for the authenticated portal client.
 * Excludes drafts (a draft is an internal document the client must never see).
 */
export async function GET() {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const supabase = createServiceRoleClient();

    const { data: creditNotes, error } = await supabase
      .from('pyra_credit_notes')
      .select(PORTAL_CREDIT_NOTE_LIST_FIELDS)
      .eq('client_id', client.id)
      .neq('status', 'draft')
      .order('issue_date', { ascending: false });

    if (error) {
      console.error('Portal credit notes list error:', error);
      return apiServerError();
    }

    // Enrich with linked invoice numbers (one round trip, no N+1)
    const invoiceIds = [...new Set((creditNotes || []).filter(cn => cn.invoice_id).map(cn => cn.invoice_id))];
    const invoiceMap: Record<string, string> = {};

    if (invoiceIds.length > 0) {
      const { data: invoices } = await supabase
        .from('pyra_invoices')
        .select('id, invoice_number')
        .in('id', invoiceIds);

      for (const inv of invoices || []) {
        invoiceMap[inv.id] = inv.invoice_number;
      }
    }

    const enriched = (creditNotes || []).map(cn => ({
      ...cn,
      invoice_number: cn.invoice_id ? invoiceMap[cn.invoice_id] || null : null,
    }));

    return apiSuccess(enriched, { total: enriched.length });
  } catch {
    return apiServerError();
  }
}
