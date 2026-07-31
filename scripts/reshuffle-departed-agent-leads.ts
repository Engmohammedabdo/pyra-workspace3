#!/usr/bin/env tsx
/**
 * npx tsx scripts/reshuffle-departed-agent-leads.ts [--apply] [--run-id=<id>]
 *
 * One-off redistribution ordered by Abdou (2026-07-31).
 *
 * Three sales agents are now INACTIVE (kassem, sayed, mo.hanach) and their
 * lead books are orphaned — nobody can work them, because every auth gate
 * rejects a non-active user. This script hands those leads to the two active
 * agents (cosette, youssef), parks them in the «ريشفل» holding column
 * (`stg_reshuffle`, migration 031 — the column exists for exactly this), and
 * tells each new owner once.
 *
 * Owner decisions captured before writing:
 *   - Split EQUALLY between the two agents ("بالتساوي"), not weighted by the
 *     load each already carries (cosette 646 vs youssef 350). Interleaving is
 *     done over the list sorted by (assigned_to, id), so each departed agent's
 *     book splits ~50/50 rather than one agent inheriting all of one book.
 *     The odd lead goes to youssef, who carries the lighter book today.
 *   - The 4 `stg_closed_lost` leads under sayed are EXCLUDED. Moving them into
 *     reshuffle would reopen dead deals in the active pipeline
 *     (PIPELINE_ACTIVE_STAGES includes reshuffle) and lift their win
 *     probability 0 -> 5. Reopening them is a separate, deliberate call.
 *   - ONE summary notification per agent, not one per lead. The app's bulk
 *     route (app/api/dashboard/sales/leads/bulk/route.ts) sends one bell row
 *     per lead, which is right for a hand-picked selection of a few; at 60+
 *     leads each it would flood the bell AND fire 60+ web pushes per agent.
 *
 * Everything else mirrors that bulk route byte-for-byte so the timeline reads
 * identically to a reassignment done through the UI: an `assignment_changed`
 * activity plus a `stage_change` activity per lead, win_probability defaulted
 * from STAGE_DEFAULT_WIN_PROBABILITY unless the lead overrides it, and a
 * `pyra_activity_log` audit row.
 *
 * Safety:
 *   - Dry run is the DEFAULT. Nothing is mutated without --apply.
 *   - The snapshot (backups/reshuffle-leads-<runId>.json) holds every target
 *     lead's FULL before-state and is written + existence-verified BEFORE any
 *     mutation. No snapshot, no write. Reversal is a hand-run UPDATE from it.
 *   - Every write is batched (<= 150 rows) and its `error` is checked; the
 *     FIRST failure aborts the run.
 *   - The selected set is cross-checked against an independent COUNT before
 *     any write — PostgREST silently caps unbounded reads at 1000 rows, and a
 *     short read here would mean a partial reassignment reported as complete.
 *   - Credentials are read from .env.local by FILE READ only (never a CLI arg,
 *     never logged) — same discipline as the other scripts in this folder.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { notify } from '@/lib/notifications/notify';
import { generateId } from '@/lib/utils/id';
import { chunk } from '@/lib/utils/chunk';
import {
  PIPELINE_STAGE_IDS,
  PIPELINE_STAGE_LABELS_AR,
  STAGE_DEFAULT_WIN_PROBABILITY,
  type PipelineStageId,
} from '@/lib/constants/statuses';

const ENV_FILE = '.env.local';
const BACKUP_DIR = 'backups';
const BATCH_SIZE = 150;

const FROM_AGENTS = ['kassem', 'sayed', 'mo.hanach'] as const;
/** Index 0 -> youssef, so with an odd total he takes the extra lead. */
const TO_AGENTS = ['youssef', 'cosette'] as const;
const TARGET_STAGE: PipelineStageId = PIPELINE_STAGE_IDS.RESHUFFLE;

/** The admin ordering the move — actor on every activity, audit and bell row. */
const ACTOR = { username: 'elharm', displayName: 'Mohamed' };

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

function readEnvValue(key: string): string {
  if (!existsSync(ENV_FILE)) fail(`${ENV_FILE} not found — run from the repo root.`);
  const env = readFileSync(ENV_FILE, 'utf8');
  const match = env.match(new RegExp(`^${key}=(.+)$`, 'm'));
  if (!match) fail(`${key} not found in ${ENV_FILE}.`);
  return match[1].trim().replace(/^["']|["']$/g, '');
}

function fail(message: string): never {
  console.error(`\n❌ ${message}\n`);
  process.exit(1);
}

// ── Types ────────────────────────────────────────────────────────────────

interface LeadRow {
  id: string;
  name: string | null;
  assigned_to: string | null;
  stage_id: string | null;
  win_probability: number | null;
  win_probability_overridden: boolean | null;
  updated_at: string | null;
}

type Assignment = { lead: LeadRow; to: string };

/** Explicit ceiling on the read, so hitting it is detectable (see below). */
const READ_CEILING = 5000;

// ── Main ─────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const { apply, runId } = parseArgs(process.argv);
  const supabaseUrl = readEnvValue('NEXT_PUBLIC_SUPABASE_URL');
  const serviceKey = readEnvValue('SUPABASE_SERVICE_ROLE_KEY');
  if (serviceKey.length < 100) {
    fail('SUPABASE_SERVICE_ROLE_KEY looks malformed (too short — expected a JWT).');
  }

  const supabase: SupabaseClient = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  console.log(`Mode: ${apply ? 'APPLY (will mutate)' : 'DRY RUN (default — pass --apply to mutate)'}`);
  console.log(`Run id: ${runId}`);
  console.log('');

  // 1. Confirm the receiving agents can actually hold leads. Reassigning to a
  //    non-active user would recreate the exact orphaning this run is fixing,
  //    and notify() would (correctly) drop their bell rows on the floor.
  const { data: agentRows, error: agentErr } = await supabase
    .from('pyra_users')
    .select('username, status')
    .in('username', TO_AGENTS as unknown as string[]);
  if (agentErr) fail(`Could not verify target agents: ${agentErr.message}`);
  for (const agent of TO_AGENTS) {
    const row = (agentRows ?? []).find((r) => r.username === agent);
    if (!row) fail(`Target agent "${agent}" has no pyra_users row.`);
    if (row.status !== 'active') fail(`Target agent "${agent}" is not active (status=${row.status}).`);
  }

  // 2. Select the target set by RULE, and independently count it. A short read
  //    (PostgREST's silent 1000-row cap) must abort rather than silently
  //    reassign a subset.
  const {
    data: leadData,
    error: leadErr,
    count: matchingCount,
  } = await supabase
    .from('pyra_sales_leads')
    .select('id, name, assigned_to, stage_id, win_probability, win_probability_overridden, updated_at', {
      count: 'exact',
    })
    .in('assigned_to', FROM_AGENTS)
    .is('archived_at', null)
    .not('is_converted', 'is', true)
    .neq('stage_id', PIPELINE_STAGE_IDS.CLOSED_LOST)
    .order('assigned_to', { ascending: true })
    .order('id', { ascending: true })
    .range(0, READ_CEILING - 1);
  if (leadErr) fail(`Lead fetch failed: ${leadErr.message}`);

  const leads = (leadData ?? []) as LeadRow[];
  // `count` is the server's total for the SAME filter, independent of what the
  // page actually returned — so a truncated page is caught rather than silently
  // reassigning a subset and reporting it as the whole job.
  if (matchingCount !== null && leads.length !== matchingCount) {
    fail(`Short read: fetched ${leads.length} leads but the server counts ${matchingCount}. Aborting before any write.`);
  }
  if (leads.length >= READ_CEILING) {
    fail(`Read hit the ${READ_CEILING}-row ceiling — raise it and re-run. Aborting before any write.`);
  }
  if (leads.length === 0) {
    console.log('Nothing to do — no leads matched. (Already reshuffled?)');
    return;
  }

  // 3. Equal split, interleaved over (assigned_to, id) so each departed
  //    agent's book is halved rather than handed over whole.
  const assignments: Assignment[] = leads.map((lead, i) => ({ lead, to: TO_AGENTS[i % TO_AGENTS.length] }));

  const perAgent = new Map<string, Assignment[]>(TO_AGENTS.map((a) => [a, []]));
  for (const a of assignments) perAgent.get(a.to)!.push(a);

  // 4. Snapshot BEFORE any write — abort if it can't be written or verified.
  if (!existsSync(BACKUP_DIR)) mkdirSync(BACKUP_DIR, { recursive: true });
  const snapshotPath = join(BACKUP_DIR, `reshuffle-leads-${runId}.json`);
  const snapshot = {
    run_id: runId,
    generated_at: new Date().toISOString(),
    mode: apply ? 'apply' : 'dry-run',
    from_agents: FROM_AGENTS,
    to_agents: TO_AGENTS,
    target_stage: TARGET_STAGE,
    excluded: 'stg_closed_lost, archived, converted',
    before: leads,
    planned: assignments.map((a) => ({
      lead_id: a.lead.id,
      name: a.lead.name,
      from_user: a.lead.assigned_to,
      to_user: a.to,
      from_stage: a.lead.stage_id,
      to_stage: TARGET_STAGE,
    })),
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

  // 5. Summary
  const bySource = new Map<string, Map<string, number>>();
  for (const a of assignments) {
    const src = a.lead.assigned_to ?? '(none)';
    if (!bySource.has(src)) bySource.set(src, new Map());
    const inner = bySource.get(src)!;
    inner.set(a.to, (inner.get(a.to) ?? 0) + 1);
  }

  console.log('── Plan ─────────────────────────────────────────────');
  console.log(`Leads to move: ${leads.length}  ->  stage "${TARGET_STAGE}" (${PIPELINE_STAGE_LABELS_AR[TARGET_STAGE]})`);
  for (const [src, inner] of bySource) {
    const parts = [...inner.entries()].map(([to, n]) => `${to}: ${n}`).join('  ·  ');
    console.log(`  from ${src.padEnd(12)} -> ${parts}`);
  }
  console.log('  ------------------------------------------------');
  for (const agent of TO_AGENTS) console.log(`  TOTAL ${agent.padEnd(12)} -> ${perAgent.get(agent)!.length}`);
  console.log('─────────────────────────────────────────────────────');
  console.log('');

  if (!apply) {
    console.log('Dry run only — nothing mutated. Re-run with --apply to write changes.');
    return;
  }

  // 6. Apply. Split into (agent × win_probability_overridden) buckets so each
  //    bucket is one uniform UPDATE, then batch each bucket.
  const nowIso = new Date().toISOString();
  let updated = 0;

  for (const agent of TO_AGENTS) {
    const mine = perAgent.get(agent)!;
    for (const overridden of [false, true]) {
      const ids = mine
        .filter((a) => !!a.lead.win_probability_overridden === overridden)
        .map((a) => a.lead.id);
      if (ids.length === 0) continue;

      const patch: Record<string, unknown> = {
        assigned_to: agent,
        stage_id: TARGET_STAGE,
        updated_at: nowIso,
      };
      // A lead whose probability was hand-set by a human keeps it — same rule
      // the bulk route applies.
      if (!overridden) patch.win_probability = STAGE_DEFAULT_WIN_PROBABILITY[TARGET_STAGE];

      for (const [i, batch] of chunk(ids, BATCH_SIZE).entries()) {
        const { error } = await supabase.from('pyra_sales_leads').update(patch).in('id', batch);
        if (error) fail(`Lead update failed (${agent}, overridden=${overridden}, batch ${i + 1}): ${error.message}`);
        updated += batch.length;
        console.log(`Updated ${agent} batch ${i + 1} (overridden=${overridden}, ${batch.length} leads) — running total ${updated}`);
      }
    }
  }

  // 7. Timeline rows — one assignment_changed + one stage_change per lead,
  //    same shape the UI's bulk route writes.
  const activityRows = assignments.flatMap((a) => [
    {
      id: generateId('la'),
      lead_id: a.lead.id,
      activity_type: 'assignment_changed',
      description: null,
      metadata: { from_user: a.lead.assigned_to ?? null, to_user: a.to, bulk: true, source: 'reshuffle_departed_agents' },
      created_by: ACTOR.username,
    },
    {
      id: generateId('la'),
      lead_id: a.lead.id,
      activity_type: 'stage_change',
      description: null,
      metadata: {
        from_stage: a.lead.stage_id,
        from_stage_label: PIPELINE_STAGE_LABELS_AR[a.lead.stage_id as PipelineStageId] ?? a.lead.stage_id,
        to_stage: TARGET_STAGE,
        to_stage_label: PIPELINE_STAGE_LABELS_AR[TARGET_STAGE],
        changed_by: ACTOR.username,
        bulk: true,
        source: 'reshuffle_departed_agents',
      },
      created_by: ACTOR.username,
    },
  ]);

  let activityWritten = 0;
  for (const [i, batch] of chunk(activityRows, BATCH_SIZE).entries()) {
    const { error } = await supabase.from('pyra_lead_activities').insert(batch);
    if (error) fail(`Activity insert failed (batch ${i + 1}): ${error.message}`);
    activityWritten += batch.length;
    console.log(`Wrote activity batch ${i + 1} (${batch.length} rows) — running total ${activityWritten}`);
  }

  // 8. Audit trail.
  const { error: auditErr } = await supabase.from('pyra_activity_log').insert({
    id: generateId('al'),
    action_type: 'leads_bulk_reshuffle',
    username: ACTOR.username,
    display_name: ACTOR.displayName,
    target_path: '/dashboard/crm/pipeline',
    details: {
      run_id: runId,
      from_agents: FROM_AGENTS,
      to_stage: TARGET_STAGE,
      affected: updated,
      per_agent: Object.fromEntries(TO_AGENTS.map((a) => [a, perAgent.get(a)!.length])),
      snapshot: snapshotPath,
    },
    ip_address: 'script',
  });
  if (auditErr) console.error('[audit] activity_log insert failed:', auditErr.message);

  // 9. One bell row (+ one web push) per agent — never one per lead.
  for (const agent of TO_AGENTS) {
    const n = perAgent.get(agent)!.length;
    if (n === 0) continue;
    await notify(supabase, {
      to: agent,
      type: 'lead_transferred',
      title: 'تم تحويل Leads إليك',
      message: `تم تحويل ${n} Lead إليك في عمود «ريشفل» بعد إعادة توزيع عملاء قاسم وسيد ومحمد حنش. راجعهم وابدأ التواصل.`,
      link: '/dashboard/crm/pipeline',
      from: { username: ACTOR.username, displayName: ACTOR.displayName },
    });
    console.log(`Notified ${agent} (${n} leads).`);
  }

  console.log('');
  console.log(`Applied: ${updated} leads reassigned + moved, ${activityWritten} activity rows written.`);
  console.log('');

  // 10. Re-measure from the DB — never report success from the plan alone.
  const { data: afterRows, error: afterErr } = await supabase
    .from('pyra_sales_leads')
    .select('assigned_to, stage_id')
    .eq('stage_id', TARGET_STAGE)
    .range(0, 4999);
  if (afterErr) {
    console.error('Post-check failed:', afterErr.message);
    return;
  }
  const tally = new Map<string, number>();
  for (const r of (afterRows ?? []) as Array<{ assigned_to: string | null }>) {
    const k = r.assigned_to ?? '(none)';
    tally.set(k, (tally.get(k) ?? 0) + 1);
  }

  // Written out explicitly rather than reusing the selection chain — a check
  // that shares code with the thing it checks verifies nothing.
  const { count: leftBehind } = await supabase
    .from('pyra_sales_leads')
    .select('id', { count: 'exact', head: true })
    .in('assigned_to', FROM_AGENTS)
    .is('archived_at', null)
    .not('is_converted', 'is', true)
    .neq('stage_id', PIPELINE_STAGE_IDS.CLOSED_LOST);

  console.log('── After (read back from the DB) ────────────────────');
  console.log(`Leads now in "${TARGET_STAGE}":`);
  for (const [who, n] of tally) console.log(`  ${who.padEnd(12)} ${n}`);
  console.log(`Still assigned to a departed agent (should be 0): ${leftBehind}`);
  console.log('─────────────────────────────────────────────────────');
}

main().catch((err) => {
  console.error('❌ Unexpected error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
