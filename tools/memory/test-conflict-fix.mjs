/**
 * Test: Conflict detection with improved threshold + prompt
 */
import { getDb, closeDb, createMemory, supersedeMemory } from './db.mjs';
import { embed, embeddingToBuffer } from './embeddings.mjs';
import { detectConflicts, autoIngestFacts, isTrivialMessage } from './fact-extractor.mjs';

const db = getDb();
let passed = 0;
let failed = 0;
const cleanup = [];

function assert(condition, name) {
  if (condition) { console.log(`  ✅ ${name}`); passed++; }
  else { console.log(`  ❌ ${name}`); failed++; }
}

async function main() {
  console.log('\n=== Test 1: Price Change Conflict ===');
  
  // Create old fact
  const old1 = createMemory({
    type: 'semantic', subtype: 'fact',
    content: 'سعر خدمة الواتساب بوت = 5000 درهم',
    importance: 7, valid_from: '2026-01-01T00:00:00Z',
    tags: 'price,whatsapp',
  });
  cleanup.push(old1.id);
  
  // Generate embedding for old fact
  const emb1 = await embed('سعر خدمة الواتساب بوت = 5000 درهم');
  db.prepare('INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)').run(old1.id, embeddingToBuffer(emb1));
  
  // Test conflict detection
  const result1 = await detectConflicts(db, { 
    content: 'سعر خدمة WhatsApp Bot صار 8000 درهم بدل 5000', 
    type: 'semantic' 
  });
  
  assert(result1.hasConflict === true, 'Price change detected as conflict');
  console.log(`    Similarity: ${result1.similarity?.toFixed(3)}, Reason: ${result1.reason}`);

  console.log('\n=== Test 2: Company Name Change ===');
  
  const old2 = createMemory({
    type: 'semantic', subtype: 'fact',
    content: 'اسم الشركة = Pyramedia Marketing',
    importance: 8, valid_from: '2026-01-01T00:00:00Z',
    tags: 'company,name',
  });
  cleanup.push(old2.id);
  
  const emb2 = await embed('اسم الشركة = Pyramedia Marketing');
  db.prepare('INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)').run(old2.id, embeddingToBuffer(emb2));
  
  const result2 = await detectConflicts(db, { 
    content: 'الشركة غيرت اسمها لـ Pyramedia AI Solutions', 
    type: 'semantic' 
  });
  
  assert(result2.hasConflict === true, 'Company name change detected as conflict');
  console.log(`    Similarity: ${result2.similarity?.toFixed(3)}, Reason: ${result2.reason}`);

  console.log('\n=== Test 3: Email Migration ===');
  
  const old3 = createMemory({
    type: 'semantic', subtype: 'fact',
    content: 'محمد يستخدم Bluehost للإيميل',
    importance: 6, valid_from: '2026-01-01T00:00:00Z',
    tags: 'email,hosting',
  });
  cleanup.push(old3.id);
  
  const emb3 = await embed('محمد يستخدم Bluehost للإيميل');
  db.prepare('INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)').run(old3.id, embeddingToBuffer(emb3));
  
  const result3 = await detectConflicts(db, { 
    content: 'محمد نقل الإيميل من Bluehost لـ Zoho', 
    type: 'semantic' 
  });
  
  assert(result3.hasConflict === true, 'Email migration detected as conflict');
  console.log(`    Similarity: ${result3.similarity?.toFixed(3)}, Reason: ${result3.reason}`);

  console.log('\n=== Test 4: NO False Positive ===');
  
  const result4 = await detectConflicts(db, { 
    content: 'Pyramedia عندها مكتب في أبوظبي',
    type: 'semantic' 
  });
  
  assert(result4.hasConflict === false, 'Different topic = no conflict');

  console.log('\n=== Test 5: Full Pipeline (autoIngestFacts) ===');
  
  const pipeResult = await autoIngestFacts(db, [
    { role: 'user', content: 'أهلاً' },
    { role: 'user', content: 'سعر خدمة WhatsApp Bot تغير وصار 8000 درهم' },
    { role: 'user', content: 'تمام' },
  ], { source: 'test' });
  
  assert(pipeResult.extracted >= 1, `Extracted ${pipeResult.extracted} facts from 3 messages`);
  assert(pipeResult.superseded >= 1 || pipeResult.ingested >= 1, `Ingested or superseded: ${pipeResult.ingested}i/${pipeResult.superseded}s`);
  
  // Cleanup pipeline-created memories
  for (const d of pipeResult.details) {
    if (d.action === 'ingested' || d.action === 'superseded') {
      // Find by content
      const found = db.prepare("SELECT id FROM memories WHERE content LIKE '%8000%' AND source = 'test'").all();
      for (const f of found) cleanup.push(f.id);
    }
  }

  // === Cleanup ===
  console.log('\n=== Cleanup ===');
  for (const id of cleanup) {
    db.prepare('DELETE FROM memory_embeddings WHERE memory_id = ?').run(id);
    db.prepare('DELETE FROM memory_entities WHERE memory_id = ?').run(id);
    db.prepare('DELETE FROM memory_relations WHERE source_id = ? OR target_id = ?').run(id, id);
    db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  }
  console.log(`  🧹 Cleaned ${cleanup.length} test memories`);
  
  // Verify baseline
  const active = db.prepare("SELECT count(*) as c FROM memories WHERE status='active'").get().c;
  assert(active === 474, `Baseline intact: ${active} active (expected 474)`);

  console.log(`\n${'='.repeat(40)}`);
  console.log(`✅ ${passed} passed | ❌ ${failed} failed`);
  
  closeDb();
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => { console.error(err); process.exit(1); });
