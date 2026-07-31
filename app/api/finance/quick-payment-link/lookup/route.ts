import { NextRequest } from 'next/server';
import { requireApiPermission, isApiError } from '@/lib/api/auth';
import { apiSuccess, apiServerError } from '@/lib/api/response';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getLeadScopeFilter } from '@/lib/auth/lead-scope';
import {
  isMatchablePhone,
  matchClientByPhone,
  matchLeadRowByPhone,
  type ClientPhoneRow,
  type LeadPhoneRow,
} from '@/lib/finance/quick-payment-match';
import { logError } from '@/lib/observability/log-error';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * GET /api/finance/quick-payment-link/lookup?phone=...
 *
 * "Do we already know this number?" — answered before the operator commits to
 * creating anything. Returns at most one existing client and at most one lead.
 *
 * READ-ONLY BY DESIGN. It never links, never creates, never marks a lead
 * converted. All it does is let the dialog say "this is Ahmed, a lead from
 * June" so the operator can choose to reuse instead of minting a duplicate
 * customer for someone already in the pipeline.
 *
 * The matching itself is NOT done in SQL. `pyra_sales_leads.phone` is free
 * text — 981 of 1,125 rows are bare digits, the rest carry a leading `+` — so a
 * LIKE would be a second, subtly different phone rule sitting next to the one
 * in lib/calls/match.ts. Fetching the rows and running the shared predicate
 * keeps exactly one definition of "same number" in the product. Measured
 * 2026-07-31: 1,125 rows come back in full (this deployment sets no PostgREST
 * row cap), and the range below makes that explicit rather than assumed.
 */

/** Generous, but present: an unbounded select would silently truncate the day
 *  a row cap gets configured, and a truncated index means a missed match. */
const LEAD_FETCH_LIMIT = 20000;

export async function GET(request: NextRequest) {
  try {
    const auth = await requireApiPermission('finance.manage');
    if (isApiError(auth)) return auth;

    const phone = request.nextUrl.searchParams.get('phone')?.trim() ?? '';

    // Not an error — the dialog calls this while the operator is still typing.
    if (!isMatchablePhone(phone)) {
      return apiSuccess({ client: null, lead: null, matched: false });
    }

    const supabase = createServiceRoleClient();

    // Leads are scoped: an agent must not learn that a number belongs to
    // someone else's lead. Admins get the whole pipeline (filter === null).
    const scope = getLeadScopeFilter(auth.pyraUser.role, auth.pyraUser.username);
    let leadQuery = supabase
      .from('pyra_sales_leads')
      .select('id, name, company, phone, stage_id, assigned_to, client_id, created_at, is_converted')
      .not('phone', 'is', null)
      // Archived leads are out of the pipeline; surfacing one as a live match
      // would invite re-linking something deliberately put away.
      .is('archived_at', null)
      .range(0, LEAD_FETCH_LIMIT - 1);
    if (scope) leadQuery = leadQuery.eq(scope.column, scope.value);

    const [{ data: clients, error: clientErr }, { data: leads, error: leadErr }] = await Promise.all([
      supabase.from('pyra_clients').select('id, name, company, email, phone').not('phone', 'is', null),
      leadQuery,
    ]);

    // A failed lookup must not render as "nobody found" — that is the answer
    // that makes the operator create a duplicate customer.
    if (clientErr || leadErr) {
      logError({
        error: clientErr ?? leadErr,
        request,
        metadata: { source: 'quick_payment_link', step: 'phone_lookup' },
      });
      return apiServerError();
    }

    const client = matchClientByPhone((clients ?? []) as ClientPhoneRow[], phone);
    const lead = matchLeadRowByPhone((leads ?? []) as LeadPhoneRow[], phone);

    // Stage name for display only — resolved after matching so the common
    // "no match" path costs nothing.
    let stageName: string | null = null;
    if (lead?.stage_id) {
      const { data: stage } = await supabase
        .from('pyra_sales_pipeline_stages')
        .select('name, name_ar')
        .eq('id', lead.stage_id)
        .maybeSingle();
      stageName = stage?.name_ar || stage?.name || null;
    }

    return apiSuccess({
      matched: !!(client || lead),
      client: client
        ? { id: client.id, name: client.name, company: client.company, email: client.email }
        : null,
      lead: lead
        ? {
            id: lead.id,
            name: lead.name,
            company: lead.company,
            stage: stageName,
            assigned_to: lead.assigned_to,
            created_at: lead.created_at,
            // Tells the dialog whether picking this lead REUSES a customer or
            // creates one and links it.
            client_id: lead.client_id,
          }
        : null,
    });
  } catch (err) {
    logError({ error: err, request, metadata: { source: 'quick_payment_link', step: 'phone_lookup' } });
    console.error('GET /api/finance/quick-payment-link/lookup error:', err);
    return apiServerError();
  }
}
