#!/usr/bin/env tsx
/**
 * npx tsx scripts/backfill-zero-duration-contact.ts [--apply] [--run-id=<id>]
 *
 * One-time data backfill for the "0-second dial counted as contact" bug that
 * `isConnectedCall` (lib/calls/match.ts, calls-urgent-fixes Task 1) closed.
 * Before that fix, ANY outgoing call (`direction !== 'missed'`) with
 * `duration_seconds === 0` (dialed, never answered) was treated as a genuine
 * contact: it wrote a `call_logged` pyra_lead_activities row AND stamped
 * pyra_sales_leads.last_contact_at. This script does NOT change any code
 * path — it only removes data the bug already wrote.
 *
 * Owner decision (Abdou, 2026-07-25): FULL CLEANUP.
 *   1. DELETE every `call_logged` activity whose metadata.duration_seconds === 0.
 *   2. For every lead referenced by one of those activities, OR whose
 *      last_contact_at exactly matches (to the minute) a 0-second call's
 *      called_at, recompute:
 *        last_contact_at = MAX(called_at) over that lead's GENUINE calls
 *        (direction <> 'missed' AND duration_seconds > 0), or NULL if it
 *        has none.
 *      Nulling is safe: every downstream consumer (deals-at-risk,
 *      lead-idle-check) reads
 *        greatest(last_contact_at, latest pyra_lead_activities.created_at)
 *      — a real WhatsApp/manual touch still registers via the activity half.
 *
 * Safety (see uf-task-2-brief.md):
 *   - Dry run is the DEFAULT. Nothing is mutated unless --apply is passed.
 *   - The snapshot (backups/zero-duration-backfill-<runId>.json) is written
 *     and existence-verified BEFORE any mutation. If it can't be written,
 *     the script aborts — no snapshot, no write.
 *   - Deletes/updates run in batches of <= 200 ids/rows per SQL statement;
 *     every batch's response is checked for an `error` key and the FIRST
 *     failure aborts the whole run immediately (no retry, no partial-then-
 *     continue). An unbounded `.in()`/`IN (...)` over the full set is
 *     exactly the defect Task 3 fixes elsewhere — this script must not
 *     reproduce it.
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are read from
 *     .env.local by FILE READ ONLY (never process.env, never a CLI arg,
 *     never logged) — same discipline as scripts/db-record-migration.ts.
 *
 * Reversal: every mutated row (fake activity incl. full metadata, and every
 * updated lead's OLD last_contact_at + the computed new value) is recorded
 * in the snapshot file — restore by hand from there if this is ever found
 * to be wrong.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ENV_FILE = '.env.local';
const BACKUP_DIR = 'backups';
const BATCH_SIZE = 200;

// ── CLI ──────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): { apply: boolean; runId: string } {
  const args = argv.slice(2);
  const apply = args.includes('--apply');
  const runIdArg = args.find((a) => a.startsWith('--run-id='));
  const runId = runIdArg ? runIdArg.slice('--run-id='.length) : String(Date.now());
  if (!/^[a-zA-Z0-9._-]+$/.test(runId)) {
    fail(`Invalid --run-id "${runId}" — must match [a-zA-Z0-9._-]+ (used in a file path).`);
  }
  return { apply, runId };
}

// ── .env.local reader — FILE READ ONLY, never process.env ──────────────────

function readEnvValue(key: string): string {
  if (!existsSync(ENV_FILE)) fail(`${ENV_FILE} not found — run from the repo root.`);
  const env = readFileSync(ENV_FILE, 'utf8');
  const match = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match) fail(`${key} not found in ${ENV_FILE}.`);
  return match[1].trim().replace(/^["']|["']$/g, '');
}

// ── pg/query helper (same request contract as scripts/db-record-migration.ts) ──

async function queryDb(endpoint: string, serviceKey: string, sql: string): Promise<unknown[]> {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', apikey: serviceKey },
    body: JSON.stringify({ query: sql }),
  });
  const text = await res.text();
  if (!res.ok) fail(`pg/query HTTP ${res.status}: ${text.slice(0, 500)}`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    fail(`pg/query returned non-JSON: ${text.slice(0, 500)}`);
  }
  // Error responses come back as a single object with `error` (+ `message`).
  // Checked on EVERY call (read or write) — a batch write that fails here
  // aborts the whole run via fail() (process.exit(1)), satisfying "abort on
  // the first failure."
  if (json && typeof json === 'object' && !Array.isArray(json) && 'error' in json) {
    fail(`pg/query error: ${JSON.stringify(json)}`);
  }
  return Array.isArray(json) ? json : [];
}

function escapeSqlString(s: string): string {
  return s.replace(/'/g, "''");
}

function sqlIdList(ids: string[]): string {
  return ids.map((id) => `'${escapeSqlString(id)}'`).join(', ');
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

function normalizeTs(v: string | null): string | null {
  if (v === null || v === undefined) return null;
  return new Date(v).toISOString();
}

// ── Types ────────────────────────────────────────────────────────────────

interface FakeActivityRow {
  id: string;
  lead_id: string;
  created_at: string;
  metadata: unknown;
}

interface AffectedLeadRow {
  lead_id: string;
  current_last_contact_at: string | null;
  genuine_max: string | null;
}

// ── SQL (hand-verified against prod on 2026-07-25 before this script existed) ──

const SQL_FAKE_ACTIVITIES = `
  SELECT id, lead_id, created_at, metadata
  FROM pyra_lead_activities
  WHERE activity_type = 'call_logged' AND (metadata->>'duration_seconds')::int = 0
  ORDER BY id
`;

// Affected leads = UNION of (a) every lead referenced by a fake activity and
// (b) every lead whose last_contact_at exactly matches (to the minute) a
// 0-second call's called_at. Deliberately narrower than "every lead with any
// call" — a lead whose last_contact_at came from a real WhatsApp/manual
// touch must never be rewritten just because it also has an unrelated
// 0-second call somewhere in its history.
const SQL_AFFECTED_LEADS = `
  WITH activity_leads AS (
    SELECT DISTINCT lead_id
    FROM pyra_lead_activities
    WHERE activity_type = 'call_logged' AND (metadata->>'duration_seconds')::int = 0
  ),
  poisoned_leads AS (
    SELECT DISTINCT l.id AS lead_id
    FROM pyra_sales_leads l
    JOIN pyra_agent_calls c ON c.lead_id = l.id
    WHERE c.duration_seconds = 0 AND c.direction <> 'missed'
      AND l.last_contact_at IS NOT NULL
      AND date_trunc('minute', l.last_contact_at) = date_trunc('minute', c.called_at)
  ),
  affected AS (
    SELECT lead_id FROM activity_leads
    UNION
    SELECT lead_id FROM poisoned_leads
  )
  SELECT
    l.id AS lead_id,
    l.last_contact_at AS current_last_contact_at,
    (
      SELECT max(c2.called_at)
      FROM pyra_agent_calls c2
      WHERE c2.lead_id = l.id AND c2.duration_seconds > 0 AND c2.direction <> 'missed'
    ) AS genuine_max
  FROM pyra_sales_leads l
  JOIN affected a ON a.lead_id = l.id
  ORDER BY l.id
`;

const SQL_MEASURE_FAKE_ACTIVITIES = `
  SELECT count(*) AS fake_activities
  FROM pyra_lead_activities a
  WHERE a.activity_type = 'call_logged' AND (a.metadata->>'duration_seconds')::int = 0
`;

const SQL_MEASURE_POISONED_LEADS = `
  SELECT count(DISTINCT l.id) AS poisoned_leads
  FROM pyra_sales_leads l
  JOIN pyra_agent_calls c ON c.lead_id = l.id
  WHERE c.duration_seconds = 0 AND c.direction <> 'missed'
    AND l.last_contact_at IS NOT NULL
    AND date_trunc('minute', l.last_contact_at) = date_trunc('minute', c.called_at)
`;

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { apply, runId } = parseArgs(process.argv);
  const supabaseUrl = readEnvValue('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = readEnvValue('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey.length < 100) {
    fail('SUPABASE_SERVICE_ROLE_KEY looks malformed (too short — expected a JWT).');
  }
  const endpoint = `${supabaseUrl.replace(/\/$/, '')}/pg/query`;

  console.log(`Mode: ${apply ? 'APPLY (will mutate)' : 'DRY RUN (default — pass --apply to mutate)'}`);
  console.log(`Run id: ${runId}`);
  console.log('');

  // 1. Read the two source-of-truth sets.
  const fakeActivities = (await queryDb(endpoint, serviceKey, SQL_FAKE_ACTIVITIES)) as FakeActivityRow[];
  const affectedLeads = (await queryDb(endpoint, serviceKey, SQL_AFFECTED_LEADS)) as AffectedLeadRow[];

  // Skip leads whose computed value already equals the current value
  // (idempotent no-op — e.g. a later genuine call already overwrote the
  // poisoned timestamp with the correct one).
  const leadsToUpdate = affectedLeads.filter(
    (l) => normalizeTs(l.genuine_max) !== normalizeTs(l.current_last_contact_at),
  );
  const toNull = leadsToUpdate.filter((l) => l.genuine_max === null);
  const toEarlier = leadsToUpdate.filter((l) => l.genuine_max !== null);

  // 2. Snapshot BEFORE any write — abort if it can't be written or verified.
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const snapshotPath = join(BACKUP_DIR, `zero-duration-backfill-${runId}.json`);
  const snapshot = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    fake_activities: fakeActivities,
    affected_leads_candidate_set: affectedLeads,
    leads_to_update: leadsToUpdate,
  };
  try {
    writeFileSync(snapshotPath, JSON.stringify(snapshot, null, 2), 'utf8');
  } catch (err) {
    fail(`Could not write snapshot to ${snapshotPath}: ${err instanceof Error ? err.message : err}`);
  }
  if (!existsSync(snapshotPath)) {
    fail(`Snapshot write reported success but the file is missing: ${snapshotPath}`);
  }
  console.log(`Snapshot written: ${snapshotPath}`);
  console.log('');

  // 3. Summary
  console.log('── Summary ──────────────────────────────────────────');
  console.log(`Fake call_logged activities to delete: ${fakeActivities.length}`);
  console.log(`Leads in the affected candidate set:    ${affectedLeads.length}`);
  console.log(`Leads that actually need an update:     ${leadsToUpdate.length}`);
  console.log(`  -> NULL (no genuine call ever):        ${toNull.length}`);
  console.log(`  -> an earlier genuine timestamp:       ${toEarlier.length}`);
  console.log(`  (already correct, skipped):            ${affectedLeads.length - leadsToUpdate.length}`);
  console.log('─────────────────────────────────────────────────────');
  console.log('');

  if (!apply) {
    console.log('Dry run only — nothing mutated. Re-run with --apply to write changes.');
    return;
  }

  // 4. Apply — batched deletes, batched updates. queryDb() calls fail() (and
  // exits the process) on the first error, so there is no separate abort
  // branch here — a failed batch stops execution immediately, before any
  // later batch runs.
  const activityIdBatches = chunk(fakeActivities.map((a) => a.id), BATCH_SIZE);
  let deletedCount = 0;
  for (const [i, batch] of activityIdBatches.entries()) {
    const sql = `DELETE FROM pyra_lead_activities WHERE id IN (${sqlIdList(batch)})`;
    await queryDb(endpoint, serviceKey, sql);
    deletedCount += batch.length;
    console.log(`Deleted activities batch ${i + 1}/${activityIdBatches.length} (${batch.length} ids) — running total ${deletedCount}`);
  }

  // Heterogeneous per-row target values -> one UPDATE ... FROM (VALUES ...)
  // statement per batch of <= 200 rows (still a single round trip per batch,
  // never a per-row request and never one unbounded statement for the full set).
  const updateBatches = chunk(leadsToUpdate, BATCH_SIZE);
  let updatedCount = 0;
  for (const [i, batch] of updateBatches.entries()) {
    const values = batch
      .map((l) => {
        const newVal = l.genuine_max === null ? 'NULL' : `'${escapeSqlString(l.genuine_max)}'::timestamptz`;
        return `('${escapeSqlString(l.lead_id)}', ${newVal})`;
      })
      .join(', ');
    const sql = `
      UPDATE pyra_sales_leads AS t
      SET last_contact_at = v.new_last_contact_at
      FROM (VALUES ${values}) AS v(lead_id, new_last_contact_at)
      WHERE t.id = v.lead_id
    `;
    await queryDb(endpoint, serviceKey, sql);
    updatedCount += batch.length;
    console.log(`Updated leads batch ${i + 1}/${updateBatches.length} (${batch.length} leads) — running total ${updatedCount}`);
  }

  console.log('');
  console.log(`Applied: ${deletedCount} activities deleted, ${updatedCount} leads updated.`);
  console.log('');

  // 5. Re-measure (same queries as Step 1) and print before/after.
  const afterActivities = (await queryDb(endpoint, serviceKey, SQL_MEASURE_FAKE_ACTIVITIES)) as Array<{
    fake_activities: number;
  }>;
  const afterLeads = (await queryDb(endpoint, serviceKey, SQL_MEASURE_POISONED_LEADS)) as Array<{
    poisoned_leads: number;
  }>;
  console.log('── After ────────────────────────────────────────────');
  console.log(`fake_activities: ${afterActivities[0]?.fake_activities}`);
  console.log(`poisoned_leads:  ${afterLeads[0]?.poisoned_leads}`);
  console.log('─────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
