#!/usr/bin/env node
/**
 * ontology-cleanup.mjs
 * One-time cleanup of the knowledge graph.
 * - Deterministic dedup/removal in code
 * - Gemini Flash Lite for context enrichment (small batches of 20 entities)
 */

import fs from 'fs';

const GRAPH_PATH = '/home/node/openclaw/memory/ontology/graph.jsonl';
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  console.error('❌ GOOGLE_API_KEY not set');
  process.exit(1);
}

// ── 1. Read graph ──────────────────────────────────────────────────────────
const raw = fs.readFileSync(GRAPH_PATH, 'utf8');
const allRecords = raw.trim().split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
const entities = allRecords.filter(r => r.type === 'entity');
const relations = allRecords.filter(r => r.type === 'relation');

console.log(`📊 Before: ${entities.length} entities, ${relations.length} relations`);

// ── 2. Backup ──────────────────────────────────────────────────────────────
const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
const backupPath = `${GRAPH_PATH}.bak.${date}`;
if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(GRAPH_PATH, backupPath);
  console.log(`✅ Backup: ${backupPath}`);
} else {
  console.log(`ℹ️  Backup already exists: ${backupPath}`);
}

// ── 3. Deterministic cleanup ───────────────────────────────────────────────

// IDs to remove (garbage entities)
const REMOVE_IDS = new Set([
  '7d8cbb86-36e2-491b-9d2f-fa5fa625373e', // "March 2, 2026" date artifact
  '855ca8d4-91ad-4442-a6f1-6fcd0681bb29', // "console" too generic
]);

// Merges: { keep_id, remove_ids[] }
const MERGES = [
  // PyramediaX → Pyramedia X
  { keep: '8b203cbe-cf7e-45e7-84ad-8e1b1a201cd2', remove: ['b8bab3a2-5302-42fb-af52-3a903922297a'] },
  // أمجد هاشم → Amjad Hashim
  { keep: 'c222f5eb-3766-4181-ae39-84ffcbb8e37c', remove: ['cbb8723e-c7b6-4515-95c4-cf74401ba11c'] },
  // إسلام أحمد رمضان → Eslam Ahmed Ramadan
  { keep: '1640c3b0-bff4-4229-8730-fd4efdf38786', remove: ['e4d2f8fe-f4f5-4f61-bf77-a6a002753ad9'] },
  // Brave → Brave Search
  { keep: '0a98aa13-5000-4923-a20d-ef372e0a7f67', remove: ['601a1bbe-4c36-4f61-98fd-3dbfd9072c7d'] },
  // Mohamed Abdou → Mohammed (same person - Mohammed/Mohamed Abdou is Mohammed the founder)
  { keep: '62799a69-d047-4fff-a21e-fe859959687b', remove: ['a196f370-afa1-4d28-8a71-fda536a4201d'] },
];

// Build removal set (includes merge-removed)
const removeAll = new Set(REMOVE_IDS);
const mergeMap = {}; // old_id → keep_id
for (const m of MERGES) {
  for (const rid of m.remove) {
    removeAll.add(rid);
    mergeMap[rid] = m.keep;
  }
}

// Fix entity types
const TYPE_FIXES = {
  'f8e202e5-98a8-45a3-84e9-7200907d32c8': { entityType: 'artifact', name: 'System Prompt v3' },
  'c7bcbe5b-f614-4c99-8713-e2dffa0c0fd9': { entityType: 'artifact', name: 'Claude Code Prompt' },
  '9e92a4cd-aa21-46e3-8b68-a66c33a2e152': { entityType: 'concept', name: 'DKIM' },
  'fa45c506-ec10-46ef-b611-09518afc53a4': { entityType: 'library', name: 'better-sqlite3' },
  '13436538-2dee-46f9-85a3-a6e440a836da': { entityType: 'tool', name: 'Deno' },
  '68aa85db-80a0-4051-84de-c7119e60bed1': { entityType: 'library', name: 'pdfjs-dist' },
  '27f59692-e0ba-482e-a210-4fbd19c9c41c': { entityType: 'resource', name: 'coreyhaines31/marketingskills' },
};

// Apply cleanup
let merged = 0;
let removed = 0;
const cleanEntities = [];

for (const e of entities) {
  if (removeAll.has(e.id)) {
    removed++;
    continue;
  }
  const fix = TYPE_FIXES[e.id];
  if (fix) {
    Object.assign(e, fix);
  }
  cleanEntities.push(e);
}
merged = MERGES.reduce((s, m) => s + m.remove.length, 0);

// Fix relations: remap merged IDs, remove broken ones
const keepIds = new Set(cleanEntities.map(e => e.id));
const cleanRelations = relations
  .map(r => ({
    ...r,
    from: mergeMap[r.from] || r.from,
    to: mergeMap[r.to] || r.to,
  }))
  .filter(r => keepIds.has(r.from) && keepIds.has(r.to));

console.log(`🔧 Deterministic cleanup: -${removed} removed, -${merged} merged`);
console.log(`   Entities now: ${cleanEntities.length}, Relations: ${cleanRelations.length}`);

// ── 4. Enrich with Gemini (batches of 20) ─────────────────────────────────
async function callGemini(prompt) {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent?key=${GOOGLE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 4096 }
      })
    }
  );
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const d = await res.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text || '';
}

function parseJsonArray(text) {
  const cleaned = text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  return JSON.parse(cleaned);
}

console.log('\n🤖 Enriching with Gemini (context + confidence)...');

const BATCH_SIZE = 20;
const enriched = [...cleanEntities];

for (let i = 0; i < enriched.length; i += BATCH_SIZE) {
  const batch = enriched.slice(i, i + BATCH_SIZE);
  const batchText = batch.map(e => `{"id":"${e.id}","name":"${e.name}","entityType":"${e.entityType}"}`).join('\n');
  
  const prompt = `For each entity below, return a JSON array with ONLY these fields: id, context (1 sentence about what this is in context of Pyramedia/Mohammed's work), confidence (0.0-1.0).

Entities:
${batchText}

Context: Mohammed is founder of Pyramedia (AI & marketing agency in Dubai). PyraAI (Bayra) is his AI assistant.

Return ONLY a JSON array like: [{"id":"...","context":"...","confidence":0.9}, ...]`;

  try {
    const text = await callGemini(prompt);
    const results = parseJsonArray(text);
    for (const r of results) {
      const entity = enriched.find(e => e.id === r.id);
      if (entity) {
        entity.context = r.context;
        entity.confidence = r.confidence;
      }
    }
    process.stdout.write(`  ✓ Batch ${Math.floor(i/BATCH_SIZE)+1}/${Math.ceil(enriched.length/BATCH_SIZE)}\n`);
  } catch (err) {
    console.warn(`  ⚠️ Batch ${Math.floor(i/BATCH_SIZE)+1} failed: ${err.message} — skipping enrichment for this batch`);
  }
  
  // Small delay between batches
  if (i + BATCH_SIZE < enriched.length) {
    await new Promise(r => setTimeout(r, 500));
  }
}

// ── 5. Write new graph ─────────────────────────────────────────────────────
const allNew = [...enriched, ...cleanRelations];
fs.writeFileSync(GRAPH_PATH, allNew.map(r => JSON.stringify(r)).join('\n') + '\n', 'utf8');

console.log(`\n✅ Graph written: ${enriched.length} entities, ${cleanRelations.length} relations`);
console.log(`\n📊 Final Report:`);
console.log(`  Before:  ${entities.length} entities, ${relations.length} relations`);
console.log(`  After:   ${enriched.length} entities, ${cleanRelations.length} relations`);
console.log(`  Removed: ${removed} garbage entities`);
console.log(`  Merged:  ${merged} duplicates`);
console.log(`  Backup:  ${backupPath}`);
