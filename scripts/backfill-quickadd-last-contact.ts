#!/usr/bin/env tsx
/**
 * npx tsx scripts/backfill-quickadd-last-contact.ts [--apply] [--run-id=<id>]
 *
 * One-time data backfill for the "mobile quick-add stamped last_contact_at
 * from an unanswered dial" bug in `app/api/mobile/leads/route.ts` (CA Task
 * A1). Unlike the earlier `isConnectedCall` fix (calls-urgent-fixes Task 1),
 * which covered the sync path (`/api/mobile/calls/sync`) and the retro-link
 * activity gate in this same file, the lead-INSERT itself set
 * `last_contact_at: call.called_at` unconditionally — so a lead created from
 * the unknown-number quick-add prompt after a 0-second (unanswered) dial was
 * born looking "freshly contacted". This script does NOT touch any activity
 * row (the quick-add path never wrote a `call_logged` activity for the
 * triggering call unless it was actually connected — `retroLinkCalls` already
 * gates that correctly) — it only corrects the `last_contact_at` column.
 *
 * Measured 2026-07-25..2026-07-29 (recent window): 41 leads mis-stamped this
 * way. Per CA-A1 instructions, the TARGET SET here is selected by the RULE,
 * not a date cutoff, so any older stragglers (leads created before
 * 2026-07-25 by the same code path) are caught too.
 *
 * Rule (identical reconstruction to scripts/backfill-zero-duration-contact.ts):
 *   A lead is "poisoned" when its last_contact_at exactly matches (to the
 *   minute) the called_at of one of its own 0-second, non-missed calls
 *   (direction <> 'missed' AND duration_seconds = 0, linked via
 *   pyra_agent_calls.lead_id = pyra_sales_leads.id).
 *   Recompute: last_contact_at = MAX(called_at) over that lead's GENUINE
 *   calls (direction <> 'missed' AND duration_seconds > 0), or NULL if it
 *   has none. Nulling is safe: every downstream consumer (deals-at-risk,
 *   lead-idle-check, ai-insights) reads
 *     greatest(last_contact_at, latest pyra_lead_activities.created_at)
 *   — a real WhatsApp/manual touch still registers via the activity half.
 *
 * Safety (same discipline as scripts/backfill-zero-duration-contact.ts):
 *   - Dry run is the DEFAULT. Nothing is mutated unless --apply is passed.
 *   - The snapshot (backups/quickadd-last-contact-backfill-<runId>.json) is
 *     written and existence-verified BEFORE any mutation. If it can't be
 *     written, the script aborts — no snapshot, no write.
 *   - Updates run in batches of <= 200 rows per SQL statement; every batch's
 *     response is checked for an `error` key and the FIRST failure aborts
 *     the whole run immediately (no retry, no partial-then-continue).
 *   - NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are read from
 *     .env.local by FILE READ ONLY (never process.env, never a CLI arg,
 *     never logged) — same discipline as scripts/db-record-migration.ts.
 *
 * Reversal: every mutated lead's OLD last_contact_at + the computed new
 * value is recorded in the snapshot file — restore by hand from there if
 * this is ever found to be wrong.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ENV_FILE = '.env.local';
const BACKUP_DIR = 'backups';
const BATCH_SIZE = 200;
const RECENT_WINDOW_START = '2026-07-25'; // the measured window this bug was found in — reporting only

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

interface PoisonedLeadRow {
  lead_id: string;
  lead_created_at: string | null;
  current_last_contact_at: string | null;
  genuine_max: string | null;
}

// ── SQL ──────────────────────────────────────────────────────────────────

// Poisoned = last_contact_at exactly matches (to the minute) the called_at
// of one of the lead's own 0-second, non-missed calls. Selected by the RULE
// only — no date cutoff on the lead itself, so any older straggler created
// by the same buggy code path is caught too.
//
// OWNERSHIP: every pyra_agent_calls join here — and the correlated max() that
// computes the replacement value — carries `c.agent_username = l.assigned_to`.
// `pyra_agent_calls.lead_id` is set even when the dialling agent does NOT own
// the matched lead (a deliberate lock in /api/mobile/calls/sync: nulling it
// would hand the row to retroLinkCalls and to calls/ignore), so an unfiltered
// join lets a COLLEAGUE's dial source a lead's last_contact_at — the exact
// write the sync route's ownership gate refuses. Without this filter a re-run
// of `--apply` would re-open that hole from the other side.
const SQL_POISONED_LEADS = `
  WITH poisoned_leads AS (
    SELECT DISTINCT l.id AS lead_id
    FROM pyra_sales_leads l
    JOIN pyra_agent_calls c ON c.lead_id = l.id AND c.agent_username = l.assigned_to
    WHERE c.duration_seconds = 0 AND c.direction <> 'missed'
      AND l.last_contact_at IS NOT NULL
      AND date_trunc('minute', l.last_contact_at) = date_trunc('minute', c.called_at)
  )
  SELECT
    l.id AS lead_id,
    l.created_at AS lead_created_at,
    l.last_contact_at AS current_last_contact_at,
    (
      SELECT max(c2.called_at)
      FROM pyra_agent_calls c2
      WHERE c2.lead_id = l.id AND c2.agent_username = l.assigned_to
        AND c2.duration_seconds > 0 AND c2.direction <> 'missed'
    ) AS genuine_max
  FROM pyra_sales_leads l
  JOIN poisoned_leads p ON p.lead_id = l.id
  ORDER BY l.id
`;

const SQL_MEASURE_POISONED_LEADS = `
  SELECT count(DISTINCT l.id) AS poisoned_leads
  FROM pyra_sales_leads l
  JOIN pyra_agent_calls c ON c.lead_id = l.id AND c.agent_username = l.assigned_to
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

  // 1. Read the source-of-truth set.
  const poisonedLeads = (await queryDb(endpoint, serviceKey, SQL_POISONED_LEADS)) as PoisonedLeadRow[];

  // Skip leads whose computed value already equals the current value
  // (idempotent no-op — should not happen given the WHERE clause above, but
  // kept for parity with the earlier backfill's defensive filter).
  const leadsToUpdate = poisonedLeads.filter(
    (l) => normalizeTs(l.genuine_max) !== normalizeTs(l.current_last_contact_at),
  );
  const toNull = leadsToUpdate.filter((l) => l.genuine_max === null);
  const toEarlier = leadsToUpdate.filter((l) => l.genuine_max !== null);
  const inRecentWindow = leadsToUpdate.filter(
    (l) => l.lead_created_at !== null && l.lead_created_at >= RECENT_WINDOW_START,
  );

  // 2. Snapshot BEFORE any write — abort if it can't be written or verified.
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const snapshotPath = join(BACKUP_DIR, `quickadd-last-contact-backfill-${runId}.json`);
  const snapshot = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    poisoned_leads_candidate_set: poisonedLeads,
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
  console.log(`Leads matched by the rule (all-time):   ${poisonedLeads.length}`);
  console.log(`Leads that actually need an update:     ${leadsToUpdate.length}`);
  console.log(`  -> NULL (no genuine call ever):        ${toNull.length}`);
  console.log(`  -> an earlier genuine timestamp:       ${toEarlier.length}`);
  console.log(`  (already correct, skipped):            ${poisonedLeads.length - leadsToUpdate.length}`);
  console.log(`  -> created on/after ${RECENT_WINDOW_START} (measured window, expect ~41): ${inRecentWindow.length}`);
  console.log(`  -> older stragglers (created before ${RECENT_WINDOW_START}): ${leadsToUpdate.length - inRecentWindow.length}`);
  console.log('─────────────────────────────────────────────────────');
  console.log('');

  if (!apply) {
    console.log('Dry run only — nothing mutated. Re-run with --apply to write changes.');
    return;
  }

  // 4. Apply — batched updates. queryDb() calls fail() (and exits the
  // process) on the first error, so there is no separate abort branch here —
  // a failed batch stops execution immediately, before any later batch runs.
  const updateBatches = chunk(leadsToUpdate, BATCH_SIZE);
  let updatedCount = 0;
  for (const [i, batch] of updateBatches.entries()) {
    const values = batch
      .map((l) => {
        // A bare NULL in a VALUES list resolves to `text`, and text->timestamptz
        // has no assignment cast — a batch whose rows are ALL NULL throws 42804
        // (verified against prod Postgres, see backfill-zero-duration-contact.ts).
        // NULL::timestamptz is unambiguous regardless of the other rows in the
        // same batch.
        const newVal = l.genuine_max === null ? 'NULL::timestamptz' : `'${escapeSqlString(l.genuine_max)}'::timestamptz`;
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
  console.log(`Applied: ${updatedCount} leads updated.`);
  console.log('');

  // 5. Re-measure (same query as Step 1) and print before/after.
  const afterLeads = (await queryDb(endpoint, serviceKey, SQL_MEASURE_POISONED_LEADS)) as Array<{
    poisoned_leads: number;
  }>;
  console.log('── After ────────────────────────────────────────────');
  console.log(`poisoned_leads: ${afterLeads[0]?.poisoned_leads}`);
  console.log('─────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
