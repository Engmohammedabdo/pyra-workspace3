/**
 * file-indexer.mjs — Index workspace files with embeddings for search
 * 
 * Creates a file_index table in bayra.db and generates embeddings
 * for file chunks to enable semantic search across workspace files.
 */

import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, relative, extname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { getDb } from './db.mjs';
import { embed, embeddingToBuffer, setCacheDb } from './embeddings.mjs';

const CHUNK_SIZE = 800;       // chars per chunk
const CHUNK_OVERLAP = 200;    // overlap between chunks
const MAX_FILE_SIZE = 100000; // 100KB max per file

// ─── Schema ──────────────────────────────────────────

export function initFileIndexSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS file_index (
      id TEXT PRIMARY KEY,
      file_path TEXT NOT NULL,
      chunk_index INTEGER DEFAULT 0,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      file_type TEXT,
      last_indexed TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
      file_modified TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_file_index_path ON file_index(file_path);
    CREATE INDEX IF NOT EXISTS idx_file_index_hash ON file_index(content_hash);
  `);
}

// ─── Chunking ────────────────────────────────────────

function chunkText(text, chunkSize = CHUNK_SIZE, overlap = CHUNK_OVERLAP) {
  const chunks = [];
  let start = 0;
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    chunks.push(text.slice(start, end));
    start += chunkSize - overlap;
    if (end === text.length) break;
  }
  return chunks;
}

function contentHash(text) {
  return createHash('md5').update(text).digest('hex');
}

// ─── Indexing ────────────────────────────────────────

/**
 * Index a single file — splits into chunks and generates embeddings.
 * Skips chunks that haven't changed (by content_hash).
 */
export async function indexFile(db, filePath, options = {}) {
  initFileIndexSchema(db);
  setCacheDb(db);
  
  if (!existsSync(filePath)) return { indexed: 0, skipped: 0, error: 'File not found' };
  
  const stat = statSync(filePath);
  if (stat.size > MAX_FILE_SIZE) return { indexed: 0, skipped: 0, error: 'File too large' };
  if (stat.size === 0) return { indexed: 0, skipped: 0, error: 'Empty file' };
  
  const content = readFileSync(filePath, 'utf-8');
  const fileType = extname(filePath).slice(1) || 'txt';
  const fileMod = stat.mtime.toISOString();
  
  // Chunk the content
  const chunks = chunkText(content);
  let indexed = 0, skipped = 0;
  
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    const hash = contentHash(chunk);
    const chunkId = `file:${contentHash(filePath)}:${i}`;
    
    // Check if already indexed with same hash
    const existing = db.prepare('SELECT content_hash FROM file_index WHERE id = ?').get(chunkId);
    if (existing && existing.content_hash === hash) {
      skipped++;
      continue;
    }
    
    // Generate embedding
    try {
      const embedding = await embed(chunk);
      if (!embedding) { skipped++; continue; }
      
      const embBuf = embeddingToBuffer(embedding);
      
      // Upsert file_index row
      db.prepare(`
        INSERT OR REPLACE INTO file_index (id, file_path, chunk_index, content, content_hash, file_type, last_indexed, file_modified)
        VALUES (?, ?, ?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%SZ', 'now'), ?)
      `).run(chunkId, filePath, i, chunk, hash, fileType, fileMod);
      
      // Store embedding in memory_embeddings (same table as memories)
      try {
        db.prepare('DELETE FROM memory_embeddings WHERE memory_id = ?').run(chunkId);
      } catch {}
      db.prepare('INSERT INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)').run(chunkId, embBuf);
      
      indexed++;
    } catch (err) {
      console.warn(`[file-indexer] Chunk ${i} of ${filePath}: ${err.message}`);
      skipped++;
    }
  }
  
  // Clean up old chunks that no longer exist (file got shorter)
  const oldChunks = db.prepare('SELECT id, chunk_index FROM file_index WHERE file_path = ? AND chunk_index >= ?')
    .all(filePath, chunks.length);
  for (const old of oldChunks) {
    db.prepare('DELETE FROM file_index WHERE id = ?').run(old.id);
    try { db.prepare('DELETE FROM memory_embeddings WHERE memory_id = ?').run(old.id); } catch {}
  }
  
  return { indexed, skipped, totalChunks: chunks.length, filePath };
}

/**
 * Index a directory recursively (matching pattern).
 */
export async function indexDirectory(db, dirPath, options = {}) {
  const { 
    pattern = /\.(md|txt|mjs|js)$/,
    maxFiles = 200,
    exclude = /node_modules|\.git|backups|test-/,
  } = options;
  
  initFileIndexSchema(db);
  setCacheDb(db);
  
  const results = [];
  let fileCount = 0;
  
  function walkDir(dir) {
    if (fileCount >= maxFiles) return;
    try {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (fileCount >= maxFiles) break;
        const fullPath = join(dir, entry.name);
        
        if (exclude.test(entry.name)) continue;
        
        if (entry.isDirectory()) {
          walkDir(fullPath);
        } else if (entry.isFile() && pattern.test(entry.name)) {
          fileCount++;
          results.push(fullPath);
        }
      }
    } catch {}
  }
  
  walkDir(dirPath);
  
  let totalIndexed = 0, totalSkipped = 0;
  
  for (const filePath of results) {
    const result = await indexFile(db, filePath);
    totalIndexed += result.indexed || 0;
    totalSkipped += result.skipped || 0;
    if (result.indexed > 0) {
      console.log(`[file-indexer] ${relative(dirPath, filePath)}: ${result.indexed} chunks indexed`);
    }
  }
  
  return { files: results.length, indexed: totalIndexed, skipped: totalSkipped };
}

// ─── Search ──────────────────────────────────────────

/**
 * Search the file index using vector similarity.
 */
export async function searchFileIndex(db, query, options = {}) {
  const { limit = 10 } = options;
  initFileIndexSchema(db);
  setCacheDb(db);
  
  const queryEmb = await embed(query);
  if (!queryEmb) return [];
  
  const embBuf = embeddingToBuffer(queryEmb);
  
  // Vector search across file embeddings
  let vecResults;
  try {
    vecResults = db.prepare(`
      SELECT memory_id, distance
      FROM memory_embeddings
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(embBuf, limit * 3);
  } catch { return []; }
  
  // Filter to only file: prefixed results
  const fileResults = vecResults.filter(r => r.memory_id.startsWith('file:'));
  
  // Join with file_index for full data
  const results = [];
  for (const vr of fileResults.slice(0, limit)) {
    const fi = db.prepare('SELECT * FROM file_index WHERE id = ?').get(vr.memory_id);
    if (fi) {
      results.push({
        ...fi,
        distance: vr.distance,
        similarity: 1 - (vr.distance * vr.distance) / 2, // L2 → cosine approx
        source: 'file',
      });
    }
  }
  
  return results;
}

/**
 * Re-index stale files (modified since last indexed).
 */
export async function reindexStale(db, options = {}) {
  initFileIndexSchema(db);
  
  const indexed = db.prepare(`
    SELECT DISTINCT file_path, file_modified FROM file_index
  `).all();
  
  let reindexed = 0;
  for (const row of indexed) {
    try {
      if (!existsSync(row.file_path)) continue;
      const currentMod = statSync(row.file_path).mtime.toISOString();
      if (currentMod > row.file_modified) {
        await indexFile(db, row.file_path);
        reindexed++;
      }
    } catch {}
  }
  
  return { checked: indexed.length, reindexed };
}

/**
 * Get file index stats.
 */
export function getFileIndexStats(db) {
  initFileIndexSchema(db);
  const totalChunks = db.prepare('SELECT COUNT(*) as c FROM file_index').get().c;
  const totalFiles = db.prepare('SELECT COUNT(DISTINCT file_path) as c FROM file_index').get().c;
  const types = db.prepare('SELECT file_type, COUNT(*) as c FROM file_index GROUP BY file_type').all();
  return { totalChunks, totalFiles, byType: Object.fromEntries(types.map(t => [t.file_type, t.c])) };
}

// ─── CLI ──────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('file-indexer.mjs');
if (isMain) {
  const cmd = process.argv[2];
  const arg = process.argv[3];
  
  const db = getDb();
  setCacheDb(db);
  
  if (cmd === 'index' && arg) {
    const stat = statSync(arg);
    if (stat.isDirectory()) {
      const result = await indexDirectory(db, arg);
      console.log(`\n✅ Indexed ${result.files} files: ${result.indexed} chunks indexed, ${result.skipped} skipped`);
    } else {
      const result = await indexFile(db, arg);
      console.log(`✅ ${result.indexed} chunks indexed, ${result.skipped} skipped`);
    }
  } else if (cmd === 'search' && arg) {
    const query = process.argv.slice(3).join(' ');
    const results = await searchFileIndex(db, query);
    console.log(`\nFound ${results.length} results:\n`);
    for (const r of results) {
      console.log(`  📄 ${r.file_path} (chunk ${r.chunk_index}, sim: ${r.similarity?.toFixed(3)})`);
      console.log(`     ${r.content.substring(0, 100)}...\n`);
    }
  } else if (cmd === 'stats') {
    const stats = getFileIndexStats(db);
    console.log(`\n📊 File Index: ${stats.totalFiles} files, ${stats.totalChunks} chunks`);
    console.log('By type:', stats.byType);
  } else if (cmd === 'reindex') {
    const result = await reindexStale(db);
    console.log(`Checked: ${result.checked}, Re-indexed: ${result.reindexed}`);
  } else {
    console.log('Usage:');
    console.log('  node file-indexer.mjs index <dir-or-file>');
    console.log('  node file-indexer.mjs search <query>');
    console.log('  node file-indexer.mjs stats');
    console.log('  node file-indexer.mjs reindex');
  }
  
  const { closeDb } = await import('./db.mjs');
  closeDb();
}
