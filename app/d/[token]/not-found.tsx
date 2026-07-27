import { getTranslations } from 'next-intl/server';
import { FileQuestion } from 'lucide-react';
import { DEFAULT_LOCALE, dirFor } from '@/lib/i18n/config';

// Unknown, revoked and expired document-link tokens all reach this exact
// boundary (see the three notFound() calls in ./page.tsx) — a harvested
// token must never be confirmable as "once real" by getting a different
// response than a token that was always fake (S-10). That indistinguishability
// requirement is why this page renders a fixed locale rather than trying to
// resolve one: at the point any of those three notFound() calls fires, the
// quote's client (and therefore its preferred_language) may not even have
// been looked up yet, so there is no per-token signal left to branch on
// without breaking the guarantee.
//
// It also deliberately contains no link into the product (no /dashboard,
// no /portal) — unlike the generic app/not-found.tsx, this page is reached
// by an unauthenticated customer from an external WhatsApp link, and an
// admin-login button here would be routing a customer straight at the
// company's internal tooling.
export default async function PublicDocumentNotFound() {
  const t = await getTranslations({ locale: DEFAULT_LOCALE, namespace: 'publicdoc' });

  return (
    <div
      dir={dirFor(DEFAULT_LOCALE)}
      lang={DEFAULT_LOCALE}
      className="flex min-h-screen flex-col items-center justify-center gap-6 bg-background p-6"
    >
      <div className="relative">
        <div className="absolute inset-0 scale-150 rounded-full bg-gradient-to-br from-orange-500/20 to-orange-600/5 blur-xl" />
        <div className="relative flex h-24 w-24 items-center justify-center rounded-full border border-orange-500/10 bg-gradient-to-br from-orange-500/15 to-orange-600/5">
          <FileQuestion className="h-11 w-11 text-orange-500" />
        </div>
      </div>

      <div className="max-w-md space-y-2 text-center">
        <h1 className="text-xl font-bold">{t('invalidTitle')}</h1>
        <p className="text-sm text-muted-foreground">{t('invalidBody')}</p>
      </div>
    </div>
  );
}
