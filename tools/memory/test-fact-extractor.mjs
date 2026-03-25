/**
 * Test Suite for fact-extractor.mjs
 * Run on backup DB: node test-fact-extractor.mjs
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { setDb, createMemory, createEntity, findEntity } from './db.mjs';
import { setCacheDb, embedWithRetry, embeddingToBuffer } from './embeddings.mjs';
import {
  extractFacts,
  detectConflicts,
  autoIngestFacts,
  resolveEntity,
  isTrivialMessage,
} from './fact-extractor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const BACKUP_DB = '/home/node/.openclaw/memory/bayra.db.pre-v2-backup';
const SCHEMA_PATH = join(__dirname, 'schema.sql');

// ─── Test Helpers ────────────────────────────────────────────────────

let testDb;
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

function setupTestDb() {
  // Open backup DB read-only, then clone to in-memory for safety
  const backupDb = new Database(BACKUP_DB, { readonly: true });
  
  // Create a fresh in-memory DB with schema
  testDb = new Database(':memory:');
  sqliteVec.load(testDb);

  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');

  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  const cleanedSchema = schema
    .split('\n')
    .filter(line => !line.trim().toUpperCase().startsWith('PRAGMA'))
    .join('\n');
  testDb.exec(cleanedSchema);
  testDb.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(memory_id TEXT PRIMARY KEY, embedding float[512])`);

  // Ensure temporal columns exist
  try { testDb.exec('ALTER TABLE memories ADD COLUMN valid_from TEXT'); } catch {}
  try { testDb.exec('ALTER TABLE memories ADD COLUMN valid_until TEXT'); } catch {}
  try { testDb.exec('ALTER TABLE memories ADD COLUMN superseded_by TEXT'); } catch {}

  // Inject as singleton
  setDb(testDb);
  setCacheDb(testDb);

  backupDb.close();
  return testDb;
}

// ─── Test 0: Trivial Message Filter ─────────────────────────────────

function test0_trivialFilter() {
  console.log('\n🧪 Test 0: Trivial Message Filter');

  assert(isTrivialMessage('السلام عليكم') === true, '"السلام عليكم" is trivial');
  assert(isTrivialMessage('تمام') === true, '"تمام" is trivial');
  assert(isTrivialMessage('ok') === true, '"ok" is trivial');
  assert(isTrivialMessage('شكراً') === true, '"شكراً" is trivial');
  assert(isTrivialMessage('👍') === true, 'Emoji-only is trivial');
  assert(isTrivialMessage('hi') === true, '"hi" is trivial');
  assert(isTrivialMessage('') === true, 'Empty is trivial');

  assert(isTrivialMessage('محمد نقل الإيميل من Bluehost لـ Zoho') === false, 'Business fact is NOT trivial');
  assert(isTrivialMessage('سعر خدمة الواتساب صار 8000 درهم بدل 5000') === false, 'Price change is NOT trivial');
  assert(isTrivialMessage('الموقع الجديد pyramedia.info شغال على Next.js') === false, 'Tech fact is NOT trivial');
}

// ─── Test 1: Fact Extraction from Messages ──────────────────────────

async function test1_extractFacts() {
  console.log('\n🧪 Test 1: Fact Extraction from Conversation');

  const messages = [
    { role: 'user', content: 'السلام عليكم' },
    { role: 'user', content: 'محمد نقل الإيميل من Bluehost لـ Zoho' },
    { role: 'user', content: 'سعر خدمة الواتساب صار 8000 درهم بدل 5000' },
    { role: 'user', content: 'تمام' },
    { role: 'user', content: 'الموقع الجديد pyramedia.info شغال على Next.js' },
  ];

  const facts = await extractFacts(messages);
  
  console.log(`  Extracted ${facts.length} facts:`);
  for (const f of facts) {
    console.log(`    → [${f.type}/${f.subtype}] ${f.content} (importance: ${f.importance})`);
  }

  assert(facts.length >= 2, `Extracted ${facts.length} facts (expected ≥ 2)`);
  assert(facts.length <= 5, `Extracted ${facts.length} facts (expected ≤ 5, not one per message)`);
  
  // Check that facts have required fields
  for (const f of facts) {
    assert(f.content && f.content.length > 5, `Fact has content: "${f.content.substring(0, 50)}..."`);
    assert(['semantic', 'episodic', 'procedural'].includes(f.type), `Valid type: ${f.type}`);
    assert(f.importance >= 1 && f.importance <= 10, `Valid importance: ${f.importance}`);
  }
}

// ─── Test 2: Conflict Detection + Auto-Supersede ────────────────────

async function test2_conflictDetection() {
  console.log('\n🧪 Test 2: Conflict Detection + Auto-Supersede');

  // Create an old fact about WhatsApp price
  const oldContent = 'سعر خدمة الواتساب بوت = 5000 درهم';
  const oldMemory = createMemory({
    type: 'semantic',
    subtype: 'fact',
    content: oldContent,
    importance: 7,
    valid_from: '2026-01-01T00:00:00Z',
    tags: 'price,whatsapp',
  });

  // Store embedding for old memory
  const oldEmbedding = await embedWithRetry(oldContent);
  assert(oldEmbedding !== null, 'Generated embedding for old fact');
  
  if (oldEmbedding) {
    const embBuf = embeddingToBuffer(oldEmbedding);
    testDb.prepare(
      'INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)'
    ).run(oldMemory.id, embBuf);
  }

  // New conflicting fact
  const newFact = {
    content: 'سعر خدمة الواتساب بوت = 8000 درهم',
    type: 'semantic',
  };

  const conflict = await detectConflicts(testDb, newFact);
  console.log(`  Conflict result: ${JSON.stringify({ hasConflict: conflict.hasConflict, reason: conflict.reason })}`);
  
  assert(conflict.hasConflict === true, 'Detected conflict between old and new WhatsApp price');
  if (conflict.oldMemory) {
    assert(conflict.oldMemory.id === oldMemory.id, 'Found the correct old memory');
  }

  // Now run full auto-ingest pipeline
  const messages = [
    { role: 'user', content: 'سعر خدمة الواتساب بوت صار 8000 درهم بدل 5000' },
  ];

  const result = await autoIngestFacts(testDb, messages, { source: 'test' });
  console.log(`  Pipeline result: extracted=${result.extracted}, ingested=${result.ingested}, superseded=${result.superseded}`);
  
  assert(result.extracted >= 1, `Extracted ${result.extracted} facts from price change message`);
  // The supersede may or may not trigger depending on LLM responses
  assert(result.ingested + result.superseded >= 1, 'At least one fact was ingested or superseded');
}

// ─── Test 3: Entity Resolution ──────────────────────────────────────

function test3_entityResolution() {
  console.log('\n🧪 Test 3: Entity Resolution');

  // Create an entity with aliases
  createEntity({
    type: 'person',
    name: 'حسين الغزال الشامسي',
    aliases: JSON.stringify(['حسين', 'Hussein', 'أ. حسين', 'حسين الشامسي']),
  });

  // Test exact match
  const exact = resolveEntity(testDb, 'حسين الغزال الشامسي', 'person');
  assert(exact && exact.name === 'حسين الغزال الشامسي', 'Exact match: "حسين الغزال الشامسي"');

  // Test alias match
  const alias = resolveEntity(testDb, 'أ. حسين', 'person');
  assert(alias && alias.name === 'حسين الغزال الشامسي', 'Alias match: "أ. حسين" → "حسين الغزال الشامسي"');

  // Test fuzzy/contains match
  const fuzzy = resolveEntity(testDb, 'حسين الشامسي', 'person');
  assert(fuzzy && fuzzy.name === 'حسين الغزال الشامسي', 'Fuzzy match: "حسين الشامسي" → "حسين الغزال الشامسي"');

  // Test creating new entity for unknown name
  const unknown = resolveEntity(testDb, 'شخص جديد تماماً', 'person');
  assert(unknown && unknown.name === 'شخص جديد تماماً', 'New entity created for unknown name');
}

// ─── Test 4: No False Positives ─────────────────────────────────────

async function test4_noFalsePositives() {
  console.log('\n🧪 Test 4: No False Positive Conflicts');

  // Create a fact about Mohammed living in Dubai
  const fact1Content = 'محمد يسكن في دبي';
  const fact1 = createMemory({
    type: 'semantic',
    subtype: 'fact',
    content: fact1Content,
    importance: 6,
    valid_from: '2026-01-01T00:00:00Z',
  });

  const emb1 = await embedWithRetry(fact1Content);
  if (emb1) {
    testDb.prepare(
      'INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)'
    ).run(fact1.id, embeddingToBuffer(emb1));
  }

  // Different topic: Pyramedia is based in Dubai (should NOT conflict)
  const newFact = {
    content: 'Pyramedia مقرها في دبي',
    type: 'semantic',
  };

  const conflict = await detectConflicts(testDb, newFact);
  console.log(`  Conflict result: ${JSON.stringify({ hasConflict: conflict.hasConflict, reason: conflict.reason })}`);
  
  // These are different subjects — should NOT be a conflict
  // Note: similarity might be high because both mention Dubai, but LLM should catch it
  assert(conflict.hasConflict === false, 'No false positive: different subjects both mentioning Dubai');
}

// ─── Run All Tests ──────────────────────────────────────────────────

async function runAllTests() {
  console.log('═══════════════════════════════════════════════');
  console.log('  Fact Extractor Test Suite');
  console.log('  Using backup DB (read-only) + in-memory test DB');
  console.log('═══════════════════════════════════════════════');

  setupTestDb();

  // Synchronous tests
  test0_trivialFilter();
  test3_entityResolution();

  // Async tests (require OpenAI API)
  await test1_extractFacts();
  await test2_conflictDetection();
  await test4_noFalsePositives();

  // Summary
  console.log('\n═══════════════════════════════════════════════');
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log('═══════════════════════════════════════════════');

  // Cleanup
  if (testDb) testDb.close();

  process.exit(failed > 0 ? 1 : 0);
}

runAllTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(2);
});
