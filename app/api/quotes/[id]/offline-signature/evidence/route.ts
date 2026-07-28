import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getApiAuth, type ApiAuthResult } from '@/lib/api/auth';
import { apiSuccess, apiUnauthorized, apiNotFound, apiForbidden, apiServerError } from '@/lib/api/response';
import { hasAnyPermission } from '@/lib/auth/rbac';
import { resolveUserScope, type UserScope } from '@/lib/auth/scope';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { logError } from '@/lib/observability/log-error';

// ────────────────────────────────────────────────────────────────────────────
// GET /api/quotes/[id]/offline-signature/evidence
//
// Returns a short-TTL signed URL for the counter-signed PDF/image stored as
// proof of an offline signature. `signed_evidence_path` is read from the DB
// to build the signed URL but MUST NEVER leave this function in the response
// body — only the ephemeral signed URL does (same doctrine as
// app/api/hr/documents/[id]/signed-url/route.ts).
//
// Gated: quotes.edit OR quotes.share_link, same three-way scope as the
// offline-signature POST route and GET/PATCH/DELETE/link — own quote OR a
// lead-owned quote OR a quote for a client in scope.
// ────────────────────────────────────────────────────────────────────────────

type RouteContext = { params: Promise<{ id: string }> };

type QuoteEvidenceRow = {
  client_id: string | null;
  lead_id: string | null;
  created_by: string | null;
  signed_evidence_path: string | null;
};

const EVIDENCE_BUCKET = 'pyra-private';
// Short TTL — this is sensitive counter-signed paperwork, not a routine HR
// document, so it deliberately gets a shorter window than the 1-hour TTL
// app/api/hr/documents uses.
const SIGNED_URL_TTL = 300; // 5 minutes

/** Same three-way scope as the offline-signature POST route. */
async function canAccessQuoteEvidence(
  supabase: SupabaseClient,
  scope: UserScope,
  auth: ApiAuthResult,
  quote: QuoteEvidenceRow,
): Promise<boolean> {
  if (scope.isAdmin) return true;
  const me = auth.pyraUser.username;
  const ownsQuote = quote.created_by === me;
  const inClientScope = !!quote.client_id && scope.clientIds.some((c) => String(c) === quote.client_id);
  const ownsLead = !!quote.lead_id && (await canAccessLead(supabase, me, auth.pyraUser.role, quote.lead_id));
  return ownsQuote || inClientScope || ownsLead;
}

export async function GET(request: NextRequest, context: RouteContext) {
  let authForLogging: ApiAuthResult | null = null;
  try {
    const auth = await getApiAuth();
    if (!auth) return apiUnauthorized();
    if (!hasAnyPermission(auth.pyraUser.rolePermissions, ['quotes.edit', 'quotes.share_link'])) {
      return apiForbidden();
    }
    authForLogging = auth;
    const t = await getTranslations('api');

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: quote } = await supabase
      .from('pyra_quotes')
      .select('id, client_id, lead_id, created_by, signed_evidence_path')
      .eq('id', id)
      .maybeSingle();
    if (!quote) return apiNotFound(t('quotes.notFound'));
    if (!(await canAccessQuoteEvidence(supabase, scope, auth, quote))) return apiForbidden();
    if (!quote.signed_evidence_path) return apiNotFound(t('quotes.evidenceNotFound'));

    const { data: urlData, error: signError } = await supabase.storage
      .from(EVIDENCE_BUCKET)
      .createSignedUrl(quote.signed_evidence_path, SIGNED_URL_TTL);

    if (signError || !urlData?.signedUrl) {
      logError({
        error: signError ?? new Error('createSignedUrl returned no URL'),
        request,
        user: { id: auth.pyraUser.username, role: auth.pyraUser.role },
        metadata: { source: 'quote_offline_evidence', quote_id: id },
      });
      return apiServerError(t('quotes.evidenceUrlFailed'));
    }

    // Only the ephemeral signed URL is returned — signed_evidence_path never is.
    return apiSuccess({ signed_url: urlData.signedUrl });
  } catch (err) {
    logError({
      error: err,
      request,
      user: authForLogging
        ? { id: authForLogging.pyraUser.username, role: authForLogging.pyraUser.role }
        : undefined,
      metadata: { source: 'quote_offline_evidence' },
    });
    return apiServerError();
  }
}
