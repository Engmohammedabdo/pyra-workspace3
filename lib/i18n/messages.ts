import type { Locale } from './config';

/**
 * One entry per messages/<locale>/<name>.json file. Each file holds exactly
 * ONE top-level namespace (its own name) — files merge with a shallow spread,
 * so splitting a namespace across two files would silently drop keys.
 * Grows per phase: Phase 1 adds 'nav', 'auth', 'statuses'. Phase 2 adds
 * 'mywork', 'boards', 'calendar', 'api'. Phase 3 adds 'crm'. Phase 4 adds
 * 'finance'. Phase 5 adds 'hr'.
 */
export const NAMESPACE_FILES = [
  'common', 'nav', 'auth', 'statuses',
  'mywork', 'boards', 'calendar', 'api',
  'crm', 'finance', 'hr',
] as const;

type Messages = Record<string, unknown>;

/**
 * Recursive merge — `override` wins per-leaf; keys missing from `override`
 * keep the `base` value. This IS the D7 Arabic-fallback guarantee: EN is
 * merged OVER the full AR tree, so an untranslated key renders Arabic.
 * Pure (does not mutate inputs). Arrays are replaced wholesale, not merged.
 */
export function deepMerge(base: Messages, override: Messages): Messages {
  const out: Messages = { ...base };
  for (const [key, value] of Object.entries(override)) {
    const existing = out[key];
    if (
      value !== null && typeof value === 'object' && !Array.isArray(value) &&
      existing !== null && typeof existing === 'object' && !Array.isArray(existing)
    ) {
      out[key] = deepMerge(existing as Messages, value as Messages);
    } else {
      out[key] = value;
    }
  }
  return out;
}

async function loadLocaleFiles(locale: Locale): Promise<Messages> {
  const parts = await Promise.all(
    NAMESPACE_FILES.map(
      (name) => import(`../../messages/${locale}/${name}.json`).then((m) => m.default as Messages),
    ),
  );
  return Object.assign({}, ...parts);
}

export async function loadMessages(locale: Locale): Promise<Messages> {
  const ar = await loadLocaleFiles('ar');
  if (locale === 'ar') return ar;
  return deepMerge(ar, await loadLocaleFiles(locale));
}
