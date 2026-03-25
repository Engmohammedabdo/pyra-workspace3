/**
 * test-search.mjs — Comprehensive tests for the hybrid search engine
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import {
  keywordSearch,
  vectorSearch,
  hybridSearch,
  multiSignalScore,
  recencyScore,
  entitySearch,
  relatedMemories,
  timeRangeSearch,
  reciprocalRankFusion,
  decayedImportance
} from './search.mjs';

const DB_PATH = '/tmp/test-memory-search.db';
const VECTOR_DIM = 64; // small dimension for testing

let passed = 0;
let failed = 0;

function assert(condition, name, detail = '') {
  if (condition) {
    console.log(`  ✅ PASS: ${name}`);
    passed++;
  } else {
    console.log(`  ❌ FAIL: ${name}${detail ? ' — ' + detail : ''}`);
    failed++;
  }
}

function randomVec(dim = VECTOR_DIM) {
  const v = new Float32Array(dim);
  for (let i = 0; i < dim; i++) v[i] = Math.random() * 2 - 1;
  return v;
}

function vecToBuffer(v) {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

function dateAgo(hours) {
  return new Date(Date.now() - hours * 3600 * 1000).toISOString();
}

// ==========================================
// SETUP DB
// ==========================================

function setupDB() {
  // Remove old test db
  try { require('fs').unlinkSync(DB_PATH); } catch {}

  const db = new Database(DB_PATH);
  sqliteVec.load(db);

  db.pragma('journal_mode = WAL');

  // Create schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL DEFAULT 'episodic',
      content TEXT NOT NULL,
      summary TEXT,
      importance INTEGER DEFAULT 5,
      confidence REAL DEFAULT 1.0,
      source TEXT DEFAULT 'conversation',
      context_tags TEXT DEFAULT '[]',
      emotional_valence REAL DEFAULT 0.0,
      status TEXT DEFAULT 'active',
      access_count INTEGER DEFAULT 0,
      last_accessed TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
      content,
      summary,
      content=memories,
      content_rowid=id,
      tokenize='porter unicode61'
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
      INSERT INTO memories_fts(rowid, content, summary)
      VALUES (new.id, new.content, new.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, summary)
      VALUES ('delete', old.id, old.content, old.summary);
    END;

    CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
      INSERT INTO memories_fts(memories_fts, rowid, content, summary)
      VALUES ('delete', old.id, old.content, old.summary);
      INSERT INTO memories_fts(rowid, content, summary)
      VALUES (new.id, new.content, new.summary);
    END;

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(
      embedding float[${VECTOR_DIM}]
    );

    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT DEFAULT 'person',
      aliases TEXT DEFAULT '[]',
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS memory_entities (
      memory_id INTEGER NOT NULL,
      entity_id INTEGER NOT NULL,
      role TEXT DEFAULT 'mentioned',
      PRIMARY KEY (memory_id, entity_id),
      FOREIGN KEY (memory_id) REFERENCES memories(id),
      FOREIGN KEY (entity_id) REFERENCES entities(id)
    );

    CREATE TABLE IF NOT EXISTS memory_relations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id INTEGER NOT NULL,
      target_id INTEGER NOT NULL,
      relation_type TEXT NOT NULL,
      weight REAL DEFAULT 1.0,
      metadata TEXT DEFAULT '{}',
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (source_id) REFERENCES memories(id),
      FOREIGN KEY (target_id) REFERENCES memories(id)
    );
  `);

  return db;
}

// ==========================================
// SEED DATA
// ==========================================

function seedData(db) {
  const insertMemory = db.prepare(`
    INSERT INTO memories (type, content, summary, importance, access_count, last_accessed, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
  `);

  const insertVec = db.prepare(`
    INSERT INTO memory_embeddings (rowid, embedding) VALUES (?, ?)
  `);

  const now = new Date().toISOString();

  // Create a "known" vector for targeted vector search
  const targetVec = new Float32Array(VECTOR_DIM);
  for (let i = 0; i < VECTOR_DIM; i++) targetVec[i] = 1.0; // all ones

  const memories = [
    // Recent, high importance
    { type: 'episodic', content: 'Mohammed deployed the Chatwoot integration on Coolify successfully', summary: 'Chatwoot deployment on Coolify', importance: 9, access: 15, lastAccess: dateAgo(1), created: dateAgo(1) },
    // Recent, low importance
    { type: 'episodic', content: 'Had a quick chat about weather in Dubai today', summary: 'Weather chat', importance: 2, access: 1, lastAccess: dateAgo(2), created: dateAgo(2) },
    // Week old, high importance
    { type: 'semantic', content: 'Pyramedia uses Next.js and Supabase for their main web application', summary: 'Pyramedia tech stack', importance: 8, access: 20, lastAccess: dateAgo(48), created: dateAgo(168) },
    // Month old, medium importance
    { type: 'procedural', content: 'To restart Coolify services, SSH into the server and run docker compose restart', summary: 'Coolify restart procedure', importance: 7, access: 5, lastAccess: dateAgo(336), created: dateAgo(720) },
    // Today, medium importance
    { type: 'episodic', content: 'Mohammed asked about implementing a memory system for the AI assistant', summary: 'Memory system discussion', importance: 8, access: 3, lastAccess: dateAgo(0.5), created: dateAgo(0.5) },
    // Old, rarely accessed
    { type: 'semantic', content: 'The capital of France is Paris, a well-known fact', summary: 'Paris is capital of France', importance: 3, access: 0, lastAccess: dateAgo(2160), created: dateAgo(2160) },
    // Recent procedural
    { type: 'procedural', content: 'Deploy to production: git push origin main, then Coolify auto-deploys', summary: 'Production deployment steps', importance: 7, access: 8, lastAccess: dateAgo(24), created: dateAgo(72) },
    // High importance semantic
    { type: 'semantic', content: 'Mohammed is the founder and CEO of Pyramedia, a digital agency in UAE', summary: 'Mohammed - Pyramedia founder', importance: 10, access: 25, lastAccess: dateAgo(0.1), created: dateAgo(4320) },
    // Episodic conversation
    { type: 'episodic', content: 'Discussed Chatwoot webhook configuration for customer support automation', summary: 'Chatwoot webhook setup', importance: 6, access: 4, lastAccess: dateAgo(48), created: dateAgo(96) },
    // Low relevance
    { type: 'episodic', content: 'Random test message with no particular meaning or context', summary: 'Test message', importance: 1, access: 0, lastAccess: dateAgo(720), created: dateAgo(720) },
    // Technical semantic
    { type: 'semantic', content: 'SQLite FTS5 supports BM25 ranking for full-text search queries', summary: 'SQLite FTS5 BM25', importance: 6, access: 3, lastAccess: dateAgo(12), created: dateAgo(48) },
    // Recent high-access
    { type: 'episodic', content: 'Mohammed reviewed the analytics dashboard and found conversion rate improved by 15%', summary: 'Analytics review', importance: 7, access: 12, lastAccess: dateAgo(3), created: dateAgo(6) },
    // Procedural
    { type: 'procedural', content: 'Configure Chatwoot: set FRONTEND_URL, SECRET_KEY_BASE, and REDIS_URL in environment', summary: 'Chatwoot configuration steps', importance: 8, access: 6, lastAccess: dateAgo(120), created: dateAgo(360) },
    // Archived (should not appear in active searches)
    { type: 'episodic', content: 'This memory about Pyramedia old project is archived', summary: 'Archived project', importance: 5, access: 0, lastAccess: dateAgo(8760), created: dateAgo(8760) },
    // Another recent one
    { type: 'semantic', content: 'Vector embeddings enable semantic similarity search in the memory system', summary: 'Vector embeddings for search', importance: 7, access: 2, lastAccess: dateAgo(1), created: dateAgo(4) },
    // Coolify specific
    { type: 'procedural', content: 'Coolify dashboard is at coolify.pyramedia.info, login with admin credentials', summary: 'Coolify access info', importance: 6, access: 10, lastAccess: dateAgo(24), created: dateAgo(240) },
    // Entity-rich
    { type: 'episodic', content: 'Mohammed met with the Pyramedia team to discuss Chatwoot integration roadmap', summary: 'Team meeting about Chatwoot', importance: 8, access: 7, lastAccess: dateAgo(48), created: dateAgo(72) },
    // Very recent
    { type: 'episodic', content: 'Building hybrid search engine with reciprocal rank fusion algorithm', summary: 'Building search engine', importance: 9, access: 1, lastAccess: dateAgo(0.1), created: dateAgo(0.1) },
  ];

  const insertArchived = db.prepare(`
    INSERT INTO memories (type, content, summary, importance, access_count, last_accessed, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'archived')
  `);

  const insertAll = db.transaction(() => {
    for (let i = 0; i < memories.length; i++) {
      const m = memories[i];
      let info;
      // Mark #14 (index 13) as archived
      if (i === 13) {
        info = insertArchived.run(m.type, m.content, m.summary, m.importance, m.access, m.lastAccess, m.created);
      } else {
        info = insertMemory.run(m.type, m.content, m.summary, m.importance, m.access, m.lastAccess, m.created);
      }
      const rowid = BigInt(info.lastInsertRowid); // vec0 requires BigInt for rowid

      // Insert vector — make memory #1 close to our target vector
      let vec;
      if (i === 0) {
        vec = new Float32Array(VECTOR_DIM);
        for (let j = 0; j < VECTOR_DIM; j++) vec[j] = 1.0 + Math.random() * 0.05;
      } else if (i === 4) {
        vec = new Float32Array(VECTOR_DIM);
        for (let j = 0; j < VECTOR_DIM; j++) vec[j] = 0.9 + Math.random() * 0.1;
      } else {
        vec = randomVec();
      }
      insertVec.run(rowid, vecToBuffer(vec));
    }
  });
  insertAll();

  // Insert entities
  db.prepare(`INSERT INTO entities (name, type, aliases) VALUES (?, ?, ?)`).run('Mohammed', 'person', '["محمد", "Mo"]');
  db.prepare(`INSERT INTO entities (name, type, aliases) VALUES (?, ?, ?)`).run('Pyramedia', 'organization', '["PyramediaX"]');
  db.prepare(`INSERT INTO entities (name, type, aliases) VALUES (?, ?, ?)`).run('Coolify', 'tool', '["coolify.pyramedia.info"]');
  db.prepare(`INSERT INTO entities (name, type, aliases) VALUES (?, ?, ?)`).run('Chatwoot', 'tool', '[]');

  // Link memories to entities
  const linkEntity = db.prepare(`INSERT INTO memory_entities (memory_id, entity_id, role) VALUES (?, ?, ?)`);
  // Mohammed linked to several memories
  linkEntity.run(1, 1, 'actor');     // Mohammed deployed Chatwoot
  linkEntity.run(5, 1, 'actor');     // Mohammed asked about memory
  linkEntity.run(8, 1, 'subject');   // Mohammed is founder
  linkEntity.run(12, 1, 'actor');    // Mohammed reviewed analytics
  linkEntity.run(17, 1, 'actor');    // Mohammed met team

  // Pyramedia
  linkEntity.run(3, 2, 'subject');   // Pyramedia tech stack
  linkEntity.run(8, 2, 'subject');   // Pyramedia founder
  linkEntity.run(17, 2, 'subject');  // Pyramedia team meeting

  // Coolify
  linkEntity.run(1, 3, 'subject');   // Coolify deployment
  linkEntity.run(4, 3, 'subject');   // Coolify restart
  linkEntity.run(7, 3, 'subject');   // Coolify auto-deploy
  linkEntity.run(16, 3, 'subject');  // Coolify dashboard

  // Chatwoot
  linkEntity.run(1, 4, 'subject');   // Chatwoot integration
  linkEntity.run(9, 4, 'subject');   // Chatwoot webhook
  linkEntity.run(13, 4, 'subject');  // Chatwoot config
  linkEntity.run(17, 4, 'subject');  // Chatwoot roadmap

  // Create relations between memories
  const linkRelation = db.prepare(`INSERT INTO memory_relations (source_id, target_id, relation_type, weight) VALUES (?, ?, ?, ?)`);
  linkRelation.run(1, 9, 'related_to', 0.9);     // Chatwoot deploy → Chatwoot webhook
  linkRelation.run(1, 13, 'requires', 0.8);       // Chatwoot deploy → Chatwoot config
  linkRelation.run(4, 16, 'related_to', 0.7);     // Coolify restart → Coolify dashboard
  linkRelation.run(5, 18, 'caused', 1.0);         // Memory discussion → Building search
  linkRelation.run(3, 7, 'related_to', 0.6);      // Tech stack → deployment
  linkRelation.run(8, 17, 'related_to', 0.5);     // Founder → team meeting

  return memories.length;
}

// ==========================================
// TESTS
// ==========================================

console.log('\n🔍 Memory Search Engine Tests\n');
console.log('='.repeat(50));

const db = setupDB();
const totalMemories = seedData(db);
console.log(`\n📦 Seeded ${totalMemories} memories\n`);

// ---------- keywordSearch ----------
console.log('--- keywordSearch ---');
{
  const results = keywordSearch(db, 'Chatwoot');
  assert(results.length > 0, 'finds Chatwoot memories', `got ${results.length}`);
  assert(results.every(r => r.content.toLowerCase().includes('chatwoot')), 'all results contain Chatwoot');
  assert(results.every(r => r.status === 'active'), 'no archived results');

  const noResults = keywordSearch(db, 'xyznonexistent');
  assert(noResults.length === 0, 'no results for nonexistent term');

  const typeFilter = keywordSearch(db, 'Coolify', { types: ['procedural'] });
  assert(typeFilter.length > 0, 'type filter returns results');
  assert(typeFilter.every(r => r.type === 'procedural'), 'all results match type filter');

  const importanceFilter = keywordSearch(db, 'Chatwoot', { minImportance: 8 });
  assert(importanceFilter.every(r => r.importance >= 8), 'importance filter works');

  // Edge case: special characters
  const specialChars = keywordSearch(db, '"test" AND *wildcard*');
  assert(Array.isArray(specialChars), 'handles special characters without error');

  // Empty query
  const empty = keywordSearch(db, '');
  assert(empty.length === 0, 'empty query returns empty array');
}

// ---------- vectorSearch ----------
console.log('\n--- vectorSearch ---');
{
  // Search with the target vector (close to memory #1)
  const targetVec = new Float32Array(VECTOR_DIM);
  for (let i = 0; i < VECTOR_DIM; i++) targetVec[i] = 1.0;

  const results = vectorSearch(db, targetVec);
  assert(results.length > 0, 'returns vector search results', `got ${results.length}`);
  assert(results[0].distance <= results[results.length - 1].distance, 'results sorted by distance ascending');
  // Memory #1 should be closest (we made its vector close to target)
  assert(results[0].id === 1 || results[0].id === 5, 'closest result is memory 1 or 5 (near target)', `got id=${results[0].id}`);

  // All have distances
  assert(results.every(r => typeof r.distance === 'number'), 'all results have distance');

  // Empty embedding
  const empty = vectorSearch(db, new Float32Array(0));
  assert(empty.length === 0, 'empty embedding returns empty');

  // Status filter — archived memory should not appear
  assert(results.every(r => r.status === 'active'), 'vector search excludes archived');
}

// ---------- hybridSearch ----------
console.log('\n--- hybridSearch ---');
{
  const targetVec = new Float32Array(VECTOR_DIM);
  for (let i = 0; i < VECTOR_DIM; i++) targetVec[i] = 1.0;

  const results = hybridSearch(db, 'Chatwoot deployment', targetVec, { limit: 5 });
  assert(results.length > 0 && results.length <= 5, 'returns limited results', `got ${results.length}`);
  assert(results.every(r => typeof r.finalScore === 'number'), 'all results have finalScore');
  assert(results.every(r => typeof r.rrfScore === 'number'), 'all results have rrfScore');

  // Scores should be descending
  let sorted = true;
  for (let i = 1; i < results.length; i++) {
    if (results[i].finalScore > results[i - 1].finalScore) sorted = false;
  }
  assert(sorted, 'results sorted by finalScore descending');
}

// ---------- multiSignalScore ----------
console.log('\n--- multiSignalScore ---');
{
  const recentImportant = {
    importance: 10,
    access_count: 20,
    created_at: new Date().toISOString(),
    last_accessed: new Date().toISOString()
  };
  const oldUnimportant = {
    importance: 1,
    access_count: 0,
    created_at: dateAgo(8760),
    last_accessed: dateAgo(8760)
  };

  const scoreHigh = multiSignalScore(recentImportant, { relevance: 1.0 });
  const scoreLow = multiSignalScore(oldUnimportant, { relevance: 0.1 });

  assert(scoreHigh > scoreLow, 'recent+important scores higher than old+unimportant', `${scoreHigh.toFixed(4)} vs ${scoreLow.toFixed(4)}`);
  assert(scoreHigh > 0 && scoreHigh <= 1, 'score in 0-1 range', `got ${scoreHigh.toFixed(4)}`);

  // Check weights sum correctly
  const perfect = multiSignalScore(
    { importance: 10, access_count: 20, created_at: new Date().toISOString(), last_accessed: new Date().toISOString() },
    { relevance: 1.0 }
  );
  // Should be close to 1.0: 0.45*1 + 0.25*~1 + 0.20*1 + 0.10*1
  assert(perfect > 0.9, 'perfect memory scores near 1.0', `got ${perfect.toFixed(4)}`);
}

// ---------- recencyScore ----------
console.log('\n--- recencyScore ---');
{
  const now = recencyScore(new Date().toISOString());
  assert(Math.abs(now - 1.0) < 0.01, 'now ≈ 1.0', `got ${now.toFixed(4)}`);

  const h24 = recencyScore(dateAgo(24));
  assert(h24 > 0.4 && h24 < 0.7, '24h ≈ 0.5 (±0.2)', `got ${h24.toFixed(4)}`);

  const d7 = recencyScore(dateAgo(168));
  assert(d7 < 0.15, '7 days < 0.15', `got ${d7.toFixed(4)}`);

  const invalid = recencyScore(null);
  assert(invalid === 0, 'null returns 0');

  const badDate = recencyScore('not-a-date');
  assert(badDate === 0, 'invalid date returns 0');
}

// ---------- entitySearch ----------
console.log('\n--- entitySearch ---');
{
  const moResults = entitySearch(db, 'Mohammed');
  assert(moResults.length >= 4, 'finds 4+ memories about Mohammed', `got ${moResults.length}`);
  assert(moResults.every(r => r.entity_name === 'Mohammed'), 'all linked to Mohammed entity');

  const pyResults = entitySearch(db, 'Pyramedia');
  assert(pyResults.length >= 2, 'finds Pyramedia memories', `got ${pyResults.length}`);

  // Search by alias
  const aliasResults = entitySearch(db, 'محمد');
  assert(aliasResults.length > 0, 'finds by Arabic alias', `got ${aliasResults.length}`);

  const noResults = entitySearch(db, 'NonexistentEntity');
  assert(noResults.length === 0, 'no results for nonexistent entity');

  const empty = entitySearch(db, '');
  assert(empty.length === 0, 'empty entity name returns empty');
}

// ---------- relatedMemories ----------
console.log('\n--- relatedMemories ---');
{
  // Memory 1 is related to 9 and 13
  const related = relatedMemories(db, 1);
  assert(related.length >= 2, 'finds related memories for memory 1', `got ${related.length}`);
  const relatedIds = related.map(r => r.id);
  assert(relatedIds.includes(9), 'finds memory 9 (Chatwoot webhook)');
  assert(relatedIds.includes(13), 'finds memory 13 (Chatwoot config)');
  assert(related.every(r => typeof r.weight === 'number'), 'all have weight');
  assert(related.every(r => typeof r.relation_type === 'string'), 'all have relation_type');

  // Filter by relation type
  const requires = relatedMemories(db, 1, { relations: ['requires'] });
  assert(requires.length >= 1, 'relation type filter works');
  assert(requires.every(r => r.relation_type === 'requires'), 'all match relation filter');

  // Bidirectional: memory 9 should find memory 1
  const reverse = relatedMemories(db, 9);
  assert(reverse.some(r => r.id === 1), 'bidirectional relation works');

  // No relations
  const noRel = relatedMemories(db, 6);
  assert(noRel.length === 0, 'memory with no relations returns empty');
}

// ---------- timeRangeSearch ----------
console.log('\n--- timeRangeSearch ---');
{
  const now = new Date().toISOString();
  const dayAgo = dateAgo(24);
  const weekAgo = dateAgo(168);

  const recent = timeRangeSearch(db, dayAgo, now);
  assert(recent.length > 0, 'finds memories from last 24h', `got ${recent.length}`);
  assert(recent.every(r => r.created_at >= dayAgo), 'all within time range');

  const weekRange = timeRangeSearch(db, weekAgo, dayAgo);
  assert(weekRange.length > 0, 'finds memories from last week', `got ${weekRange.length}`);

  // Type filter
  const procRecent = timeRangeSearch(db, weekAgo, now, { types: ['procedural'] });
  assert(procRecent.every(r => r.type === 'procedural'), 'type filter in time range');

  // No results for future range
  const future = timeRangeSearch(db, dateAgo(-48), dateAgo(-24));
  assert(future.length === 0, 'future range returns empty');
}

// ---------- reciprocalRankFusion ----------
console.log('\n--- reciprocalRankFusion ---');
{
  const ranking1 = [
    { id: 'A', rank: 1 },
    { id: 'B', rank: 2 },
    { id: 'C', rank: 3 },
  ];
  const ranking2 = [
    { id: 'B', rank: 1 },
    { id: 'C', rank: 2 },
    { id: 'D', rank: 3 },
  ];

  const merged = reciprocalRankFusion([ranking1, ranking2], 60);

  // B should be top (rank 2 in r1, rank 1 in r2) → score = 1/62 + 1/61
  assert(merged[0].id === 'B', 'B is top (appears high in both)', `got ${merged[0].id}`);

  // All 4 unique items present
  assert(merged.length === 4, 'all unique items present', `got ${merged.length}`);

  // Scores are descending
  let sorted = true;
  for (let i = 1; i < merged.length; i++) {
    if (merged[i].rrfScore > merged[i - 1].rrfScore) sorted = false;
  }
  assert(sorted, 'sorted by rrfScore descending');

  // Verify exact score for B: 1/(60+2) + 1/(60+1) = 1/62 + 1/61
  const expectedB = 1 / 62 + 1 / 61;
  assert(Math.abs(merged[0].rrfScore - expectedB) < 0.0001, 'B score matches formula', `${merged[0].rrfScore.toFixed(6)} vs ${expectedB.toFixed(6)}`);

  // D only in one ranking, should have lowest score
  const dItem = merged.find(m => m.id === 'D');
  assert(dItem.rrfScore < merged[0].rrfScore, 'D (single ranking) scores lower');

  // Empty input
  const emptyResult = reciprocalRankFusion([]);
  assert(emptyResult.length === 0, 'empty rankings returns empty');
}

// ---------- decayedImportance ----------
console.log('\n--- decayedImportance ---');
{
  // Recent, high importance, high access
  const fresh = decayedImportance({
    importance: 10,
    access_count: 15,
    last_accessed: new Date().toISOString(),
    created_at: dateAgo(24)
  });

  // Old, low importance, no access
  const stale = decayedImportance({
    importance: 2,
    access_count: 0,
    last_accessed: dateAgo(2160),
    created_at: dateAgo(2160)
  });

  assert(fresh > stale, 'fresh+important > stale+unimportant', `${fresh.toFixed(4)} vs ${stale.toFixed(4)}`);

  // High importance decays slower (importance shield)
  const highImpOld = decayedImportance({
    importance: 10,
    access_count: 0,
    last_accessed: dateAgo(720),
    created_at: dateAgo(720)
  });
  const lowImpOld = decayedImportance({
    importance: 2,
    access_count: 0,
    last_accessed: dateAgo(720),
    created_at: dateAgo(720)
  });
  assert(highImpOld > lowImpOld, 'high importance decays slower', `${highImpOld.toFixed(4)} vs ${lowImpOld.toFixed(4)}`);

  // Reinforcement helps fight decay
  const reinforced = decayedImportance({
    importance: 5,
    access_count: 20,
    last_accessed: dateAgo(720),
    created_at: dateAgo(720)
  });
  const notReinforced = decayedImportance({
    importance: 5,
    access_count: 0,
    last_accessed: dateAgo(720),
    created_at: dateAgo(720)
  });
  assert(reinforced > notReinforced, 'reinforcement fights decay', `${reinforced.toFixed(4)} vs ${notReinforced.toFixed(4)}`);

  // Null/missing memory
  assert(decayedImportance(null) === 0, 'null memory returns 0');
  assert(decayedImportance({}) === 0, 'empty memory returns 0');
}

// ---------- Edge cases ----------
console.log('\n--- Edge Cases ---');
{
  // Empty database
  const emptyDb = new Database(':memory:');
  sqliteVec.load(emptyDb);
  emptyDb.exec(`
    CREATE TABLE memories (id INTEGER PRIMARY KEY, type TEXT, content TEXT, summary TEXT, importance INTEGER DEFAULT 5, confidence REAL DEFAULT 1.0, source TEXT, context_tags TEXT, emotional_valence REAL, status TEXT DEFAULT 'active', access_count INTEGER DEFAULT 0, last_accessed TEXT, created_at TEXT, updated_at TEXT);
    CREATE VIRTUAL TABLE memories_fts USING fts5(content, summary, content=memories, content_rowid=id, tokenize='porter unicode61');
    CREATE VIRTUAL TABLE memory_embeddings USING vec0(embedding float[${VECTOR_DIM}]);
    CREATE TABLE entities (id INTEGER PRIMARY KEY, name TEXT, type TEXT, aliases TEXT, metadata TEXT, created_at TEXT);
    CREATE TABLE memory_entities (memory_id INTEGER, entity_id INTEGER, role TEXT, PRIMARY KEY(memory_id, entity_id));
    CREATE TABLE memory_relations (id INTEGER PRIMARY KEY, source_id INTEGER, target_id INTEGER, relation_type TEXT, weight REAL, metadata TEXT, created_at TEXT);
  `);

  assert(keywordSearch(emptyDb, 'test').length === 0, 'keyword search on empty DB');
  assert(vectorSearch(emptyDb, randomVec()).length === 0, 'vector search on empty DB');
  assert(hybridSearch(emptyDb, 'test', randomVec()).length === 0, 'hybrid search on empty DB');
  assert(entitySearch(emptyDb, 'test').length === 0, 'entity search on empty DB');
  assert(relatedMemories(emptyDb, 1).length === 0, 'related memories on empty DB');
  assert(timeRangeSearch(emptyDb, dateAgo(24), new Date().toISOString()).length === 0, 'time range on empty DB');

  emptyDb.close();
}

// ==========================================
// SUMMARY
// ==========================================

db.close();

console.log('\n' + '='.repeat(50));
console.log(`\n📊 Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests\n`);

if (failed > 0) {
  console.log('❌ Some tests failed!');
  process.exit(1);
} else {
  console.log('✅ All tests passed!');
  process.exit(0);
}
