/**
 * Test suite for Phase 4: Ingestion Pipeline
 * Runs actual API calls to OpenAI (embeddings + chat).
 */

import {
  sanitizeContent, isSensitive,
  extractMemories, extractFromText,
  findDuplicate, ingestMemory, ingestConversation,
} from './ingest.mjs';
import { getDb, closeDb, createMemory, getMemory } from './db.mjs';
import { embed, embeddingToBuffer, setCacheDb } from './embeddings.mjs';

let db;
let passed = 0, failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.log(`  ❌ ${label}`);
    failed++;
  }
}

// ─── Test 1: sanitizeContent ─────────────────────────────────────────

function testSanitize() {
  console.log('\n🧪 Test 1: sanitizeContent');

  const t1 = sanitizeContent('My key is sk-proj-abc123def456ghi789jkl012mno');
  assert(t1.includes('[REDACTED]'), 'Redacts sk- API key');
  assert(!t1.includes('sk-proj'), 'sk- key is gone');

  const t2 = sanitizeContent('Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz12');
  assert(t2.includes('[REDACTED]'), 'Redacts GitHub PAT');

  const t3 = sanitizeContent('Auth: Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.signature123456789');
  assert(t3.includes('[REDACTED]'), 'Redacts Bearer token');

  const t4 = sanitizeContent('password = "supersecret123"');
  assert(t4.includes('[REDACTED]'), 'Redacts password');

  const t5 = sanitizeContent('Mohammed is the CEO of Pyramedia');
  assert(!t5.includes('[REDACTED]'), 'Normal text unchanged');
  assert(t5 === 'Mohammed is the CEO of Pyramedia', 'Exact match for normal text');
}

// ─── Test 2: isSensitive ─────────────────────────────────────────────

function testIsSensitive() {
  console.log('\n🧪 Test 2: isSensitive');

  assert(isSensitive('key: sk-proj-abc123def456ghi789jkl012mno'), 'Detects API key');
  assert(isSensitive('password=abc123456'), 'Detects password');
  assert(!isSensitive('Just a normal sentence'), 'Normal text is not sensitive');
  assert(!isSensitive('Mohammed uses Supabase'), 'Tech text is not sensitive');
}

// ─── Test 3: extractMemories (LLM call) ─────────────────────────────

async function testExtractMemories() {
  console.log('\n🧪 Test 3: extractMemories (LLM API call)');

  const testMessages = [
    { role: 'user', content: 'أنا محمد، مؤسس شركة Pyramedia في دبي' },
    { role: 'assistant', content: 'أهلاً محمد! Pyramedia شركة تسويق وأتمتة بالذكاء الاصطناعي' },
    { role: 'user', content: 'بدي نستخدم Supabase للداتابيس وCoolify للديبلوي' },
    { role: 'assistant', content: 'ممتاز! Supabase خيار رائع. Coolify على السيرفر 72.61.148.81' },
    { role: 'user', content: 'تمام خلص' },
  ];

  const memories = await extractMemories(testMessages);
  console.log(`  📝 Extracted ${memories.length} memories`);

  assert(memories.length >= 2, `Extracted ≥2 memories (got ${memories.length})`);

  if (memories.length > 0) {
    const m = memories[0];
    assert(typeof m.content === 'string' && m.content.length > 5, 'Memory has content');
    assert(['episodic', 'semantic', 'procedural'].includes(m.type), `Valid type: ${m.type}`);
    assert(m.importance >= 1 && m.importance <= 10, `Valid importance: ${m.importance}`);
    assert(Array.isArray(m.entities), 'Has entities array');
    assert(Array.isArray(m.tags), 'Has tags array');

    // Check that filler was skipped
    const fillerMemory = memories.find(m =>
      m.content.includes('تمام خلص') || m.content.includes('ok') || m.content === 'thanks'
    );
    assert(!fillerMemory, 'Filler messages were skipped');

    console.log('  📋 Sample memories:');
    for (const mem of memories.slice(0, 3)) {
      console.log(`     - [${mem.type}/${mem.importance}] ${mem.content}`);
      if (mem.entities.length > 0) {
        console.log(`       Entities: ${mem.entities.map(e => `${e.name}(${e.type})`).join(', ')}`);
      }
    }
  }
}

// ─── Test 4: findDuplicate ───────────────────────────────────────────

async function testFindDuplicate() {
  console.log('\n🧪 Test 4: findDuplicate');

  const content = 'Mohammed is the founder of Pyramedia in Dubai';
  const emb = await embed(content);

  // Store a memory + embedding
  const mem = createMemory({
    type: 'semantic',
    content,
    importance: 8,
  });
  db.prepare('INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)')
    .run(mem.id, embeddingToBuffer(emb));

  // Test exact duplicate
  const dup1 = await findDuplicate(db, content, emb);
  assert(dup1.isDuplicate === true, 'Finds exact duplicate');
  assert(dup1.similarity === 1.0, 'Exact match similarity is 1.0');

  // Test similar content
  const similar = 'Mohammed founded Pyramedia company in Dubai';
  const embSimilar = await embed(similar);
  const dup2 = await findDuplicate(db, similar, embSimilar);
  console.log(`  📊 Similar content similarity: ${dup2.similarity?.toFixed(3) || 'N/A'}`);
  // This might or might not be duplicate depending on threshold

  // Test completely different content
  const different = 'The weather in Tokyo is cold in winter';
  const embDiff = await embed(different);
  const dup3 = await findDuplicate(db, different, embDiff);
  assert(dup3.isDuplicate === false, 'Different content is not duplicate');
}

// ─── Test 5: ingestMemory (full pipeline) ────────────────────────────

async function testIngestMemory() {
  console.log('\n🧪 Test 5: ingestMemory (full pipeline)');

  // New memory
  const result1 = await ingestMemory(db, 'Pyramedia uses Coolify for deployment on server 72.61.148.81', {
    type: 'semantic',
    subtype: 'fact',
    importance: 7,
    entities: [{ name: 'Pyramedia', type: 'company' }, { name: 'Coolify', type: 'tool' }],
    tags: ['infrastructure', 'deployment'],
    source: 'test',
  });

  assert(result1.action === 'created', `New memory created (${result1.action})`);
  assert(result1.memory && result1.memory.id, 'Memory has ID');
  console.log(`  📝 Created memory: ${result1.memory.id}`);

  // Duplicate (same content)
  const result2 = await ingestMemory(db, 'Pyramedia uses Coolify for deployment on server 72.61.148.81', {
    type: 'semantic',
    importance: 8,
    tags: ['devops'],
    source: 'test',
  });

  assert(result2.action === 'updated', `Duplicate detected and updated (${result2.action})`);
  if (result2.memory) {
    assert(result2.memory.importance > 7, `Importance bumped: ${result2.memory.importance}`);
  }

  // Memory with sensitive data
  const result3 = await ingestMemory(db, 'API key is sk-proj-abc123def456ghi789jkl012mno345pqr', {
    type: 'semantic',
    source: 'test',
  });

  if (result3.memory) {
    assert(result3.memory.content.includes('[REDACTED]'), 'Sensitive data was sanitized');
    assert(!result3.memory.content.includes('sk-proj'), 'API key removed from stored content');
  }
}

// ─── Test 6: ingestConversation (full pipeline) ──────────────────────

async function testIngestConversation() {
  console.log('\n🧪 Test 6: ingestConversation (full pipeline)');

  const testMessages = [
    { role: 'user', content: 'We decided to use Next.js for the Pyramedia website' },
    { role: 'assistant', content: 'Great choice! Next.js with Supabase for the backend' },
    { role: 'user', content: 'The domain is pyramedia.info and DNS is on Cloudflare' },
    { role: 'assistant', content: 'Perfect. I\'ll configure the DNS records' },
  ];

  const result = await ingestConversation(db, testMessages, {
    source: 'test-conversation',
    channel: 'telegram',
  });

  console.log(`  📊 Results: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
  assert(result.created >= 1 || result.updated >= 1, 'At least 1 memory ingested');
  assert(Array.isArray(result.memories), 'Returns memories array');

  if (result.memories.length > 0) {
    console.log('  📋 Ingested memories:');
    for (const mem of result.memories) {
      console.log(`     - [${mem.type}] ${mem.content?.substring(0, 80)}`);
    }
  }
}

// ─── Test 7: extractFromText ─────────────────────────────────────────

async function testExtractFromText() {
  console.log('\n🧪 Test 7: extractFromText');

  const text = `Pyramedia is a Dubai-based marketing and AI automation company founded by Mohammed.
The tech stack includes Supabase for database, Coolify for deployment, and n8n for workflow automation.
The main server IP is 72.61.148.81 running Ubuntu.
The company focuses on social media marketing for UAE clients.`;

  const memories = await extractFromText(text, 'test-doc');
  console.log(`  📝 Extracted ${memories.length} memories from text block`);

  assert(memories.length >= 2, `Extracted ≥2 memories (got ${memories.length})`);

  if (memories.length > 0) {
    assert(memories[0].source === 'test-doc', 'Source preserved');
    console.log('  📋 Extracted:');
    for (const mem of memories.slice(0, 4)) {
      console.log(`     - [${mem.type}/${mem.importance}] ${mem.content}`);
    }
  }
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  console.log('🚀 Phase 4: Ingestion Pipeline Tests');
  console.log('=' .repeat(60));

  db = getDb();
  setCacheDb(db);

  try {
    // Sync tests
    testSanitize();
    testIsSensitive();

    // Async tests (API calls)
    await testExtractMemories();
    await testFindDuplicate();
    await testIngestMemory();
    await testIngestConversation();
    await testExtractFromText();

  } catch (err) {
    console.error('\n💥 Test error:', err);
    failed++;
  } finally {
    closeDb();
  }

  console.log('\n' + '='.repeat(60));
  console.log(`📊 Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(failed === 0 ? '🎉 All tests passed!' : '⚠️  Some tests failed');
  process.exit(failed > 0 ? 1 : 0);
}

main();
