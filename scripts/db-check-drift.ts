#!/usr/bin/env tsx
/**
 * pnpm db:check-drift
 *
 * Compares pyra_schema_migrations rows against on-disk migration files.
 * Reports three inconsistency categories. Phase 14.2 Commit 2.
 *
 * Categories (exit code 1 if ANY found):
 *   ❌ DRIFT     File exists + row exists + checksums don't match
 *                → file was edited POST-apply. Restore content OR write
 *                  a new migration to formalize the change.
 *
 *   ⚠️  MISSING  File exists on disk, no row in pyra_schema_migrations
 *                → after applying the migration, run `pnpm db:record`.
 *
 *   🗑️  ORPHAN   Row exists in table, no matching file on disk
 *                → file was deleted/renamed. Review git history before
 *                  deciding to remove the row.
 *
 * Output format:
 *   - All clean      → exit 0, prints "✅ All migrations clean (N tracked)"
 *   - Issues found   → exit 1, prints categorized list
 *
 * Drift detection is LF-normalized: file content has CRLF → LF replacement
 * applied before SHA-256 (per docs/MIGRATIONS.md §8). Identical normalization
 * to db-record-migration.ts — they MUST stay in sync.
 */

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SUPABASE_HOST = 'pyraworkspacedb.pyramedia.cloud';
const MIGRATIONS_DIR = 'supabase/migrations';
const ENV_FILE = '.env.local';

// ── Helpers (mirror db-record-migration.ts) ────────────────────────────────

function readServiceRoleKey(): string {
  if (!existsSync(ENV_FILE)) {
    fail(`${ENV_FILE} not found in cwd. Run from the repo root.`);
  }
  const env = readFileSync(ENV_FILE, 'utf8');
  const match = env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m);
  if (!match) {
    fail(`SUPABASE_SERVICE_ROLE_KEY not found in ${ENV_FILE}.`);
  }
  const stripped = match[1].trim().replace(/^["']|["']$/g, '');
  if (stripped.length < 20) {
    fail(`SUPABASE_SERVICE_ROLE_KEY looks malformed (length ${stripped.length}).`);
  }
  return stripped;
}

function listMigrationFiles(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d{3,}_.*\.sql$/.test(f))
    .sort();
}

function computeChecksum(path: string): string {
  const raw = readFileSync(path, 'utf8');
  // LF-normalize per docs/MIGRATIONS.md §8 — must match db-record-migration.ts.
  const normalized = raw.replace(/\r\n/g, '\n');
  return createHash('sha256').update(normalized).digest('hex');
}

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
  if (json && typeof json === 'object' && 'error' in json) {
    fail(`pg/query error: ${JSON.stringify(json)}`);
  }
  return [];
}

interface DbRow {
  version: string;
  checksum: string | null;
  applied_at: string;
  applied_by: string | null;
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const serviceKey = readServiceRoleKey();

  // ── Build the on-disk side: { version → checksum } ──
  const files = listMigrationFiles();
  const onDisk = new Map<string, string>();
  for (const file of files) {
    const version = file.replace(/\.sql$/, '');
    onDisk.set(version, computeChecksum(join(MIGRATIONS_DIR, file)));
  }

  // ── Build the DB side ──
  const rows = (await queryDb(
    serviceKey,
    'SELECT version, checksum, applied_at, applied_by FROM pyra_schema_migrations ORDER BY version',
  )) as DbRow[];
  const inDb = new Map<string, DbRow>();
  for (const row of rows) inDb.set(row.version, row);

  // ── Compare ──
  const drift: Array<{ version: string; file: string; db: string }> = [];
  const missing: string[] = [];
  const orphan: DbRow[] = [];

  for (const [version, fileChecksum] of onDisk) {
    const dbRow = inDb.get(version);
    if (!dbRow) {
      missing.push(version);
    } else if (dbRow.checksum !== fileChecksum) {
      drift.push({ version, file: fileChecksum, db: dbRow.checksum ?? '(null)' });
    }
  }

  for (const [version, row] of inDb) {
    if (!onDisk.has(version)) orphan.push(row);
  }

  // ── Report ──
  console.log(`Tracked in pyra_schema_migrations: ${rows.length}`);
  console.log(`Found on disk:                     ${files.length}`);
  console.log('');

  const hasIssues = drift.length + missing.length + orphan.length > 0;

  if (!hasIssues) {
    console.log(`✅ All migrations clean (${rows.length} tracked, no drift)`);
    process.exit(0);
  }

  if (drift.length > 0) {
    console.log(`❌ DRIFT (${drift.length}) — file edited post-apply:`);
    for (const d of drift) {
      console.log(`   ${d.version}`);
      console.log(`     file checksum: ${d.file}`);
      console.log(`     db   checksum: ${d.db}`);
    }
    console.log(
      '   Fix: restore the file to its applied content OR write a new migration to formalize the change.',
    );
    console.log('');
  }

  if (missing.length > 0) {
    console.log(`⚠️  MISSING (${missing.length}) — file exists, no row in pyra_schema_migrations:`);
    for (const v of missing) {
      console.log(`   ${v}`);
    }
    console.log(
      '   Fix: verify the migration was applied (manual SELECT against the affected tables), then run `pnpm db:record <version> --by=<you>`.',
    );
    console.log('');
  }

  if (orphan.length > 0) {
    console.log(`🗑️  ORPHAN (${orphan.length}) — row in table, file missing on disk:`);
    for (const r of orphan) {
      console.log(`   ${r.version}  (applied ${r.applied_at} by ${r.applied_by ?? '(unknown)'})`);
    }
    console.log(
      '   Fix: review git history for the missing file. If it was renamed, write a new migration to update the row. If truly deleted, DELETE the row via pg/query.',
    );
    console.log('');
  }

  process.exit(1);
}

function fail(message: string): never {
  console.error(`❌ ${message}`);
  process.exit(1);
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
