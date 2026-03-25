import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import { readFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_DIR = join(os.homedir(), '.openclaw', 'memory');
const DB_PATH = join(DB_DIR, 'bayra.db');
const SCHEMA_PATH = join(__dirname, 'schema.sql');

let _db = null;

/**
 * Open (or return cached) database connection.
 */
export function getDb() {
  if (_db) return _db;

  mkdirSync(DB_DIR, { recursive: true });

  const db = new Database(DB_PATH);

  // Load sqlite-vec extension
  sqliteVec.load(db);

  // Run pragmas first (they can't be inside transactions)
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // Run schema migration — strip PRAGMAs (already applied via db.pragma)
  const schema = readFileSync(SCHEMA_PATH, 'utf-8');
  const cleanedSchema = schema
    .split('\n')
    .filter(line => !line.trim().toUpperCase().startsWith('PRAGMA'))
    .join('\n');
  db.exec(cleanedSchema);

  // Create vec0 virtual table for vector embeddings (3072d = Gemini Embedding 2 Preview)
  db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(memory_id TEXT PRIMARY KEY, embedding float[3072])`);

  // Composite indexes for common query patterns
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_status_type_importance ON memories(status, type, importance DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_status_created ON memories(status, created_at DESC)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_memories_last_accessed ON memories(last_accessed_at)`);

  _db = db;
  return db;
}

/**
 * Close the database connection.
 */
export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

/**
 * Replace the singleton DB connection (for testing / custom paths).
 * The caller is responsible for loading extensions, pragmas, and schema.
 */
export function setDb(db) {
  _db = db;
}

// ─── Memory CRUD ───────────────────────────────────────────

export function createMemory(memory) {
  const db = getDb();
  const id = memory.id || crypto.randomUUID();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const stmt = db.prepare(`
    INSERT INTO memories (id, type, subtype, content, summary, importance, confidence,
      event_at, expires_at, source, session_id, channel, tags, metadata, status,
      parent_id, visibility, created_at, updated_at, valid_from, valid_until, superseded_by)
    VALUES (@id, @type, @subtype, @content, @summary, @importance, @confidence,
      @event_at, @expires_at, @source, @session_id, @channel, @tags, @metadata, @status,
      @parent_id, @visibility, @created_at, @updated_at, @valid_from, @valid_until, @superseded_by)
  `);

  const row = {
    id,
    type: memory.type || 'episodic',
    subtype: memory.subtype || null,
    content: memory.content,
    summary: memory.summary || null,
    importance: memory.importance ?? 5.0,
    confidence: memory.confidence ?? 1.0,
    event_at: memory.event_at || null,
    expires_at: memory.expires_at || null,
    source: memory.source || null,
    session_id: memory.session_id || null,
    channel: memory.channel || null,
    tags: memory.tags || null,
    metadata: memory.metadata ? (typeof memory.metadata === 'string' ? memory.metadata : JSON.stringify(memory.metadata)) : null,
    status: memory.status || 'active',
    parent_id: memory.parent_id || null,
    visibility: memory.visibility || 'private',
    created_at: memory.created_at || now,
    updated_at: now,
    valid_from: memory.valid_from || null,
    valid_until: memory.valid_until || null,
    superseded_by: memory.superseded_by || null,
  };

  stmt.run(row);
  return { id, ...row };
}

export function getMemory(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM memories WHERE id = ?').get(id) || null;
}

export function updateMemory(id, updates) {
  const db = getDb();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const allowed = [
    'type', 'subtype', 'content', 'summary', 'importance', 'confidence',
    'event_at', 'expires_at', 'source', 'session_id', 'channel', 'tags',
    'metadata', 'status', 'parent_id', 'visibility', 'version',
    'valid_from', 'valid_until', 'superseded_by',
  ];

  const sets = [];
  const params = { id };

  for (const key of allowed) {
    if (key in updates) {
      let val = updates[key];
      if (key === 'metadata' && typeof val === 'object') val = JSON.stringify(val);
      sets.push(`${key} = @${key}`);
      params[key] = val;
    }
  }

  if (sets.length === 0) return null;

  sets.push('updated_at = @updated_at');
  params.updated_at = now;

  const sql = `UPDATE memories SET ${sets.join(', ')} WHERE id = @id`;
  const result = db.prepare(sql).run(params);
  return result.changes > 0 ? getMemory(id) : null;
}

export function deleteMemory(id, hard = false) {
  const db = getDb();
  if (hard) {
    const result = db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return result.changes > 0;
  } else {
    return updateMemory(id, { status: 'deleted' }) !== null;
  }
}

export function supersedeMemory(db, oldId, newId, reason) {
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const oldMem = db.prepare('SELECT * FROM memories WHERE id = ?').get(oldId);
  if (!oldMem) throw new Error(`Old memory not found: ${oldId}`);
  const newMem = db.prepare('SELECT * FROM memories WHERE id = ?').get(newId);
  if (!newMem) throw new Error(`New memory not found: ${newId}`);

  const run = db.transaction(() => {
    // 1. Mark old memory as superseded
    db.prepare(`
      UPDATE memories SET valid_until = @now, superseded_by = @newId, updated_at = @now
      WHERE id = @oldId
    `).run({ now, newId, oldId });

    // 2. Set valid_from on new memory if not already set
    if (!newMem.valid_from) {
      db.prepare(`
        UPDATE memories SET valid_from = @now, updated_at = @now WHERE id = @newId
      `).run({ now, newId });
    }

    // 3. Create superseded_by relation
    const relNow = now;
    db.prepare(`
      INSERT INTO memory_relations (source_id, target_id, relation, weight, created_at)
      VALUES (?, ?, 'superseded_by', 1.0, ?)
      ON CONFLICT(source_id, target_id, relation) DO UPDATE SET
        weight = 1.0, created_at = excluded.created_at
    `).run(oldId, newId, relNow);
  });

  run();

  return {
    old: db.prepare('SELECT * FROM memories WHERE id = ?').get(oldId),
    new: db.prepare('SELECT * FROM memories WHERE id = ?').get(newId),
  };
}

export function listMemories(filters = {}) {
  const db = getDb();
  const conditions = [];
  const params = {};

  if (filters.type) {
    conditions.push('type = @type');
    params.type = filters.type;
  }
  if (filters.status) {
    conditions.push('status = @status');
    params.status = filters.status;
  } else {
    // Default: exclude deleted
    conditions.push("status != 'deleted'");
  }
  if (filters.visibility) {
    conditions.push('visibility = @visibility');
    params.visibility = filters.visibility;
  }
  if (filters.minImportance != null) {
    conditions.push('importance >= @minImportance');
    params.minImportance = filters.minImportance;
  }
  if (filters.maxImportance != null) {
    conditions.push('importance <= @maxImportance');
    params.maxImportance = filters.maxImportance;
  }
  if (filters.since) {
    conditions.push('created_at >= @since');
    params.since = filters.since;
  }
  if (filters.until) {
    conditions.push('created_at <= @until');
    params.until = filters.until;
  }
  if (filters.source) {
    conditions.push('source = @source');
    params.source = filters.source;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 100;
  const offset = filters.offset || 0;

  const sql = `SELECT * FROM memories ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;
  return db.prepare(sql).all(params);
}

// ─── Entity CRUD ───────────────────────────────────────────

export function createEntity(entity) {
  const db = getDb();
  const id = entity.id || crypto.randomUUID();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  db.prepare(`
    INSERT INTO entities (id, type, name, aliases, properties, created_at, updated_at)
    VALUES (@id, @type, @name, @aliases, @properties, @created_at, @updated_at)
  `).run({
    id,
    type: entity.type,
    name: entity.name,
    aliases: entity.aliases || null,
    properties: entity.properties ? (typeof entity.properties === 'string' ? entity.properties : JSON.stringify(entity.properties)) : null,
    created_at: now,
    updated_at: now,
  });

  return { id, ...entity };
}

export function getEntity(id) {
  const db = getDb();
  return db.prepare('SELECT * FROM entities WHERE id = ?').get(id) || null;
}

export function findEntity(name) {
  const db = getDb();
  // Search by exact name or in aliases JSON array
  const entity = db.prepare('SELECT * FROM entities WHERE name = ? COLLATE NOCASE').get(name);
  if (entity) return entity;

  // Search aliases using JSON1 (no full table scan)
  return db.prepare(`
    SELECT * FROM entities
    WHERE EXISTS (SELECT 1 FROM json_each(aliases) WHERE json_each.value = ? COLLATE NOCASE)
    LIMIT 1
  `).get(name) || null;
}

// ─── Relations ─────────────────────────────────────────────

export function linkMemoryEntity(memoryId, entityId, role = null) {
  const db = getDb();
  db.prepare(`
    INSERT OR REPLACE INTO memory_entities (memory_id, entity_id, role)
    VALUES (?, ?, ?)
  `).run(memoryId, entityId, role);
  return { memoryId, entityId, role };
}

export function createRelation(sourceId, targetId, relation, weight = 1.0) {
  const db = getDb();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  db.prepare(`
    INSERT INTO memory_relations (source_id, target_id, relation, weight, created_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(source_id, target_id, relation) DO UPDATE SET
      weight = MAX(weight, excluded.weight),
      created_at = excluded.created_at
  `).run(sourceId, targetId, relation, weight, now);
  return { sourceId, targetId, relation, weight };
}

// ─── Entity Updates ────────────────────────────────────────

export function updateEntity(id, updates) {
  const db = getDb();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const allowed = ['type', 'name', 'aliases', 'properties'];
  const sets = [];
  const params = { id };
  for (const key of allowed) {
    if (key in updates) {
      let val = updates[key];
      if ((key === 'aliases' || key === 'properties') && typeof val === 'object') val = JSON.stringify(val);
      sets.push(`${key} = @${key}`);
      params[key] = val;
    }
  }
  if (sets.length === 0) return null;
  sets.push('updated_at = @updated_at');
  params.updated_at = now;
  db.prepare(`UPDATE entities SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return db.prepare('SELECT * FROM entities WHERE id = ?').get(id);
}

export function mergeEntities(primaryId, secondaryId) {
  const db = getDb();
  const primary = db.prepare('SELECT * FROM entities WHERE id = ?').get(primaryId);
  const secondary = db.prepare('SELECT * FROM entities WHERE id = ?').get(secondaryId);
  if (!primary || !secondary) return null;
  const pAliases = JSON.parse(primary.aliases || '[]');
  const sAliases = JSON.parse(secondary.aliases || '[]');
  const merged = [...new Set([...pAliases, ...sAliases, secondary.name])];
  updateEntity(primaryId, { aliases: merged });
  db.prepare('UPDATE memory_entities SET entity_id = ? WHERE entity_id = ?').run(primaryId, secondaryId);
  db.prepare('DELETE FROM entities WHERE id = ?').run(secondaryId);
  return db.prepare('SELECT * FROM entities WHERE id = ?').get(primaryId);
}

// ─── Reinforcement ─────────────────────────────────────────

export function reinforceMemory(id) {
  const db = getDb();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

  const result = db.prepare(`
    UPDATE memories
    SET access_count = access_count + 1,
        last_accessed_at = ?,
        importance = MIN(10.0, importance + 0.2),
        updated_at = ?
    WHERE id = ?
  `).run(now, now, id);

  return result.changes > 0 ? getMemory(id) : null;
}

// ─── Stats ─────────────────────────────────────────────────

export function getStats() {
  const db = getDb();

  const typeCounts = db.prepare(`
    SELECT type, COUNT(*) as count FROM memories WHERE status = 'active' GROUP BY type
  `).all();

  const total = db.prepare(`SELECT COUNT(*) as count FROM memories WHERE status = 'active'`).get();
  const totalAll = db.prepare(`SELECT COUNT(*) as count FROM memories`).get();

  let dbSize = 0;
  try {
    dbSize = statSync(DB_PATH).size;
  } catch { /* file may not exist yet */ }

  return {
    byType: Object.fromEntries(typeCounts.map(r => [r.type, r.count])),
    totalActive: total.count,
    totalAll: totalAll.count,
    dbSizeBytes: dbSize,
    dbSizeMB: (dbSize / 1024 / 1024).toFixed(2),
    dbPath: DB_PATH,
  };
}

// ─── FTS Search ────────────────────────────────────────────

export function searchMemories(query, limit = 20) {
  const db = getDb();
  const results = db.prepare(`
    SELECT m.* FROM memories_fts f
    JOIN memories m ON m.rowid = f.rowid
    WHERE memories_fts MATCH ?
    AND m.status != 'deleted'
    ORDER BY rank
    LIMIT ?
  `).all(query, limit);
  return results;
}

// ─── Entity Relations (Ontology V2) ──────────────────────

export function createEntityRelation(rel) {
  const db = getDb();
  const id = rel.id || crypto.randomUUID();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  db.prepare(`INSERT INTO entity_relations (id, source_entity_id, target_entity_id, relation_type, metadata, confidence, source, created_at, updated_at)
    VALUES (@id, @src, @tgt, @type, @meta, @conf, @source, @ca, @ua)
    ON CONFLICT(source_entity_id, target_entity_id, relation_type) DO UPDATE SET
      metadata = COALESCE(excluded.metadata, entity_relations.metadata),
      confidence = MAX(entity_relations.confidence, excluded.confidence),
      updated_at = excluded.updated_at`).run({
    id, src: rel.source_entity_id, tgt: rel.target_entity_id, type: rel.relation_type,
    meta: rel.metadata ? (typeof rel.metadata === 'string' ? rel.metadata : JSON.stringify(rel.metadata)) : null,
    conf: rel.confidence ?? 1.0, source: rel.source || null, ca: now, ua: now
  });
  return { id, ...rel };
}

export function getEntityRelations(entityId, direction = 'both') {
  const db = getDb();
  if (direction === 'outgoing') return db.prepare('SELECT er.*, e.name as target_name, e.type as target_type FROM entity_relations er JOIN entities e ON er.target_entity_id = e.id WHERE er.source_entity_id = ?').all(entityId);
  if (direction === 'incoming') return db.prepare('SELECT er.*, e.name as source_name, e.type as source_type FROM entity_relations er JOIN entities e ON er.source_entity_id = e.id WHERE er.target_entity_id = ?').all(entityId);
  return db.prepare('SELECT er.*, es.name as source_name, es.type as source_type, et.name as target_name, et.type as target_type FROM entity_relations er JOIN entities es ON er.source_entity_id = es.id JOIN entities et ON er.target_entity_id = et.id WHERE er.source_entity_id = ? OR er.target_entity_id = ?').all(entityId, entityId);
}

export function findEntityRelationsByType(type, limit = 50) {
  const db = getDb();
  return db.prepare('SELECT er.*, es.name as source_name, es.type as source_type, et.name as target_name, et.type as target_type FROM entity_relations er JOIN entities es ON er.source_entity_id = es.id JOIN entities et ON er.target_entity_id = et.id WHERE er.relation_type = ? ORDER BY er.confidence DESC LIMIT ?').all(type, limit);
}

export function deleteEntityRelation(id) {
  return getDb().prepare('DELETE FROM entity_relations WHERE id = ?').run(id).changes > 0;
}

export function getEntityRelationStats() {
  return getDb().prepare('SELECT relation_type, COUNT(*) as count FROM entity_relations GROUP BY relation_type ORDER BY count DESC').all();
}
