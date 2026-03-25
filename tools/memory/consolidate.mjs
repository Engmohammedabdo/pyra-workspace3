#!/usr/bin/env node
/**
 * Memory Consolidation Script
 * - Finds and merges duplicate/near-duplicate memories
 * - Archives old low-importance memories
 * - Cleans up orphaned entities
 * - Updates stats
 * 
 * Run: node tools/memory/consolidate.mjs [--dry-run]
 */

import { getDb, closeDb, getStats } from './db.mjs';

const DRY_RUN = process.argv.includes('--dry-run');
const NOW = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

function log(msg) { console.log(`[consolidate] ${msg}`); }

// ─── 1. Find exact duplicate memories (same content) ─────────────────

function findExactDuplicates() {
  const db = getDb();
  const dupes = db.prepare(`
    SELECT content, COUNT(*) as cnt, GROUP_CONCAT(id, '|') as ids
    FROM memories 
    WHERE status = 'active'
    GROUP BY content 
    HAVING cnt > 1
    ORDER BY cnt DESC
  `).all();
  return dupes;
}

function mergeDuplicates(dupes) {
  const db = getDb();
  let merged = 0;
  
  for (const dupe of dupes) {
    const ids = dupe.ids.split('|');
    const keep = ids[0]; // Keep the first one
    const remove = ids.slice(1);
    
    for (const id of remove) {
      if (DRY_RUN) {
        log(`  [dry-run] Would archive duplicate: ${id} (keeping ${keep})`);
      } else {
        db.prepare(`UPDATE memories SET status = 'consolidated', superseded_by = ?, updated_at = ? WHERE id = ?`).run(keep, NOW, id);
      }
      merged++;
    }
  }
  return merged;
}

// ─── 2. Find near-duplicate summaries (same summary text) ────────────

function findNearDuplicates() {
  const db = getDb();
  const dupes = db.prepare(`
    SELECT summary, COUNT(*) as cnt, GROUP_CONCAT(id, '|') as ids
    FROM memories 
    WHERE status = 'active' AND summary IS NOT NULL AND summary != ''
    GROUP BY summary 
    HAVING cnt > 1
  `).all();
  return dupes;
}

// ─── 3. Archive old low-importance memories ──────────────────────────

function archiveOldLowImportance(daysOld = 60, maxImportance = 3) {
  const db = getDb();
  const cutoff = new Date(Date.now() - daysOld * 86400000).toISOString();
  
  const candidates = db.prepare(`
    SELECT id FROM memories 
    WHERE status = 'active' 
    AND importance <= ? 
    AND created_at < ?
    AND access_count <= 1
  `).all(maxImportance, cutoff);
  
  if (DRY_RUN) {
    log(`  [dry-run] Would archive ${candidates.length} old low-importance memories`);
    return candidates.length;
  }
  
  const stmt = db.prepare(`UPDATE memories SET status = 'archived', updated_at = ? WHERE id = ?`);
  for (const c of candidates) {
    stmt.run(NOW, c.id);
  }
  return candidates.length;
}

// ─── 4. Clean up orphaned entities ───────────────────────────────────

function cleanOrphanedEntities() {
  const db = getDb();
  const orphans = db.prepare(`
    SELECT e.id, e.name FROM entities e
    LEFT JOIN memory_entities me ON e.id = me.entity_id
    LEFT JOIN entity_relations er1 ON e.id = er1.source_entity_id
    LEFT JOIN entity_relations er2 ON e.id = er2.target_entity_id
    WHERE me.entity_id IS NULL AND er1.id IS NULL AND er2.id IS NULL
  `).all();
  
  if (DRY_RUN) {
    log(`  [dry-run] Would remove ${orphans.length} orphaned entities`);
    return orphans.length;
  }
  
  const stmt = db.prepare(`DELETE FROM entities WHERE id = ?`);
  for (const o of orphans) {
    stmt.run(o.id);
  }
  return orphans.length;
}

// ─── 5. Clean up duplicate entity relations ──────────────────────────

function cleanDuplicateRelations() {
  const db = getDb();
  // entity_relations already has UNIQUE constraint, so just count
  const stats = db.prepare(`SELECT COUNT(*) as c FROM entity_relations`).get();
  return stats.c;
}

// ─── Main ────────────────────────────────────────────────────────────

async function main() {
  log(DRY_RUN ? '🔍 DRY RUN — no changes will be made' : '🔧 Running consolidation...');
  
  const before = getStats();
  log(`Before: ${before.totalActive} active, ${before.totalAll} total memories`);
  
  // 1. Exact duplicates
  const exactDupes = findExactDuplicates();
  const merged = mergeDuplicates(exactDupes);
  log(`Exact duplicates: ${exactDupes.length} groups, ${merged} merged`);
  
  // 2. Near duplicates (same summary)
  const nearDupes = findNearDuplicates();
  const nearMerged = mergeDuplicates(nearDupes);
  log(`Near duplicates (same summary): ${nearDupes.length} groups, ${nearMerged} merged`);
  
  // 3. Archive old low-importance
  const archived = archiveOldLowImportance();
  log(`Archived old low-importance: ${archived}`);
  
  // 4. Orphaned entities
  const orphans = cleanOrphanedEntities();
  log(`Orphaned entities removed: ${orphans}`);
  
  // 5. Relation stats
  const relCount = cleanDuplicateRelations();
  log(`Entity relations: ${relCount}`);
  
  const after = getStats();
  log(`After: ${after.totalActive} active, ${after.totalAll} total memories`);
  log(`Reduced: ${before.totalActive - after.totalActive} memories consolidated`);
  
  closeDb();
  
  const summary = `consolidation: ${merged + nearMerged} duplicates merged, ${archived} archived, ${orphans} orphans removed`;
  console.log(summary);
}

main().catch(err => {
  console.error('consolidate: Fatal error:', err.message);
  process.exit(1);
});
