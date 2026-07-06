/**
 * i18n regression guard (design §13.2).
 * 1. No hardcoded Arabic literals in MIGRATED source paths.
 * 2. No EN catalog key missing from AR (orphan-key guard).
 * Run: pnpm i18n:check   (wire into the pre-push routine alongside pnpm run check)
 * Escape hatch: append `// i18n-exempt: <reason>` on the same line.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();

/** Paths fully migrated to catalogs — GROWS at the end of every phase. */
const MIGRATED_PATHS: string[] = [
  'i18n',
  'lib/i18n',
  'scripts/i18n-check.ts',
  // Phase 0
  'components/layout/locale-switcher.tsx',
  'components/layout/locale-sync.tsx',
  'components/layout/locale-toggle-anon.tsx',
  // Phase 1 — app shell
  'components/layout/nav-config.ts',
  'components/layout/sidebar.tsx',
  'components/layout/mobile-nav.tsx',
  'components/layout/topbar.tsx',
  'components/layout/breadcrumb.tsx',
  'components/layout/CommandPalette.tsx',
  'components/layout/NotificationBell.tsx',
  'components/ui/page-guide.tsx',
  'components/ui/data-table.tsx',
  'components/ui/pagination.tsx',
  'components/ui/search-input.tsx',
  'components/ui/sheet.tsx',
  'components/ui/error-boundary.tsx',
  'components/ui/error-card.tsx',
  'components/ui/mention-textarea.tsx',
  'components/ui/scroll-area.tsx',
  'components/portal/portal-nav-config.ts',
  'components/portal/portal-sidebar.tsx',
  'components/portal/portal-mobile-nav.tsx',
  'components/portal/portal-topbar.tsx',
  'app/(auth)/login/page.tsx',
  'app/portal/(auth)',
  'app/api/portal/auth',
  // Phase 2 — work core
  'components/dashboard/MyWorkInbox.tsx',
  'components/dashboard/MyCalendarWidget.tsx',
  'app/dashboard/my-tasks',
  'app/dashboard/boards',
  'components/boards',
  'app/dashboard/calendar',
  'components/calendar',
  'app/api/calendar',
  'app/api/boards',
  'app/api/tasks',
  'app/api/my-tasks',
  // Phase 3 — CRM
  'app/dashboard/crm',
  'components/crm',
  'app/api/crm',
  'hooks/useLeads.ts',
];

const ARABIC = /[؀-ۿ]/; // i18n-exempt: Unicode range literal, not translatable text
const EXEMPT = 'i18n-exempt';

export function scanSource(source: string): number[] {
  const hits: number[] = [];
  source.split('\n').forEach((line, i) => {
    if (ARABIC.test(line) && !line.includes(EXEMPT)) hits.push(i + 1);
  });
  return hits;
}

export function findOrphanKeys(
  ar: Record<string, unknown>,
  en: Record<string, unknown>,
  prefix = '',
): string[] {
  const orphans: string[] = [];
  for (const [key, value] of Object.entries(en)) {
    const arValue = ar[key];
    if (arValue === undefined) {
      orphans.push(`${prefix}${key}`);
    } else if (
      value !== null && typeof value === 'object' && !Array.isArray(value) &&
      arValue !== null && typeof arValue === 'object' && !Array.isArray(arValue)
    ) {
      orphans.push(...findOrphanKeys(
        arValue as Record<string, unknown>,
        value as Record<string, unknown>,
        `${prefix}${key}.`,
      ));
    }
  }
  return orphans;
}

function collectSourceFiles(path: string): string[] {
  const full = join(ROOT, path);
  const st = statSync(full, { throwIfNoEntry: false });
  if (!st) return [];
  if (st.isFile()) return /\.tsx?$/.test(path) ? [full] : [];
  return readdirSync(full, { recursive: true, encoding: 'utf8' })
    .filter((f) => /\.tsx?$/.test(f))
    .map((f) => join(full, f));
}

function main(): void {
  let failed = false;

  for (const path of MIGRATED_PATHS) {
    const files = collectSourceFiles(path);
    if (files.length === 0) {
      // A typo'd manifest entry must fail LOUD — silently scanning nothing
      // permanently disables coverage for that path (final-review finding).
      console.error(`MANIFEST PATH MISSING/EMPTY  ${path}`);
      failed = true;
      continue;
    }
    for (const file of files) {
      const hits = scanSource(readFileSync(file, 'utf8'));
      for (const line of hits) {
        console.error(`ARABIC LITERAL  ${relative(ROOT, file)}:${line}`);
        failed = true;
      }
    }
  }

  const namespaces = readdirSync(join(ROOT, 'messages/ar')).filter((f) => f.endsWith('.json'));
  for (const file of namespaces) {
    const ar = JSON.parse(readFileSync(join(ROOT, 'messages/ar', file), 'utf8'));
    let en: Record<string, unknown> = {};
    try {
      en = JSON.parse(readFileSync(join(ROOT, 'messages/en', file), 'utf8'));
    } catch {
      // Missing EN file is fine — full-fallback to Arabic.
    }
    for (const orphan of findOrphanKeys(ar, en)) {
      console.error(`ORPHAN EN KEY   messages/en/${file} → ${orphan} (missing from ar)`);
      failed = true;
    }
  }

  if (failed) process.exit(1);
  console.log('i18n:check ✓ clean');
}

if (process.argv[1]?.includes('i18n-check')) main();
