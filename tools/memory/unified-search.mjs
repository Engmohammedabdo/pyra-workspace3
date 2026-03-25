/**
 * unified-search.mjs — Single search interface across all knowledge sources
 * 
 * Searches:
 * 1. Memory DB (semantic + episodic + procedural memories)
 * 2. File Index (workspace files indexed with embeddings)
 * 
 * Merges results using Reciprocal Rank Fusion (RRF) with source weights.
 */

import { getDb } from './db.mjs';
import { setCacheDb } from './embeddings.mjs';
import { smartSearch } from './search.mjs';
import { searchFileIndex } from './file-indexer.mjs';

/**
 * Search across all knowledge sources and merge results.
 * 
 * @param {string} query - Search query
 * @param {object} options
 * @param {string[]} options.sources - Which sources to search: ['memory', 'files'] (default both)
 * @param {number} options.limit - Max results (default 10)
 * @param {number} options.memoryWeight - Weight for memory results (default 0.6)
 * @param {number} options.fileWeight - Weight for file results (default 0.4)
 * @returns {object} { memory: [], files: [], merged: [], query, timing }
 */
export async function unifiedSearch(query, options = {}) {
  const {
    sources = ['memory', 'files'],
    limit = 10,
    memoryWeight = 0.6,
    fileWeight = 0.4,
  } = options;
  
  const db = getDb();
  setCacheDb(db);
  
  const startTime = Date.now();
  const result = { memory: [], files: [], merged: [], query, timing: {} };
  
  // 1. Memory search
  if (sources.includes('memory')) {
    const t0 = Date.now();
    try {
      result.memory = await smartSearch(db, query, { limit: limit * 2 });
    } catch (err) {
      console.warn('[unified] Memory search error:', err.message);
      result.memory = [];
    }
    result.timing.memory = Date.now() - t0;
  }
  
  // 2. File search
  if (sources.includes('files')) {
    const t0 = Date.now();
    try {
      result.files = await searchFileIndex(db, query, { limit: limit * 2 });
    } catch (err) {
      console.warn('[unified] File search error:', err.message);
      result.files = [];
    }
    result.timing.files = Date.now() - t0;
  }
  
  // 3. Merge with RRF
  result.merged = mergeWithRRF(result.memory, result.files, {
    limit,
    memoryWeight,
    fileWeight,
  });
  
  result.timing.total = Date.now() - startTime;
  
  return result;
}

/**
 * Merge memory and file results using Reciprocal Rank Fusion.
 */
function mergeWithRRF(memoryResults, fileResults, options = {}) {
  const { limit = 10, memoryWeight = 0.6, fileWeight = 0.4, k = 60 } = options;
  
  const scoreMap = new Map(); // id -> { score, item, source }
  
  // Score memory results
  for (let i = 0; i < memoryResults.length; i++) {
    const m = memoryResults[i];
    const id = m.id;
    const rrfScore = memoryWeight * (1 / (k + i + 1));
    scoreMap.set(`mem:${id}`, {
      score: rrfScore,
      item: {
        id: m.id,
        content: m.content,
        type: m.type,
        subtype: m.subtype,
        importance: m.importance,
        source: 'memory',
        sourceDetail: m.type,
        finalScore: m.finalScore,
        created_at: m.created_at,
      },
    });
  }
  
  // Score file results
  for (let i = 0; i < fileResults.length; i++) {
    const f = fileResults[i];
    const id = f.id;
    const rrfScore = fileWeight * (1 / (k + i + 1));
    
    // Check if same content exists in memory (boost if so)
    const existingKey = Array.from(scoreMap.keys()).find(key => {
      const existing = scoreMap.get(key);
      return existing && existing.item.content && f.content &&
        existing.item.content.substring(0, 100) === f.content.substring(0, 100);
    });
    
    if (existingKey) {
      // Boost existing entry
      const existing = scoreMap.get(existingKey);
      existing.score += rrfScore * 0.5; // partial boost for cross-source match
    } else {
      scoreMap.set(`file:${id}`, {
        score: rrfScore,
        item: {
          id: f.id,
          content: f.content,
          type: 'file',
          subtype: f.file_type,
          importance: null,
          source: 'file',
          sourceDetail: f.file_path,
          similarity: f.similarity,
          chunk_index: f.chunk_index,
        },
      });
    }
  }
  
  // Sort by score and return
  const merged = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((entry, rank) => ({
      ...entry.item,
      unifiedScore: entry.score,
      rank: rank + 1,
    }));
  
  return merged;
}

/**
 * Quick search — returns just the merged results (convenience wrapper).
 */
export async function quickSearch(query, limit = 5) {
  const result = await unifiedSearch(query, { limit });
  return result.merged;
}

/**
 * Format search results for LLM context injection.
 */
export function formatForContext(results, options = {}) {
  const { maxChars = 4000, includeMetadata = true } = options;
  
  let ctx = '';
  let totalChars = 0;
  
  for (const r of results) {
    const sourceLabel = r.source === 'memory' 
      ? `[Memory/${r.sourceDetail || r.type}]` 
      : `[File: ${r.sourceDetail || 'unknown'}]`;
    
    const meta = includeMetadata 
      ? ` (score: ${r.unifiedScore?.toFixed(4) || '?'}${r.importance ? `, imp: ${r.importance}` : ''})` 
      : '';
    
    const entry = `### ${sourceLabel}${meta}\n${r.content}\n\n`;
    
    if (totalChars + entry.length > maxChars && ctx.length > 0) break;
    ctx += entry;
    totalChars += entry.length;
  }
  
  return ctx;
}

// ─── CLI ──────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('unified-search.mjs');
if (isMain) {
  const query = process.argv.slice(2).join(' ');
  if (!query) {
    console.log('Usage: node unified-search.mjs <query>');
    process.exit(1);
  }
  
  console.log(`\n🔍 Unified Search: "${query}"\n`);
  
  const result = await unifiedSearch(query, { limit: 10 });
  
  console.log(`Memory: ${result.memory.length} results (${result.timing.memory}ms)`);
  console.log(`Files:  ${result.files.length} results (${result.timing.files}ms)`);
  console.log(`Merged: ${result.merged.length} results (${result.timing.total}ms total)\n`);
  
  for (const r of result.merged) {
    const icon = r.source === 'memory' ? '🧠' : '📄';
    const detail = r.source === 'memory' ? r.type : r.sourceDetail?.split('/').pop();
    console.log(`  ${r.rank}. ${icon} [${detail}] score=${r.unifiedScore.toFixed(4)}`);
    console.log(`     ${(r.content || '').substring(0, 120).replace(/\n/g, ' ')}...\n`);
  }
  
  const { closeDb } = await import('./db.mjs');
  closeDb();
}
