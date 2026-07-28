/**
 * Plain (non-'use client') shared constant between the Server Component page
 * (./page.tsx) and its Client Component view (./public-quote-view.tsx).
 *
 * MUST live in a module without 'use client' — a Server Component importing
 * a value export from a 'use client' file gets a client-reference
 * placeholder instead of the real value (Next.js App Router only special-
 * cases component exports across that boundary), which silently broke the
 * very first version of this fix: `t('alreadySignedBody', { date:
 * DATE_TOKEN })` received an object instead of a string, next-intl's ICU
 * formatter failed, and the banner rendered the raw missing-message fallback
 * "publicdoc.alreadySignedBody" instead of the translated sentence (caught
 * in final-review Minor 1 live verification, before this file existed).
 *
 * Sentinel substituted for the real signed date at RENDER time — see the
 * long comment on `alreadySignedBody` in page.tsx for why this can't just be
 * a formatted date baked in server-side. Not a curly-brace ICU placeholder
 * on purpose: it travels through next-intl's `t(key, { date: DATE_TOKEN })`
 * as an opaque argument VALUE (never re-parsed as message syntax), but
 * keeping it free of `{`/`}` avoids relying on that distinction at all.
 */
export const DATE_TOKEN = '__SIGNED_DATE__';
