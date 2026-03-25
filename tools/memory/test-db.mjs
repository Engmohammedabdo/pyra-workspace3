import {
  getDb, closeDb,
  createMemory, getMemory, updateMemory, deleteMemory, listMemories,
  createEntity, getEntity, findEntity,
  linkMemoryEntity, createRelation,
  reinforceMemory, getStats, searchMemories,
} from './db.mjs';

// Use a test database
import { mkdirSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import os from 'node:os';

const TEST_DB = join(os.homedir(), '.openclaw', 'memory', 'bayra.db');

console.log('═══════════════════════════════════════');
console.log('  Bayra Memory System — Phase 1 Tests  ');
console.log('═══════════════════════════════════════\n');

// Clean start
if (existsSync(TEST_DB)) {
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(TEST_DB + '-wal'); } catch {}
  try { unlinkSync(TEST_DB + '-shm'); } catch {}
}

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name}: ${err.message}`);
    failed++;
  }
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ─── Init DB ───────────────────────────────────────────────
console.log('📦 Initializing database...');
const db = getDb();
console.log(`   DB path: ${TEST_DB}\n`);

// ─── Test 1: Create Memories ───────────────────────────────
console.log('🧠 Memory CRUD:');

const memoryIds = [];

test('Create episodic memory', () => {
  const m = createMemory({
    type: 'episodic',
    subtype: 'conversation',
    content: 'Mohammed asked Bayra to build a memory system for AI persistence.',
    importance: 8.0,
    source: 'telegram',
    channel: 'main',
    tags: 'memory,ai,project',
  });
  assert(m.id, 'Should have ID');
  memoryIds.push(m.id);
});

test('Create semantic memory', () => {
  const m = createMemory({
    type: 'semantic',
    subtype: 'fact',
    content: 'Pyramedia is a digital media company based in the UAE.',
    importance: 7.0,
    tags: 'pyramedia,uae,company',
    visibility: 'internal',
  });
  memoryIds.push(m.id);
});

test('Create procedural memory', () => {
  const m = createMemory({
    type: 'procedural',
    subtype: 'workflow',
    content: 'To deploy n8n workflows: 1. Test locally 2. Push to production 3. Activate',
    importance: 6.0,
    tags: 'n8n,deployment,workflow',
  });
  memoryIds.push(m.id);
});

test('Create episodic memory (conversation)', () => {
  const m = createMemory({
    type: 'episodic',
    subtype: 'event',
    content: 'Set up EliteLife clinic database on Supabase with patient management.',
    importance: 7.5,
    source: 'supabase',
    tags: 'elitelife,clinic,database',
  });
  memoryIds.push(m.id);
});

test('Create semantic memory (preference)', () => {
  const m = createMemory({
    type: 'semantic',
    subtype: 'preference',
    content: 'Mohammed prefers Arabic-first UI with English fallback.',
    importance: 6.5,
    tags: 'preference,language,ui',
  });
  memoryIds.push(m.id);
});

// ─── Test 2: Get Memory ────────────────────────────────────
test('Get memory by ID', () => {
  const m = getMemory(memoryIds[0]);
  assert(m, 'Should find memory');
  assert(m.type === 'episodic', 'Type should be episodic');
  assert(m.importance === 8.0, 'Importance should be 8.0');
});

// ─── Test 3: Update Memory ─────────────────────────────────
test('Update memory fields', () => {
  const updated = updateMemory(memoryIds[0], {
    summary: 'Memory system project kickoff',
    importance: 9.0,
  });
  assert(updated, 'Should return updated memory');
  assert(updated.summary === 'Memory system project kickoff', 'Summary should update');
  assert(updated.importance === 9.0, 'Importance should update');
});

// ─── Test 4: Create Entities ───────────────────────────────
console.log('\n👤 Entity CRUD:');

const entityIds = [];

test('Create entity: Mohammed', () => {
  const e = createEntity({
    type: 'person',
    name: 'Mohammed',
    aliases: JSON.stringify(['محمد', 'Mo']),
    properties: JSON.stringify({ role: 'founder', company: 'Pyramedia' }),
  });
  assert(e.id, 'Should have ID');
  entityIds.push(e.id);
});

test('Create entity: Pyramedia', () => {
  const e = createEntity({
    type: 'organization',
    name: 'Pyramedia',
    aliases: JSON.stringify(['Pyramedia Digital', 'بيراميديا']),
    properties: JSON.stringify({ industry: 'digital media', country: 'UAE' }),
  });
  entityIds.push(e.id);
});

test('Get entity by ID', () => {
  const e = getEntity(entityIds[0]);
  assert(e, 'Should find entity');
  assert(e.name === 'Mohammed', 'Name should match');
});

test('Find entity by name', () => {
  const e = findEntity('Pyramedia');
  assert(e, 'Should find by name');
  assert(e.type === 'organization', 'Type should match');
});

test('Find entity by alias', () => {
  const e = findEntity('محمد');
  assert(e, 'Should find by Arabic alias');
  assert(e.name === 'Mohammed', 'Should be Mohammed');
});

// ─── Test 5: Link Memory-Entity ────────────────────────────
console.log('\n🔗 Relations:');

test('Link memory to entity (Mohammed)', () => {
  const link = linkMemoryEntity(memoryIds[0], entityIds[0], 'requester');
  assert(link.memoryId === memoryIds[0], 'Memory ID should match');
});

test('Link memory to entity (Pyramedia)', () => {
  const link = linkMemoryEntity(memoryIds[1], entityIds[1], 'subject');
  assert(link.entityId === entityIds[1], 'Entity ID should match');
});

test('Create memory-memory relation', () => {
  const rel = createRelation(memoryIds[0], memoryIds[3], 'related_to', 0.8);
  assert(rel.relation === 'related_to', 'Relation should match');
  assert(rel.weight === 0.8, 'Weight should match');
});

// ─── Test 6: List with Filters ─────────────────────────────
console.log('\n📋 List & Filter:');

test('List all active memories', () => {
  const list = listMemories();
  assert(list.length === 5, `Should have 5 active memories, got ${list.length}`);
});

test('Filter by type: episodic', () => {
  const list = listMemories({ type: 'episodic' });
  assert(list.length === 2, `Should have 2 episodic, got ${list.length}`);
});

test('Filter by type: semantic', () => {
  const list = listMemories({ type: 'semantic' });
  assert(list.length === 2, `Should have 2 semantic, got ${list.length}`);
});

test('Filter by min importance', () => {
  const list = listMemories({ minImportance: 7.0 });
  // Updated memory has 9.0, others: 7.0, 7.5 = 3 memories ≥ 7.0
  assert(list.length >= 3, `Should have ≥3 important memories, got ${list.length}`);
});

test('Filter by visibility', () => {
  const list = listMemories({ visibility: 'internal' });
  assert(list.length === 1, `Should have 1 internal, got ${list.length}`);
});

// ─── Test 7: Reinforce Memory ──────────────────────────────
console.log('\n💪 Reinforcement:');

test('Reinforce memory boosts access_count and importance', () => {
  const before = getMemory(memoryIds[2]);
  const beforeImportance = before.importance;
  const beforeCount = before.access_count;

  reinforceMemory(memoryIds[2]);
  const after = getMemory(memoryIds[2]);

  assert(after.access_count === beforeCount + 1, 'Access count should increment');
  assert(after.importance === beforeImportance + 0.2, 'Importance should increase by 0.2');
  assert(after.last_accessed_at, 'Last accessed should be set');
});

test('Reinforce caps importance at 10.0', () => {
  // Set importance to 9.9 then reinforce
  updateMemory(memoryIds[2], { importance: 9.9 });
  reinforceMemory(memoryIds[2]);
  const m = getMemory(memoryIds[2]);
  assert(m.importance === 10.0, `Importance should cap at 10.0, got ${m.importance}`);
});

// ─── Test 8: Soft Delete ───────────────────────────────────
console.log('\n🗑️  Delete:');

test('Soft-delete memory', () => {
  const result = deleteMemory(memoryIds[4]);
  assert(result, 'Should succeed');
  const m = getMemory(memoryIds[4]);
  assert(m.status === 'deleted', 'Status should be deleted');
});

test('Soft-deleted excluded from default list', () => {
  const list = listMemories();
  assert(list.length === 4, `Should have 4 active memories, got ${list.length}`);
});

test('Can still find deleted with status filter', () => {
  const list = listMemories({ status: 'deleted' });
  assert(list.length === 1, `Should have 1 deleted, got ${list.length}`);
});

// ─── Test 9: FTS Search ────────────────────────────────────
console.log('\n🔍 Full-Text Search:');

test('Search memories by content', () => {
  const results = searchMemories('Pyramedia');
  assert(results.length >= 1, `Should find ≥1 result for "Pyramedia", got ${results.length}`);
});

test('Search memories by tag keyword', () => {
  const results = searchMemories('n8n');
  assert(results.length >= 1, `Should find ≥1 result for "n8n", got ${results.length}`);
});

// ─── Test 10: Stats ────────────────────────────────────────
console.log('\n📊 Stats:');

test('Get database stats', () => {
  const stats = getStats();
  assert(stats.totalActive === 4, `Active should be 4, got ${stats.totalActive}`);
  assert(stats.totalAll === 5, `Total should be 5, got ${stats.totalAll}`);
  assert(stats.byType.episodic === 2, `Episodic should be 2`);
  assert(stats.dbSizeBytes > 0, 'DB size should be > 0');
  console.log(`   📁 DB Size: ${stats.dbSizeMB} MB`);
  console.log(`   📊 Active: ${stats.totalActive} | Total: ${stats.totalAll}`);
  console.log(`   📂 By type:`, stats.byType);
});

// ─── Summary ───────────────────────────────────────────────
console.log('\n═══════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════\n');

closeDb();

if (failed > 0) {
  process.exit(1);
}
