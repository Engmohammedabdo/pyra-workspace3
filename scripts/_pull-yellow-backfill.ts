#!/usr/bin/env tsx
/**
 * One-time backfill of the `yellow` line's recent history into the system.
 * Runs the SAME pullInstanceMessages the browser poll / cron use, so messages
 * are deduped on message_id (safe to re-run) and outgoing rows are stamped with
 * the line holder (youssef) via the Task 3 attribution. Run BEFORE the Task 6
 * lead-feed exists so historical messages do NOT retro-write lead timelines.
 */
import { existsSync, readFileSync } from 'node:fs';

// Load .env.local into process.env before importing app modules (tsx does not
// auto-load env; createServiceRoleClient reads NEXT_PUBLIC_SUPABASE_URL etc.).
for (const file of ['.env.local']) {
  if (!existsSync(file)) continue;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m && process.env[m[1]] === undefined) {
      process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
    }
  }
}

async function main() {
  const { createServiceRoleClient } = await import('@/lib/supabase/server');
  const { pullInstanceMessages } = await import('@/lib/whatsapp/pull-messages');
  const supabase = createServiceRoleClient();
  const r = await pullInstanceMessages({
    supabase,
    instanceName: 'yellow',
    ownPhone: '971524800970',
    pageSize: 300,
  });
  console.log('yellow backfill result:', JSON.stringify(r));
}

main().catch((e) => {
  console.error('backfill failed:', e);
  process.exit(1);
});
