/**
 * Bayra Memory System — Embedding Engine V2
 * Supports Google Gemini Embedding (primary) + OpenAI (fallback).
 * 
 * Upgraded 2026-03-18: Gemini Embedding 2 Preview (3072d) for better Arabic support.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import https from 'node:https';
import OpenAI from 'openai';

// ─── Provider Config ──────────────────────────────────────────────────

const PROVIDER = process.env.EMBEDDING_PROVIDER || 'google';  // 'google' or 'openai'

// Google Gemini config
const GOOGLE_MODEL = 'gemini-embedding-2-preview';
const GOOGLE_DIMS = 3072;

// OpenAI fallback config
const OPENAI_MODEL = 'text-embedding-3-small';
const OPENAI_DIMS = 512;

// Active config (set based on provider)
const DEFAULT_MODEL = PROVIDER === 'google' ? GOOGLE_MODEL : OPENAI_MODEL;
const DEFAULT_DIMS = PROVIDER === 'google' ? GOOGLE_DIMS : OPENAI_DIMS;

// Export for migration scripts
export { DEFAULT_DIMS, DEFAULT_MODEL, PROVIDER, GOOGLE_DIMS, OPENAI_DIMS };

// ─── API Key Resolution ───────────────────────────────────────────────

function resolveOpenAIKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const env = readFileSync('/home/node/.openclaw/credentials/pyra-voice.env', 'utf8');
    const m = env.match(/^OPENAI_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  return null;
}

function resolveGoogleKey() {
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  try {
    const env = readFileSync('/home/node/.openclaw/credentials/pyra-voice.env', 'utf8');
    const m = env.match(/^GOOGLE_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  return null;
}

// OpenAI client (for fallback)
let _openai = null;
function getOpenAI() {
  if (_openai) return _openai;
  const key = resolveOpenAIKey();
  if (!key) throw new Error('OPENAI_API_KEY not found');
  _openai = new OpenAI({ apiKey: key });
  return _openai;
}

// ─── Google Gemini Embedding API ──────────────────────────────────────

async function googleEmbed(text) {
  const key = resolveGoogleKey();
  if (!key) throw new Error('GOOGLE_API_KEY not found');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:embedContent?key=${key}`;
  const body = JSON.stringify({
    model: `models/${GOOGLE_MODEL}`,
    content: { parts: [{ text }] },
  });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.embedding?.values) {
            resolve(new Float32Array(json.embedding.values));
          } else {
            reject(new Error(`Google embedding failed: ${JSON.stringify(json.error || json)}`));
          }
        } catch (e) {
          reject(new Error(`Google embedding parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function googleEmbedBatch(texts) {
  const key = resolveGoogleKey();
  if (!key) throw new Error('GOOGLE_API_KEY not found');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GOOGLE_MODEL}:batchEmbedContents?key=${key}`;
  const requests = texts.map(text => ({
    model: `models/${GOOGLE_MODEL}`,
    content: { parts: [{ text }] },
  }));
  const body = JSON.stringify({ requests });

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
    }, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.embeddings) {
            resolve(json.embeddings.map(e => new Float32Array(e.values)));
          } else {
            reject(new Error(`Google batch embed failed: ${JSON.stringify(json.error || json)}`));
          }
        } catch (e) {
          reject(new Error(`Google batch embed parse error: ${e.message}`));
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Embedding Cache (LRU, in-memory with optional SQLite) ───────────

export class EmbeddingCache {
  constructor(db = null) {
    this.db = db;
    this.memCache = new Map();
    this.maxMemCache = 1000;
  }

  get(hash) {
    if (this.memCache.has(hash)) {
      const val = this.memCache.get(hash);
      this.memCache.delete(hash);
      this.memCache.set(hash, val);
      return val;
    }
    if (this.db) {
      try {
        const row = this.db.prepare('SELECT embedding FROM embedding_cache WHERE text_hash = ?').get(hash);
        if (row) {
          const emb = bufferToEmbedding(row.embedding);
          // Only return if dimensions match current provider
          if (emb.length === DEFAULT_DIMS) {
            this._memSet(hash, emb);
            return emb;
          }
          // Stale cache entry (wrong dimensions) — skip
        }
      } catch {}
    }
    return null;
  }

  set(hash, embedding) {
    this._memSet(hash, embedding);
    if (this.db) {
      try {
        this.db.prepare(
          'INSERT OR REPLACE INTO embedding_cache (text_hash, embedding) VALUES (?, ?)'
        ).run(hash, embeddingToBuffer(embedding));
      } catch {}
    }
  }

  has(hash) {
    if (this.memCache.has(hash)) return true;
    if (this.db) {
      try {
        const row = this.db.prepare('SELECT embedding FROM embedding_cache WHERE text_hash = ? LIMIT 1').get(hash);
        if (row) {
          const emb = bufferToEmbedding(row.embedding);
          return emb.length === DEFAULT_DIMS;
        }
      } catch {}
    }
    return false;
  }

  _memSet(hash, embedding) {
    if (this.memCache.size >= this.maxMemCache) {
      const oldest = this.memCache.keys().next().value;
      this.memCache.delete(oldest);
    }
    this.memCache.set(hash, embedding);
  }

  /** Clear all cached embeddings (for migration). */
  clearAll() {
    this.memCache.clear();
    if (this.db) {
      try {
        this.db.prepare('DELETE FROM embedding_cache').run();
      } catch {}
    }
  }
}

const cache = new EmbeddingCache();

export function setCacheDb(db) {
  cache.db = db;
}

// ─── Core Embed Functions ─────────────────────────────────────────────

/**
 * Embed a single text string using the configured provider.
 * @returns {Promise<Float32Array>} Normalized embedding vector
 */
export async function embed(text, options = {}) {
  const {
    model = DEFAULT_MODEL,
    dimensions = DEFAULT_DIMS,
    cache: useCache = true,
    provider = PROVIDER,
  } = options;

  if (useCache) {
    const hash = textHash(text);
    const cached = cache.get(hash);
    if (cached) return cached;
  }

  let vec;
  try {
    if (provider === 'google') {
      const raw = await googleEmbed(text);
      vec = normalizeVector(raw);
    } else {
      const openai = getOpenAI();
      const res = await openai.embeddings.create({ model, input: text, dimensions });
      vec = normalizeVector(new Float32Array(res.data[0].embedding));
    }
  } catch (err) {
    // Fallback: Google → OpenAI or vice versa
    if (provider === 'google') {
      console.warn(`[embed] Google failed, falling back to OpenAI: ${err.message}`);
      const openaiKey = resolveOpenAIKey();
      if (openaiKey) {
        const openai = getOpenAI();
        const res = await openai.embeddings.create({ model: OPENAI_MODEL, input: text, dimensions: OPENAI_DIMS });
        // Pad to match Google dims for vec0 table compatibility
        const smallVec = normalizeVector(new Float32Array(res.data[0].embedding));
        vec = padVector(smallVec, GOOGLE_DIMS);
      } else {
        throw err;
      }
    } else {
      throw err;
    }
  }

  if (useCache) {
    cache.set(textHash(text), vec);
  }

  return vec;
}

/**
 * Embed multiple texts in a single API call.
 * @returns {Promise<Float32Array[]>}
 */
export async function embedBatch(texts, options = {}) {
  const {
    model = DEFAULT_MODEL,
    dimensions = DEFAULT_DIMS,
    cache: useCache = true,
    provider = PROVIDER,
  } = options;

  const results = new Array(texts.length);
  const misses = [];

  if (useCache) {
    for (let i = 0; i < texts.length; i++) {
      const hash = textHash(texts[i]);
      const cached = cache.get(hash);
      if (cached) {
        results[i] = cached;
      } else {
        misses.push({ index: i, text: texts[i] });
      }
    }
  } else {
    for (let i = 0; i < texts.length; i++) {
      misses.push({ index: i, text: texts[i] });
    }
  }

  if (misses.length === 0) return results;

  if (provider === 'google') {
    // Google batch API supports up to 100 texts
    const BATCH_SIZE = 100;
    for (let start = 0; start < misses.length; start += BATCH_SIZE) {
      const batch = misses.slice(start, start + BATCH_SIZE);
      const vecs = await googleEmbedBatch(batch.map(m => m.text));
      for (let j = 0; j < batch.length; j++) {
        const vec = normalizeVector(vecs[j]);
        results[batch[j].index] = vec;
        if (useCache) {
          cache.set(textHash(batch[j].text), vec);
        }
      }
    }
  } else {
    const openai = getOpenAI();
    const res = await openai.embeddings.create({
      model, input: misses.map(m => m.text), dimensions,
    });
    for (let j = 0; j < misses.length; j++) {
      const vec = normalizeVector(new Float32Array(res.data[j].embedding));
      results[misses[j].index] = vec;
      if (useCache) {
        cache.set(textHash(misses[j].text), vec);
      }
    }
  }

  return results;
}

// ─── Retry Logic ──────────────────────────────────────────────────────

let _lastFailureAt = null;
const FAILURE_COOLDOWN_MS = 15000;

function inFailureCooldown() {
  if (!_lastFailureAt) return false;
  return (Date.now() - _lastFailureAt) < FAILURE_COOLDOWN_MS;
}

export async function embedWithRetry(text, maxRetries = 3) {
  if (inFailureCooldown()) {
    console.warn(`[embedWithRetry] In failure cooldown, skipping`);
    return null;
  }

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await embed(text);
      _lastFailureAt = null;
      return result;
    } catch (err) {
      const status = err?.status || err?.response?.status;
      const retryable = status === 429 || status >= 500 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
      if (!retryable || attempt === maxRetries) {
        console.error(`[embedWithRetry] Failed after ${attempt + 1} attempts:`, err.message);
        _lastFailureAt = Date.now();
        return null;
      }
      const delay = Math.min(1000 * 2 ** attempt + Math.random() * 500, 30000);
      console.warn(`[embedWithRetry] Attempt ${attempt + 1} failed, retrying in ${Math.round(delay)}ms…`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  _lastFailureAt = Date.now();
  return null;
}

// ─── Embedding Queue ──────────────────────────────────────────────────

export class EmbeddingQueue {
  constructor() {
    this.pending = [];
  }

  enqueue(memoryId, content) {
    this.pending.push({ memoryId, content });
  }

  async processQueue() {
    const results = [];
    const remaining = [];
    for (const item of this.pending) {
      const vec = await embedWithRetry(item.content);
      if (vec) {
        results.push({ memoryId: item.memoryId, embedding: vec });
      } else {
        remaining.push(item);
      }
    }
    this.pending = remaining;
    return results;
  }

  getPendingCount() {
    return this.pending.length;
  }
}

// ─── Vector Math ──────────────────────────────────────────────────────

export function cosineSimilarity(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

export function normalizeVector(vec) {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) sum += vec[i] * vec[i];
  const norm = Math.sqrt(sum);
  if (norm === 0) return new Float32Array(vec.length);
  const out = new Float32Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

/** Pad a smaller vector with zeros to match target dimensions. */
function padVector(vec, targetDims) {
  if (vec.length >= targetDims) return vec;
  const padded = new Float32Array(targetDims);
  padded.set(vec);
  return padded;
}

// ─── Serialization ────────────────────────────────────────────────────

export function embeddingToBuffer(embedding) {
  return Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength);
}

export function bufferToEmbedding(buffer) {
  const ab = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return new Float32Array(ab);
}

// ─── Hashing ──────────────────────────────────────────────────────────

export function textHash(text) {
  return createHash('sha256').update(text).digest('hex');
}

// Legacy exports for backward compatibility
// Proxy so that openai.chat.completions.create() delegates to the real client
const openai = new Proxy({}, {
  get(_, prop) {
    return getOpenAI()[prop];
  }
});
export { cache, openai };
