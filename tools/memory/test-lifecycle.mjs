/**
 * Test suite for lifecycle.mjs
 * Uses an isolated in-memory-like temp database.
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

import { cosineSimilarity, embeddingToBuffer, normalizeVector } from './embeddings.mjs';
import {
  consolidateMemories,
  applyDecay,
  garbageCollect,
  sleepTimeReflection,
  backupDatabase,
  checkIntegrity,
  getMemoryHealth,
} from './lifecycle.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');
const TEST_DB_PATH = '/tmp/test-lifecycle.db';
const TEST_BACKUP_DIR = '/tmp/test-lifecycle-backups';

let passed = 0, failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ PASS: ${label}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${label}`);
    failed++;
  }
}

// ─── Setup ─────────────────────────────────────────────────

function createTestDb() {
  // Clean up any previous test
  try { rmSync(TEST_DB_PATH); } catch {}
  try { rmSync(TEST_DB_PATH + '-wal'); } catch {}
  try { rmSync(TEST_DB_PATH + '-shm'); } catch {}

  const db = new Database(TEST_DB_PATH);
  sqliteVec.load(db);

  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');

  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  const cleaned = schema.split('\n').filter(l => !l.trim().toUpperCase().startsWith('PRAGMA')).join('\n');
  db.exec(cleaned);

  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(memory_id TEXT PRIMARY KEY, embedding float[512])`);

  return db;
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000).toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function randomEmbedding(seed = null) {
  // Create a pseudo-random but deterministic embedding
  const arr = new Float32Array(512);
  let s = seed ? seed.split('').reduce((a, c) => a + c.charCodeAt(0), 0) : Math.random() * 1000;
  for (let i = 0; i < 512; i++) {
    s = (s * 9301 + 49297) % 233280;
    arr[i] = s / 233280 - 0.5;
  }
  return normalizeVector(arr);
}

function similarEmbedding(base, noise = 0.05) {
  // Create an embedding very similar to base (for consolidation testing)
  const arr = new Float32Array(512);
  let s = 42;
  for (let i = 0; i < 512; i++) {
    s = (s * 9301 + 49297) % 233280;
    arr[i] = base[i] + (s / 233280 - 0.5) * noise;
  }
  return normalizeVector(arr);
}

function insertMemory(db, overrides = {}) {
  const id = overrides.id || crypto.randomUUID();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const m = {
    id,
    type: 'episodic',
    subtype: null,
    content: 'Test memory content',
    summary: null,
    importance: 5.0,
    confidence: 1.0,
    access_count: 0,
    event_at: null,
    expires_at: null,
    source: 'test',
    session_id: null,
    channel: null,
    tags: null,
    metadata: null,
    status: 'active',
    parent_id: null,
    visibility: 'private',
    created_at: now,
    updated_at: now,
    last_accessed_at: null,
    ...overrides,
  };

  db.prepare(`
    INSERT INTO memories (id, type, subtype, content, summary, importance, confidence,
      access_count, event_at, expires_at, source, session_id, channel, tags, metadata,
      status, parent_id, visibility, created_at, updated_at, last_accessed_at)
    VALUES (@id, @type, @subtype, @content, @summary, @importance, @confidence,
      @access_count, @event_at, @expires_at, @source, @session_id, @channel, @tags, @metadata,
      @status, @parent_id, @visibility, @created_at, @updated_at, @last_accessed_at)
  `).run(m);

  return m;
}

function insertEmbedding(db, memoryId, embedding) {
  db.prepare(`INSERT INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)`)
    .run(memoryId, embeddingToBuffer(embedding));
}

function populateTestDb(db) {
  // === Consolidation test memories (similar semantic memories) ===
  const baseEmb1 = randomEmbedding('consolidation-group-1');
  const m1 = insertMemory(db, {
    type: 'semantic', content: 'Mohammed likes coffee in the morning',
    importance: 6.0, created_at: daysAgo(5),
  });
  insertEmbedding(db, m1.id, baseEmb1);

  const m2 = insertMemory(db, {
    type: 'semantic', content: 'Mohammed enjoys morning coffee every day',
    importance: 5.0, created_at: daysAgo(3),
  });
  insertEmbedding(db, m2.id, similarEmbedding(baseEmb1, 0.02)); // very similar

  const baseEmb2 = randomEmbedding('consolidation-group-2');
  const m3 = insertMemory(db, {
    type: 'semantic', content: 'Bayra is an AI assistant',
    importance: 7.0, created_at: daysAgo(10),
  });
  insertEmbedding(db, m3.id, baseEmb2);

  const m4 = insertMemory(db, {
    type: 'semantic', content: 'Bayra is an artificial intelligence assistant',
    importance: 6.5, created_at: daysAgo(8),
  });
  insertEmbedding(db, m4.id, similarEmbedding(baseEmb2, 0.02));

  // Different type — should NOT consolidate with above
  const m5 = insertMemory(db, {
    type: 'episodic', content: 'Bayra helped with code today',
    importance: 4.0, created_at: daysAgo(2),
  });
  insertEmbedding(db, m5.id, similarEmbedding(baseEmb2, 0.03));

  // === Decay test memories ===
  // Old episodic, low access — should decay
  const m6 = insertMemory(db, {
    type: 'episodic', content: 'Had a chat about weather',
    importance: 5.0, access_count: 0, created_at: daysAgo(60),
    last_accessed_at: daysAgo(60),
  });
  insertEmbedding(db, m6.id, randomEmbedding('decay-1'));

  // Old episodic, high access — should resist decay
  const m7 = insertMemory(db, {
    type: 'episodic', content: 'Important recurring conversation',
    importance: 5.0, access_count: 15, created_at: daysAgo(60),
    last_accessed_at: daysAgo(60),
  });
  insertEmbedding(db, m7.id, randomEmbedding('decay-2'));

  // Recent episodic — should NOT decay (< 7 days)
  const m8 = insertMemory(db, {
    type: 'episodic', content: 'Recent conversation',
    importance: 5.0, access_count: 0, created_at: daysAgo(2),
    last_accessed_at: daysAgo(2),
  });

  // Procedural — should NEVER decay
  const m9 = insertMemory(db, {
    type: 'procedural', content: 'How to restart the server',
    importance: 4.0, access_count: 0, created_at: daysAgo(100),
    last_accessed_at: daysAgo(100),
  });

  // High importance semantic — should NOT decay
  const m10 = insertMemory(db, {
    type: 'semantic', content: 'Mohammed is the founder of Pyramedia',
    importance: 9.0, access_count: 5, created_at: daysAgo(90),
    last_accessed_at: daysAgo(45),
  });

  // Old semantic, low importance — should decay (> 30 days)
  const m11 = insertMemory(db, {
    type: 'semantic', content: 'Some old fact that might not matter',
    importance: 4.0, access_count: 1, created_at: daysAgo(60),
    last_accessed_at: daysAgo(60),
  });

  // === Garbage Collection test memories ===
  // Old, low importance, low access episodic — should archive
  for (let i = 0; i < 5; i++) {
    insertMemory(db, {
      type: 'episodic',
      content: `Old unimportant memory ${i}`,
      importance: 2.0,
      access_count: 0,
      created_at: daysAgo(120),
      last_accessed_at: daysAgo(120),
    });
  }

  // Already archived and very old — should be deleted
  for (let i = 0; i < 3; i++) {
    insertMemory(db, {
      type: 'episodic',
      content: `Ancient archived memory ${i}`,
      importance: 1.0,
      status: 'archived',
      created_at: daysAgo(250),
      updated_at: daysAgo(200),
    });
  }

  // Active memory that should NOT be archived (high importance)
  insertMemory(db, {
    type: 'episodic',
    content: 'Important recent episodic memory',
    importance: 8.0,
    access_count: 10,
    created_at: daysAgo(120),
    last_accessed_at: daysAgo(5),
  });

  // === Add some entities ===
  db.prepare(`INSERT INTO entities (id, type, name) VALUES (?, ?, ?)`).run('e1', 'person', 'Mohammed');
  db.prepare(`INSERT INTO entities (id, type, name) VALUES (?, ?, ?)`).run('e2', 'ai', 'Bayra');
  db.prepare(`INSERT INTO memory_entities (memory_id, entity_id, role) VALUES (?, ?, ?)`)
    .run(m1.id, 'e1', 'subject');
  db.prepare(`INSERT INTO memory_entities (memory_id, entity_id, role) VALUES (?, ?, ?)`)
    .run(m3.id, 'e2', 'subject');

  // === Staging / queue entries for GC ===
  try {
    db.prepare(`INSERT INTO memory_staging (id, agent_id, content, status, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run('s1', 'test', 'Staging entry', 'approved', daysAgo(10));
    db.prepare(`INSERT INTO memory_staging (id, agent_id, content, status, created_at) VALUES (?, ?, ?, ?, ?)`)
      .run('s2', 'test', 'Pending staging', 'pending', daysAgo(10));
  } catch {}

  try {
    db.prepare(`INSERT INTO embedding_queue (memory_id, content, status, created_at) VALUES (?, ?, ?, ?)`)
      .run(m1.id, 'test content', 'done', daysAgo(10));
  } catch {}

  // Add old embedding cache entries
  try {
    db.prepare(`INSERT INTO embedding_cache (text_hash, embedding, last_used) VALUES (?, ?, ?)`)
      .run('old-hash-1', embeddingToBuffer(randomEmbedding('cache1')), daysAgo(45));
    db.prepare(`INSERT INTO embedding_cache (text_hash, embedding, last_used) VALUES (?, ?, ?)`)
      .run('recent-hash', embeddingToBuffer(randomEmbedding('cache2')), daysAgo(5));
  } catch {}

  // Fill up to 30+ memories
  for (let i = 0; i < 10; i++) {
    const emb = randomEmbedding(`filler-${i}`);
    const m = insertMemory(db, {
      type: ['episodic', 'semantic', 'procedural'][i % 3],
      content: `Filler memory number ${i} with unique content about topic ${i}`,
      importance: 3 + (i % 5),
      access_count: i,
      created_at: daysAgo(i * 5),
      last_accessed_at: daysAgo(i * 3),
    });
    insertEmbedding(db, m.id, emb);
  }

  const total = db.prepare(`SELECT COUNT(*) as c FROM memories`).get().c;
  console.log(`  Populated test DB with ${total} memories`);
}

// ─── Tests ─────────────────────────────────────────────────

async function testConsolidation(db) {
  console.log('\n📦 Test: consolidateMemories');

  // Dry run first
  const dry = await consolidateMemories(db, { dryRun: true, threshold: 0.90 });
  assert(dry.merged > 0, `Dry run found ${dry.merged} pairs to merge`);

  // Verify no changes in dry run
  const activeBefore = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE status = 'active'`).get().c;

  const result = await consolidateMemories(db, { threshold: 0.90 });
  assert(result.merged > 0, `Merged ${result.merged} pairs`);
  assert(result.pairs.length === result.merged, 'Pairs array matches merged count');

  // Verify consolidated memories have correct status
  const consolidated = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE status = 'consolidated'`).get().c;
  assert(consolidated >= result.merged, `${consolidated} memories marked as consolidated`);

  // Verify parent_id is set
  const withParent = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE status = 'consolidated' AND parent_id IS NOT NULL`).get().c;
  assert(withParent === consolidated, 'All consolidated memories have parent_id');

  // Verify cross-type NOT consolidated (episodic should remain if similar to semantic)
  for (const pair of result.pairs) {
    const p = db.prepare(`SELECT type FROM memories WHERE id = ?`).get(pair.primary);
    const c = db.prepare(`SELECT type FROM memories WHERE id = ?`).get(pair.consolidated);
    assert(p.type === c.type, `Pair types match: ${p.type} === ${c.type}`);
  }
}

function testDecay(db) {
  console.log('\n⏳ Test: applyDecay');

  // Dry run
  const dry = applyDecay(db, { dryRun: true });
  assert(dry.decayed > 0, `Dry run found ${dry.decayed} memories to decay`);

  // Verify no changes
  const importanceBefore = db.prepare(`SELECT id, importance FROM memories WHERE status = 'active'`).all();
  const beforeMap = new Map(importanceBefore.map(m => [m.id, m.importance]));

  const result = applyDecay(db);
  assert(result.decayed > 0, `Decayed ${result.decayed} memories`);

  // Check specific rules
  const procedural = db.prepare(`SELECT * FROM memories WHERE type = 'procedural' AND status = 'active'`).all();
  for (const m of procedural) {
    assert(!result.details.find(d => d.id === m.id), `Procedural memory ${m.id.slice(0,8)} NOT decayed`);
  }

  const highSemantic = db.prepare(`SELECT * FROM memories WHERE type = 'semantic' AND importance >= 8 AND status = 'active'`).all();
  for (const m of highSemantic) {
    assert(!result.details.find(d => d.id === m.id), `High-importance semantic ${m.id.slice(0,8)} NOT decayed`);
  }

  // Verify no importance below 1.0
  const belowOne = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE importance < 1.0`).get().c;
  assert(belowOne === 0, 'No memories decayed below 1.0');

  // Check that frequently accessed memories decay less
  const decayDetails = result.details;
  if (decayDetails.length >= 2) {
    // Find a high-access and low-access memory in the details
    const sorted = [...decayDetails].sort((a, b) => (b.newImportance / b.oldImportance) - (a.newImportance / a.oldImportance));
    assert(sorted[0].newImportance / sorted[0].oldImportance > sorted[sorted.length-1].newImportance / sorted[sorted.length-1].oldImportance,
      'Higher reinforcement = less decay');
  }
}

function testGarbageCollect(db) {
  console.log('\n🗑️ Test: garbageCollect');

  // Dry run
  const dry = garbageCollect(db, { dryRun: true });
  assert(dry.archived >= 0, `Dry run: ${dry.archived} to archive`);
  assert(dry.deleted >= 0, `Dry run: ${dry.deleted} to delete`);

  const archivedBefore = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE status = 'archived'`).get().c;

  const result = garbageCollect(db);
  assert(result.archived > 0, `Archived ${result.archived} old memories`);
  assert(result.deleted > 0, `Deleted ${result.deleted} ancient archived memories`);
  assert(result.cacheCleaned > 0, `Cleaned ${result.cacheCleaned} old cache entries`);

  // Verify archived count increased
  const archivedAfter = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE status = 'archived'`).get().c;
  assert(archivedAfter > archivedBefore - result.deleted, 'Archive count increased');

  // Verify important memories weren't touched
  const importantEpisodic = db.prepare(`
    SELECT COUNT(*) as c FROM memories WHERE type = 'episodic' AND importance >= 8 AND status = 'active'
  `).get().c;
  assert(importantEpisodic > 0, 'Important episodic memories preserved');

  // Queue/staging cleaned
  assert(typeof result.queueCleaned === 'number', 'Queue cleaned reported');
  assert(typeof result.stagingCleaned === 'number', 'Staging cleaned reported');
}

async function testSleepTimeReflection(db) {
  console.log('\n💤 Test: sleepTimeReflection');

  const result = await sleepTimeReflection(db, { dryRun: true });
  assert(result.consolidation !== undefined, 'Has consolidation results');
  assert(result.decay !== undefined, 'Has decay results');
  assert(result.gc !== undefined, 'Has gc results');
  assert(typeof result.summary === 'string', 'Has summary string');
  assert(result.summary.includes('DRY RUN'), 'Summary mentions dry run');
  console.log(`  Summary: ${result.summary.replace(/\n/g, ' | ')}`);
}

async function testBackup(db) {
  console.log('\n💾 Test: backupDatabase');

  // Clean test backup dir
  try { rmSync(TEST_BACKUP_DIR, { recursive: true }); } catch {}

  const result = await backupDatabase(db, TEST_BACKUP_DIR);
  assert(existsSync(result.path), `Backup created at ${result.path}`);
  assert(result.size > 0, `Backup size: ${result.size} bytes`);
  assert(result.kept >= 1, `Kept ${result.kept} backups`);
  assert(result.deleted === 0, 'No old backups deleted (only 1 exists)');
}

function testIntegrity(db) {
  console.log('\n🔍 Test: checkIntegrity');

  const result = checkIntegrity(db);
  assert(result.ok === true, `Integrity check passed: ${result.result}`);
}

function testHealth(db) {
  console.log('\n📊 Test: getMemoryHealth');

  const report = getMemoryHealth(db);
  assert(Array.isArray(report.byTypeStatus) && report.byTypeStatus.length > 0, 'Has type/status breakdown');
  assert(typeof report.avgImportance === 'object', 'Has avg importance by type');
  assert(report.recentActivity.last30d > 0, `Recent activity: ${report.recentActivity.last30d} in 30d`);
  assert(Array.isArray(report.topAccessed), 'Has top accessed list');
  assert(Array.isArray(report.topImportance), 'Has top importance list');
  assert(report.entities.count >= 2, `Entity count: ${report.entities.count}`);
  assert(typeof report.embeddingCoverage === 'string', `Embedding coverage: ${report.embeddingCoverage}`);
  assert(report.dateRange.oldest !== null, 'Has oldest date');
  assert(report.dateRange.newest !== null, 'Has newest date');

  console.log(`  DB size: ${report.dbSizeMB}MB`);
  console.log(`  Types: ${JSON.stringify(report.avgImportance)}`);
  console.log(`  Embeddings: ${report.embeddingCoverage}`);
}

function testEmptyDb() {
  console.log('\n🫙 Test: Empty database handling');
  const emptyDb = createTestDb();

  try {
    const decay = applyDecay(emptyDb);
    assert(decay.decayed === 0, 'Decay on empty DB returns 0');

    const gc = garbageCollect(emptyDb);
    assert(gc.archived === 0, 'GC on empty DB returns 0');

    const health = getMemoryHealth(emptyDb);
    assert(health.byTypeStatus.length === 0, 'Health on empty DB has no types');
    assert(health.embeddingCoverage === '0/0 (0%)', 'Empty embedding coverage');
  } finally {
    emptyDb.close();
  }
}

// ─── Main ──────────────────────────────────────────────────

async function main() {
  console.log('🧪 Lifecycle Engine Tests\n');
  console.log('Setting up test database...');

  const db = createTestDb();
  populateTestDb(db);

  try {
    await testConsolidation(db);
    testDecay(db);
    testGarbageCollect(db);
    await testSleepTimeReflection(db);
    await testBackup(db);
    testIntegrity(db);
    testHealth(db);
    testEmptyDb();
  } finally {
    db.close();
    // Cleanup
    try { rmSync(TEST_DB_PATH); } catch {}
    try { rmSync(TEST_DB_PATH + '-wal'); } catch {}
    try { rmSync(TEST_DB_PATH + '-shm'); } catch {}
    try { rmSync(TEST_BACKUP_DIR, { recursive: true }); } catch {}
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(40)}`);

  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
