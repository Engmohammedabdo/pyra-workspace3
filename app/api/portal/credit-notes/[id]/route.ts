import { NextRequest } from 'next/server';
import { getPortalSession } from '@/lib/portal/auth';
import { apiSuccess, apiUnauthorized, apiNotFound, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { CREDIT_NOTE_ITEM_FIELDS } from '@/lib/supabase/fields';

type RouteContext = { params: Promise<{ id: string }> };

// Safe subset of pyra_credit_notes columns for the portal detail view —
// adds document breakdown (subtotal/tax/notes) over the list fields,
// still excludes internal fields (created_by, company branding, client contact copies).
const PORTAL_CREDIT_NOTE_DETAIL_FIELDS =
  'id, credit_note_number, invoice_id, reason, status, issue_date, currency, subtotal, tax_rate, tax_amount, total, applied_amount, notes, created_at';

/**
 * GET /api/portal/credit-notes/[id]
 * Get a single credit note with its line items.
 * Only returns non-draft credit notes belonging to the portal client (IDOR-proof).
 */
export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const client = await getPortalSession();
    if (!client) return apiUnauthorized();

    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    // 1. Fetch credit note — scoped to the client on the fetch itself
    const { data: creditNote, error } = await supabase
      .from('pyra_credit_notes')
      .select(PORTAL_CREDIT_NOTE_DETAIL_FIELDS)
      .eq('id', id)
      .eq('client_id', client.id)
      .neq('status', 'draft')
      .maybeSingle();

    if (error) {
      console.error('Portal credit note detail error:', error);
      return apiServerError();
    }
    if (!creditNote) return apiNotFound('الإشعار الدائن غير موجود');

    // 2. Enrich with linked invoice number
    let invoice_number: string | null = null;
    if (creditNote.invoice_id) {
      const { data: invoice } = await supabase
        .from('pyra_invoices')
        .select('invoice_number')
        .eq('id', creditNote.invoice_id)
        .maybeSingle();
      if (invoice) invoice_number = invoice.invoice_number;
    }

    // 3. Fetch line items
    const { data: items } = await supabase
      .from('pyra_credit_note_items')
      .select(CREDIT_NOTE_ITEM_FIELDS)
      .eq('credit_note_id', id)
      .order('sort_order', { ascending: true });

    return apiSuccess({
      ...creditNote,
      invoice_number,
      items: items || [],
    });
  } catch {
    return apiServerError();
  }
}
