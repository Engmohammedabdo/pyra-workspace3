#!/usr/bin/env tsx
/**
 * pnpm db:record <version> [--by=<username>] [--notes="…"] [--force]
 *
 * Records a migration in pyra_schema_migrations. Phase 14.2 Commit 2.
 *
 *   <version>           Migration basename without .sql — e.g.
 *                       "017_pyra_schema_migrations". Required positional arg.
 *
 *   --by=<username>     pyra_users.username (or "bootstrap"/"system").
 *                       Falls back to ABDOU_USERNAME env var, then "system".
 *
 *   --notes="<text>"    Optional human-readable annotation.
 *
 *   --force             If a row already exists for <version>, UPDATE its
 *                       checksum + applied_at + applied_by + notes instead
 *                       of erroring. Use when intentionally re-applying a
 *                       migration whose file content has changed (rare).
 *
 * Behaviour:
 *   1. Reads supabase/migrations/<version>.sql from disk.
 *   2. Normalizes CRLF → LF (per docs/MIGRATIONS.md §8).
 *   3. Computes SHA-256 of the normalized content.
 *   4. Reads SUPABASE_SERVICE_ROLE_KEY from .env.local (NEVER from CLI).
 *   5. POSTs to https://pyraworkspacedb.pyramedia.cloud/pg/query.
 *   6. Prints the inserted/updated row + an exit code.
 *
 * Security:
 *   The service-role key MUST come from .env.local. The script will refuse
 *   to read it from process.env or CLI args — that path would expose it to
 *   shell history (`history | grep` is trivial). Standard env-from-file
 *   pattern, same as the curl helper in docs/MIGRATIONS.md §5.1.
 */

import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_HOST = 'pyraworkspacedb.pyramedia.cloud';
const MIGRATIONS_DIR = 'supabase/migrations';
const ENV_FILE = '.env.local';

// ── CLI parsing ────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): {
  version: string;
  by: string;
  notes: string | null;
  force: boolean;
} {
  const args = argv.slice(2);
  let version: string | null = null;
  let by: string | null = null;
  let notes: string | null = null;
  let force = false;

  for (const a of args) {
    if (a === '--force') {
      force = true;
    } else if (a.startsWith('--by=')) {
      by = a.slice('--by='.length);
    } else if (a.startsWith('--notes=')) {
      notes = a.slice('--notes='.length);
    } else if (!a.startsWith('--')) {
      if (version === null) version = a;
    }
  }

  if (!version) {
    fail(
      'Missing positional arg: <version>\n' +
        'Usage: pnpm db:record 017_pyra_schema_migrations [--by=abdou] [--notes="..."] [--force]',
    );
  }

  // Strip a trailing .sql if user includes it — friendly default.
  version = version.replace(/\.sql$/, '');

  // Validate version shape — NNN_topic (3+ digits, underscore, lowercase topic).
  if (!/^\d{3,}_[a-z0-9_]+$/.test(version)) {
    fail(
      `Invalid version "${version}".\n` +
        'Expected NNN_<lowercase_topic_underscored>, e.g. "017_pyra_schema_migrations".',
    );
  }

  // Intentional asymmetry vs the service-role key (which must come from
  // .env.local only): ABDOU_USERNAME is a NON-SENSITIVE username. Standard
  // shell-env fallback (like $USER / $LOGNAME) is fine here — there's no
  // security gain from gating it through a file read. The service-role key
  // is the only secret we treat as file-only.
  const finalBy = by ?? process.env.ABDOU_USERNAME ?? 'system';

  return { version, by: finalBy, notes, force };
}

// ── .env.local reader (service-role key) ───────────────────────────────────

function readServiceRoleKey(): string {
  if (!existsSync(ENV_FILE)) {
    fail(`${ENV_FILE} not found in cwd. Run from the repo root.`);
  }
  const env = readFileSync(ENV_FILE, 'utf8');
  // Match either:  KEY=value   OR   KEY="value"   OR   KEY='value'
  const match = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
  if (!match) {
    fail(`SUPABASE_SERVICE_ROLE_KEY not found in ${ENV_FILE}.`);
  }
  // Strip surrounding quotes if present.
  const raw = match[1].trim();
  const stripped = raw.replace(/^["']|["']$/g, '');
  if (stripped.length < 20) {
    fail(
      `SUPABASE_SERVICE_ROLE_KEY in ${ENV_FILE} looks malformed (length ${stripped.length}). Expected a JWT > 100 chars.`,
    );
  }
  return stripped;
}

// ── File read + LF-normalize + SHA-256 ─────────────────────────────────────

function computeChecksum(version: string): string {
  const path = join(MIGRATIONS_DIR, `${version}.sql`);
  if (!existsSync(path)) {
    fail(
      `Migration file not found: ${path}\n` +
        'Create the file first (copy from supabase/migrations/_template.sql), then re-run.',
    );
  }
  const raw = readFileSync(path, 'utf8');
  // LF-normalize per docs/MIGRATIONS.md §8 — prevents CRLF/LF drift false
  // positives on Windows. Both this script and db-check-drift.ts use the
  // identical normalization.
  const normalized = raw.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized).digest('hex');
}

// ── Supabase write via pg/query ────────────────────────────────────────────

async function queryDb(
  serviceKey: string,
  sql: string,
): Promise<unknown[]> {
  const res = await fetch(`https://${SUPABASE_HOST}/pg/query`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: serviceKey,
    },
    body: JSON.stringify({ query: sql }),
  });
  if (!res.ok) {
    const text = await res.text();
    fail(`pg/query HTTP ${res.status}: ${text}`);
  }
  const json = (await res.json()) as unknown;
  if (Array.isArray(json)) return json;
  // Error responses come back as a single object with `error` + `message`.
  if (json && typeof json === 'object' && 'error' in json) {
    fail(`pg/query error: ${JSON.stringify(json)}`);
  }
  return [];
}

// ── Main ───────────────────────────────────────────────────────────────────

function escapeSqlString(s: string): string {
  // Postgres single-quote escaping: replace ' with ''. The query goes
  // through pg/query (Kong → Postgres) as a JSON-wrapped string, so the
  // only SQL-injection vector is unescaped single quotes inside our
  // values. This handles that one case.
  return s.replace(/'/g, "''");
}

async function main(): Promise<void> {
  const { version, by, notes, force } = parseArgs(process.argv);
  const serviceKey = readServiceRoleKey();
  const checksum = computeChecksum(version);

  console.log(`Migration: ${version}`);
  console.log(`Checksum:  ${checksum}`);
  console.log(`Applied by: ${by}`);
  if (notes) console.log(`Notes:     ${notes}`);
  console.log('');

  const sqlNotes = notes === null ? 'NULL' : `'${escapeSqlString(notes)}'`;
  const sqlBy = `'${escapeSqlString(by)}'`;
  const sqlVersion = `'${escapeSqlString(version)}'`;
  const sqlChecksum = `'${escapeSqlString(checksum)}'`;

  // ON CONFLICT branch depends on --force flag:
  //   default: DO NOTHING (silent skip if row exists — caller can rerun without error)
  //   --force: DO UPDATE (overwrites checksum + applied_at + by + notes — for intentional re-record)
  const conflictClause = force
    ? `ON CONFLICT (version) DO UPDATE SET
         checksum = EXCLUDED.checksum,
         applied_at = NOW(),
         applied_by = EXCLUDED.applied_by,
         notes = EXCLUDED.notes`
    : 'ON CONFLICT (version) DO NOTHING';

  const insertSql = `
    INSERT INTO pyra_schema_migrations (version, applied_at, applied_by, checksum, notes)
    VALUES (${sqlVersion}, NOW(), ${sqlBy}, ${sqlChecksum}, ${sqlNotes})
    ${conflictClause}
    RETURNING version, applied_at, applied_by, checksum, notes
  `.trim();

  const rows = (await queryDb(serviceKey, insertSql)) as Array<{
    version: string;
    applied_at: string;
    applied_by: string;
    checksum: string;
    notes: string | null;
  }>;

  if (rows.length === 0) {
    // ON CONFLICT DO NOTHING path — row already existed; not an error.
    console.log(
      `⚠️  Row for ${version} already exists. No change. (Pass --force to overwrite.)`,
    );
    process.exit(0);
  }

  const row = rows[0];
  const action = force ? '✅ Recorded (or updated via --force)' : '✅ Recorded';
  console.log(action);
  console.log(`  version:    ${row.version}`);
  console.log(`  applied_at: ${row.applied_at}`);
  console.log(`  applied_by: ${row.applied_by}`);
  console.log(`  checksum:   ${row.checksum}`);
  if (row.notes) console.log(`  notes:      ${row.notes}`);
}

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
