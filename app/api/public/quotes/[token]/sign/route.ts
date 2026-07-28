import { NextRequest } from 'next/server';
import { getTranslations } from 'next-intl/server';
import { apiSuccess, apiNotFound, apiValidationError, apiServerError } from '@/lib/api/response';
import { checkRateLimit, documentLinkSignLimiter } from '@/lib/utils/rate-limit';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { classifyLinkState } from '@/lib/documents/link-state';
import { toPublicQuotePayload } from '@/lib/quotes/public-payload';
import { quoteContentHash } from '@/lib/quotes/content-hash';
import { signQuote, MAX_SIGNATURE_LENGTH, MAX_SIGNED_BY_LENGTH } from '@/lib/quotes/sign-quote';
import { dubaiDayKey } from '@/lib/utils/format';
import { notify } from '@/lib/notifications/notify';
import { logActivity } from '@/lib/api/activity';
import { logError } from '@/lib/observability/log-error';
import { loadServerPdfFonts, loadServerDefaultLogo } from '@/lib/pdf/pdf-assets-server';
import { notifyQuoteSigned, sendSignedQuoteCopyEmail } from '@/lib/email/notify';
import { DEFAULT_LOCALE, type Locale } from '@/lib/i18n/config';

type RouteContext = { params: Promise<{ token: string }> };

/**
 * POST /api/public/quotes/[token]/sign
 *
 * Unauthenticated — anyone holding the opaque `token` from a document link
 * can sign. Every guard here is the exact same guard the portal sign route
 * (app/api/portal/quotes/[id]/sign) uses, via the shared
 * lib/quotes/sign-quote.ts core, so the two paths cannot silently drift
 * apart. What genuinely differs from the portal route is the already-signed
 * response: both a concurrent-submit LOSER ('race') and a quote that turns
 * out to already be signed when signQuote() re-reads it ('already_signed' —
 * e.g. the customer signed on their phone and is now opening the same
 * emailed link on a laptop) get a 200 "already signed" marker here instead
 * of a 422 (Task 6 Finding 2). The public client
 * (app/d/[token]/public-quote-view.tsx) renders that marker as a read-only
 * state, not an error toast — unlike the portal route, this stranger has no
 * support channel to fall back on if told "signing failed" on a quote that
 * is, in fact, already signed.
 *
 * Rate limiting (documentLinkSignLimiter, lib/utils/rate-limit.ts) is
 * per-process, in-memory, and resets on every deploy/restart — it is an
 * abuse speed bump, not a security control. The durable guard against a
 * forged or replayed signature is the append-only signature columns
 * enforced by a DB trigger (migrations 054/055): once signature_data is
 * set, a second write raises instead of silently overwriting it — which is
 * exactly why the 'race' branch below never attempts a second write of its
 * own, it just reports the state signQuote() already observed.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  // Step 1 (brief): rate limit BEFORE any DB work.
  const limited = checkRateLimit(documentLinkSignLimiter, request);
  if (limited) return limited;

  const { token } = await context.params;
  const supabase = createServiceRoleClient();

  // Unknown / revoked / expired links must collapse into ONE
  // indistinguishable response (S-10) — same status, same body. Since an
  // invalid token tells us nothing about which client/locale it was minted
  // for, this uses a FIXED locale rather than trying to resolve one —
  // exactly the reasoning documented in app/d/[token]/not-found.tsx.
  const tInvalid = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'publicdoc' });
  const invalidLinkResponse = () => apiNotFound(tInvalid('invalidBody'));

  let body: { signature_data?: unknown; signed_by?: unknown };
  try {
    body = await request.json();
  } catch {
    return apiValidationError(tInvalid('invalidRequest'));
  }

  const { data: link, error: linkErr } = await supabase
    .from('pyra_document_links')
    .select('id, entity_type, entity_id, content_hash, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  // A DB error must NOT render as "invalid link" — that is exactly how the
  // /api/shares stack stayed dead in production for five months.
  if (linkErr) {
    // Do NOT pass `request` here — logError stores its raw `request.url`
    // pathname verbatim into request_path, and this route's path IS
    // `/api/public/quotes/<TOKEN>/sign`. That column has no redaction pass
    // (unlike metadata, where the `token` key is auto-redacted by the
    // PII_KEY_FRAGMENTS layer), so passing `request` would permanently leak
    // a live signing token into pyra_error_logs — readable by anyone holding
    // the standalone `error_logs.view` permission, no quote access required
    // (Task 6 Finding 3). `request.method` is safe, non-sensitive context.
    logError({
      error: linkErr,
      metadata: { scope: 'public_quote_sign_link_lookup', token, request_method: request.method },
    });
    return apiServerError(tInvalid('serverError'));
  }
  if (!link || link.entity_type !== 'quote') return invalidLinkResponse();
  if (classifyLinkState(link, new Date().toISOString()) !== 'valid') return invalidLinkResponse();

  const { data: quote, error: quoteErr } = await supabase
    .from('pyra_quotes')
    .select('*')
    .eq('id', link.entity_id)
    .maybeSingle();

  if (quoteErr) {
    // See the linkErr branch above — `request` is never passed to logError
    // on this route; its request_path column is unredacted and the path
    // contains the live signing token (Task 6 Finding 3).
    logError({
      error: quoteErr,
      metadata: { scope: 'public_quote_sign_quote_lookup', link_id: link.id, request_method: request.method },
    });
    return apiServerError(tInvalid('serverError'));
  }
  // An orphaned link (row exists, target quote does not) is a data-integrity
  // anomaly, not a real "invalid link" — but from the customer's side it is
  // the same "cannot reach this document" outcome, so it renders the same.
  if (!quote) return invalidLinkResponse();

  const { data: items, error: itemsErr } = await supabase
    .from('pyra_quote_items')
    .select('description, quantity, rate, amount')
    .eq('quote_id', quote.id)
    .order('sort_order', { ascending: true });

  if (itemsErr) {
    // See the linkErr branch above — same reason `request` is withheld here.
    logError({
      error: itemsErr,
      metadata: { scope: 'public_quote_sign_items_lookup', quote_id: quote.id, request_method: request.method },
    });
    return apiServerError(tInvalid('serverError'));
  }

  // Recipient-language rendering for everything from here on — mirrors
  // app/d/[token]/page.tsx exactly (DB-stored client preference, never a
  // client-supplied header, so it cannot be used to fingerprint the
  // already-collapsed invalid-link path above).
  let locale: Locale = DEFAULT_LOCALE;
  if (quote.client_id) {
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('preferred_language')
      .eq('id', quote.client_id)
      .maybeSingle();
    if (client?.preferred_language === 'en') locale = 'en';
  }
  const t = await getTranslations({ locale, namespace: 'publicdoc' });

  // Step 3 (brief): re-verify content_hash against the freshly computed
  // hash. The link was minted against a snapshot of the quote; if the quote
  // was edited since, the customer must not be able to sign content they
  // never actually saw (S-8).
  const payload = toPublicQuotePayload(quote, items ?? []);
  const contentChanged = !!link.content_hash && link.content_hash !== quoteContentHash(payload);
  if (contentChanged) return apiValidationError(t('changedBody'));

  const signatureData = body.signature_data;
  const signedByRaw = body.signed_by;
  if (typeof signatureData !== 'string' || !signatureData) {
    return apiValidationError(t('signatureRequired'));
  }
  if (signatureData.length > MAX_SIGNATURE_LENGTH) {
    return apiValidationError(t('signatureInvalid'));
  }
  if (typeof signedByRaw !== 'string' || !signedByRaw.trim()) {
    return apiValidationError(t('signedByRequired'));
  }
  const signedBy = signedByRaw.trim();
  if (signedBy.length > MAX_SIGNED_BY_LENGTH) {
    return apiValidationError(t('signedByTooLong'));
  }

  // Same expression the rest of the app uses for signed_ip — see
  // app/api/comments/route.ts, app/api/webhooks/[id]/route.ts, etc.
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  // The one shared core (lib/quotes/sign-quote.ts) owns the expiry guard,
  // the status guard and the race-safe conditional update — the portal sign
  // route (Task 4) and this public route enforce exactly the same rules.
  const result = await signQuote(supabase, {
    quoteId: quote.id,
    signatureData,
    signedBy,
    signedIp: ip,
    userAgent: request.headers.get('user-agent'),
    source: 'public_link',
    linkId: link.id,
    todayKey: dubaiDayKey(),
  });

  if (!result.ok) {
    switch (result.reason) {
      case 'race':
        // Someone else's concurrent submit won the conditional UPDATE
        // first. Not an error — the quote IS signed, just not by this
        // request. The public client renders this as a friendly
        // "already signed" info toast, not an error toast (plan Task 6
        // Step 5) — hence 200, not 422.
        return apiSuccess({ signed: true, alreadySigned: true });
      case 'already_signed':
        // Same 200 marker as 'race' (Task 6 Finding 2) — a customer who
        // already signed (elsewhere, or via a genuine concurrent submit)
        // must land on the friendly read-only state, not a red error with
        // no way to ever clear it. This also sidesteps the stale-null-date
        // bug the old branch had: `quote` here is the row this request
        // fetched BEFORE calling signQuote(), so on a real race its
        // signed_at is still null (Task 6 Minor 4) — the client already
        // renders the correct signed date from its own initial page load
        // (app/d/[token]/page.tsx), so no date needs to travel in this
        // response at all.
        return apiSuccess({ signed: true, alreadySigned: true });
      case 'quote_expired':
        return apiValidationError(t('quoteExpiredBody'));
      case 'wrong_status':
        return apiValidationError(t('unavailableBody'));
      case 'signature_too_large':
        // Unreachable in practice — the length check above already rejects
        // this before signQuote() is called. Kept for defense in depth,
        // same as the portal route.
        return apiValidationError(t('signatureInvalid'));
      case 'db_error':
      default:
        // Log the REAL Supabase error — result.reason is just the literal
        // string 'db_error' and tells an operator nothing (see ba3c055).
        // `request` withheld — see the linkErr branch above (Task 6 Finding 3).
        logError({
          error: result.error,
          metadata: {
            route: 'public-quotes-sign',
            quote_id: quote.id,
            link_id: link.id,
            request_method: request.method,
          },
        });
        return apiServerError(t('serverError'));
    }
  }

  const signed = result.quote;

  // Activity log — username/display_name are NOT NULL and an anonymous
  // signer has neither. 'public_link' is the deliberate stand-in; the
  // typed name goes in display_name, and the link id + entity type go in
  // details so the audit trail stays fully attributable. Fire-and-forget
  // (logActivity never blocks the response) — this is also why the race
  // branch above returns before reaching here: only the request that
  // actually wrote the signature gets an activity row.
  logActivity(
    'public_link',
    signedBy,
    'quote_signed',
    `/quotes/${quote.id}`,
    { quote_number: quote.quote_number, entity_type: 'quote', link_id: link.id, source: 'public_link' },
    ip,
  );

  // Email the creating agent + admins — same channel a portal signature
  // uses (app/api/portal/quotes/[id]/sign), so a sales rep learns about a
  // signature the same way regardless of which link the customer signed
  // through (Task 6 Minor 5). Fire-and-forget: notifyQuoteSigned wraps its
  // own work in a detached async IIFE and never throws to this caller.
  if (quote.created_by) {
    notifyQuoteSigned({
      createdBy: quote.created_by,
      quoteNumber: quote.quote_number,
      quoteId: quote.id,
      signedBy,
      total: Number(quote.total) || 0,
      currency: quote.currency || 'AED',
    });
  }

  // In-app bell for the creating agent. Arabic literal content —
  // notification strings inside routes stay Arabic until Phase 8
  // (recipient-language notification templates); see CLAUDE.md "i18n —
  // Bilingual AR/EN".
  if (quote.created_by) {
    await notify(supabase, {
      to: quote.created_by,
      type: 'quote_signed',
      title: 'تم توقيع عرض السعر', // i18n-exempt: notification content, Phase 8
      message: `تم توقيع عرض السعر ${quote.quote_number} بواسطة ${signedBy}`, // i18n-exempt: notification content, Phase 8
      link: `/dashboard/quotes/${quote.id}`,
      entity: { type: 'quote', id: quote.id },
    });
  }

  // Owner decision D-3: email the signer their own signed copy. Owner
  // decision D-1: the attached PDF must NOT carry bank_details — an
  // unauthenticated, forwardable link flow must never let the company IBAN
  // leak into an email. Best-effort and never fails the request — the
  // quote is already signed in the DB regardless of this email's outcome.
  if (quote.client_email) {
    try {
      const [fonts, defaultLogo] = await Promise.all([loadServerPdfFonts(), loadServerDefaultLogo()]);
      const { generateQuotePDF } = await import('@/lib/pdf/quote-pdf');
      const blob = await generateQuotePDF(
        {
          ...signed,
          items: items ?? [],
          terms_conditions: quote.terms_conditions || [],
          // D-1 — always blanked here, never the real quote.bank_details.
          bank_details: { bank: '', account_name: '', account_no: '', iban: '' },
        } as Parameters<typeof generateQuotePDF>[0],
        { returnBlob: true, fonts, defaultLogo },
      );
      if (blob) {
        const ok = await sendSignedQuoteCopyEmail({
          clientEmail: quote.client_email,
          clientName: quote.client_name || '',
          quoteNumber: quote.quote_number,
          total: Number(quote.total ?? 0),
          currency: quote.currency || 'AED',
          pdf: {
            filename: `Quote_${quote.quote_number}_Signed.pdf`,
            content: Buffer.from(await (blob as Blob).arrayBuffer()),
          },
        });
        if (!ok) {
          logError({
            severity: 'warning',
            error: 'signed-copy email did not send (SMTP not configured or send failed)',
            metadata: { scope: 'public_quote_sign_email', quote_id: quote.id },
          });
        }
      }
    } catch (emailErr) {
      logError({
        severity: 'warning',
        error: emailErr,
        metadata: { scope: 'public_quote_sign_email', quote_id: quote.id },
      });
    }
  }

  return apiSuccess({ signed: true });
}
