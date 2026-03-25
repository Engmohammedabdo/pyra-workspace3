/**
 * Comprehensive test for MemoryManager
 * Uses /tmp/test-memory-manager.db — NOT production DB
 */

import { unlinkSync } from 'node:fs';
import MemoryManager from './memory-manager.mjs';

const TEST_DB = '/tmp/test-memory-manager.db';

// Cleanup any previous test DB
try { unlinkSync(TEST_DB); } catch {}
try { unlinkSync(TEST_DB + '-wal'); } catch {}
try { unlinkSync(TEST_DB + '-shm'); } catch {}

let passed = 0, failed = 0;
function assert(condition, label) {
  if (condition) { passed++; console.log(`  ✅ ${label}`); }
  else { failed++; console.error(`  ❌ ${label}`); }
}

async function run() {
  const mm = new MemoryManager({ dbPath: TEST_DB });

  // ── 1. Init ──
  console.log('\n═══ 1. Init ═══');
  await mm.init();
  assert(mm.initialized === true, 'Manager initialized');
  assert(mm.db !== null, 'DB connection is set');

  // ── 2. Remember — store a fact ──
  console.log('\n═══ 2. Remember (store fact) ═══');
  const r1 = await mm.remember('Mohammed prefers dark mode on all his devices', {
    type: 'semantic',
    subtype: 'preference',
    importance: 7,
    tags: ['preference', 'ui'],
    entities: [{ name: 'Mohammed', type: 'person' }],
    source: 'test',
  });
  console.log('  Result:', r1.action);
  assert(r1.action === 'created', 'Memory created');
  assert(r1.memory?.id, 'Memory has ID: ' + r1.memory?.id);
  const memId1 = r1.memory?.id;

  // ── 3. Remember — store duplicate ──
  console.log('\n═══ 3. Remember (dedup test) ═══');
  const r2 = await mm.remember('Mohammed prefers dark mode on all his devices', {
    type: 'semantic',
    importance: 7,
    tags: ['dark-mode'],
    source: 'test',
  });
  console.log('  Result:', r2.action);
  assert(r2.action === 'updated', 'Duplicate detected and updated');

  // ── 4. Remember more facts for search testing ──
  console.log('\n═══ 4. Remember additional facts ═══');
  const r3 = await mm.remember('Bayra is an AI assistant built by Pyramedia', {
    type: 'semantic',
    subtype: 'fact',
    importance: 9,
    entities: [{ name: 'Bayra', type: 'ai' }, { name: 'Pyramedia', type: 'company' }],
    tags: ['ai', 'identity'],
    source: 'test',
  });
  assert(r3.action === 'created', 'Second memory created');

  const r4 = await mm.remember('The office is located in Dubai Media City', {
    type: 'semantic',
    importance: 6,
    entities: [{ name: 'Dubai Media City', type: 'location' }],
    tags: ['office', 'location'],
    source: 'test',
  });
  assert(r4.action === 'created', 'Third memory created');

  const r5 = await mm.remember('Always use yt-dlp with cookies for YouTube downloads', {
    type: 'procedural',
    subtype: 'workflow',
    importance: 8,
    tags: ['youtube', 'yt-dlp', 'workflow'],
    source: 'test',
  });
  assert(r5.action === 'created', 'Procedural memory created');

  // ── 5. Recall — semantic search ──
  console.log('\n═══ 5. Recall (semantic search) ═══');
  const recall1 = await mm.recall('What UI preferences does Mohammed have?');
  console.log(`  Found ${recall1.length} results`);
  assert(recall1.length > 0, 'Recall returned results');
  if (recall1.length > 0) {
    console.log('  Top result:', recall1[0].memory.content.substring(0, 80));
    const hasDarkMode = recall1.some(r => r.memory.content.includes('dark mode'));
    assert(hasDarkMode, 'Dark mode preference found in results');
    assert(recall1[0].score > 0, 'Has a score: ' + recall1[0].score.toFixed(4));
  }

  // ── 6. Recall by entity ──
  console.log('\n═══ 6. RecallByEntity ═══');
  const entityResults = await mm.recallByEntity('Mohammed');
  console.log(`  Found ${entityResults.length} memories about Mohammed`);
  assert(entityResults.length > 0, 'Entity search found results');
  if (entityResults.length > 0) {
    assert(entityResults[0].entity?.name, 'Has entity info: ' + entityResults[0].entity?.name);
  }

  // ── 7. Recall recent ──
  console.log('\n═══ 7. RecallRecent ═══');
  const recent = await mm.recallRecent({ hours: 1, limit: 10 });
  console.log(`  Found ${recent.length} recent memories`);
  assert(recent.length >= 4, 'Found at least 4 recent memories');

  // ── 8. Recall important ──
  console.log('\n═══ 8. RecallImportant ═══');
  const important = await mm.recallImportant({ minImportance: 7 });
  console.log(`  Found ${important.length} important memories`);
  assert(important.length >= 2, 'Found at least 2 important memories');

  // ── 9. Forget ──
  console.log('\n═══ 9. Forget ═══');
  const forgetResult = await mm.forget(r4.memory.id);
  assert(forgetResult !== false, 'Forget returned truthy');

  // Verify it's gone from search
  const afterForget = await mm.recall('Dubai Media City office location');
  const stillThere = afterForget.some(r => r.memory.id === r4.memory.id);
  assert(!stillThere, 'Forgotten memory excluded from recall');

  // ── 10. Maintain ──
  console.log('\n═══ 10. Maintain ═══');
  const maintResult = await mm.maintain({ dryRun: true });
  assert(maintResult.summary, 'Maintain returned summary');
  console.log('  ', maintResult.summary.split('\n')[0]);

  // ── 11. Health ──
  console.log('\n═══ 11. Health ═══');
  const healthReport = mm.health();
  assert(healthReport.embeddingCoverage, 'Health has embedding coverage: ' + healthReport.embeddingCoverage);
  assert(healthReport.recentActivity, 'Health has recent activity');
  console.log('  Embedding coverage:', healthReport.embeddingCoverage);

  // ── 12. Integrity ──
  console.log('\n═══ 12. Integrity ═══');
  const integ = mm.integrity();
  assert(integ.ok === true, 'DB integrity OK');

  // ── 13. Stats ──
  console.log('\n═══ 13. Stats ═══');
  const stats = mm.stats();
  console.log('  Total active:', stats.totalActive, '| By type:', JSON.stringify(stats.byType));
  assert(stats.totalActive >= 3, 'Stats show >= 3 active memories');

  // ── 14. getContextMemories ──
  console.log('\n═══ 14. getContextMemories ═══');
  const ctx = await mm.getContextMemories('Tell me about Bayra and Pyramedia');
  console.log(`  Found ${ctx.count} context memories`);
  assert(ctx.count > 0, 'Context has memories');
  assert(ctx.contextText.length > 0, 'Context text is non-empty');
  assert(ctx.contextText.includes('[Relevant Memories]'), 'Context text has header');
  console.log('  Context text preview:\n    ' + ctx.contextText.split('\n').slice(0, 4).join('\n    '));

  // ── 15. RememberConversation ──
  console.log('\n═══ 15. RememberConversation ═══');
  const convResult = await mm.rememberConversation([
    { role: 'user', content: 'Can you set up a cron job to check emails every morning at 9am?' },
    { role: 'assistant', content: 'Sure! I\'ll create a cron job that checks your pyraai@pyramedia.info inbox at 9:00 AM UTC daily.' },
    { role: 'user', content: 'Perfect, and make sure it only alerts me for urgent emails.' },
  ], { source: 'test-conversation', channel: 'telegram' });
  console.log(`  Created: ${convResult.created}, Updated: ${convResult.updated}, Skipped: ${convResult.skipped}`);
  assert(convResult.created + convResult.updated > 0, 'Conversation produced memories');

  // ── 16. Close ──
  console.log('\n═══ 16. Close ═══');
  mm.close();
  assert(mm.initialized === false, 'Manager closed');
  assert(mm.db === null, 'DB connection released');

  // ── Summary ──
  console.log('\n' + '═'.repeat(50));
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    console.log('⚠️  Some tests failed!');
    process.exit(1);
  } else {
    console.log('🎉 All tests passed!');
  }

  // Cleanup
  try { unlinkSync(TEST_DB); } catch {}
  try { unlinkSync(TEST_DB + '-wal'); } catch {}
  try { unlinkSync(TEST_DB + '-shm'); } catch {}
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
