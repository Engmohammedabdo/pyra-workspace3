/**
 * i18n core config — single source of truth for locales + the locale cookie.
 * Design spec: docs/superpowers/specs/2026-07-05-bilingual-i18n-design.md
 */
export const LOCALES = ['ar', 'en'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'ar';

/** Cookie is a CACHE of the DB preferred_language — DB always wins (LocaleSync heals drift). */
export const LOCALE_COOKIE = 'pyra_locale';
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

export function isLocale(v: unknown): v is Locale {
  return typeof v === 'string' && (LOCALES as readonly string[]).includes(v);
}

export function dirFor(locale: Locale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
