/**
 * Migration: OpenAI text-embedding-3-small (512d) → Google Gemini Embedding 2 (3072d)
 * 
 * Steps:
 * 1. Drop old vec0 table (512d)
 * 2. Create new vec0 table (3072d)
 * 3. Clear embedding cache (old dimensions)
 * 4. Re-embed all active memories
 * 5. Verify search works
 * 
 * Usage: node migrate-to-gemini.mjs [--dry-run]
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { embed, embedBatch, DEFAULT_DIMS, cache, setCacheDb } from './embeddings.mjs';
import { join } from 'node:path';
import os from 'node:os';

const DB_PATH = join(os.homedir(), '.openclaw', 'memory', 'bayra.db');
const DRY_RUN = process.argv.includes('--dry-run');
const NEW_DIMS = DEFAULT_DIMS; // 3072 from gemini

console.log('🧠 Bayra Memory Migration — OpenAI → Gemini Embedding 2 Preview');
console.log(`   New dimensions: ${NEW_DIMS}`);
console.log(`   Dry run: ${DRY_RUN}`);
console.log('');

// Open DB
const db = new Database(DB_PATH);
sqliteVec.load(db);
db.pragma('journal_mode = WAL');
db.pragma('busy_timeout = 10000');

// Connect cache
setCacheDb(db);

// ─── Step 1: Count current state ─────────────────────────

const totalMemories = db.prepare("SELECT COUNT(*) as c FROM memories WHERE status = 'active'").get().c;
const totalEmbeddings = db.prepare("SELECT COUNT(*) as c FROM memory_embeddings").get().c;
const totalCache = db.prepare("SELECT COUNT(*) as c FROM embedding_cache").get().c;

console.log(`📊 Current state:`);
console.log(`   Active memories: ${totalMemories}`);
console.log(`   Vector embeddings: ${totalEmbeddings}`);
console.log(`   Cached embeddings: ${totalCache}`);
console.log('');

if (DRY_RUN) {
  console.log('🔍 Dry run — would migrate all above. Exiting.');
  db.close();
  process.exit(0);
}

// ─── Step 2: Drop old vec0 table and recreate with new dims ──

console.log('🔄 Step 1/4: Recreating vec0 table with new dimensions...');
try {
  db.exec('DROP TABLE IF EXISTS memory_embeddings');
} catch (e) {
  console.warn('   Warning dropping old table:', e.message);
}

db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(memory_id TEXT PRIMARY KEY, embedding float[${NEW_DIMS}])`);
console.log(`   ✅ Created vec0 table with float[${NEW_DIMS}]`);

// ─── Step 3: Clear old embedding cache ───────────────────

console.log('🧹 Step 2/4: Clearing old embedding cache...');
db.prepare('DELETE FROM embedding_cache').run();
console.log('   ✅ Cache cleared');

// ─── Step 4: Re-embed all active memories ────────────────

console.log('🚀 Step 3/4: Re-embedding all active memories...');

const memories = db.prepare(`
  SELECT id, content, summary FROM memories 
  WHERE status = 'active' 
  ORDER BY importance DESC
`).all();

console.log(`   Found ${memories.length} memories to embed`);

const BATCH_SIZE = 50;
let embedded = 0;
let failed = 0;
const startTime = Date.now();

// Prepare insert statement
const insertVec = db.prepare('INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)');

for (let i = 0; i < memories.length; i += BATCH_SIZE) {
  const batch = memories.slice(i, i + BATCH_SIZE);
  const texts = batch.map(m => m.summary || m.content);
  
  try {
    const vectors = await embedBatch(texts);
    
    const insertBatch = db.transaction(() => {
      for (let j = 0; j < batch.length; j++) {
        if (vectors[j]) {
          // vec0 expects raw Float32Array bytes
          const buf = Buffer.from(vectors[j].buffer, vectors[j].byteOffset, vectors[j].byteLength);
          insertVec.run(batch[j].id, buf);
          embedded++;
        } else {
          failed++;
        }
      }
    });
    insertBatch();
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const progress = ((i + batch.length) / memories.length * 100).toFixed(1);
    process.stdout.write(`\r   Progress: ${embedded}/${memories.length} (${progress}%) — ${elapsed}s elapsed`);
    
    // Rate limiting for Google API
    if (i + BATCH_SIZE < memories.length) {
      await new Promise(r => setTimeout(r, 200));
    }
  } catch (err) {
    console.error(`\n   ❌ Batch ${i}-${i+BATCH_SIZE} failed: ${err.message}`);
    failed += batch.length;
    // Wait longer on error
    await new Promise(r => setTimeout(r, 2000));
  }
}

const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
console.log(`\n   ✅ Done: ${embedded} embedded, ${failed} failed — ${totalTime}s total`);

// ─── Step 5: Verify ──────────────────────────────────────

console.log('🔍 Step 4/4: Verifying...');

const newEmbeddingCount = db.prepare("SELECT COUNT(*) as c FROM memory_embeddings").get().c;
const newCacheCount = db.prepare("SELECT COUNT(*) as c FROM embedding_cache").get().c;
console.log(`   Vector embeddings: ${newEmbeddingCount}`);
console.log(`   Cached embeddings: ${newCacheCount}`);

// Test search
console.log('\n📝 Test search: "ليلى إتمام"');
try {
  const testVec = await embed("ليلى إتمام");
  const testBuf = Buffer.from(testVec.buffer, testVec.byteOffset, testVec.byteLength);
  
  const results = db.prepare(`
    SELECT me.memory_id, me.distance, m.content, m.summary
    FROM memory_embeddings me
    JOIN memories m ON m.id = me.memory_id
    WHERE me.embedding MATCH ?
    AND k = 5
    ORDER BY me.distance
  `).all(testBuf);
  
  for (const r of results) {
    const text = (r.summary || r.content).substring(0, 80);
    console.log(`   ${r.distance.toFixed(4)} — ${text}`);
  }
} catch (e) {
  console.error('   ❌ Search test failed:', e.message);
}

db.close();

console.log('\n🎉 Migration complete!');
console.log(`   Provider: Google Gemini Embedding 2 Preview`);
console.log(`   Dimensions: ${NEW_DIMS}`);
console.log(`   Memories embedded: ${embedded}/${memories.length}`);
