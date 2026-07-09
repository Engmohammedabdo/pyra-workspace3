'use client';

import { useTranslations } from 'next-intl';
import {
  MODULE_GUIDES,
  getModuleGuide as getModuleGuideEntry,
  type ModuleGuideEntry,
} from '@/lib/config/module-guide';

/**
 * Locale-resolved module guide content — the bilingual counterpart to the
 * structural `ModuleGuideEntry` in `lib/config/module-guide.ts`. `tips` and
 * `keywords` are rebuilt into arrays from the catalog's index-keyed objects
 * (`{ "0": "...", "1": "..." }`) so every existing `.map()`/`.some()` call
 * site keeps working untouched — see the ARRAY HAZARD note in the P6
 * module-guide census (catalogs must never store JSON arrays; deepMerge
 * replaces arrays wholesale, breaking the per-item AR fallback).
 */
export interface ResolvedModuleGuide {
  href: string;
  slug: string;
  description: string;
  goal: string;
  tips: string[];
  keywords: string[];
}

// Loosely-typed translator shape, cast ONCE from `useTranslations('guide')`.
// The `guide` namespace has ~1170 leaf paths (78 slugs × description/goal/
// up-to-10-tips/up-to-12-keywords) — resolving next-intl's real nested-key
// union against dynamically-built `${slug}.description`-style template keys
// at every call site risks "type instantiation is excessively deep" (the
// exact failure mode already documented at `components/dashboard/
// MyWorkInbox.tsx:126-134` for a MUCH smaller catalog). Runtime correctness
// is guaranteed elsewhere instead: `ModuleGuideSlug` (in module-guide.ts)
// type-checks every slug against the AR catalog at the MODULE_GUIDES
// declaration site, and the build step verifies AR/EN key-set parity.
interface GuideTranslator {
  (key: string, values?: Record<string, string | number>): string;
  raw(key: string): unknown;
}

function useGuideTranslator(): GuideTranslator {
  return useTranslations('guide') as unknown as GuideTranslator;
}

function keyedObjectToArray(obj: unknown): string[] {
  if (!obj || typeof obj !== 'object') return [];
  return Object.keys(obj as Record<string, string>)
    .sort((a, b) => Number(a) - Number(b))
    .map((k) => (obj as Record<string, string>)[k]);
}

function resolveEntry(t: GuideTranslator, entry: ModuleGuideEntry): ResolvedModuleGuide {
  return {
    href: entry.href,
    slug: entry.slug,
    description: t(`${entry.slug}.description`),
    goal: t(`${entry.slug}.goal`),
    tips: keyedObjectToArray(t.raw(`${entry.slug}.tips`)),
    keywords: keyedObjectToArray(t.raw(`${entry.slug}.keywords`)),
  };
}

/**
 * Resolve the guide entry for a route (exact match, then prefix walk-up —
 * mirrors `getModuleGuide()`). Used by `<PageGuide>` (the topbar help
 * popover), which auto-detects the current module from the URL.
 */
export function useModuleGuide(pathname: string): ResolvedModuleGuide | undefined {
  const t = useGuideTranslator();
  const entry = getModuleGuideEntry(pathname);
  if (!entry) return undefined;
  return resolveEntry(t, entry);
}

/**
 * Resolve every module guide entry, keyed identically to `MODULE_GUIDES`
 * (object key — NOT always equal to `href`; see the lead-detail tab entries
 * and the admin pseudo-entries, which share an `href` with a sibling but
 * have distinct object keys / catalog slugs). Used by the guide directory
 * page to render `SECTIONS[].hrefs` lookups and to build the search corpus.
 *
 * Also the sidebar + mobile-nav tooltip source: both call this ONCE at their
 * component top level, then do a plain `allGuides[item.href]?.description`
 * lookup inside their per-item render loop — a per-item `useTranslations`
 * call would violate the rules of hooks (variable call count per render).
 */
export function useAllModuleGuides(): Record<string, ResolvedModuleGuide> {
  const t = useGuideTranslator();
  const out: Record<string, ResolvedModuleGuide> = {};
  for (const [key, entry] of Object.entries(MODULE_GUIDES)) {
    out[key] = resolveEntry(t, entry);
  }
  return out;
}

/**
 * Locale-aware replacement for the old `searchModuleGuides()` — searches
 * across the RESOLVED (active-locale) description/goal/keywords, so an
 * English-locale user searching English terms matches English content
 * (previously the raw Arabic-only data was searched regardless of locale).
 * `keywords` intentionally keeps the Arabic terms too (see guide.json —
 * EN keywords are the AR set plus English additions), so Arabic search
 * terms keep matching in both locales.
 */
export function useModuleGuideSearch(query: string | undefined): ResolvedModuleGuide[] {
  const all = useAllModuleGuides();
  const list = Object.values(all);
  if (!query || query.trim() === '') return list;

  const q = query.toLowerCase();
  return list.filter(
    (m) =>
      m.description.toLowerCase().includes(q) ||
      m.goal.toLowerCase().includes(q) ||
      m.keywords.some((k) => k.toLowerCase().includes(q)),
  );
}
