import { cookies } from 'next/headers';
import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale } from '@/lib/i18n/config';
import { loadMessages } from '@/lib/i18n/messages';

export default getRequestConfig(async ({ requestLocale }) => {
  // `requestLocale` only resolves to something other than undefined when the
  // caller explicitly overrode it — `getTranslations({ locale, ... })` (server.js
  // sets `params.locale`, which this getter echoes straight back without
  // touching headers). Normal calls (getLocale(), getTranslations(namespace))
  // never populate it, because this app has no next-intl routing middleware
  // to set the x-next-intl-locale header — so they fall through to the cookie,
  // unchanged from before. Recipient-language rendering (cron/webhook/public-
  // document contexts, e.g. app/d/[token]/page.tsx) depends on the override
  // actually winning here; without this, an explicit `locale: 'en'` request
  // silently rendered the cookie's locale instead — cookie 'ar' by default
  // for a session-less anonymous visitor, i.e. the exact case the override
  // exists to handle.
  const requested = await requestLocale;
  let locale = isLocale(requested) ? requested : undefined;
  if (!locale) {
    const store = await cookies();
    const raw = store.get(LOCALE_COOKIE)?.value;
    locale = isLocale(raw) ? raw : DEFAULT_LOCALE;
  }

  return {
    locale,
    messages: await loadMessages(locale),
  };
});
