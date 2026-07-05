'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';
import { LOCALE_COOKIE, LOCALE_COOKIE_MAX_AGE, isLocale } from '@/lib/i18n/config';

/**
 * Heals cookie↔DB drift: the DB preferred_language is the source of truth,
 * the pyra_locale cookie is a cache. On a new device / cleared cookies the
 * cookie is absent → request renders with DEFAULT_LOCALE while the user's DB
 * preference may differ. This mounts in the authed layouts, writes the cookie
 * once, and refreshes. One-shot ref guards against refresh loops.
 */
export function LocaleSync({ dbLocale }: { dbLocale: string | null | undefined }) {
  const active = useLocale();
  const router = useRouter();
  const synced = useRef(false);

  useEffect(() => {
    if (synced.current) return;
    if (!isLocale(dbLocale) || dbLocale === active) return;
    synced.current = true;
    document.cookie = `${LOCALE_COOKIE}=${dbLocale}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    router.refresh();
  }, [dbLocale, active, router]);

  return null;
}
