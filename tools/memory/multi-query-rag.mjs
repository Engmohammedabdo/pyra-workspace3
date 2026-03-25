#!/usr/bin/env node

/**
 * Multi-Query RAG Enhancement for Bayra's Memory System
 * 
 * Enhances retrieval by generating multiple query variations and merging results
 * using Reciprocal Rank Fusion. No LLM calls — rule-based expansion only.
 * 
 * Functions:
 *   expandQuery(query) → variations[]
 *   multiQuerySearch(db, query, limit) → merged results
 *   dynamicWeights(query) → {ftsWeight, vectorWeight}
 *   searchWithContext(db, query, conversationContext, limit) → enhanced results
 * 
 * CLI:
 *   node multi-query-rag.mjs search "query"
 *   node multi-query-rag.mjs expand "query"
 *   node multi-query-rag.mjs compare "query"
 *   node multi-query-rag.mjs weights "query"
 */

import { getDb, closeDb } from './db.mjs';
import { smartSearch } from './search.mjs';

// ─── Bilingual Dictionary ──────────────────────────────────

const bilingualMap = {
  // People & brands
  'محمد': ['Mohammed', 'Mohamed', 'Mohammad'],
  'بايرا': ['PyraAI', 'Bayra', 'بيرا'],
  'بيراميديا': ['Pyramedia', 'بيرا ميديا'],
  'إلايت': ['EliteLife', 'Elite Life', 'إلايت لايف'],
  // Business terms
  'مشروع': ['project', 'مشاريع', 'projects'],
  'عميل': ['client', 'customer', 'عملاء', 'زبون'],
  'إتمام': ['Etmam', 'إنجازات', 'completion'],
  'تسويق': ['marketing', 'إعلان', 'إعلانات', 'ads'],
  'حملة': ['campaign', 'حملات', 'campaigns'],
  'ميزانية': ['budget', 'ميزانيات'],
  'تقرير': ['report', 'تقارير', 'reports'],
  'موقع': ['website', 'site', 'مواقع'],
  'تصميم': ['design', 'تصاميم', 'designs'],
  'محتوى': ['content', 'محتويات'],
  'فيديو': ['video', 'فيديوهات', 'videos'],
  'صورة': ['image', 'صور', 'photo', 'photos'],
  'بوست': ['post', 'بوستات', 'posts'],
  'ريل': ['reel', 'ريلز', 'reels'],
  'ستوري': ['story', 'ستوريز', 'stories'],
  // Tech terms
  'قاعدة بيانات': ['database', 'DB', 'قواعد بيانات'],
  'سيرفر': ['server', 'سيرفرات', 'servers'],
  'دومين': ['domain', 'دومينات', 'domains'],
  'استضافة': ['hosting', 'host'],
  'واتساب': ['WhatsApp', 'واتس آب', 'WA'],
  'تلقرام': ['Telegram', 'تليجرام', 'TG'],
  'سوبابيس': ['Supabase', 'سوبا بيس'],
  'ذكاء اصطناعي': ['AI', 'artificial intelligence'],
  'أداة': ['tool', 'أدوات', 'tools'],
  'بوت': ['bot', 'بوتات', 'bots'],
  // Actions
  'رفع': ['upload', 'رفعت', 'uploaded'],
  'تحميل': ['download', 'حملت', 'downloaded'],
  'إرسال': ['send', 'أرسلت', 'sent'],
  'حذف': ['delete', 'مسح', 'deleted', 'removed'],
  'تحديث': ['update', 'حدثت', 'updated'],
  'إنشاء': ['create', 'أنشأت', 'created'],
  // Status
  'مشكلة': ['problem', 'issue', 'مشاكل', 'bug', 'error'],
  'حل': ['solution', 'fix', 'حلول', 'solved'],
  'جاهز': ['ready', 'done', 'مكتمل', 'complete'],
  'معلق': ['pending', 'waiting', 'منتظر'],
  // English → Arabic (reverse lookups)
  'project': ['مشروع', 'مشاريع'],
  'client': ['عميل', 'عملاء', 'زبون'],
  'marketing': ['تسويق', 'إعلان'],
  'campaign': ['حملة', 'حملات'],
  'website': ['موقع', 'مواقع'],
  'design': ['تصميم', 'تصاميم'],
  'content': ['محتوى', 'محتويات'],
  'video': ['فيديو', 'فيديوهات'],
  'report': ['تقرير', 'تقارير'],
  'budget': ['ميزانية', 'ميزانيات'],
  'upload': ['رفع', 'رفعت'],
  'problem': ['مشكلة', 'مشاكل'],
  'solution': ['حل', 'حلول'],
  'tool': ['أداة', 'أدوات'],
  'server': ['سيرفر', 'سيرفرات'],
  'database': ['قاعدة بيانات', 'قواعد بيانات'],
};

// ─── Synonym Dictionary (English) ──────────────────────────

const synonymMap = {
  'error': ['mistake', 'bug', 'issue', 'problem', 'fault'],
  'fix': ['solve', 'repair', 'resolve', 'patch'],
  'create': ['make', 'build', 'generate', 'setup'],
  'delete': ['remove', 'erase', 'drop', 'clear'],
  'update': ['modify', 'change', 'edit', 'revise'],
  'send': ['deliver', 'transmit', 'push', 'forward'],
  'fast': ['quick', 'rapid', 'speedy'],
  'slow': ['delayed', 'lagging', 'sluggish'],
  'big': ['large', 'huge', 'massive'],
  'small': ['tiny', 'little', 'minor'],
  'important': ['critical', 'crucial', 'vital', 'key'],
  'test': ['check', 'verify', 'validate', 'examine'],
  'deploy': ['publish', 'release', 'launch', 'ship'],
  'config': ['configuration', 'settings', 'setup'],
  'auth': ['authentication', 'login', 'credentials'],
  'api': ['endpoint', 'interface', 'service'],
};

// ─── Helper: Detect Arabic ─────────────────────────────────

function isArabic(text) {
  const arabicChars = (text.match(/[\u0600-\u06FF]/g) || []).length;
  return arabicChars > text.length * 0.3;
}

function getQueryTokens(query) {
  return query.split(/\s+/).filter(t => t.length > 1);
}

// ─── 1. Query Expansion ────────────────────────────────────

/**
 * Generate 3-5 variations of the original query using rule-based expansion.
 * @param {string} originalQuery
 * @returns {Array<{query: string, type: string, rationale: string}>}
 */
export function expandQuery(originalQuery) {
  if (!originalQuery || typeof originalQuery !== 'string') return [];
  
  const variations = [
    { query: originalQuery, type: 'original', rationale: 'Original query' }
  ];
  
  const tokens = getQueryTokens(originalQuery);
  const queryIsArabic = isArabic(originalQuery);
  
  // 1. Bilingual expansion — translate key terms
  const translatedTokens = [];
  let hasTranslation = false;
  for (const token of tokens) {
    const lowerToken = token.toLowerCase();
    if (bilingualMap[token]) {
      translatedTokens.push(bilingualMap[token][0]);
      hasTranslation = true;
    } else if (bilingualMap[lowerToken]) {
      translatedTokens.push(bilingualMap[lowerToken][0]);
      hasTranslation = true;
    } else {
      translatedTokens.push(token);
    }
  }
  if (hasTranslation) {
    variations.push({
      query: translatedTokens.join(' '),
      type: 'bilingual',
      rationale: queryIsArabic ? 'Arabic→English term mapping' : 'English→Arabic term mapping',
    });
  }
  
  // 2. Synonym expansion — replace key terms with synonyms
  const synonymTokens = [...tokens];
  let hasSynonym = false;
  for (let i = 0; i < synonymTokens.length; i++) {
    const lower = synonymTokens[i].toLowerCase();
    if (synonymMap[lower]) {
      synonymTokens[i] = synonymMap[lower][0];
      hasSynonym = true;
    }
  }
  if (hasSynonym) {
    variations.push({
      query: synonymTokens.join(' '),
      type: 'synonym',
      rationale: 'Key terms replaced with synonyms',
    });
  }
  
  // 3. Abstraction — make query more general (remove specific qualifiers)
  if (tokens.length >= 3) {
    // Remove the most specific-looking token (numbers, short tokens)
    const generalTokens = tokens.filter(t => !/^\d+$/.test(t) && t.length > 2);
    if (generalTokens.length < tokens.length && generalTokens.length >= 1) {
      variations.push({
        query: generalTokens.join(' '),
        type: 'abstraction',
        rationale: 'Removed specific qualifiers for broader search',
      });
    }
  }
  
  // 4. Extended bilingual — add ALL translations as separate query
  const allTranslations = [];
  for (const token of tokens) {
    const mappings = bilingualMap[token] || bilingualMap[token.toLowerCase()];
    if (mappings) {
      allTranslations.push(...mappings.slice(0, 2));
    }
  }
  if (allTranslations.length > 0) {
    const extQuery = [...tokens, ...allTranslations].join(' ');
    if (!variations.some(v => v.query === extQuery)) {
      variations.push({
        query: extQuery,
        type: 'extended',
        rationale: 'Original + all bilingual expansions',
      });
    }
  }
  
  // 5. Decomposition — if query has connectors, break into sub-queries
  const connectors = ['و', 'and', 'مع', 'with', 'أو', 'or'];
  for (const conn of connectors) {
    if (originalQuery.includes(` ${conn} `)) {
      const parts = originalQuery.split(` ${conn} `).map(p => p.trim()).filter(p => p.length > 2);
      if (parts.length >= 2) {
        for (const part of parts.slice(0, 2)) {
          variations.push({
            query: part,
            type: 'decomposition',
            rationale: `Sub-query from decomposing at "${conn}"`,
          });
        }
        break;
      }
    }
  }
  
  // Deduplicate
  const seen = new Set();
  return variations.filter(v => {
    const key = v.query.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ─── 2. Dynamic Weights ────────────────────────────────────

/**
 * Auto-detect optimal FTS vs vector weights for a query.
 * @param {string} query
 * @returns {{ftsWeight: number, vectorWeight: number, reason: string}}
 */
export function dynamicWeights(query) {
  if (!query) return { ftsWeight: 0.5, vectorWeight: 0.5, reason: 'empty query' };
  
  const tokens = getQueryTokens(query);
  const queryIsArabic = isArabic(query);
  const wordCount = tokens.length;
  
  // Short exact terms (names, IDs, single words) → more FTS
  if (wordCount <= 2 && !queryIsArabic) {
    // Check if it looks like a name or ID
    const hasCapital = tokens.some(t => /^[A-Z]/.test(t));
    const hasNumber = tokens.some(t => /\d/.test(t));
    if (hasCapital || hasNumber || wordCount === 1) {
      return { ftsWeight: 0.7, vectorWeight: 0.3, reason: 'short exact term — FTS preferred' };
    }
  }
  
  // Long conceptual questions → more vector
  if (wordCount >= 6) {
    return { ftsWeight: 0.3, vectorWeight: 0.7, reason: 'long conceptual query — vector preferred' };
  }
  
  // Arabic text → slightly more vector (FTS tokenization weaker for Arabic)
  if (queryIsArabic) {
    if (wordCount <= 2) {
      return { ftsWeight: 0.5, vectorWeight: 0.5, reason: 'short Arabic — balanced (FTS tokenization weaker)' };
    }
    return { ftsWeight: 0.35, vectorWeight: 0.65, reason: 'Arabic text — vector preferred (better semantic matching)' };
  }
  
  // Question patterns → more vector
  const questionWords = ['what', 'how', 'why', 'when', 'where', 'who', 'which',
                          'ما', 'كيف', 'لماذا', 'متى', 'أين', 'من', 'أي', 'شو', 'ليش', 'وين'];
  if (questionWords.some(w => query.toLowerCase().startsWith(w))) {
    return { ftsWeight: 0.3, vectorWeight: 0.7, reason: 'question query — vector preferred for semantic matching' };
  }
  
  // Default balanced
  return { ftsWeight: 0.5, vectorWeight: 0.5, reason: 'balanced — mixed query type' };
}

// ─── 3. Multi-Query Search ─────────────────────────────────

/**
 * Search with multiple query variations and merge via RRF.
 * @param {import('better-sqlite3').Database} db
 * @param {string} originalQuery
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function multiQuerySearch(db, originalQuery, limit = 10) {
  const variations = expandQuery(originalQuery);
  const weights = dynamicWeights(originalQuery);
  
  // Collect all results per variation
  const allRankings = [];
  const memoryMap = new Map();
  
  for (const variation of variations) {
    try {
      const results = await smartSearch(db, variation.query, {
        limit: 20,
        keywordWeight: weights.ftsWeight,
        vectorWeight: weights.vectorWeight,
      });
      
      // Build ranking for this variation
      const ranking = results.map((r, i) => ({ id: r.id, rank: i + 1 }));
      allRankings.push(ranking);
      
      // Store full memory objects
      for (const r of results) {
        if (!memoryMap.has(r.id)) memoryMap.set(r.id, r);
      }
    } catch (e) {
      // Skip failed variations
      continue;
    }
  }
  
  if (allRankings.length === 0) return [];
  
  // Reciprocal Rank Fusion
  const k = 60;
  const scoreMap = new Map();
  
  for (const ranking of allRankings) {
    for (const { id, rank } of ranking) {
      const prev = scoreMap.get(id) || 0;
      scoreMap.set(id, prev + 1 / (k + rank));
    }
  }
  
  // Build merged results
  const results = [];
  for (const [id, rrfScore] of scoreMap) {
    const memory = memoryMap.get(id);
    if (!memory) continue;
    results.push({
      ...memory,
      multiQueryScore: rrfScore,
      queryVariationsUsed: variations.length,
    });
  }
  
  results.sort((a, b) => b.multiQueryScore - a.multiQueryScore);
  return results.slice(0, limit);
}

// ─── 4. Context-Aware Search ───────────────────────────────

/**
 * Extract entity-like tokens from text.
 */
function extractEntities(text) {
  if (!text) return [];
  const entities = [];
  
  // Capitalized words (potential names/brands)
  const caps = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*/g) || [];
  entities.push(...caps);
  
  // Known bilingual terms
  for (const [key, vals] of Object.entries(bilingualMap)) {
    if (text.includes(key)) {
      entities.push(key);
      entities.push(...vals.slice(0, 2));
    }
  }
  
  // Arabic proper nouns (words that appear in bilingual map)
  const tokens = text.split(/\s+/);
  for (const token of tokens) {
    if (bilingualMap[token]) entities.push(token);
  }
  
  return [...new Set(entities)];
}

/**
 * Search with conversation context awareness.
 * @param {import('better-sqlite3').Database} db
 * @param {string} query
 * @param {string} conversationContext - Recent conversation text
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function searchWithContext(db, query, conversationContext, limit = 10) {
  // Get base multi-query results
  const baseResults = await multiQuerySearch(db, query, limit * 2);
  
  if (!conversationContext) return baseResults.slice(0, limit);
  
  // Extract entities from conversation context
  const contextEntities = extractEntities(conversationContext);
  
  if (contextEntities.length === 0) return baseResults.slice(0, limit);
  
  // Boost results that mention context entities
  const boosted = baseResults.map(r => {
    const content = (r.content || '').toLowerCase();
    let entityBoost = 0;
    let matchedEntities = [];
    
    for (const entity of contextEntities) {
      if (content.includes(entity.toLowerCase())) {
        entityBoost += 0.05;
        matchedEntities.push(entity);
      }
    }
    
    return {
      ...r,
      contextScore: (r.multiQueryScore || 0) + entityBoost,
      matchedContextEntities: matchedEntities,
    };
  });
  
  boosted.sort((a, b) => b.contextScore - a.contextScore);
  return boosted.slice(0, limit);
}

// ─── CLI ───────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  red: isTTY ? '\x1b[31m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  blue: isTTY ? '\x1b[34m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
};

function truncate(str, len = 80) {
  if (!str) return '';
  str = str.replace(/\n/g, ' ');
  return str.length > len ? str.substring(0, len - 1) + '…' : str;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const query = rest.join(' ');
  
  if (!command || !query) {
    console.log(`${c.bold}Multi-Query RAG${c.reset} — Enhanced search with query expansion\n`);
    console.log(`Usage:`);
    console.log(`  node multi-query-rag.mjs search "query"    Search with multi-query RAG`);
    console.log(`  node multi-query-rag.mjs expand "query"    Show query variations`);
    console.log(`  node multi-query-rag.mjs compare "query"   Compare single vs multi results`);
    console.log(`  node multi-query-rag.mjs weights "query"   Show auto-detected weights`);
    process.exit(0);
  }
  
  const db = getDb();
  
  try {
    switch (command) {
      case 'expand': {
        const variations = expandQuery(query);
        console.log(`\n${c.bold}Query Expansion for:${c.reset} "${query}"\n`);
        console.log(`${c.dim}Generated ${variations.length} variations:${c.reset}\n`);
        for (const v of variations) {
          const typeColor = v.type === 'original' ? c.blue : v.type === 'bilingual' ? c.green : c.yellow;
          console.log(`  ${typeColor}[${v.type}]${c.reset} ${v.query}`);
          console.log(`    ${c.dim}${v.rationale}${c.reset}\n`);
        }
        break;
      }
      
      case 'weights': {
        const w = dynamicWeights(query);
        console.log(`\n${c.bold}Dynamic Weights for:${c.reset} "${query}"\n`);
        console.log(`  ${c.cyan}FTS Weight:${c.reset}    ${w.ftsWeight}`);
        console.log(`  ${c.cyan}Vector Weight:${c.reset} ${w.vectorWeight}`);
        console.log(`  ${c.cyan}Reason:${c.reset}        ${w.reason}\n`);
        
        const ftsBar = '█'.repeat(Math.round(w.ftsWeight * 20)) + '░'.repeat(Math.round((1 - w.ftsWeight) * 20));
        const vecBar = '█'.repeat(Math.round(w.vectorWeight * 20)) + '░'.repeat(Math.round((1 - w.vectorWeight) * 20));
        console.log(`  FTS:    [${c.yellow}${ftsBar}${c.reset}] ${(w.ftsWeight * 100).toFixed(0)}%`);
        console.log(`  Vector: [${c.green}${vecBar}${c.reset}] ${(w.vectorWeight * 100).toFixed(0)}%\n`);
        break;
      }
      
      case 'search': {
        console.log(`\n${c.bold}Multi-Query RAG Search:${c.reset} "${query}"\n`);
        const start = Date.now();
        const results = await multiQuerySearch(db, query, 10);
        const elapsed = Date.now() - start;
        
        if (results.length === 0) {
          console.log(`${c.yellow}No results found.${c.reset}`);
          break;
        }
        
        console.log(`${c.dim}Found ${results.length} results in ${elapsed}ms (${results[0]?.queryVariationsUsed || 0} query variations)${c.reset}\n`);
        for (const r of results) {
          const score = r.multiQueryScore ? r.multiQueryScore.toFixed(4) : '?';
          console.log(`  ${c.dim}${(r.id || '').substring(0, 8)}${c.reset} ${c.green}↑${score}${c.reset} ${c.yellow}[${r.type}]${c.reset}`);
          console.log(`    ${truncate(r.content || r.summary || '', 100)}\n`);
        }
        break;
      }
      
      case 'compare': {
        console.log(`\n${c.bold}Comparison: Single Query vs Multi-Query RAG${c.reset}`);
        console.log(`${c.dim}Query: "${query}"${c.reset}\n`);
        
        // Single query search
        const t1 = Date.now();
        const singleResults = await smartSearch(db, query, { limit: 10 });
        const t1e = Date.now() - t1;
        
        // Multi-query search
        const t2 = Date.now();
        const multiResults = await multiQuerySearch(db, query, 10);
        const t2e = Date.now() - t2;
        
        console.log(`${c.bold}━━━ Single Query (${t1e}ms) ━━━${c.reset}\n`);
        for (const r of singleResults.slice(0, 5)) {
          const score = r.finalScore ? r.finalScore.toFixed(4) : '?';
          console.log(`  ${c.dim}${(r.id || '').substring(0, 8)}${c.reset} ${c.green}↑${score}${c.reset} ${truncate(r.content || '', 80)}`);
        }
        
        console.log(`\n${c.bold}━━━ Multi-Query RAG (${t2e}ms) ━━━${c.reset}\n`);
        for (const r of multiResults.slice(0, 5)) {
          const score = r.multiQueryScore ? r.multiQueryScore.toFixed(4) : '?';
          console.log(`  ${c.dim}${(r.id || '').substring(0, 8)}${c.reset} ${c.green}↑${score}${c.reset} ${truncate(r.content || '', 80)}`);
        }
        
        // Show unique results in multi that weren't in single
        const singleIds = new Set(singleResults.map(r => r.id));
        const uniqueMulti = multiResults.filter(r => !singleIds.has(r.id));
        
        if (uniqueMulti.length > 0) {
          console.log(`\n${c.bold}━━━ New results from Multi-Query (${uniqueMulti.length}) ━━━${c.reset}\n`);
          for (const r of uniqueMulti.slice(0, 5)) {
            console.log(`  ${c.green}+${c.reset} ${c.dim}${(r.id || '').substring(0, 8)}${c.reset} ${truncate(r.content || '', 80)}`);
          }
        } else {
          console.log(`\n${c.dim}No additional unique results from multi-query.${c.reset}`);
        }
        
        console.log();
        break;
      }
      
      default:
        console.log(`Unknown command: ${command}`);
        console.log(`Try: search, expand, compare, weights`);
    }
  } finally {
    closeDb();
  }
}

main().catch(e => {
  console.error(e.message);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
});
