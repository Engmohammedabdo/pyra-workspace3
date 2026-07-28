import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireApiPermission, isApiError, type ApiAuthResult } from '@/lib/api/auth';
import {
  apiSuccess,
  apiNotFound,
  apiForbidden,
  apiValidationError,
  apiServerError,
} from '@/lib/api/response';
import { resolveUserScope, type UserScope } from '@/lib/auth/scope';
import { canAccessLead } from '@/lib/auth/lead-scope';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { generateId } from '@/lib/utils/id';
import { generateDocumentLinkToken } from '@/lib/documents/token';
import { quoteContentHash } from '@/lib/quotes/content-hash';
import { toPublicQuotePayload } from '@/lib/quotes/public-payload';
import { QUOTE_STATUS } from '@/lib/constants/statuses';
import { QUOTE_FIELDS } from '@/lib/supabase/fields';
import { logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';

type RouteContext = { params: Promise<{ id: string }> };

type QuoteScopeRow = { client_id: string | null; lead_id: string | null; created_by: string | null };

/**
 * Same three-way scope as GET/PATCH/DELETE /api/quotes/[id] (own quote OR a
 * lead-owned quote OR a quote for a client in scope) — a sales agent must not
 * be able to mint, inspect or revoke a public link for a quote they cannot
 * otherwise touch.
 */
async function canAccessQuoteForLink(
  supabase: SupabaseClient,
  scope: UserScope,
  auth: ApiAuthResult,
  quote: QuoteScopeRow,
): Promise<boolean> {
  if (scope.isAdmin) return true;
  const me = auth.pyraUser.username;
  const ownsQuote = quote.created_by === me;
  const inClientScope = !!quote.client_id && scope.clientIds.some((c) => String(c) === quote.client_id);
  const ownsLead = !!quote.lead_id && (await canAccessLead(supabase, me, auth.pyraUser.role, quote.lead_id));
  return ownsQuote || inClientScope || ownsLead;
}

/**
 * `quote.expiry_date` is a DATE ('YYYY-MM-DD') compared against
 * dubaiDayKey() by lib/quotes/signability.ts — a quote is signable through
 * the END of that Dubai calendar day, inclusive. The link's expires_at must
 * match that boundary exactly, or the link would die up to ~4h before the
 * quote itself stops being signable. Dubai is UTC+4 with no DST, so Dubai
 * midnight of (expiryDate + 1 day) is 20:00:00 UTC on expiryDate itself.
 */
function expiresAtFromQuoteExpiry(expiryDate: string | null): string | null {
  if (!expiryDate) return null;
  const [y, m, d] = expiryDate.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 20, 0, 0, 0)).toISOString();
}

const LINK_SELECT = 'id, expires_at, created_at, view_count, last_viewed_at';

/**
 * GET /api/quotes/[id]/link
 *
 * Returns the quote's live (non-revoked) public link WITHOUT its token —
 * migration 054's table comment is explicit that the token must never appear
 * in a list/GET response (S-5). The token is only ever returned once, by the
 * POST below, at the moment it is minted.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('quotes.edit');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: quote } = await supabase
      .from('pyra_quotes')
      .select('id, client_id, lead_id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (!quote) return apiNotFound(t('quotes.notFound'));
    if (!(await canAccessQuoteForLink(supabase, scope, auth, quote))) return apiForbidden();

    const { data: link, error } = await supabase
      .from('pyra_document_links')
      .select(LINK_SELECT)
      .eq('entity_type', 'quote')
      .eq('entity_id', id)
      .is('revoked_at', null)
      .maybeSingle();

    if (error) {
      logError({ error, metadata: { scope: 'quote_link_get', quote_id: id } });
      return apiServerError();
    }

    if (!link) return apiSuccess({ exists: false });
    return apiSuccess({ exists: true, ...link });
  } catch (err) {
    console.error('GET /api/quotes/[id]/link error:', err);
    return apiServerError();
  }
}

/**
 * POST /api/quotes/[id]/link
 *
 * Mints a public signing link. Refused unless the quote is already `sent` or
 * `viewed` — draft and pending_approval must never become publicly
 * reachable (S-19, mirrored by app/d/[token]/page.tsx's VISIBLE gate).
 *
 * Revoke-then-insert, never a bare insert: idx_document_links_one_live only
 * allows ONE row with revoked_at IS NULL per (entity_type, entity_id) and
 * does NOT account for expiry — an expired-but-unrevoked link would 23505 a
 * fresh insert forever. Revoking any live link first (including an expired
 * one) makes "generate a new link" always succeed, and it also means a
 * second mint supersedes the first exactly like the UI implies.
 *
 * The 23505 catch below is for the genuine leftover race: two concurrent
 * POSTs both revoke (no-op) then both insert — the loser gets 23505 after
 * the winner's row is already live. That loser must NOT fabricate or return
 * the winner's token (S-5 again) — it just reports the link now exists.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('quotes.edit');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: quote } = await supabase
      .from('pyra_quotes')
      .select(QUOTE_FIELDS)
      .eq('id', id)
      .maybeSingle();
    if (!quote) return apiNotFound(t('quotes.notFound'));
    if (!(await canAccessQuoteForLink(supabase, scope, auth, quote))) return apiForbidden();

    const SIGNABLE_STATUSES: readonly string[] = [QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED];
    if (!SIGNABLE_STATUSES.includes(quote.status)) {
      return apiValidationError(t('quotes.linkRequiresSent'));
    }

    const { data: items, error: itemsErr } = await supabase
      .from('pyra_quote_items')
      .select('description, quantity, rate, amount')
      .eq('quote_id', id)
      .order('sort_order', { ascending: true });
    if (itemsErr) {
      logError({ error: itemsErr, metadata: { scope: 'quote_link_post_items', quote_id: id } });
      return apiServerError();
    }

    const payload = toPublicQuotePayload(quote, items ?? []);
    const contentHash = quoteContentHash(payload);
    const expiresAt = expiresAtFromQuoteExpiry(quote.expiry_date as string | null);
    const token = generateDocumentLinkToken();
    const linkId = generateId('dl');
    const now = new Date().toISOString();

    // Revoke any live link first (see doc comment above) — including an
    // expired-but-unrevoked one, which the partial unique index does not
    // distinguish from a genuinely live link.
    const { error: revokeErr } = await supabase
      .from('pyra_document_links')
      .update({ revoked_at: now, revoked_by: auth.pyraUser.username })
      .eq('entity_type', 'quote')
      .eq('entity_id', id)
      .is('revoked_at', null);
    if (revokeErr) {
      logError({ error: revokeErr, metadata: { scope: 'quote_link_post_revoke', quote_id: id } });
      return apiServerError();
    }

    const { data: inserted, error: insertErr } = await supabase
      .from('pyra_document_links')
      .insert({
        id: linkId,
        entity_type: 'quote',
        entity_id: id,
        token,
        content_hash: contentHash,
        expires_at: expiresAt,
        created_by: auth.pyraUser.username,
      })
      .select(LINK_SELECT)
      .single();

    if (insertErr) {
      // 23505 = unique_violation. Only outcome the partial index can produce
      // here is idx_document_links_one_live, since `id` is a fresh nanoid and
      // `token` is a fresh 256-bit random value — both effectively unique.
      if (insertErr.code === '23505') {
        const { data: existing, error: fetchErr } = await supabase
          .from('pyra_document_links')
          .select(LINK_SELECT)
          .eq('entity_type', 'quote')
          .eq('entity_id', id)
          .is('revoked_at', null)
          .maybeSingle();
        if (fetchErr || !existing) {
          logError({
            error: fetchErr ?? insertErr,
            metadata: { scope: 'quote_link_post_race_fetch', quote_id: id },
          });
          return apiServerError();
        }
        // Lost the race — do not return a token for a link we did not mint.
        return apiSuccess({ exists: true, ...existing, token: null, url: null });
      }
      logError({ error: insertErr, metadata: { scope: 'quote_link_post_insert', quote_id: id } });
      return apiServerError();
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://workspace.pyramedia.cloud';
    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'quote_link_created',
      `/dashboard/quotes/${id}`,
      { link_id: linkId, quote_number: quote.quote_number },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({
      exists: true,
      ...inserted,
      token,
      url: `${appUrl}/d/${token}`,
    });
  } catch (err) {
    console.error('POST /api/quotes/[id]/link error:', err);
    return apiServerError();
  }
}

/**
 * DELETE /api/quotes/[id]/link
 * Revokes the quote's live public link (sets revoked_at + revoked_by).
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const t = await getTranslations('api');
  try {
    const auth = await requireApiPermission('quotes.edit');
    if (isApiError(auth)) return auth;

    const scope = await resolveUserScope(auth);
    const { id } = await context.params;
    const supabase = createServiceRoleClient();

    const { data: quote } = await supabase
      .from('pyra_quotes')
      .select('id, client_id, lead_id, created_by')
      .eq('id', id)
      .maybeSingle();
    if (!quote) return apiNotFound(t('quotes.notFound'));
    if (!(await canAccessQuoteForLink(supabase, scope, auth, quote))) return apiForbidden();

    const { data: revoked, error } = await supabase
      .from('pyra_document_links')
      .update({ revoked_at: new Date().toISOString(), revoked_by: auth.pyraUser.username })
      .eq('entity_type', 'quote')
      .eq('entity_id', id)
      .is('revoked_at', null)
      .select('id')
      .maybeSingle();

    if (error) {
      logError({ error, metadata: { scope: 'quote_link_delete', quote_id: id } });
      return apiServerError();
    }
    if (!revoked) return apiNotFound(t('quotes.linkNotFound'));

    logActivity(
      auth.pyraUser.username,
      auth.pyraUser.display_name,
      'quote_link_revoked',
      `/dashboard/quotes/${id}`,
      { link_id: revoked.id, trigger: 'manual' },
      request.headers.get('x-forwarded-for') || undefined,
    );

    return apiSuccess({ revoked: true });
  } catch (err) {
    console.error('DELETE /api/quotes/[id]/link error:', err);
    return apiServerError();
  }
}
