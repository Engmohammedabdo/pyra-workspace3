#!/usr/bin/env node
/**
 * Contextual Embeddings for Bayra Memory System
 * 
 * Based on Anthropic's Contextual Retrieval technique:
 * Prepend rich context before embedding to improve retrieval accuracy by 49-67%.
 * 
 * Instead of embedding raw content, we embed:
 *   "This memory is about [entity]. Category: [type]. Tags: [tags]. Context: [summary]. Content: [content]"
 * 
 * This helps the embedding model understand the semantic role of each memory.
 */

import { getDb, closeDb, getMemory } from './db.mjs';
import { embed, embedBatch, embeddingToBuffer, setCacheDb } from './embeddings.mjs';
import { entitySearch } from './search.mjs';

const CONTEXTUAL_PREFIX = 'contextual:';

// ─── Core Functions ───────────────────────────────────────────

/**
 * Build a contextualized text for a memory.
 * Prepends entity info, type, tags, and summary before the content.
 */
export function buildContextualText(memory, entities = []) {
  const parts = [];

  // Entity context
  if (entities.length > 0) {
    const entityNames = entities.map(e => e.entity_name || e.name).filter(Boolean);
    if (entityNames.length > 0) {
      parts.push(`This memory involves: ${entityNames.join(', ')}.`);
    }
  }

  // Category/type
  parts.push(`Category: ${memory.type}${memory.subtype ? '/' + memory.subtype : ''}.`);

  // Tags
  if (memory.tags) {
    parts.push(`Tags: ${memory.tags}.`);
  }

  // Summary as extra context
  if (memory.summary && memory.summary !== memory.content) {
    parts.push(`Summary: ${memory.summary}.`);
  }

  // Temporal context
  if (memory.valid_from || memory.valid_until) {
    const temporal = [];
    if (memory.valid_from) temporal.push(`valid from ${memory.valid_from}`);
    if (memory.valid_until) temporal.push(`valid until ${memory.valid_until}`);
    parts.push(`Temporal: ${temporal.join(', ')}.`);
  }

  // The actual content
  parts.push(`Content: ${memory.content}`);

  return parts.join(' ');
}

/**
 * Generate a contextual embedding for a single memory.
 * @param {string} memoryId
 * @returns {Promise<{memoryId, contextualText, embedding}>}
 */
export async function generateContextualEmbedding(memoryId) {
  const db = getDb();
  setCacheDb(db);

  const memory = getMemory(memoryId);
  if (!memory) throw new Error(`Memory not found: ${memoryId}`);

  // Get linked entities
  let entities = [];
  try {
    entities = db.prepare(`
      SELECT e.name as entity_name, e.type as entity_type, me.role
      FROM memory_entities me
      JOIN entities e ON e.id = me.entity_id
      WHERE me.memory_id = ?
    `).all(memoryId);
  } catch (e) { /* table might not exist */ }

  const contextualText = buildContextualText(memory, entities);
  const embedding = await embed(contextualText);

  if (!embedding) throw new Error('Failed to generate embedding');

  // Store with contextual: prefix in memory_embeddings
  const contextualId = CONTEXTUAL_PREFIX + memoryId;
  const buf = embeddingToBuffer(embedding);

  try {
    db.prepare(`
      INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding)
      VALUES (?, ?)
    `).run(contextualId, buf);
  } catch (e) {
    throw new Error(`Failed to store contextual embedding: ${e.message}`);
  }

  return { memoryId, contextualText, embedding };
}

/**
 * Batch re-embed all active memories with contextual prefixes.
 */
export async function reembedAll(options = {}) {
  const {
    batchSize = 50,
    dryRun = false,
    onlyMissing = true,
    onProgress = null,
  } = options;

  const db = getDb();
  setCacheDb(db);

  // Get all active memories
  const memories = db.prepare("SELECT id FROM memories WHERE status = 'active'").all();
  const totalMemories = memories.length;

  // If onlyMissing, filter out those that already have contextual embeddings
  let toProcess = memories;
  if (onlyMissing) {
    const existing = new Set();
    try {
      const rows = db.prepare("SELECT memory_id FROM memory_embeddings WHERE memory_id LIKE 'contextual:%'").all();
      rows.forEach(r => existing.add(r.memory_id.replace(CONTEXTUAL_PREFIX, '')));
    } catch {}
    toProcess = memories.filter(m => !existing.has(m.id));
  }

  const estimatedCost = (toProcess.length / 100) * 0.01; // ~$0.01 per 100 at text-embedding-3-small

  console.log(`Total active memories: ${totalMemories}`);
  console.log(`To process: ${toProcess.length}${onlyMissing ? ' (missing only)' : ' (all)'}`);
  console.log(`Estimated cost: ~$${estimatedCost.toFixed(4)}`);
  console.log(`Batch size: ${batchSize}`);

  if (dryRun) {
    console.log('\n[DRY RUN] No embeddings generated.');
    return { total: totalMemories, toProcess: toProcess.length, processed: 0, estimatedCost };
  }

  let processed = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i += batchSize) {
    const batch = toProcess.slice(i, i + batchSize);

    // Build contextual texts for the batch
    const batchData = batch.map(m => {
      const memory = getMemory(m.id);
      if (!memory) return null;

      let entities = [];
      try {
        entities = db.prepare(`
          SELECT e.name as entity_name, e.type as entity_type, me.role
          FROM memory_entities me
          JOIN entities e ON e.id = me.entity_id
          WHERE me.memory_id = ?
        `).all(m.id);
      } catch {}

      return { memory, contextualText: buildContextualText(memory, entities) };
    }).filter(Boolean);

    // Batch embed
    try {
      const texts = batchData.map(d => d.contextualText);
      const embeddings = await embedBatch(texts);

      // Store all
      const insertStmt = db.prepare('INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)');
      const insertMany = db.transaction((items) => {
        for (const item of items) insertStmt.run(item.id, item.buf);
      });

      const items = batchData.map((d, idx) => ({
        id: CONTEXTUAL_PREFIX + d.memory.id,
        buf: embeddingToBuffer(embeddings[idx]),
      }));

      insertMany(items);
      processed += batchData.length;
    } catch (e) {
      console.error(`Batch ${i}-${i + batchSize} failed:`, e.message);
      failed += batchData.length;
    }

    if (onProgress) onProgress(processed, toProcess.length);
    else console.log(`Progress: ${processed}/${toProcess.length}`);
  }

  console.log(`\nDone. Processed: ${processed}, Failed: ${failed}`);
  return { total: totalMemories, toProcess: toProcess.length, processed, failed, estimatedCost };
}

/**
 * Enhanced search using both regular and contextual embeddings.
 * Merges results with RRF, giving contextual results a 1.2x boost.
 */
export async function contextualSearch(query, limit = 10) {
  const db = getDb();
  setCacheDb(db);

  const queryEmbedding = await embed(query);
  if (!queryEmbedding) throw new Error('Failed to embed query');

  const buf = embeddingToBuffer(queryEmbedding);

  // vec0 virtual tables don't support WHERE filters with MATCH well,
  // so we fetch more results and filter in JS
  let allVecResults = [];
  try {
    allVecResults = db.prepare(`
      SELECT memory_id, distance
      FROM memory_embeddings
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(buf, limit * 6);
  } catch {}

  // Split into regular and contextual
  let regularResults = allVecResults.filter(r => !r.memory_id.startsWith(CONTEXTUAL_PREFIX));
  let contextualResults = allVecResults.filter(r => r.memory_id.startsWith(CONTEXTUAL_PREFIX));

  // Normalize contextual memory_ids (strip prefix)
  contextualResults = contextualResults.map(r => ({
    ...r,
    memory_id: r.memory_id.replace(CONTEXTUAL_PREFIX, ''),
  }));

  // RRF fusion with contextual boost
  const k = 60;
  const contextualBoost = 1.2;
  const scoreMap = new Map();

  regularResults.forEach((r, i) => {
    const prev = scoreMap.get(r.memory_id) || 0;
    scoreMap.set(r.memory_id, prev + 1 / (k + i + 1));
  });

  contextualResults.forEach((r, i) => {
    const prev = scoreMap.get(r.memory_id) || 0;
    scoreMap.set(r.memory_id, prev + contextualBoost * (1 / (k + i + 1)));
  });

  // Sort by fused score
  const ranked = Array.from(scoreMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit);

  // Fetch full memories
  const results = [];
  for (const [memId, score] of ranked) {
    const memory = getMemory(memId);
    if (memory && memory.status === 'active') {
      results.push({
        ...memory,
        fusedScore: score,
        inRegular: regularResults.some(r => r.memory_id === memId),
        inContextual: contextualResults.some(r => r.memory_id === memId),
      });
    }
  }

  return results;
}

/**
 * Side-by-side comparison of regular vs contextual search.
 */
export async function compareSearchQuality(query, limit = 5) {
  const db = getDb();
  setCacheDb(db);

  const queryEmbedding = await embed(query);
  if (!queryEmbedding) throw new Error('Failed to embed query');
  const buf = embeddingToBuffer(queryEmbedding);

  // Fetch all and split (vec0 doesn't support LIKE filter with MATCH)
  let allRows = [];
  try {
    allRows = db.prepare(`
      SELECT memory_id, distance FROM memory_embeddings
      WHERE embedding MATCH ?
      ORDER BY distance LIMIT ?
    `).all(buf, limit * 4);
  } catch {}

  let regularResults = [];
  let contextualResults = [];

  for (const r of allRows) {
    if (r.memory_id.startsWith(CONTEXTUAL_PREFIX)) {
      const realId = r.memory_id.replace(CONTEXTUAL_PREFIX, '');
      const mem = getMemory(realId);
      if (mem) contextualResults.push({ ...mem, distance: r.distance });
    } else {
      const mem = getMemory(r.memory_id);
      if (mem) regularResults.push({ ...mem, distance: r.distance });
    }
  }

  regularResults = regularResults.slice(0, limit);
  contextualResults = contextualResults.slice(0, limit);

  // Fused search
  const fusedResults = await contextualSearch(query, limit);

  return { query, regularResults, contextualResults, fusedResults };
}

/**
 * Get stats about regular vs contextual embeddings.
 */
export function getContextualStats() {
  const db = getDb();

  let regular = 0, contextual = 0, totalMemories = 0;
  try {
    regular = db.prepare("SELECT COUNT(*) as c FROM memory_embeddings WHERE memory_id NOT LIKE 'contextual:%'").get().c;
    contextual = db.prepare("SELECT COUNT(*) as c FROM memory_embeddings WHERE memory_id LIKE 'contextual:%'").get().c;
    totalMemories = db.prepare("SELECT COUNT(*) as c FROM memories WHERE status = 'active'").get().c;
  } catch (e) {
    console.error('Error getting stats:', e.message);
  }

  return {
    totalActiveMemories: totalMemories,
    regularEmbeddings: regular,
    contextualEmbeddings: contextual,
    coverage: totalMemories > 0 ? ((contextual / totalMemories) * 100).toFixed(1) + '%' : '0%',
    missingContextual: totalMemories - contextual,
  };
}

// ─── CLI ──────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'reembed': {
        const dryRun = args.includes('--dry-run');
        const batchSizeIdx = args.indexOf('--batch-size');
        const batchSize = batchSizeIdx >= 0 ? parseInt(args[batchSizeIdx + 1]) : 50;
        const all = args.includes('--all');

        await reembedAll({ dryRun, batchSize, onlyMissing: !all });
        break;
      }

      case 'single': {
        const memoryId = args[1];
        if (!memoryId) { console.error('Usage: single <memoryId>'); break; }
        const result = await generateContextualEmbedding(memoryId);
        console.log('Contextual text:', result.contextualText);
        console.log('Embedding dimensions:', result.embedding.length);
        break;
      }

      case 'search': {
        const query = args.slice(1).join(' ');
        if (!query) { console.error('Usage: search <query>'); break; }
        const results = await contextualSearch(query);
        console.log(`\n🔍 Contextual Search: "${query}"\n`);
        results.forEach((r, i) => {
          const flags = [r.inRegular ? '📎regular' : '', r.inContextual ? '🧠contextual' : ''].filter(Boolean).join(' ');
          console.log(`${i + 1}. [${r.type}] ${r.content.slice(0, 120)}...`);
          console.log(`   Score: ${r.fusedScore.toFixed(4)} | Importance: ${r.importance} | ${flags}`);
          if (r.tags) console.log(`   Tags: ${r.tags}`);
          console.log();
        });
        break;
      }

      case 'compare': {
        const query = args.slice(1).join(' ');
        if (!query) { console.error('Usage: compare <query>'); break; }
        const { regularResults, contextualResults, fusedResults } = await compareSearchQuality(query);

        console.log(`\n📊 Search Quality Comparison: "${query}"\n`);

        console.log('── Regular Embeddings ──');
        if (regularResults.length === 0) console.log('  (no results)');
        regularResults.forEach((r, i) => {
          console.log(`  ${i + 1}. [dist=${r.distance.toFixed(4)}] ${r.content.slice(0, 100)}`);
        });

        console.log('\n── Contextual Embeddings ──');
        if (contextualResults.length === 0) console.log('  (no contextual embeddings yet — run reembed first)');
        contextualResults.forEach((r, i) => {
          console.log(`  ${i + 1}. [dist=${r.distance.toFixed(4)}] ${r.content.slice(0, 100)}`);
        });

        console.log('\n── Fused (RRF) ──');
        fusedResults.forEach((r, i) => {
          const flags = [r.inRegular ? '📎' : '', r.inContextual ? '🧠' : ''].filter(Boolean).join('');
          console.log(`  ${i + 1}. [score=${r.fusedScore.toFixed(4)}] ${flags} ${r.content.slice(0, 100)}`);
        });
        break;
      }

      case 'stats': {
        const stats = getContextualStats();
        console.log('\n📈 Contextual Embeddings Stats\n');
        console.log(`  Active memories:       ${stats.totalActiveMemories}`);
        console.log(`  Regular embeddings:    ${stats.regularEmbeddings}`);
        console.log(`  Contextual embeddings: ${stats.contextualEmbeddings}`);
        console.log(`  Coverage:              ${stats.coverage}`);
        console.log(`  Missing contextual:    ${stats.missingContextual}`);
        break;
      }

      default:
        console.log(`Usage:
  node contextual-embeddings.mjs reembed [--dry-run] [--batch-size N] [--all]
  node contextual-embeddings.mjs single <memoryId>
  node contextual-embeddings.mjs search <query>
  node contextual-embeddings.mjs compare <query>
  node contextual-embeddings.mjs stats`);
    }
  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    closeDb();
  }
}

main();
