import type { Locale } from './config';

/**
 * One entry per messages/<locale>/<name>.json file. Each file holds exactly
 * ONE top-level namespace (its own name) — files merge with a shallow spread,
 * so splitting a namespace across two files would silently drop keys.
 * Grows per phase: Phase 1 adds 'nav', 'auth', 'statuses'. Phase 2 adds
 * 'mywork', 'boards', 'calendar', 'api'. Phase 3 adds 'crm'. Phase 4 adds
 * 'finance'. Phase 5 adds 'hr'. Phase 6a adds 'settings', 'admin', 'users',
 * 'rbac'. Phase 6b adds 'guide' (module-guide catalog — 78 entries, keyed-
 * object tips/keywords; see lib/config/module-guide.ts + lib/i18n/
 * module-guide-labels.ts). Phase 6c adds 'clients', 'projects', 'files',
 * 'teams' (empty scaffolds at foundation time — filled by the UI-migration
 * tasks in the same wave; `components/files/*` is shared dashboard+portal,
 * so `files.*` must stay reachable from both shells). Task 7 (CRM calls
 * report) adds a standalone 'calls' namespace. Public quote signing Task 5
 * adds 'publicdoc' — the unauthenticated /d/<token> page's own copy
 * (invalid/expired/already-signed/etc. states), rendered per-recipient-
 * locale rather than per-session-cookie, hence a namespace of its own.
 */
export const NAMESPACE_FILES = [
  'common', 'nav', 'auth', 'statuses',
  'mywork', 'boards', 'calendar', 'api',
  'crm', 'finance', 'hr',
  'settings', 'admin', 'users', 'rbac',
  'guide',
  'clients', 'projects', 'files', 'teams',
  'calls',
  'publicdoc',
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

/**
 * Narrow loader for a single sub-tree of ONE namespace file — deliberately
 * NOT the full merged catalog `loadMessages()` builds (~508 KB AR / ~930 KB
 * EN-merged, since it imports all of NAMESPACE_FILES). First caller: the
 * public /d/<token> quote page (app/d/[token]/page.tsx). That page already
 * sits inside the root layout's own <NextIntlClientProvider> (which
 * auto-inherits the full catalog for every route — accepted baseline cost,
 * not this function's concern), and used to ALSO mount a second nested
 * provider with the full catalog again just so its one client component
 * (QuoteDetailView) could resolve `useTranslations('finance.quotes.detail')`
 * — doubling ~1 MB of JSON on the single page in the product most likely to
 * be opened on a customer's mobile data. Everything else on that page
 * already arrives pre-rendered via a `copy` prop, so only that one sub-tree
 * needs to travel through a client provider at all.
 *
 * Only imports `messages/{ar,en}/<namespaceFile>.json` (not all ~20 files)
 * and returns the `path` sub-tree reshaped back into its original nesting,
 * so `<NextIntlClientProvider messages={...}>` resolves
 * `useTranslations(path)` exactly like the full catalog would.
 */
export async function loadMessageSlice(
  locale: Locale,
  namespaceFile: string,
  path: string,
): Promise<Messages> {
  const ar = (await import(`../../messages/ar/${namespaceFile}.json`)).default as Messages;
  const merged =
    locale === 'ar'
      ? ar
      : deepMerge(ar, (await import(`../../messages/en/${namespaceFile}.json`)).default as Messages);

  const keys = path.split('.');
  let node: unknown = merged;
  for (const key of keys) {
    node = (node as Messages | undefined)?.[key];
  }

  const root: Messages = {};
  let cursor = root;
  for (let i = 0; i < keys.length - 1; i++) {
    const branch: Messages = {};
    cursor[keys[i]] = branch;
    cursor = branch;
  }
  cursor[keys[keys.length - 1]] = node ?? {};
  return root;
}
