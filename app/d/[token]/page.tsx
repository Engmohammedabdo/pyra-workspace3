import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { Clock } from 'lucide-react';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { classifyLinkState } from '@/lib/documents/link-state';
import { dirFor, DEFAULT_LOCALE } from '@/lib/i18n/config';
import { logError } from '@/lib/observability/log-error';
import { documentLinkViewLimiter, getClientIpFromHeaders } from '@/lib/utils/rate-limit';
import { QuoteDocument } from './quote-document';
import { InvoiceDocument } from './invoice-document';
import type { PublicDocumentLink } from './link-types';

// Never cached: link state and document status both change server-side.
export const dynamic = 'force-dynamic';

// X-Robots-Tag equivalent (belt-and-suspenders — the real HTTP header is set
// in next.config.ts, matched on this route's exact path). Referrer-Policy
// has no header set here on purpose: overriding it for this one path only
// (so the opaque token in the URL is never leaked in a Referer header to a
// third-party site the customer navigates to next) also lives in
// next.config.ts, because a Server Component page cannot set arbitrary
// response headers in the Next.js App Router — only middleware or
// next.config.ts `headers()` can, and the brief keeps middleware.ts to its
// one inserted line.
export const metadata = { robots: { index: false, follow: false } };

/**
 * The one unauthenticated document surface in the product.
 *
 * This file owns only what every document type shares — rate limit, token
 * lookup, link-state — and then dispatches on `entity_type`. The dispatch is
 * a hard boundary: a quote token must never render an invoice payload or the
 * reverse, so each branch re-reads its OWN table by `link.entity_id` and
 * applies its own visibility rules. `pyra_document_links.entity_id` carries no
 * foreign key and its CHECK permits three entity types, so an id that happens
 * to exist in the wrong table would otherwise render whatever it found.
 */
export default async function PublicDocumentPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;

  // Rate limit BEFORE any DB work (final-review Important 3) — this is the
  // one unauthenticated surface in the product, and every hit past this
  // point costs 4-5 queries, an RPC write and a status UPDATE. A Server
  // Component has no `Request` object, so the IP comes from `headers()`
  // (next/headers) rather than `checkRateLimit()`, which builds a raw
  // `Response` meant for an API route handler — a page must render JSX
  // instead, hence the friendly state below rather than a thrown 429.
  const hdrs = await headers();
  const clientIp = getClientIpFromHeaders(hdrs);
  const rate = documentLinkViewLimiter.check(clientIp);
  if (rate.limited) {
    const tRate = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'publicdoc' });
    return (
      <div
        dir={dirFor(DEFAULT_LOCALE)}
        lang={DEFAULT_LOCALE}
        className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6"
      >
        <div className="relative">
          <div className="absolute inset-0 scale-150 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/5 blur-xl" />
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-orange-500/10 bg-gradient-to-br from-orange-500/15 to-orange-600/5">
            <Clock className="h-11 w-11 text-orange-500" />
          </div>
        </div>
        <div className="max-w-md space-y-2 text-center">
          <h1 className="text-xl font-bold">{tRate('rateLimitedViewTitle')}</h1>
          <p className="text-sm text-muted-foreground">{tRate('rateLimitedViewBody')}</p>
        </div>
      </div>
    );
  }

  const supabase = createServiceRoleClient();

  const { data: link, error: linkErr } = await supabase
    .from('pyra_document_links')
    .select('id, entity_type, entity_id, content_hash, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  // A DB error must NOT render as "invalid link" — that is exactly how the
  // /api/shares stack stayed dead in production for five months. Logged
  // before the throw (final-review Important 2) — Next has no error.tsx
  // above this route to catch it otherwise, and even with one now in place
  // (app/d/error.tsx) that boundary has no session to beacon through, so the
  // record has to be written here, server-side, before the throw.
  if (linkErr) {
    logError({
      error: linkErr,
      metadata: { scope: 'public_document_view_link_lookup', token },
    });
    throw new Error(`document link lookup failed: ${linkErr.message}`);
  }

  // Unknown, revoked and expired all collapse into one indistinguishable
  // response so a harvested token cannot be confirmed as once-real (S-10).
  if (!link) notFound();
  if (classifyLinkState(link, new Date().toISOString()) !== 'valid') notFound();

  const typed = link as PublicDocumentLink;

  if (typed.entity_type === 'quote') {
    return <QuoteDocument token={token} link={typed} />;
  }

  if (typed.entity_type === 'invoice') {
    // Both flags come straight off an attacker-controlled query string and are
    // treated as hints only — derivePublicPaymentState refuses to claim
    // payment from either without a matching session row AND a settled ledger.
    const sessionId = typeof sp.session_id === 'string' ? sp.session_id : null;
    return (
      <InvoiceDocument
        token={token}
        link={typed}
        paidFlag={sp.paid === '1'}
        sessionIdFromUrl={sessionId}
      />
    );
  }

  // 'contract' is permitted by the table's CHECK but has no public renderer
  // yet. Same indistinguishable response — never a half-rendered document.
  notFound();
}
