/**
 * Bayra Memory System — Lifecycle Engine
 * Consolidation, decay, garbage collection, backup, and health reporting.
 */

import { mkdirSync, readdirSync, unlinkSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { cosineSimilarity, embeddingToBuffer, bufferToEmbedding } from './embeddings.mjs';

// ==========================================
// CONSOLIDATION — Merge similar memories
// ==========================================

export async function consolidateMemories(db, options = {}) {
  const {
    threshold = 0.90,
    dryRun = false,
    maxPairs = 100,
  } = options;

  // Get all active memories that have embeddings, grouped by type
  const memories = db.prepare(`
    SELECT m.*, me.embedding
    FROM memories m
    JOIN memory_embeddings me ON me.memory_id = m.id
    WHERE m.status = 'active'
    ORDER BY m.type, m.importance DESC, m.created_at DESC
  `).all();

  // Group by type
  const byType = new Map();
  for (const m of memories) {
    if (!byType.has(m.type)) byType.set(m.type, []);
    byType.get(m.type).push(m);
  }

  const pairs = [];
  const consolidated = new Set(); // track already-consolidated IDs

  for (const [type, mems] of byType) {
    if (pairs.length >= maxPairs) break;

    for (let i = 0; i < mems.length && pairs.length < maxPairs; i++) {
      if (consolidated.has(mems[i].id)) continue;

      const embA = bufferToEmbedding(mems[i].embedding);

      for (let j = i + 1; j < mems.length && pairs.length < maxPairs; j++) {
        if (consolidated.has(mems[j].id)) continue;

        const embB = bufferToEmbedding(mems[j].embedding);
        const sim = cosineSimilarity(embA, embB);

        if (sim >= threshold) {
          // Pick primary: higher importance, or more recent if tied
          let primary = mems[i], secondary = mems[j];
          if (secondary.importance > primary.importance ||
              (secondary.importance === primary.importance &&
               secondary.created_at > primary.created_at)) {
            [primary, secondary] = [secondary, primary];
          }

          pairs.push({
            primary: primary.id,
            consolidated: secondary.id,
            similarity: Math.round(sim * 10000) / 10000,
            primaryContent: primary.content?.substring(0, 80),
            consolidatedContent: secondary.content?.substring(0, 80),
          });

          if (!dryRun) {
            // Merge content
            const mergedContent = primary.content +
              (secondary.content && !primary.content.includes(secondary.content)
                ? `\n[Consolidated] ${secondary.content}`
                : '');

            const newImportance = Math.min(10.0, primary.importance + 0.5);
            const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

            db.prepare(`
              UPDATE memories SET content = ?, importance = ?, updated_at = ? WHERE id = ?
            `).run(mergedContent, newImportance, now, primary.id);

            db.prepare(`
              UPDATE memories SET status = 'consolidated', parent_id = ?, updated_at = ? WHERE id = ?
            `).run(primary.id, now, secondary.id);
          }

          consolidated.add(secondary.id);
        }
      }
    }
  }

  return { merged: pairs.length, pairs };
}

// ==========================================
// DECAY — Reduce importance over time
// ==========================================

export function applyDecay(db, options = {}) {
  const { dryRun = false } = options;

  const memories = db.prepare(`
    SELECT id, type, importance, access_count, last_accessed_at, created_at
    FROM memories WHERE status = 'active'
  `).all();

  const now = Date.now();
  const details = [];

  for (const m of memories) {
    // Skip procedural memories entirely
    if (m.type === 'procedural') continue;
    // Skip high-importance semantic memories
    if (m.type === 'semantic' && m.importance >= 8) continue;

    const refDate = new Date(m.last_accessed_at || m.created_at).getTime();
    const daysSinceAccess = Math.max(0, (now - refDate) / (1000 * 60 * 60 * 24));

    // Age thresholds
    if (m.type === 'episodic' && daysSinceAccess < 7) continue;
    if (m.type === 'semantic' && daysSinceAccess < 30) continue;

    const timeDecay = 1 / (1 + Math.log(1 + daysSinceAccess / 30));
    const reinforcement = Math.min((m.access_count || 0) / 10, 1.0);
    const importanceShield = m.importance / 10;
    const decayFactor = timeDecay * 0.5 + reinforcement * 0.3 + importanceShield * 0.2;
    const newImportance = Math.max(1.0, m.importance * decayFactor);

    // Only record if there's actual change
    if (Math.abs(newImportance - m.importance) < 0.001) continue;

    details.push({
      id: m.id,
      type: m.type,
      oldImportance: Math.round(m.importance * 100) / 100,
      newImportance: Math.round(newImportance * 100) / 100,
    });

    if (!dryRun) {
      const nowStr = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      db.prepare(`UPDATE memories SET importance = ?, updated_at = ? WHERE id = ?`)
        .run(newImportance, nowStr, m.id);
    }
  }

  return { decayed: details.length, details };
}

// ==========================================
// GARBAGE COLLECTION — Archive old memories
// ==========================================

export function garbageCollect(db, options = {}) {
  const {
    dryRun = false,
    archiveDays = 90,
    deleteDays = 180,
  } = options;

  const now = new Date();
  const archiveCutoff = new Date(now - archiveDays * 86400000).toISOString();
  const deleteCutoff = new Date(now - deleteDays * 86400000).toISOString();
  const cacheCutoff = new Date(now - 30 * 86400000).toISOString();
  const queueCutoff = new Date(now - 7 * 86400000).toISOString();

  // 1. Archive old low-importance episodic memories
  const toArchive = db.prepare(`
    SELECT id, content, summary FROM memories
    WHERE status = 'active' AND importance < 3 AND access_count < 2
      AND (last_accessed_at < ? OR (last_accessed_at IS NULL AND created_at < ?))
      AND type = 'episodic'
  `).all(archiveCutoff, archiveCutoff);

  if (!dryRun && toArchive.length > 0) {
    const stmt = db.prepare(`UPDATE memories SET status = 'archived', updated_at = ? WHERE id = ?`);
    const nowStr = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
    for (const m of toArchive) stmt.run(nowStr, m.id);
  }

  // 2. Hard delete old archived memories (export to markdown first)
  const toDelete = db.prepare(`
    SELECT * FROM memories
    WHERE status = 'archived' AND updated_at < ?
  `).all(deleteCutoff);

  if (!dryRun && toDelete.length > 0) {
    // Export to markdown before deleting
    try {
      const exportDir = '/home/node/openclaw/backups/memory/exports';
      mkdirSync(exportDir, { recursive: true });
      const dateStr = now.toISOString().split('T')[0];
      const lines = toDelete.map(m =>
        `## ${m.id}\n- Type: ${m.type}\n- Created: ${m.created_at}\n- Content: ${m.content}\n`
      );
      writeFileSync(join(exportDir, `deleted-${dateStr}.md`), lines.join('\n---\n\n'));
    } catch (e) { /* best effort */ }

    const delStmt = db.prepare(`DELETE FROM memories WHERE id = ?`);
    for (const m of toDelete) delStmt.run(m.id);
  }

  // 3. Clean embedding_cache
  let cacheCleaned = 0;
  try {
    const cacheResult = dryRun
      ? db.prepare(`SELECT COUNT(*) as c FROM embedding_cache WHERE last_used < ?`).get(cacheCutoff)
      : db.prepare(`DELETE FROM embedding_cache WHERE last_used < ?`).run(cacheCutoff);
    cacheCleaned = dryRun ? cacheResult.c : cacheResult.changes;
  } catch { /* table may not exist */ }

  // 4. Clean embedding_queue
  let queueCleaned = 0;
  try {
    const queueResult = dryRun
      ? db.prepare(`SELECT COUNT(*) as c FROM embedding_queue WHERE status = 'done' AND created_at < ?`).get(queueCutoff)
      : db.prepare(`DELETE FROM embedding_queue WHERE status = 'done' AND created_at < ?`).run(queueCutoff);
    queueCleaned = dryRun ? queueResult.c : queueResult.changes;
  } catch { /* table may not exist */ }

  // 5. Clean memory_staging
  let stagingCleaned = 0;
  try {
    const stagingResult = dryRun
      ? db.prepare(`SELECT COUNT(*) as c FROM memory_staging WHERE status IN ('approved','rejected') AND created_at < ?`).get(queueCutoff)
      : db.prepare(`DELETE FROM memory_staging WHERE status IN ('approved','rejected') AND created_at < ?`).run(queueCutoff);
    stagingCleaned = dryRun ? stagingResult.c : stagingResult.changes;
  } catch { /* table may not exist */ }

  return {
    archived: toArchive.length,
    deleted: toDelete.length,
    cacheCleaned,
    queueCleaned,
    stagingCleaned,
  };
}

// ==========================================
// SLEEP-TIME REFLECTION — Background consolidation
// ==========================================

export async function sleepTimeReflection(db, options = {}) {
  const { dryRun = false } = options;

  const consolidation = await consolidateMemories(db, { dryRun });
  const decay = applyDecay(db, { dryRun });
  const gc = garbageCollect(db, { dryRun });

  const summary = [
    `🧠 Sleep-Time Reflection${dryRun ? ' (DRY RUN)' : ''}:`,
    `  Consolidated: ${consolidation.merged} pairs merged`,
    `  Decayed: ${decay.decayed} memories adjusted`,
    `  Archived: ${gc.archived} | Deleted: ${gc.deleted} | Cache cleaned: ${gc.cacheCleaned}`,
  ].join('\n');

  return { consolidation, decay, gc, summary };
}

// ==========================================
// BACKUP
// ==========================================

export async function backupDatabase(db, backupDir = null) {
  const dir = backupDir || '/home/node/openclaw/backups/memory';
  mkdirSync(dir, { recursive: true });

  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `memory-${dateStr}.db`;
  const backupPath = join(dir, filename);

  await db.backup(backupPath);

  const size = statSync(backupPath).size;

  // Keep only last 30 backups
  const files = readdirSync(dir)
    .filter(f => f.startsWith('memory-') && f.endsWith('.db'))
    .sort();

  let deleted = 0;
  while (files.length > 30) {
    const oldest = files.shift();
    try {
      unlinkSync(join(dir, oldest));
      deleted++;
    } catch { /* ignore */ }
  }

  return { path: backupPath, size, kept: files.length, deleted };
}

export function checkIntegrity(db) {
  const result = db.pragma('integrity_check');
  const text = result.map(r => r.integrity_check).join(', ');
  return { ok: text === 'ok', result: text };
}

// ==========================================
// STATISTICS & HEALTH
// ==========================================

export function getMemoryHealth(db) {
  // Total by type and status
  const byTypeStatus = db.prepare(`
    SELECT type, status, COUNT(*) as count FROM memories GROUP BY type, status
  `).all();

  // Average importance by type
  const avgImportance = db.prepare(`
    SELECT type, ROUND(AVG(importance), 2) as avg_importance
    FROM memories WHERE status = 'active' GROUP BY type
  `).all();

  // Recent activity
  const now = new Date();
  const d1 = new Date(now - 86400000).toISOString();
  const d7 = new Date(now - 7 * 86400000).toISOString();
  const d30 = new Date(now - 30 * 86400000).toISOString();

  const last24h = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE created_at >= ?`).get(d1).c;
  const last7d = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE created_at >= ?`).get(d7).c;
  const last30d = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE created_at >= ?`).get(d30).c;

  // Top accessed
  const topAccessed = db.prepare(`
    SELECT id, content, type, access_count, importance
    FROM memories WHERE status = 'active'
    ORDER BY access_count DESC LIMIT 10
  `).all().map(m => ({ ...m, content: m.content?.substring(0, 100) }));

  // Top importance
  const topImportance = db.prepare(`
    SELECT id, content, type, importance, access_count
    FROM memories WHERE status = 'active'
    ORDER BY importance DESC LIMIT 10
  `).all().map(m => ({ ...m, content: m.content?.substring(0, 100) }));

  // Entities
  const entityCount = db.prepare(`SELECT COUNT(*) as c FROM entities`).get().c;
  const topEntities = db.prepare(`
    SELECT e.name, e.type, COUNT(me.memory_id) as memory_count
    FROM entities e LEFT JOIN memory_entities me ON e.id = me.entity_id
    GROUP BY e.id ORDER BY memory_count DESC LIMIT 10
  `).all();

  // DB file size
  let dbSize = 0;
  try {
    const dbPath = db.pragma('database_list')[0]?.file;
    if (dbPath) dbSize = statSync(dbPath).size;
  } catch { /* ignore */ }

  // Embedding coverage
  const totalActive = db.prepare(`SELECT COUNT(*) as c FROM memories WHERE status = 'active'`).get().c;
  let withEmbeddings = 0;
  try {
    withEmbeddings = db.prepare(`
      SELECT COUNT(*) as c FROM memory_embeddings me
      JOIN memories m ON m.id = me.memory_id WHERE m.status = 'active'
    `).get().c;
  } catch { /* vec table may not exist */ }

  // Date range
  const oldest = db.prepare(`SELECT MIN(created_at) as d FROM memories`).get().d;
  const newest = db.prepare(`SELECT MAX(created_at) as d FROM memories`).get().d;

  return {
    byTypeStatus,
    avgImportance: Object.fromEntries(avgImportance.map(r => [r.type, r.avg_importance])),
    recentActivity: { last24h, last7d, last30d },
    topAccessed,
    topImportance,
    entities: { count: entityCount, top: topEntities },
    dbSizeBytes: dbSize,
    dbSizeMB: (dbSize / 1024 / 1024).toFixed(2),
    embeddingCoverage: totalActive > 0
      ? `${withEmbeddings}/${totalActive} (${Math.round(withEmbeddings / totalActive * 100)}%)`
      : '0/0 (0%)',
    dateRange: { oldest, newest },
  };
}
