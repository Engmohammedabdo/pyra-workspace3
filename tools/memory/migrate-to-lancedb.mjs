/**
 * migrate-to-lancedb.mjs — Migrate embeddings from sqlite-vec to LanceDB
 * Usage: node migrate-to-lancedb.mjs [--dry-run]
 */
import { getDb, closeDb } from './db.mjs';
import { LanceDBBackend } from './vector-backend.mjs';

async function migrate() {
  const dryRun = process.argv.includes('--dry-run');
  const db = getDb();

  // 1. Count sqlite-vec embeddings
  const count = db.prepare('SELECT COUNT(*) as c FROM memory_embeddings').get().c;
  console.log(`Found ${count} embeddings in sqlite-vec`);

  if (dryRun) { console.log('DRY RUN — no changes'); closeDb(); return; }

  // 2. Create LanceDB backend
  const lance = new LanceDBBackend();
  await lance.init();

  // 3. Read all embeddings in batches
  const BATCH_SIZE = 100;
  const rows = db.prepare('SELECT memory_id, embedding FROM memory_embeddings').all();

  let migrated = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    for (const row of batch) {
      await lance.upsert(row.memory_id, row.embedding);
      migrated++;
    }
    console.log(`Migrated: ${migrated}/${count}`);
  }

  // 4. Verify
  const lanceCount = await lance.count();
  console.log(`\nVerification: sqlite-vec=${count}, LanceDB=${lanceCount}`);

  if (lanceCount === count) {
    console.log('✅ Migration successful!');
  } else {
    console.log('⚠️ Count mismatch — check for errors');
  }

  closeDb();
}

migrate().catch(e => { console.error('Fatal:', e); process.exit(1); });
