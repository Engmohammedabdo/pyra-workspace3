#!/usr/bin/env node
/**
 * Temporal Awareness Migration (Upgrade 1)
 * Adds valid_from, valid_until, superseded_by columns to memories table.
 * Safe: ALTER TABLE ADD COLUMN only, wrapped in transaction.
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';

export function migrateTemporalAwareness(dbPath) {
  const db = new Database(dbPath);
  sqliteVec.load(db);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Check if already migrated
  const cols = db.prepare("PRAGMA table_info(memories)").all().map(c => c.name);
  if (cols.includes('valid_from')) {
    console.log('⚠️  Already migrated (valid_from exists). Skipping.');
    const count = db.prepare("SELECT COUNT(*) as c FROM memories").get().c;
    const active = db.prepare("SELECT COUNT(*) as c FROM memories WHERE status = 'active'").get().c;
    console.log(`   Active: ${active} | Total: ${count}`);
    db.close();
    return { alreadyDone: true, active, total: count };
  }

  // Run migration in transaction
  const migrate = db.transaction(() => {
    // 1. Add columns
    db.exec(`ALTER TABLE memories ADD COLUMN valid_from TEXT;`);
    db.exec(`ALTER TABLE memories ADD COLUMN valid_until TEXT;`);
    db.exec(`ALTER TABLE memories ADD COLUMN superseded_by TEXT REFERENCES memories(id);`);

    // 2. Backfill valid_from for semantic memories
    const updated = db.prepare(
      `UPDATE memories SET valid_from = created_at WHERE type = 'semantic' AND valid_from IS NULL`
    ).run();
    console.log(`   Backfilled valid_from for ${updated.changes} semantic memories`);

    // 3. Create indexes
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_temporal ON memories(valid_from, valid_until);`);
    db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_superseded ON memories(superseded_by);`);
  });

  migrate();

  // Verify
  const integrity = db.pragma('integrity_check');
  const integrityOk = integrity[0]?.integrity_check === 'ok';
  const count = db.prepare("SELECT COUNT(*) as c FROM memories").get().c;
  const active = db.prepare("SELECT COUNT(*) as c FROM memories WHERE status = 'active'").get().c;
  const emb = db.prepare("SELECT COUNT(*) as c FROM memory_embeddings").get().c;
  const ent = db.prepare("SELECT COUNT(*) as c FROM entities").get().c;
  const rel = db.prepare("SELECT COUNT(*) as c FROM memory_relations").get().c;

  console.log(`   Integrity: ${integrityOk ? '✅ OK' : '❌ FAIL'}`);
  console.log(`   Active: ${active} | Total: ${count} | Embeddings: ${emb} | Entities: ${ent} | Relations: ${rel}`);

  db.close();
  return { alreadyDone: false, integrityOk, active, total: count, embeddings: emb, entities: ent, relations: rel };
}

// CLI
if (process.argv[1] && process.argv[1].endsWith('migrate-temporal.mjs')) {
  const dbPath = process.argv[2];
  if (!dbPath) {
    console.error('Usage: node migrate-temporal.mjs <path-to-bayra.db>');
    process.exit(1);
  }
  console.log(`\n🔄 Migrating: ${dbPath}`);
  const result = migrateTemporalAwareness(dbPath);
  if (!result.alreadyDone && !result.integrityOk) {
    console.error('❌ Migration failed integrity check!');
    process.exit(1);
  }
  console.log('✅ Migration complete\n');
}
