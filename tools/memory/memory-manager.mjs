/**
 * Bayra Memory System — Unified Memory Manager
 * Single entry point for all memory operations.
 * 
 * Usage:
 *   import MemoryManager from './memory-manager.mjs';
 *   const mm = new MemoryManager();
 *   await mm.init();
 *   await mm.remember("Mohammed prefers dark mode", { type: 'semantic', importance: 7 });
 *   const results = await mm.recall("dark mode preference");
 *   mm.close();
 */

import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// ─── Module imports ───────────────────────────────────────────────────
import { getDb, closeDb, setDb, getMemory, deleteMemory, listMemories, reinforceMemory, getStats } from './db.mjs';
import { embed, setCacheDb } from './embeddings.mjs';
import { hybridSearch, entitySearch, timeRangeSearch } from './search.mjs';
import { ingestMemory, ingestConversation, ingestMarkdownFile, sanitizeContent } from './ingest.mjs';
import { sleepTimeReflection, backupDatabase, checkIntegrity, getMemoryHealth, garbageCollect } from './lifecycle.mjs';
import { initCacheSchema, cacheKey, cacheGet, cachePut, cacheStats } from './response-cache.mjs';
import { runHygiene, shouldRunNow } from './hygiene.mjs';
import { exportSnapshot, shouldHydrate, hydrateFromSnapshot } from './snapshot.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_PATH = join(__dirname, 'schema.sql');
const DEFAULT_DB_DIR = join(os.homedir(), '.openclaw', 'memory');
const DEFAULT_DB_PATH = join(DEFAULT_DB_DIR, 'bayra.db');

class MemoryManager {
  constructor(options = {}) {
    this.dbPath = options.dbPath || DEFAULT_DB_PATH;
    this.autoBackup = options.autoBackup ?? false;
    this.db = null;
    this.initialized = false;
  }

  // ==========================================
  // LIFECYCLE
  // ==========================================

  async init() {
    if (this.initialized) return this;

    const dbDir = dirname(this.dbPath);
    mkdirSync(dbDir, { recursive: true });

    // Create DB connection
    const db = new Database(this.dbPath);
    sqliteVec.load(db);

    // Pragmas
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('synchronous = NORMAL');
    db.pragma('foreign_keys = ON');

    // Schema
    const schema = readFileSync(SCHEMA_PATH, 'utf-8');
    const cleanedSchema = schema
      .split('\n')
      .filter(line => !line.trim().toUpperCase().startsWith('PRAGMA'))
      .join('\n');
    db.exec(cleanedSchema);

    // Vec0 virtual table
    db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(memory_id TEXT PRIMARY KEY, embedding float[512])`);

    // Inject into singleton so all module functions use this DB
    setDb(db);
    this.db = db;

    // Connect embedding cache to DB
    setCacheDb(db);

    // Initialize response cache schema (ZeroClaw-inspired)
    try { initCacheSchema(db); } catch (e) { /* table may already exist */ }

    // Auto-hydrate from snapshot if DB was empty
    if (shouldHydrate()) {
      try {
        const count = hydrateFromSnapshot(db);
        if (count > 0) console.log(`[MemoryManager] 🧬 Hydrated ${count} memories from snapshot`);
      } catch (e) { console.warn('[MemoryManager] Hydration failed:', e.message); }
    }

    // Run hygiene if due (archiving, purging, pruning)
    try { runHygiene(db); } catch (e) { console.warn('[MemoryManager] Hygiene failed:', e.message); }

    this.initialized = true;
    return this;
  }

  close() {
    if (this.db) {
      closeDb();
      this.db = null;
      this.initialized = false;
    }
  }

  _ensureInit() {
    if (!this.initialized) throw new Error('MemoryManager not initialized. Call init() first.');
  }

  // ==========================================
  // REMEMBER — Store memories
  // ==========================================

  async remember(content, options = {}) {
    this._ensureInit();
    try {
      return await ingestMemory(this.db, content, {
        type: options.type || 'semantic',
        subtype: options.subtype || null,
        importance: options.importance ?? 5,
        entities: options.entities || [],
        tags: options.tags || [],
        source: options.source || null,
        session_id: options.session_id || null,
        channel: options.channel || null,
        duplicateThreshold: options.skipDedup ? 1.01 : (options.duplicateThreshold || 0.92),
      });
    } catch (err) {
      console.error('[MemoryManager.remember] Error:', err.message);
      return { action: 'error', error: err.message };
    }
  }

  async rememberConversation(messages, options = {}) {
    this._ensureInit();
    try {
      return await ingestConversation(this.db, messages, options);
    } catch (err) {
      console.error('[MemoryManager.rememberConversation] Error:', err.message);
      return { created: 0, updated: 0, skipped: 0, memories: [], error: err.message };
    }
  }

  async rememberFile(filePath, options = {}) {
    this._ensureInit();
    try {
      return await ingestMarkdownFile(this.db, filePath, options.source || 'file');
    } catch (err) {
      console.error('[MemoryManager.rememberFile] Error:', err.message);
      return { created: 0, updated: 0, skipped: 0, total: 0, error: err.message };
    }
  }

  // ==========================================
  // RECALL — Retrieve memories
  // ==========================================

  async recall(query, options = {}) {
    this._ensureInit();
    const { limit = 10, types, minImportance = 0, visibility, timeRange, reinforce = true, tokenBudget = 0, useCache = true } = options;

    try {
      // 0. Check response cache (ZeroClaw-inspired)
      const ck = cacheKey(query, { limit, types, minImportance });
      if (useCache) {
        const cached = cacheGet(this.db, ck);
        if (cached) return cached;
      }

      // 1. Embed the query
      let queryEmbedding = null;
      try {
        queryEmbedding = await embed(query);
      } catch (err) {
        console.warn('[MemoryManager.recall] Embedding failed, falling back to keyword-only:', err.message);
      }

      // 2. Hybrid search
      const results = hybridSearch(this.db, query, queryEmbedding, {
        limit,
        types,
        minImportance,
        status: 'active',
        tokenBudget,
      });

      // 3. Reinforce accessed memories
      if (reinforce) {
        for (const r of results.slice(0, 5)) {
          try { reinforceMemory(r.id); } catch {}
        }
      }

      // 4. Format results
      const formatted = results.map(r => ({
        memory: {
          id: r.id,
          type: r.type,
          subtype: r.subtype,
          content: r.content,
          importance: r.importance,
          tags: r.tags,
          created_at: r.created_at,
          access_count: r.access_count,
        },
        score: r.finalScore ?? r.rrfScore ?? 0,
        matchType: r.rrfScore ? 'hybrid' : 'keyword',
      }));

      // 5. Store in response cache
      if (useCache && formatted.length > 0) {
        try { cachePut(this.db, ck, query, formatted); } catch {}
      }

      return formatted;
    } catch (err) {
      console.error('[MemoryManager.recall] Error:', err.message);
      return [];
    }
  }

  async recallByEntity(entityName, options = {}) {
    this._ensureInit();
    try {
      const results = entitySearch(this.db, entityName, {
        limit: options.limit || 20,
        status: 'active',
      });
      return results.map(r => ({
        memory: {
          id: r.id,
          type: r.type,
          content: r.content,
          importance: r.importance,
          tags: r.tags,
          created_at: r.created_at,
        },
        entity: { name: r.entity_name, type: r.entity_type, role: r.role },
      }));
    } catch (err) {
      console.error('[MemoryManager.recallByEntity] Error:', err.message);
      return [];
    }
  }

  async recallRecent(options = {}) {
    this._ensureInit();
    const { hours = 24, limit = 20, types } = options;
    try {
      const now = new Date();
      const isoNow = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
      const start = new Date(now - hours * 3600000).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const end = isoNow;
      return timeRangeSearch(this.db, start, end, { limit, types, status: 'active' });
    } catch (err) {
      console.error('[MemoryManager.recallRecent] Error:', err.message);
      return [];
    }
  }

  async recallImportant(options = {}) {
    this._ensureInit();
    const { limit = 20, types, minImportance = 7 } = options;
    try {
      return listMemories({
        status: 'active',
        type: types?.[0] || undefined,
        minImportance,
        limit,
      });
    } catch (err) {
      console.error('[MemoryManager.recallImportant] Error:', err.message);
      return [];
    }
  }

  // ==========================================
  // FORGET — Remove memories
  // ==========================================

  async forget(memoryId) {
    this._ensureInit();
    try {
      return deleteMemory(memoryId, false); // soft delete
    } catch (err) {
      console.error('[MemoryManager.forget] Error:', err.message);
      return false;
    }
  }

  async forgetOld(options = {}) {
    this._ensureInit();
    try {
      return garbageCollect(this.db, options);
    } catch (err) {
      console.error('[MemoryManager.forgetOld] Error:', err.message);
      return { archived: 0, deleted: 0, cacheCleaned: 0 };
    }
  }

  // ==========================================
  // MAINTAIN — System maintenance
  // ==========================================

  async maintain(options = {}) {
    this._ensureInit();
    try {
      const result = await sleepTimeReflection(this.db, options);

      if (this.autoBackup && !options.dryRun) {
        try {
          result.backup = await backupDatabase(this.db);
        } catch (err) {
          result.backup = { error: err.message };
        }
      }

      return result;
    } catch (err) {
      console.error('[MemoryManager.maintain] Error:', err.message);
      return { error: err.message };
    }
  }

  async backup() {
    this._ensureInit();
    try {
      return await backupDatabase(this.db);
    } catch (err) {
      console.error('[MemoryManager.backup] Error:', err.message);
      return { error: err.message };
    }
  }

  health() {
    this._ensureInit();
    try {
      const health = getMemoryHealth(this.db);
      // Add cache stats
      try { health.cacheStats = cacheStats(this.db); } catch {}
      return health;
    } catch (err) {
      console.error('[MemoryManager.health] Error:', err.message);
      return { error: err.message };
    }
  }

  // ─── ZeroClaw-inspired: Snapshot ────────────────────────────────
  
  snapshot() {
    this._ensureInit();
    try {
      const count = exportSnapshot(this.db);
      return { exported: count, path: 'MEMORY_SNAPSHOT.md' };
    } catch (err) {
      console.error('[MemoryManager.snapshot] Error:', err.message);
      return { error: err.message };
    }
  }

  // ─── ZeroClaw-inspired: Hygiene ─────────────────────────────────
  
  hygiene(config) {
    this._ensureInit();
    try {
      return runHygiene(this.db, config);
    } catch (err) {
      console.error('[MemoryManager.hygiene] Error:', err.message);
      return { error: err.message };
    }
  }

  integrity() {
    this._ensureInit();
    try {
      return checkIntegrity(this.db);
    } catch (err) {
      console.error('[MemoryManager.integrity] Error:', err.message);
      return { ok: false, error: err.message };
    }
  }

  // ==========================================
  // CONTEXT — For agent context injection
  // ==========================================

  async getContextMemories(currentMessage, recentMessages = [], options = {}) {
    this._ensureInit();
    const { maxMemories = 10, maxTokens = 2000 } = options;

    try {
      const allMemories = new Map(); // id → { memory, score, source }

      // 1. Semantic search on current message
      const semanticResults = await this.recall(currentMessage, {
        limit: Math.ceil(maxMemories * 0.6),
        reinforce: true,
      });
      for (const r of semanticResults) {
        allMemories.set(r.memory.id, {
          ...r.memory,
          score: r.score,
          source: 'semantic',
        });
      }

      // 2. Extract entity names from current message and recall by entity
      const entityNames = this._extractEntityNames(currentMessage);
      for (const name of entityNames.slice(0, 3)) {
        const entityResults = await this.recallByEntity(name, { limit: 5 });
        for (const r of entityResults) {
          if (!allMemories.has(r.memory.id)) {
            allMemories.set(r.memory.id, {
              ...r.memory,
              score: (r.memory.importance || 5) / 10,
              source: 'entity',
            });
          }
        }
      }

      // 3. Recent high-importance memories
      const recentImportant = await this.recallImportant({ limit: 5, minImportance: 8 });
      for (const m of recentImportant) {
        if (!allMemories.has(m.id)) {
          allMemories.set(m.id, {
            id: m.id,
            type: m.type,
            content: m.content,
            importance: m.importance,
            tags: m.tags,
            created_at: m.created_at,
            score: (m.importance || 5) / 10 * 0.8, // slightly lower priority
            source: 'important',
          });
        }
      }

      // 4. Rank and limit
      const ranked = [...allMemories.values()]
        .sort((a, b) => b.score - a.score)
        .slice(0, maxMemories);

      // 5. Format as context text
      const contextText = this._formatContextText(ranked, maxTokens);

      return {
        memories: ranked,
        contextText,
        count: ranked.length,
      };
    } catch (err) {
      console.error('[MemoryManager.getContextMemories] Error:', err.message);
      return { memories: [], contextText: '', count: 0 };
    }
  }

  /**
   * Simple entity name extraction (capitalized words, quoted terms).
   * Not LLM-based — fast heuristic for context retrieval.
   */
  _extractEntityNames(text) {
    const names = new Set();
    let match;

    // 1. Multi-word capitalized (e.g., "Mohammed Ali", "Elite Life")
    const multiCap = /\b([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+)+)\b/g;
    while ((match = multiCap.exec(text)) !== null) names.add(match[1]);

    // 2. Single capitalized words NOT at sentence start (min 3 chars)
    const singleCap = /(?<=[a-z.!?]\s+)([A-Z][a-zA-Z]{2,})\b/g;
    while ((match = singleCap.exec(text)) !== null) names.add(match[1]);

    // 3. Known tool/product names (case-insensitive)
    const knownEntities = ['n8n', 'supabase', 'telegram', 'whatsapp', 'pyramedia',
      'elitelife', 'openclaw', 'bayra', 'claude', 'openai', 'meta', 'google',
      'coolify', 'chatwoot', 'evolution api', 'etmam', 'docker', 'nginx'];
    const lower = text.toLowerCase();
    for (const ent of knownEntities) {
      if (lower.includes(ent)) names.add(ent);
    }

    // 4. Arabic proper nouns (words after common prepositions/titles)
    const arabicContext = /(?:يا|أخ|مع|عند|من|دكتور|د\.|مهندس|أستاذ)\s+([\u0600-\u06FF]+)/g;
    while ((match = arabicContext.exec(text)) !== null) names.add(match[1]);

    // 5. Quoted strings (3-40 chars)
    const quoted = /["']([^"']{3,40})["']/g;
    while ((match = quoted.exec(text)) !== null) names.add(match[1]);

    return [...names];
  }

  /**
   * Format memories as clean, readable text for context injection.
   */
  _formatContextText(memories, maxTokens) {
    if (memories.length === 0) return '';

    const lines = ['[Relevant Memories]'];
    let charCount = lines[0].length;
    const charLimit = maxTokens * 4; // rough token→char estimate

    for (const m of memories) {
      const typeLabel = m.type === 'semantic' ? '💡' :
                        m.type === 'episodic' ? '📝' :
                        m.type === 'procedural' ? '⚙️' : '•';
      const importance = m.importance >= 8 ? ' ⭐' : '';
      const line = `${typeLabel} ${m.content}${importance}`;

      if (charCount + line.length + 1 > charLimit) break;

      lines.push(line);
      charCount += line.length + 1;
    }

    return lines.join('\n');
  }

  // ==========================================
  // STATS
  // ==========================================

  stats() {
    this._ensureInit();
    try {
      return getStats();
    } catch (err) {
      console.error('[MemoryManager.stats] Error:', err.message);
      return { error: err.message };
    }
  }
}

export default MemoryManager;
export { MemoryManager };
