/**
 * Bayra Memory System — Response Cache
 * Inspired by ZeroClaw's response_cache.rs
 * 
 * Caches search results to avoid burning embedding tokens on repeated queries.
 * SHA-256 hash keyed, TTL-based expiry, LRU eviction.
 */

import { createHash } from 'node:crypto';
import { getDb } from './db.mjs';

// ─── Config ────────────────────────────────────────────────────────

const DEFAULT_TTL_MINUTES = 60;     // 1 hour
const DEFAULT_MAX_ENTRIES = 500;

// ─── Schema (added to existing DB) ─────────────────────────────────

export function initCacheSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS response_cache (
      query_hash  TEXT PRIMARY KEY,
      query       TEXT NOT NULL,
      response    TEXT NOT NULL,
      result_count INTEGER NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL,
      accessed_at TEXT NOT NULL,
      hit_count   INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_rc_accessed ON response_cache(accessed_at);
    CREATE INDEX IF NOT EXISTS idx_rc_created ON response_cache(created_at);
  `);
}

// ─── Cache Key ─────────────────────────────────────────────────────

export function cacheKey(query, options = {}) {
  const hash = createHash('sha256');
  hash.update(query);
  hash.update('|');
  hash.update(JSON.stringify(options));
  return hash.digest('hex').substring(0, 32);
}

// ─── Get (Cache Hit) ───────────────────────────────────────────────

export function cacheGet(db, key, ttlMinutes = DEFAULT_TTL_MINUTES) {
  const cutoff = new Date(Date.now() - ttlMinutes * 60 * 1000).toISOString();
  
  const row = db.prepare(`
    SELECT response FROM response_cache
    WHERE query_hash = ? AND created_at > ?
  `).get(key, cutoff);

  if (row) {
    // Bump hit count
    const now = new Date().toISOString();
    db.prepare(`
      UPDATE response_cache SET accessed_at = ?, hit_count = hit_count + 1
      WHERE query_hash = ?
    `).run(now, key);
    
    return JSON.parse(row.response);
  }
  return null;
}

// ─── Put (Cache Store) ─────────────────────────────────────────────

export function cachePut(db, key, query, results, maxEntries = DEFAULT_MAX_ENTRIES) {
  const now = new Date().toISOString();
  
  db.prepare(`
    INSERT OR REPLACE INTO response_cache
    (query_hash, query, response, result_count, created_at, accessed_at, hit_count)
    VALUES (?, ?, ?, ?, ?, ?, 0)
  `).run(key, query, JSON.stringify(results), results.length || 0, now, now);

  // Evict expired + over-limit entries
  evict(db, maxEntries);
}

// ─── Evict ─────────────────────────────────────────────────────────

function evict(db, maxEntries = DEFAULT_MAX_ENTRIES) {
  // Remove expired (older than 24h regardless of TTL)
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  db.prepare(`DELETE FROM response_cache WHERE created_at < ?`).run(dayAgo);

  // If still over limit, remove least recently accessed
  const count = db.prepare(`SELECT COUNT(*) as c FROM response_cache`).get().c;
  if (count > maxEntries) {
    const excess = count - maxEntries;
    db.prepare(`
      DELETE FROM response_cache WHERE query_hash IN (
        SELECT query_hash FROM response_cache
        ORDER BY accessed_at ASC LIMIT ?
      )
    `).run(excess);
  }
}

// ─── Stats ─────────────────────────────────────────────────────────

export function cacheStats(db) {
  const row = db.prepare(`
    SELECT COUNT(*) as entries,
           SUM(hit_count) as totalHits,
           MAX(hit_count) as maxHits
    FROM response_cache
  `).get();
  return row || { entries: 0, totalHits: 0, maxHits: 0 };
}

// ─── Clear ─────────────────────────────────────────────────────────

export function cacheClear(db) {
  db.prepare(`DELETE FROM response_cache`).run();
}
