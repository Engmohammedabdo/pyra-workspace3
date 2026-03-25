#!/usr/bin/env node
/**
 * test-vector-backend.mjs — Benchmark & Test Suite for Vector Backend
 * 
 * Tests:
 * 1. Benchmark old vectorSearch vs new SqliteVecBackend.search (pre-filter)
 * 2. Verify same results (no regression)
 * 3. Test healthCheck()
 * 4. Test upsert + delete
 * 
 * Runs on backup DB: /home/node/.openclaw/memory/bayra.db.pre-v2-backup
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createVectorBackend, SqliteVecBackend } from './vector-backend.mjs';
import { vectorSearch } from './search.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DB = '/home/node/.openclaw/memory/bayra.db.pre-v2-backup';

// ─── Helpers ──────────────────────────────────────────────

function openBackupDb() {
  const db = new Database(BACKUP_DB, { readonly: false });
  sqliteVec.load(db);
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  return db;
}

/**
 * Get a real embedding from the DB for testing.
 */
function getTestEmbedding(db) {
  const row = db.prepare(`
    SELECT memory_id, embedding FROM memory_embeddings LIMIT 1
  `).get();
  if (!row) throw new Error('No embeddings found in backup DB');
  return { memoryId: row.memory_id, embedding: row.embedding };
}

function hrMs(start) {
  const [s, ns] = process.hrtime(start);
  return (s * 1000 + ns / 1e6).toFixed(3);
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.log(`  ❌ ${message}`);
    failed++;
  }
}

// ─── Tests ────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Vector Backend Test Suite');
  console.log(`  DB: ${BACKUP_DB}`);
  console.log('═══════════════════════════════════════════════\n');

  const db = openBackupDb();

  // Get stats
  const totalEmbeddings = db.prepare('SELECT COUNT(*) as c FROM memory_embeddings').get().c;
  const totalMemories = db.prepare("SELECT COUNT(*) as c FROM memories WHERE status = 'active'").get().c;
  console.log(`📊 Embeddings: ${totalEmbeddings} | Active memories: ${totalMemories}\n`);

  const testEmb = getTestEmbedding(db);
  const embBuf = testEmb.embedding;

  // ── Test 1: Factory ──
  console.log('── Test 1: Factory & Construction ──');
  const backend = createVectorBackend('sqlite-vec', { db });
  assert(backend instanceof SqliteVecBackend, 'createVectorBackend returns SqliteVecBackend');

  let threw = false;
  try { createVectorBackend('lancedb', {}); } catch { threw = true; }
  // LanceDB should not throw on creation (it's a placeholder)
  assert(!threw, 'LanceDB backend creates without error (placeholder)');

  try { createVectorBackend('sqlite-vec', {}); } catch { threw = true; }
  assert(threw, 'sqlite-vec without db throws error');

  // ── Test 2: Health Check ──
  console.log('\n── Test 2: Health Check ──');
  const health = await backend.healthCheck();
  assert(health.ok === true, `healthCheck ok=${health.ok}`);
  assert(health.details.embeddingCount > 0, `embeddingCount = ${health.details.embeddingCount}`);
  assert(health.details.searchOperational === true, 'search is operational');
  assert(health.details.activeMemories > 0, `activeMemories = ${health.details.activeMemories}`);
  console.log(`  ℹ️  ${health.message}`);

  // ── Test 3: Count ──
  console.log('\n── Test 3: Count ──');
  const count = await backend.count();
  assert(count === totalEmbeddings, `count() = ${count} (matches direct query: ${totalEmbeddings})`);

  // ── Test 4: Search — No filters (baseline) ──
  console.log('\n── Test 4: Search without filters ──');
  const results = await backend.search(embBuf, 10, {});
  assert(results.length > 0, `Got ${results.length} results`);
  assert(results.length <= 10, 'Respects limit');
  assert(results[0].memory_id != null, 'Results have memory_id');
  assert(typeof results[0].distance === 'number', 'Results have distance');
  // Check sorted by distance
  let sorted = true;
  for (let i = 1; i < results.length; i++) {
    if (results[i].distance < results[i - 1].distance) { sorted = false; break; }
  }
  assert(sorted, 'Results sorted by distance ascending');

  // ── Test 5: Search — With type filter ──
  console.log('\n── Test 5: Search with type filter ──');
  const semanticResults = await backend.search(embBuf, 10, { types: ['semantic'], status: 'active' });
  assert(semanticResults.length > 0, `Got ${semanticResults.length} semantic results`);
  // Verify all results are actually semantic
  if (semanticResults.length > 0) {
    const ids = semanticResults.map(r => r.memory_id);
    const placeholders = ids.map(() => '?').join(',');
    const mems = db.prepare(`SELECT id, type FROM memories WHERE id IN (${placeholders})`).all(...ids);
    const allSemantic = mems.every(m => m.type === 'semantic');
    assert(allSemantic, 'All filtered results are semantic type');
  }

  // ── Test 6: Search — With excludeIds ──
  console.log('\n── Test 6: Search with excludeIds ──');
  const firstId = results[0].memory_id;
  const excludeResults = await backend.search(embBuf, 10, { excludeIds: [firstId] });
  const hasExcluded = excludeResults.some(r => r.memory_id === firstId);
  assert(!hasExcluded, `Excluded ID "${firstId}" not in results`);

  // ── Test 7: Search — With minImportance ──
  console.log('\n── Test 7: Search with minImportance ──');
  const highImpResults = await backend.search(embBuf, 10, { minImportance: 7, status: 'active' });
  if (highImpResults.length > 0) {
    const hids = highImpResults.map(r => r.memory_id);
    const hplaceholders = hids.map(() => '?').join(',');
    const hmems = db.prepare(`SELECT id, importance FROM memories WHERE id IN (${hplaceholders})`).all(...hids);
    const allHighImp = hmems.every(m => m.importance >= 7);
    assert(allHighImp, `All results have importance >= 7 (got ${hmems.length} results)`);
  } else {
    console.log('  ⚠️  No results with importance >= 7 (may be expected)');
  }

  // ── Test 8: Benchmark — Old vs New ──
  console.log('\n── Test 8: Benchmark — Old vectorSearch vs New backend.search ──');

  const ITERATIONS = 50;
  const benchFilters = { types: ['semantic', 'episodic'], status: 'active', minImportance: 0 };

  // Old method (from search.mjs)
  let oldStart = process.hrtime();
  for (let i = 0; i < ITERATIONS; i++) {
    vectorSearch(db, embBuf, { limit: 10, ...benchFilters });
  }
  const oldMs = hrMs(oldStart);
  const oldAvg = (parseFloat(oldMs) / ITERATIONS).toFixed(3);

  // New method (SqliteVecBackend with pre-filter)
  let newStart = process.hrtime();
  for (let i = 0; i < ITERATIONS; i++) {
    await backend.search(embBuf, 10, benchFilters);
  }
  const newMs = hrMs(newStart);
  const newAvg = (parseFloat(newMs) / ITERATIONS).toFixed(3);

  console.log(`  📈 Old vectorSearch:  ${oldMs}ms total, ${oldAvg}ms avg (${ITERATIONS} iterations)`);
  console.log(`  📈 New backend.search: ${newMs}ms total, ${newAvg}ms avg (${ITERATIONS} iterations)`);

  const speedup = ((parseFloat(oldMs) - parseFloat(newMs)) / parseFloat(oldMs) * 100).toFixed(1);
  if (parseFloat(newMs) <= parseFloat(oldMs)) {
    console.log(`  🚀 New is ${speedup}% faster (or equal)`);
  } else {
    console.log(`  ⚠️  New is ${Math.abs(speedup)}% slower — acceptable if < 20%`);
  }
  assert(parseFloat(newAvg) < 50, `Average search time ${newAvg}ms < 50ms threshold`);

  // ── Test 9: Result Comparison — Same results? ──
  console.log('\n── Test 9: Result Comparison (no regression) ──');
  const oldResults = vectorSearch(db, embBuf, { limit: 10, status: 'active' });
  const newResults = await backend.search(embBuf, 10, { status: 'active' });

  // The new method returns {memory_id, distance}, old returns full memory objects
  const oldIds = oldResults.map(r => r.id);
  const newIds = newResults.map(r => r.memory_id);

  // Check overlap (should be very high, but order may differ slightly due to fetch limits)
  const overlap = oldIds.filter(id => newIds.includes(id)).length;
  const overlapPct = (overlap / Math.max(oldIds.length, 1) * 100).toFixed(0);
  assert(overlap >= Math.min(oldIds.length, newIds.length) * 0.7, 
    `Result overlap: ${overlap}/${oldIds.length} (${overlapPct}%) — ≥70% required`);

  // ── Test 10: Upsert + Delete ──
  console.log('\n── Test 10: Upsert + Delete ──');
  const testId = '__test_vector_backend_' + Date.now();
  // Create a random embedding (512 floats)
  const randEmb = new Float32Array(512);
  for (let i = 0; i < 512; i++) randEmb[i] = Math.random() * 2 - 1;
  const randBuf = Buffer.from(randEmb.buffer, randEmb.byteOffset, randEmb.byteLength);

  const countBefore = await backend.count();
  const upserted = await backend.upsert(testId, randBuf);
  assert(upserted === true, 'upsert returned true');

  const countAfter = await backend.count();
  assert(countAfter === countBefore + 1, `count increased: ${countBefore} → ${countAfter}`);

  // Upsert again (replace) — count should stay same
  const upserted2 = await backend.upsert(testId, randBuf);
  assert(upserted2 === true, 'upsert (replace) returned true');
  const countAfter2 = await backend.count();
  assert(countAfter2 === countAfter, `count unchanged after replace: ${countAfter2}`);

  // Delete
  const deleted = await backend.delete(testId);
  assert(deleted === true, 'delete returned true');

  const countFinal = await backend.count();
  assert(countFinal === countBefore, `count restored: ${countFinal} === ${countBefore}`);

  // Delete non-existent
  const deletedAgain = await backend.delete(testId);
  assert(deletedAgain === false, 'delete non-existent returns false');

  // ── Test 11: Edge Cases ──
  console.log('\n── Test 11: Edge Cases ──');
  const emptyResults = await backend.search(Buffer.alloc(0), 10, {});
  assert(emptyResults.length === 0, 'Empty embedding returns empty results');

  // Filter that matches nothing
  const noMatchResults = await backend.search(embBuf, 10, { types: ['nonexistent_type'], status: 'active' });
  assert(noMatchResults.length === 0, 'Non-existent type filter returns empty');

  // ── Test 12: LanceDB placeholder ──
  console.log('\n── Test 12: LanceDB Placeholder ──');
  const lanceBackend = createVectorBackend('lancedb', {});
  const lanceHealth = await lanceBackend.healthCheck();
  assert(lanceHealth.ok === false, 'LanceDB healthCheck returns ok=false');
  
  let lanceSearchThrew = false;
  try { await lanceBackend.search(embBuf, 10); } catch { lanceSearchThrew = true; }
  assert(lanceSearchThrew, 'LanceDB search throws not-implemented');

  // ── Summary ──
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════');

  db.close();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
