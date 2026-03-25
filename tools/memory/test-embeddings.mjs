/**
 * Bayra Memory — Embedding Engine Tests
 */

import {
  embed,
  embedBatch,
  embedWithRetry,
  cosineSimilarity,
  normalizeVector,
  embeddingToBuffer,
  bufferToEmbedding,
  textHash,
  EmbeddingCache,
  EmbeddingQueue,
} from './embeddings.mjs';

const PASS = '✅';
const FAIL = '❌';
let passed = 0, failed = 0;

function assert(label, condition) {
  if (condition) { passed++; console.log(`${PASS} ${label}`); }
  else { failed++; console.error(`${FAIL} ${label}`); }
}

function time() { return performance.now(); }

console.log('═══════════════════════════════════════');
console.log('  Bayra Embedding Engine — Test Suite  ');
console.log('═══════════════════════════════════════\n');

// ─── Test 1: Single embed ─────────────────────────────────────────
console.log('── Test 1: Single embed ──');
let t0 = time();
const vec1 = await embed('Mohammed prefers concise reports');
let dt = time() - t0;
assert(`Returns Float32Array (got ${vec1.constructor.name})`, vec1 instanceof Float32Array);
assert(`Dimension = 512 (got ${vec1.length})`, vec1.length === 512);
assert(`Vector is normalized (L2 ≈ 1)`, Math.abs(Math.sqrt(vec1.reduce((s, v) => s + v * v, 0)) - 1) < 0.001);
console.log(`   ⏱  ${dt.toFixed(0)}ms\n`);

// ─── Test 2: Batch embed ──────────────────────────────────────────
console.log('── Test 2: Batch embed (3 texts) ──');
t0 = time();
const batch = await embedBatch([
  'Marketing strategy for UAE market',
  'Mohammed prefers concise reports',  // same as above — should cache-hit
  'The weather in Dubai is sunny',
]);
dt = time() - t0;
assert(`Returns array of 3`, Array.isArray(batch) && batch.length === 3);
assert(`All Float32Array`, batch.every(v => v instanceof Float32Array));
assert(`All dim 512`, batch.every(v => v.length === 512));
console.log(`   ⏱  ${dt.toFixed(0)}ms\n`);

// ─── Test 3: Cosine similarity (similar texts) ───────────────────
console.log('── Test 3: Cosine similarity (similar) ──');
const [simA, simB] = await embedBatch([
  'Mohammed likes brief and clear summaries',
  'Mohammed prefers concise reports',
]);
const simScore = cosineSimilarity(simA, simB);
assert(`Similar texts sim = ${simScore.toFixed(4)} (> 0.7)`, simScore > 0.7);

// ─── Test 4: Cosine similarity (unrelated texts) ─────────────────
console.log('── Test 4: Cosine similarity (unrelated) ──');
const [unA, unB] = await embedBatch([
  'Quantum physics and string theory',
  'Best recipe for chocolate cake',
]);
const unScore = cosineSimilarity(unA, unB);
assert(`Unrelated texts sim = ${unScore.toFixed(4)} (< 0.5)`, unScore < 0.5);

// ─── Test 5: normalizeVector ──────────────────────────────────────
console.log('── Test 5: normalizeVector ──');
const raw = new Float32Array([3, 4, 0]);
const normed = normalizeVector(raw);
const l2 = Math.sqrt(normed.reduce((s, v) => s + v * v, 0));
assert(`Normalized L2 = ${l2.toFixed(6)} (≈ 1)`, Math.abs(l2 - 1) < 0.0001);
assert(`Values correct [${normed[0].toFixed(2)}, ${normed[1].toFixed(2)}]`, Math.abs(normed[0] - 0.6) < 0.01 && Math.abs(normed[1] - 0.8) < 0.01);

// ─── Test 6: Buffer roundtrip ─────────────────────────────────────
console.log('── Test 6: embeddingToBuffer ↔ bufferToEmbedding ──');
const buf = embeddingToBuffer(vec1);
assert(`Buffer length = ${buf.length} (expected ${512 * 4})`, buf.length === 512 * 4);
const restored = bufferToEmbedding(buf);
assert(`Restored is Float32Array`, restored instanceof Float32Array);
assert(`Restored length = ${restored.length}`, restored.length === 512);
const roundtripOk = vec1.every((v, i) => v === restored[i]);
assert(`Roundtrip exact match`, roundtripOk);

// ─── Test 7: Cache hit ────────────────────────────────────────────
console.log('── Test 7: Cache hit (second embed should be instant) ──');
t0 = time();
const vec1b = await embed('Mohammed prefers concise reports');
dt = time() - t0;
assert(`Cache hit in ${dt.toFixed(1)}ms (< 5ms)`, dt < 5);
assert(`Same vector from cache`, vec1b.every((v, i) => v === vec1[i]));

// ─── Test 8: textHash stability ───────────────────────────────────
console.log('── Test 8: textHash stability ──');
const h1 = textHash('hello world');
const h2 = textHash('hello world');
const h3 = textHash('hello world!');
assert(`Same input → same hash`, h1 === h2);
assert(`Different input → different hash`, h1 !== h3);
assert(`Hash is 64-char hex`, h1.length === 64 && /^[0-9a-f]+$/.test(h1));

// ─── Test 9: EmbeddingQueue ──────────────────────────────────────
console.log('── Test 9: EmbeddingQueue ──');
const queue = new EmbeddingQueue();
queue.enqueue('mem-1', 'Test embedding queue item');
assert(`Pending count = 1`, queue.getPendingCount() === 1);
const qResults = await queue.processQueue();
assert(`Processed 1 item`, qResults.length === 1);
assert(`Pending count after = 0`, queue.getPendingCount() === 0);
assert(`Result has memoryId`, qResults[0].memoryId === 'mem-1');
assert(`Result has embedding`, qResults[0].embedding instanceof Float32Array);

// ─── Test 10: embedWithRetry ─────────────────────────────────────
console.log('── Test 10: embedWithRetry ──');
t0 = time();
const retryVec = await embedWithRetry('Testing retry logic');
dt = time() - t0;
assert(`embedWithRetry returns Float32Array`, retryVec instanceof Float32Array);
assert(`Correct dimensions`, retryVec.length === 512);
console.log(`   ⏱  ${dt.toFixed(0)}ms\n`);

// ─── Summary ──────────────────────────────────────────────────────
console.log('═══════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════');
process.exit(failed > 0 ? 1 : 0);
