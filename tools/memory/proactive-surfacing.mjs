/**
 * Proactive Memory Surfacing — PyraAI 🦊
 * يطلّع ذكريات مرتبطة بالسياق الحالي بشكل استباقي
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

const DB_PATH = '/home/node/.openclaw/memory/bayra.db';

/**
 * Get a readonly database connection
 * @returns {import('better-sqlite3').Database}
 */
function getDb() {
  const Database = require('better-sqlite3');
  return new Database(DB_PATH, { readonly: true });
}

/**
 * Surface relevant memories based on current context
 * @param {string} context - Current conversation context or topic
 * @param {number} limit - Max results
 * @returns {Array<{id: string, content: string, type: string, importance: number, created_at: string}>}
 */
export function surfaceRelevantMemories(context, limit = 5) {
  const db = getDb();
  try {
    // Use FTS5 for text search
    const ftsResults = db.prepare(`
      SELECT m.id, m.content, m.type, m.importance, m.created_at
      FROM memories_fts fts
      JOIN memories m ON m.id = fts.rowid
      WHERE memories_fts MATCH ?
      AND m.deleted = 0
      ORDER BY rank, m.importance DESC
      LIMIT ?
    `).all(context.split(/\s+/).slice(0, 5).join(' OR '), limit);

    if (ftsResults.length > 0) return ftsResults;

    // Fallback: recent important memories
    return db.prepare(`
      SELECT id, content, type, importance, created_at
      FROM memories
      WHERE deleted = 0 AND importance >= 5
      ORDER BY created_at DESC
      LIMIT ?
    `).all(limit);
  } catch (e) {
    // If FTS table doesn't exist, fallback to LIKE search
    const keywords = context.split(/\s+/).slice(0, 3);
    const conditions = keywords.map(() => 'content LIKE ?').join(' OR ');
    const params = keywords.map(k => `%${k}%`);
    return db.prepare(`
      SELECT id, content, type, importance, created_at
      FROM memories
      WHERE deleted = 0 AND (${conditions})
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(...params, limit);
  } finally {
    db.close();
  }
}

/**
 * Get upcoming reminders and time-sensitive memories
 * @returns {Array<{id: string, content: string, valid_from: string, valid_until: string}>}
 */
export function getUpcomingReminders() {
  const db = getDb();
  try {
    const now = new Date().toISOString();
    const tomorrow = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    return db.prepare(`
      SELECT id, content, type, importance, valid_from, valid_until, created_at
      FROM memories
      WHERE deleted = 0
      AND valid_until IS NOT NULL
      AND valid_until > ?
      AND valid_until < ?
      ORDER BY valid_until ASC
      LIMIT 10
    `).all(now, tomorrow);
  } catch (e) {
    return [];
  } finally {
    db.close();
  }
}

/**
 * Find entities related to a topic
 * @param {string} topic
 * @returns {Array<{name: string, type: string, mention_count: number}>}
 */
export function findRelatedEntities(topic) {
  const db = getDb();
  try {
    return db.prepare(`
      SELECT name, type, mention_count, first_seen, last_seen
      FROM entities
      WHERE name LIKE ? OR name LIKE ?
      ORDER BY mention_count DESC
      LIMIT 10
    `).all(`%${topic}%`, `%${topic.toLowerCase()}%`);
  } catch (e) {
    return [];
  } finally {
    db.close();
  }
}

/**
 * Get recently active entities (last 7 days)
 * @returns {Array}
 */
export function getActiveEntities(days = 7) {
  const db = getDb();
  try {
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
    return db.prepare(`
      SELECT name, type, mention_count, last_seen
      FROM entities
      WHERE last_seen > ?
      ORDER BY last_seen DESC
      LIMIT 20
    `).all(since);
  } catch (e) {
    return [];
  } finally {
    db.close();
  }
}

/**
 * Quick surface — one-liner for common use
 * @param {string} query
 * @returns {string} Formatted memory snippets
 */
export function quickSurface(query) {
  const memories = surfaceRelevantMemories(query, 3);
  if (memories.length === 0) return 'لا توجد ذكريات مرتبطة';
  return memories.map(m => `• [${m.type}] ${m.content.substring(0, 150)}`).join('\n');
}

export default { surfaceRelevantMemories, getUpcomingReminders, findRelatedEntities, getActiveEntities, quickSurface };
