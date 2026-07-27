import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { NextIntlClientProvider } from 'next-intl';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { classifyLinkState } from '@/lib/documents/link-state';
import { toPublicQuotePayload } from '@/lib/quotes/public-payload';
import { quoteContentHash } from '@/lib/quotes/content-hash';
import { canSignQuote } from '@/lib/quotes/signability';
import { QUOTE_STATUS } from '@/lib/constants/statuses';
import { dubaiDayKey, formatDate } from '@/lib/utils/format';
import { loadMessages } from '@/lib/i18n/messages';
import { dirFor, type Locale } from '@/lib/i18n/config';
import { logError } from '@/lib/observability/log-error';
import { PublicQuoteView } from './public-quote-view';

// Never cached: link state and quote status both change server-side.
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

export default async function PublicDocumentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = createServiceRoleClient();

  const { data: link, error: linkErr } = await supabase
    .from('pyra_document_links')
    .select('id, entity_type, entity_id, content_hash, expires_at, revoked_at')
    .eq('token', token)
    .maybeSingle();

  // A DB error must NOT render as "invalid link" — that is exactly how the
  // /api/shares stack stayed dead in production for five months.
  if (linkErr) throw new Error(`document link lookup failed: ${linkErr.message}`);

  // Unknown, revoked and expired all collapse into one indistinguishable
  // response so a harvested token cannot be confirmed as once-real (S-10).
  if (!link || link.entity_type !== 'quote') notFound();
  if (classifyLinkState(link, new Date().toISOString()) !== 'valid') notFound();

  const { data: quote, error: quoteErr } = await supabase
    .from('pyra_quotes')
    .select('*')
    .eq('id', link.entity_id)
    .maybeSingle();
  if (quoteErr) throw new Error(`quote lookup failed: ${quoteErr.message}`);
  if (!quote) notFound();

  // Draft and pending_approval must never be reachable publicly (S-19).
  const VISIBLE: readonly string[] = [
    QUOTE_STATUS.SENT, QUOTE_STATUS.VIEWED, QUOTE_STATUS.SIGNED, QUOTE_STATUS.INVOICED,
  ];
  if (!VISIBLE.includes(quote.status)) notFound();

  const { data: items, error: itemsErr } = await supabase
    .from('pyra_quote_items')
    .select('description, quantity, rate, amount')
    .eq('quote_id', quote.id)
    .order('sort_order', { ascending: true });

  // Same reasoning as the quote lookup above: a DB blip here must not render
  // as a signable quote with zero line items and a non-zero total.
  if (itemsErr) throw new Error(`quote items lookup failed: ${itemsErr.message}`);

  const payload = toPublicQuotePayload(quote, items ?? []);
  const contentChanged =
    !!link.content_hash && link.content_hash !== quoteContentHash(payload);

  // Recipient-language rendering: an anonymous visitor has no pyra_locale
  // cookie, so without this a customer who reads English gets an Arabic legal
  // document. Resolve from the client's stored preference.
  let locale: Locale = 'ar';
  if (quote.client_id) {
    const { data: client } = await supabase
      .from('pyra_clients')
      .select('preferred_language')
      .eq('id', quote.client_id)
      .maybeSingle();
    if (client?.preferred_language === 'en') locale = 'en';
  }
  const t = await getTranslations({ locale, namespace: 'publicdoc' });

  // Both writes below are best-effort side effects of a read — a customer
  // must still see their quote if either fails. But a silent failure here
  // means nobody ever finds out the view counter or status transition broke
  // (e.g. the RPC grant regresses, or the append-only trigger rejects the
  // update), so log instead of discarding the result.
  const { error: viewErr } = await supabase.rpc('pyra_increment_document_link_view', {
    link_id: link.id,
  });
  if (viewErr) {
    logError({
      severity: 'warning',
      error: viewErr,
      metadata: { scope: 'pyra_increment_document_link_view', link_id: link.id },
    });
  }

  // sent -> viewed on first open, mirroring the portal.
  if (quote.status === QUOTE_STATUS.SENT) {
    const { error: viewedTransitionErr } = await supabase
      .from('pyra_quotes')
      .update({ status: QUOTE_STATUS.VIEWED, viewed_at: new Date().toISOString() })
      .eq('id', quote.id)
      .eq('status', QUOTE_STATUS.SENT);
    if (viewedTransitionErr) {
      logError({
        severity: 'warning',
        error: viewedTransitionErr,
        metadata: { scope: 'quote_sent_to_viewed', quote_id: quote.id },
      });
    }
  }

  const todayKey = dubaiDayKey();
  const signable = canSignQuote(
    { status: quote.status, expiry_date: quote.expiry_date },
    todayKey,
  );

  // QuoteDetailView (rendered inside PublicQuoteView, a client component)
  // reads its own strings via useTranslations('finance.quotes.detail'). The
  // root layout's <NextIntlClientProvider> only ever carries the session
  // cookie's locale — irrelevant here, there is no session. This nested
  // provider is what actually makes the recipient-language resolution above
  // reach the quote content itself, not just the copy strings below.
  const messages = await loadMessages(locale);

  // The root layout's <html lang dir> is cookie-derived and an anonymous
  // visitor never has a pyra_locale cookie, so it always renders ar/rtl —
  // wrong for an English-preferring client's whole subtree. Rather than
  // touching the shared root layout, this page sets its own dir/lang on the
  // outermost element of its own subtree, matching the recipient locale
  // resolved above.
  return (
    <div dir={dirFor(locale)} lang={locale}>
      <NextIntlClientProvider locale={locale} messages={messages}>
        <PublicQuoteView
          token={token}
          quote={payload}
          canSign={signable.ok && !contentChanged}
          blockReason={contentChanged ? 'content_changed' : signable.ok ? null : signable.reason}
          copy={{
            alreadySignedTitle: t('alreadySignedTitle'),
            alreadySignedBody: t('alreadySignedBody', {
              date: quote.signed_at ? formatDate(quote.signed_at as string, undefined, locale) : '',
            }),
            quoteExpiredTitle: t('quoteExpiredTitle'),
            quoteExpiredBody: t('quoteExpiredBody'),
            changedTitle: t('changedTitle'),
            changedBody: t('changedBody'),
            unavailableTitle: t('unavailableTitle'),
            unavailableBody: t('unavailableBody'),
            signError: t('signError'),
            downloadError: t('downloadError'),
            rateLimited: t('rateLimited'),
          }}
        />
      </NextIntlClientProvider>
    </div>
  );
}
