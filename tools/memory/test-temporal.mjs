#!/usr/bin/env node
/**
 * Test: Temporal Awareness (Upgrade 1)
 * Tests supersede flow, temporal boost in search, and data integrity.
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { createMemory, getMemory, supersedeMemory, getStats, setDb, closeDb } from './db.mjs';
import { hybridSearch, keywordSearch } from './search.mjs';
import { embed, embeddingToBuffer, setCacheDb } from './embeddings.mjs';
import { mkdirSync, copyFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const TEST_DB = join(os.tmpdir(), `bayra-test-temporal-${Date.now()}.db`);
const ORIG_DB = join(os.homedir(), '.openclaw', 'memory', 'bayra.db');

let passed = 0;
let failed = 0;

function assert(condition, msg) {
  if (condition) {
    console.log(`  ✅ ${msg}`);
    passed++;
  } else {
    console.log(`  ❌ ${msg}`);
    failed++;
  }
}

async function main() {
  console.log('\n🧪 Temporal Awareness Tests\n');

  // === Test 1: Schema columns exist on real DB ===
  console.log('📋 Test 1: Schema columns exist');
  {
    const db = new Database(ORIG_DB, { readonly: true });
    const cols = db.prepare("PRAGMA table_info(memories)").all().map(c => c.name);
    assert(cols.includes('valid_from'), 'valid_from column exists');
    assert(cols.includes('valid_until'), 'valid_until column exists');
    assert(cols.includes('superseded_by'), 'superseded_by column exists');
    db.close();
  }

  // === Test 2: Baseline stats unchanged ===
  console.log('\n📋 Test 2: Baseline stats unchanged');
  {
    const db = new Database(ORIG_DB, { readonly: true });
    sqliteVec.load(db);
    const active = db.prepare("SELECT COUNT(*) as c FROM memories WHERE status = 'active'").get().c;
    const total = db.prepare("SELECT COUNT(*) as c FROM memories").get().c;
    const emb = db.prepare("SELECT COUNT(*) as c FROM memory_embeddings").get().c;
    const ent = db.prepare("SELECT COUNT(*) as c FROM entities").get().c;
    const rel = db.prepare("SELECT COUNT(*) as c FROM memory_relations").get().c;
    assert(active === 474, `Active: ${active} === 474`);
    assert(total === 528, `Total: ${total} === 528`);
    assert(emb === 527, `Embeddings: ${emb} === 527`);
    assert(ent === 69, `Entities: ${ent} === 69`);
    assert(rel === 201, `Relations: ${rel} === 201`);
    db.close();
  }

  // === Test 3-5: Supersede flow on test DB ===
  console.log('\n📋 Test 3: Supersede flow');
  {
    // Copy original DB to temp for testing
    copyFileSync(ORIG_DB, TEST_DB);

    const db = new Database(TEST_DB);
    sqliteVec.load(db);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');

    // Create vec0 table if missing
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(memory_id TEXT PRIMARY KEY, embedding float[512])`);

    setDb(db);
    setCacheDb(db);

    // 1. Create old fact
    const oldMem = createMemory({
      type: 'semantic',
      subtype: 'fact',
      content: 'سعر خدمة WhatsApp Bot = 5000 درهم',
      importance: 7,
      source: 'test',
      valid_from: '2026-01-15T00:00:00Z',
    });
    assert(oldMem.id != null, `Old memory created: ${oldMem.id.substring(0, 8)}`);
    assert(oldMem.valid_from === '2026-01-15T00:00:00Z', 'Old memory has valid_from');

    // 2. Create new fact
    const newMem = createMemory({
      type: 'semantic',
      subtype: 'fact',
      content: 'سعر خدمة WhatsApp Bot = 7500 درهم',
      importance: 7,
      source: 'test',
    });
    assert(newMem.id != null, `New memory created: ${newMem.id.substring(0, 8)}`);

    // 3. Generate embeddings for both
    const oldEmb = await embed(oldMem.content);
    const newEmb = await embed(newMem.content);
    if (oldEmb && newEmb) {
      db.prepare('INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)').run(oldMem.id, embeddingToBuffer(oldEmb));
      db.prepare('INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)').run(newMem.id, embeddingToBuffer(newEmb));
      console.log('  📦 Embeddings generated for both memories');
    }

    // 4. Supersede
    const result = supersedeMemory(db, oldMem.id, newMem.id, 'تحديث السعر');
    assert(result.old.valid_until != null, `Old memory valid_until set: ${result.old.valid_until}`);
    assert(result.old.superseded_by === newMem.id, 'Old memory superseded_by = new ID');
    assert(result.new.valid_from != null, `New memory valid_from set: ${result.new.valid_from}`);

    // 5. Check relation created
    const rel = db.prepare(
      "SELECT * FROM memory_relations WHERE source_id = ? AND target_id = ? AND relation = 'superseded_by'"
    ).get(oldMem.id, newMem.id);
    assert(rel != null, 'superseded_by relation created');

    // 6. Search — new should rank higher
    console.log('\n📋 Test 4: Search ranking (temporal boost)');
    if (oldEmb) {
      const queryEmb = await embed('سعر خدمة WhatsApp Bot');
      const results = hybridSearch(db, 'سعر خدمة WhatsApp Bot', queryEmb, { limit: 10 });

      const newIdx = results.findIndex(r => r.id === newMem.id);
      const oldIdx = results.findIndex(r => r.id === oldMem.id);

      if (newIdx >= 0 && oldIdx >= 0) {
        assert(newIdx < oldIdx, `New memory ranks higher (${newIdx}) than old (${oldIdx})`);
        const newScore = results[newIdx].finalScore;
        const oldScore = results[oldIdx].finalScore;
        console.log(`    New score: ${newScore.toFixed(4)} | Old score: ${oldScore.toFixed(4)}`);
      } else {
        // At least new should appear
        assert(newIdx >= 0, `New memory found in results (idx: ${newIdx})`);
        if (oldIdx < 0) console.log('    (Old memory filtered out — expected due to heavy penalty)');
      }
    } else {
      console.log('  ⚠️  Skipping search test (no embeddings API)');
    }

    // 7. Stats — original counts should be same + 2
    console.log('\n📋 Test 5: Stats integrity');
    const active = db.prepare("SELECT COUNT(*) as c FROM memories WHERE status = 'active'").get().c;
    const total = db.prepare("SELECT COUNT(*) as c FROM memories").get().c;
    assert(active === 474 + 2, `Active: ${active} === ${474 + 2} (original + 2 test)`);
    assert(total === 528 + 2, `Total: ${total} === ${528 + 2} (original + 2 test)`);

    // Cleanup: remove test memories
    db.prepare('DELETE FROM memory_relations WHERE source_id = ? OR target_id = ?').run(oldMem.id, oldMem.id);
    db.prepare('DELETE FROM memory_embeddings WHERE memory_id IN (?, ?)').run(oldMem.id, newMem.id);
    db.prepare('DELETE FROM memories WHERE id IN (?, ?)').run(oldMem.id, newMem.id);
    
    db.close();
  }

  // Cleanup temp DB
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(TEST_DB + '-wal'); } catch {}
  try { unlinkSync(TEST_DB + '-shm'); } catch {}

  // Summary
  console.log(`\n${'='.repeat(40)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('❌ Test error:', e);
  process.exit(1);
});
