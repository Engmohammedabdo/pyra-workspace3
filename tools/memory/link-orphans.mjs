#!/usr/bin/env node
/**
 * Link orphan memories to entities using Gemini Flash LLM.
 * Processes in batches to avoid rate limits.
 * 
 * Usage:
 *   node link-orphans.mjs              # process all (default batch=50)
 *   node link-orphans.mjs --dry-run    # preview only
 *   node link-orphans.mjs --batch 100  # custom batch size
 *   node link-orphans.mjs --limit 200  # max memories to process
 */

import { getDb, closeDb } from './db.mjs';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const API_KEY = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const BATCH_SIZE = parseInt(process.argv.find((_, i, a) => a[i-1] === '--batch') || '20');
const LIMIT = parseInt(process.argv.find((_, i, a) => a[i-1] === '--limit') || '9999');
const DRY_RUN = process.argv.includes('--dry-run');

if (!API_KEY) {
  console.error('❌ Missing GOOGLE_API_KEY or GEMINI_API_KEY');
  process.exit(1);
}

async function callGemini(prompt) {
  const resp = await fetch(`${GEMINI_API_URL}?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 4096,
        responseMimeType: 'application/json'
      }
    })
  });
  
  if (!resp.ok) {
    const err = await resp.text();
    throw new Error(`Gemini API error ${resp.status}: ${err.slice(0, 200)}`);
  }
  
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty Gemini response');
  return JSON.parse(text);
}

function buildEntityList(entities) {
  // Group by type for cleaner prompt
  const grouped = {};
  for (const e of entities) {
    if (!grouped[e.type]) grouped[e.type] = [];
    grouped[e.type].push({ id: e.id, name: e.name });
  }
  
  let list = '';
  for (const [type, items] of Object.entries(grouped)) {
    list += `\n[${type}]: ${items.map(i => `${i.name} (${i.id.slice(0,8)})`).join(', ')}`;
  }
  return list;
}

async function processBatch(memories, entities, db) {
  const entityList = buildEntityList(entities);
  const entityMap = new Map(entities.map(e => [e.id.slice(0, 8), e.id]));
  
  // Build memory list for prompt
  const memList = memories.map((m, i) => 
    `[${i}] ${m.content.slice(0, 200)}`
  ).join('\n');
  
  const prompt = `You are an entity linker. Given a list of memories and a list of known entities, determine which entities each memory is related to.

ENTITIES:${entityList}

MEMORIES:
${memList}

For each memory, return the entity IDs (first 8 chars) it relates to, and the role (subject, object, mentioned, about).
Only link when there's a clear connection. Skip if unsure.

Return JSON array:
[
  {"memoryIndex": 0, "links": [{"entityId": "abc12345", "role": "about"}]},
  {"memoryIndex": 1, "links": []},
  ...
]

Rules:
- Use ONLY entity IDs from the list above
- role must be: "subject", "object", "mentioned", or "about"
- Empty links array if no clear match
- Be precise, not greedy — only link when genuinely related`;

  const result = await callGemini(prompt);
  
  let linked = 0;
  const insertStmt = db.prepare('INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, role) VALUES (?, ?, ?)');
  
  for (const item of result) {
    if (!item.links || item.links.length === 0) continue;
    const memory = memories[item.memoryIndex];
    if (!memory) continue;
    
    for (const link of item.links) {
      // Resolve short ID to full ID
      const fullId = entityMap.get(link.entityId);
      if (!fullId) continue;
      
      if (DRY_RUN) {
        const entity = entities.find(e => e.id === fullId);
        console.log(`  🔗 "${memory.content.slice(0, 60)}..." → ${entity?.name} [${link.role}]`);
      } else {
        insertStmt.run(memory.id, fullId, link.role);
      }
      linked++;
    }
  }
  
  return linked;
}

async function main() {
  const db = getDb();
  
  // Get all entities
  const entities = db.prepare('SELECT id, name, type FROM entities ORDER BY name').all();
  console.log(`👥 ${entities.length} entities loaded`);
  
  // Get orphan memories
  const orphans = db.prepare(`
    SELECT m.id, m.content, m.type, m.importance 
    FROM memories m 
    WHERE m.status = 'active' 
    AND m.id NOT IN (SELECT memory_id FROM memory_entities)
    ORDER BY m.importance DESC
    LIMIT ?
  `).all(LIMIT);
  
  console.log(`🔍 ${orphans.length} orphan memories to process`);
  if (DRY_RUN) console.log('🏃 DRY RUN — no changes will be made\n');
  
  let totalLinked = 0;
  let totalBatches = Math.ceil(orphans.length / BATCH_SIZE);
  
  for (let i = 0; i < orphans.length; i += BATCH_SIZE) {
    const batch = orphans.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    
    console.log(`\n📦 Batch ${batchNum}/${totalBatches} (${batch.length} memories)...`);
    
    try {
      const linked = await processBatch(batch, entities, db);
      totalLinked += linked;
      console.log(`  ✅ ${linked} links created`);
    } catch (err) {
      console.error(`  ❌ Batch ${batchNum} failed: ${err.message}`);
      // Wait and retry once
      await new Promise(r => setTimeout(r, 5000));
      try {
        const linked = await processBatch(batch, entities, db);
        totalLinked += linked;
        console.log(`  ✅ Retry: ${linked} links created`);
      } catch (err2) {
        console.error(`  ❌ Retry failed: ${err2.message}`);
      }
    }
    
    // Rate limit: 1.5s between batches
    if (i + BATCH_SIZE < orphans.length) {
      await new Promise(r => setTimeout(r, 1500));
    }
  }
  
  // Final stats
  const afterCount = db.prepare(`
    SELECT count(*) as c FROM memories m 
    WHERE m.status = 'active' 
    AND m.id NOT IN (SELECT memory_id FROM memory_entities)
  `).get();
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 Results:`);
  console.log(`   Links created: ${totalLinked}`);
  console.log(`   Orphans remaining: ${afterCount.c}`);
  console.log(`   Coverage: ${((1 - afterCount.c / 1209) * 100).toFixed(1)}%`);
  console.log(`${'═'.repeat(50)}`);
  
  closeDb();
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
