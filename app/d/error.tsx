'use client';

import { useEffect } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { dirFor, type Locale } from '@/lib/i18n/config';

// Client error boundary for the entire /d/<token> segment (final-review
// Important 2). Before this existed, a server-side throw in
// app/d/[token]/page.tsx (DB error on the link/quote/items lookup) had no
// error.tsx anywhere above it, so Next rendered its own raw crash screen to
// an external, unauthenticated customer instead of a friendly page.
//
// Deliberately does NOT POST to /api/observability/log-client-error like
// app/dashboard/error.tsx and app/portal/(main)/error.tsx do — that route
// requires an authenticated dashboard OR portal session and would just 401
// for this anonymous visitor. That is not a gap: every throw this boundary
// can possibly catch originates server-side in page.tsx, which already
// calls logError() directly (it runs on the server and has no session to
// authenticate) immediately before each throw — so the failure is already
// recorded by the time this boundary renders.
//
// Deliberately contains NO link into the product (no /dashboard, no
// /portal) — same reasoning as app/d/[token]/not-found.tsx: the visitor is
// an external customer, and an admin-login button here would route them
// straight at the company's internal tooling. `reset()` (Next's own retry
// contract) is the only recovery action offered.
//
// Uses the root layout's inherited <NextIntlClientProvider> (locale from the
// session cookie, 'ar' default for an anonymous visitor with none) rather
// than the page's own narrowed nested provider — that nested provider only
// ever carries `finance.quotes.detail` (Important 4) and, on a server-side
// throw, never even mounts.
export default function PublicDocumentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const t = useTranslations('publicdoc');
  const locale = useLocale() as Locale;

  useEffect(() => {
    console.error('[Public Document Error]', error);
  }, [error]);

  return (
    <div
      dir={dirFor(locale)}
      lang={locale}
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6"
    >
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/5 blur-xl" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-orange-500/10 bg-gradient-to-br from-orange-500/15 to-orange-600/5">
          <AlertTriangle className="h-11 w-11 text-orange-500" />
        </div>
      </div>

      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-xl font-bold">{t('errorTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('errorBody')}</p>
      </div>

      <Button onClick={reset} variant="outline" className="gap-2">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        {t('retryButton')}
      </Button>
    </div>
  );
}
