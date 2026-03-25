/**
 * rag-pipeline.mjs — Retrieval-Augmented Generation Pipeline
 * 
 * Retrieves relevant context from all knowledge sources,
 * re-ranks for diversity, and assembles within a token budget.
 * 
 * Does NOT call LLM directly — prepares context for the agent to use.
 */

import { getDb } from './db.mjs';
import { setCacheDb } from './embeddings.mjs';
import { unifiedSearch, formatForContext } from './unified-search.mjs';

/**
 * Retrieve and prepare context for a query.
 * 
 * @param {string} query - The question or topic
 * @param {object} options
 * @param {number} options.maxTokens - Token budget for context (default 4000, ~16K chars)
 * @param {string[]} options.sources - ['memory', 'files'] (default both)
 * @param {boolean} options.rerank - Apply MMR re-ranking for diversity (default true)
 * @param {number} options.limit - Max results to consider (default 20)
 * @returns {object} { context, results, query, stats }
 */
export async function retrieveContext(query, options = {}) {
  const {
    maxTokens = 4000,
    sources = ['memory', 'files'],
    rerank = true,
    limit = 20,
  } = options;
  
  const db = getDb();
  setCacheDb(db);
  const startTime = Date.now();
  
  // 1. Search
  const searchResult = await unifiedSearch(query, { sources, limit });
  
  // 2. Re-rank with MMR (Maximal Marginal Relevance) for diversity
  let ranked = searchResult.merged;
  if (rerank && ranked.length > 3) {
    ranked = mmrRerank(ranked, { lambda: 0.7, limit });
  }
  
  // 3. Assemble context within token budget
  const maxChars = maxTokens * 4; // ~4 chars per token
  const context = formatForContext(ranked, { maxChars, includeMetadata: true });
  
  // 4. Stats
  const stats = {
    query,
    sourcesSearched: sources,
    totalResults: searchResult.memory.length + searchResult.files.length,
    mergedResults: searchResult.merged.length,
    contextResults: ranked.length,
    contextChars: context.length,
    contextTokensEstimate: Math.ceil(context.length / 4),
    timingMs: Date.now() - startTime,
  };
  
  return { context, results: ranked, query, stats };
}

/**
 * MMR (Maximal Marginal Relevance) re-ranking.
 * Balances relevance with diversity to avoid redundant results.
 * 
 * @param {Array} results - Sorted by relevance
 * @param {object} options
 * @param {number} options.lambda - Balance: 1.0=pure relevance, 0.0=pure diversity (default 0.7)
 * @param {number} options.limit - Max results to return
 */
function mmrRerank(results, options = {}) {
  const { lambda = 0.7, limit = 20 } = options;
  
  if (results.length <= 1) return results;
  
  const selected = [results[0]]; // Always keep top result
  const remaining = results.slice(1);
  
  while (selected.length < limit && remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;
    
    for (let i = 0; i < remaining.length; i++) {
      const candidate = remaining[i];
      
      // Relevance score (normalized from unifiedScore)
      const relevance = candidate.unifiedScore || 0;
      
      // Diversity: max similarity to any already-selected result
      // Use content overlap as a proxy for similarity
      let maxSimilarity = 0;
      for (const sel of selected) {
        const sim = contentSimilarity(candidate.content, sel.content);
        if (sim > maxSimilarity) maxSimilarity = sim;
      }
      
      // MMR score
      const mmrScore = lambda * relevance - (1 - lambda) * maxSimilarity;
      
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }
    
    if (bestIdx >= 0) {
      selected.push(remaining.splice(bestIdx, 1)[0]);
    } else {
      break;
    }
  }
  
  return selected;
}

/**
 * Simple content similarity using Jaccard index on word sets.
 * Fast approximation — no embeddings needed.
 */
function contentSimilarity(textA, textB) {
  if (!textA || !textB) return 0;
  
  const wordsA = new Set(textA.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(textB.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  
  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }
  
  const union = wordsA.size + wordsB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * Multi-query RAG: search with query variations for better recall.
 */
export async function multiQueryRAG(query, options = {}) {
  const { maxTokens = 6000, variations = null } = options;
  
  // Generate query variations
  const queries = variations || generateQueryVariations(query);
  
  // Search all variations
  const allResults = new Map();
  
  for (const q of queries) {
    const result = await unifiedSearch(q, { limit: 10 });
    for (const r of result.merged) {
      const key = r.id;
      if (!allResults.has(key)) {
        allResults.set(key, { ...r, queryMatches: 1 });
      } else {
        const existing = allResults.get(key);
        existing.queryMatches++;
        existing.unifiedScore = Math.max(existing.unifiedScore || 0, r.unifiedScore || 0);
      }
    }
  }
  
  // Sort by query matches (boost items found by multiple queries) then by score
  const merged = Array.from(allResults.values())
    .sort((a, b) => {
      if (b.queryMatches !== a.queryMatches) return b.queryMatches - a.queryMatches;
      return (b.unifiedScore || 0) - (a.unifiedScore || 0);
    });
  
  // Re-rank with MMR
  const ranked = mmrRerank(merged, { lambda: 0.7, limit: 20 });
  
  // Assemble context
  const context = formatForContext(ranked, { maxChars: maxTokens * 4 });
  
  return {
    context,
    results: ranked,
    queries,
    stats: {
      queryCount: queries.length,
      totalUnique: allResults.size,
      contextChars: context.length,
    },
  };
}

/**
 * Generate query variations for better recall.
 */
function generateQueryVariations(query) {
  const variations = [query];
  
  // Add Arabic/English flip keywords
  const arToEn = {
    'أسعار': 'pricing', 'خدمات': 'services', 'مشروع': 'project',
    'عميل': 'client', 'تسويق': 'marketing', 'ذاكرة': 'memory',
    'بحث': 'search', 'مهام': 'tasks',
  };
  
  for (const [ar, en] of Object.entries(arToEn)) {
    if (query.includes(ar)) {
      variations.push(query.replace(ar, en));
    }
    if (query.toLowerCase().includes(en)) {
      variations.push(query.toLowerCase().replace(en, ar));
    }
  }
  
  // Cap at 4 variations
  return variations.slice(0, 4);
}

// ─── CLI ──────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('rag-pipeline.mjs');
if (isMain) {
  const query = process.argv.slice(2).join(' ');
  if (!query) {
    console.log('Usage: node rag-pipeline.mjs <query>');
    console.log('       node rag-pipeline.mjs --multi <query>');
    process.exit(1);
  }
  
  const isMulti = process.argv.includes('--multi');
  const cleanQuery = query.replace('--multi', '').trim();
  
  if (isMulti) {
    console.log(`\n🔍 Multi-Query RAG: "${cleanQuery}"\n`);
    const result = await multiQueryRAG(cleanQuery);
    console.log(`Queries: ${result.queries.join(' | ')}`);
    console.log(`Unique results: ${result.stats.totalUnique}`);
    console.log(`Context: ${result.stats.contextChars} chars\n`);
    console.log(result.context.substring(0, 2000));
  } else {
    console.log(`\n🔍 RAG Pipeline: "${cleanQuery}"\n`);
    const result = await retrieveContext(cleanQuery);
    console.log(`Results: ${result.stats.totalResults} total → ${result.stats.contextResults} in context`);
    console.log(`Context: ~${result.stats.contextTokensEstimate} tokens (${result.stats.contextChars} chars)`);
    console.log(`Time: ${result.stats.timingMs}ms\n`);
    console.log(result.context.substring(0, 2000));
  }
  
  const { closeDb } = await import('./db.mjs');
  closeDb();
}
