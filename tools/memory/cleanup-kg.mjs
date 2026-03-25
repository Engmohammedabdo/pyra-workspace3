#!/usr/bin/env node
/**
 * Knowledge Graph Cleanup Script for bayra.db
 */
import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

const DB_PATH = '/home/node/.openclaw/memory/bayra.db';
const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = OFF'); // avoid FK issues during merge

const report = [];
function log(msg) { report.push(msg); console.log(msg); }

log('# Knowledge Graph Cleanup Report');
log(`Date: ${new Date().toISOString()}`);
log('');

// ─── Task 1A: Merge Duplicate Entities ──────────────────────

log('## Task 1A: Merge Duplicate Entities');

function mergeEntities(keepId, dupeIds, newAliases, extraUpdates = {}) {
  const keepEntity = db.prepare('SELECT * FROM entities WHERE id LIKE ?').get(keepId + '%');
  if (!keepEntity) { log(`  ⚠️ Keep entity ${keepId} not found!`); return; }
  
  const fullKeepId = keepEntity.id;
  log(`  Keeping: ${keepEntity.name} (${fullKeepId.substring(0,8)})`);
  
  for (const dupePrefix of dupeIds) {
    const dupe = db.prepare('SELECT * FROM entities WHERE id LIKE ?').get(dupePrefix + '%');
    if (!dupe) { log(`    ⚠️ Dupe ${dupePrefix} not found, skipping`); continue; }
    
    const fullDupeId = dupe.id;
    log(`    Merging: ${dupe.name} (${fullDupeId.substring(0,8)})`);
    
    // Move memory_entities links
    const moved = db.prepare(`
      UPDATE OR IGNORE memory_entities SET entity_id = ? WHERE entity_id = ?
    `).run(fullKeepId, fullDupeId);
    log(`      Moved ${moved.changes} memory links`);
    
    // Delete orphaned links (duplicates that couldn't be moved due to unique constraint)
    const cleaned = db.prepare(`DELETE FROM memory_entities WHERE entity_id = ?`).run(fullDupeId);
    if (cleaned.changes) log(`      Cleaned ${cleaned.changes} duplicate links`);
    
    // Delete duplicate entity
    db.prepare('DELETE FROM entities WHERE id = ?').run(fullDupeId);
    log(`      Deleted entity`);
  }
  
  // Update aliases
  const aliasJson = JSON.stringify(newAliases);
  let sql = `UPDATE entities SET aliases = ?, updated_at = datetime('now')`;
  const params = [aliasJson];
  
  if (extraUpdates.properties) {
    sql += `, properties = ?`;
    params.push(typeof extraUpdates.properties === 'string' ? extraUpdates.properties : JSON.stringify(extraUpdates.properties));
  }
  if (extraUpdates.type) {
    sql += `, type = ?`;
    params.push(extraUpdates.type);
  }
  if (extraUpdates.name) {
    sql += `, name = ?`;
    params.push(extraUpdates.name);
  }
  
  sql += ` WHERE id = ?`;
  params.push(fullKeepId);
  
  db.prepare(sql).run(...params);
  log(`    Updated aliases: ${aliasJson}`);
  log('');
}

// Mohammed merge
log('### Mohammed');
mergeEntities('62799a69', ['08832759', '6c3c61ab'], 
  ["محمد", "Mo", "Mohamed", "Engmohammedabdo"]);

// Layla merge
log('### Layla');
mergeEntities('a3dd5060', ['89314a86'], 
  ["Layla", "ليلى"]);

// Mr. Hussein merge
log('### Mr. Hussein');
mergeEntities('b77ab538', ['0b0c18e0', '798fbf93'], 
  ["Mr. Hussein", "Hussein", "أ. حسين", "حسين"]);

// Pyramedia → Pyramedia X (keep Pyramedia X as the main)
log('### Pyramedia X');
mergeEntities('8b203cbe', ['d551cdc6'], 
  ["Pyramedia", "Pyramedia X", "Pyramedia Digital", "بيراميديا", "بيراميديا إكس"],
  { name: 'Pyramedia X', type: 'company' });

// Etmam merge
log('### Etmam');
mergeEntities('62f6abd8', ['a290ff12'], 
  ["إتمام", "Etmam", "Etmam Center", "مركز إتمام", "مركز إتمام للخدمات القضائية", "Tasheel AI"]);

// ─── Task 1B: Update Injazat ───────────────────────────────

log('## Task 1B: Update Injazat');
const injazat = db.prepare("SELECT id FROM entities WHERE id LIKE '807ef760%'").get();
if (injazat) {
  db.prepare(`UPDATE entities SET 
    aliases = ?,
    properties = ?,
    updated_at = datetime('now')
    WHERE id = ?`).run(
    JSON.stringify(["إنجازات", "Injazat Group", "مجموعة إنجازات"]),
    JSON.stringify({"type": "parent_company", "location": "Sharjah", "subsidiaries": ["إتمام", "تسهيل", "توجيه"], "head": "حسين الغزال الشامسي", "contact": "Layla"}),
    injazat.id
  );
  log(`  Updated Injazat (${injazat.id.substring(0,8)})`);
} else {
  log('  ⚠️ Injazat entity not found!');
}

// ─── Task 1C: Update Etmam ─────────────────────────────────

log('## Task 1C: Update Etmam');
const etmam = db.prepare("SELECT id FROM entities WHERE id LIKE '62f6abd8%'").get();
if (etmam) {
  db.prepare(`UPDATE entities SET 
    type = 'organization',
    properties = ?,
    updated_at = datetime('now')
    WHERE id = ?`).run(
    JSON.stringify({"parent": "Injazat", "location": "Sharjah", "type": "judicial_services_center"}),
    etmam.id
  );
  log(`  Updated Etmam (${etmam.id.substring(0,8)})`);
}

// ─── Task 1D: Add New Entities ─────────────────────────────

log('## Task 1D: Add New Entities');

function addEntity(name, type, aliases, properties) {
  const existing = db.prepare('SELECT id FROM entities WHERE name = ?').get(name);
  if (existing) { log(`  ⚠️ ${name} already exists, skipping`); return; }
  
  const id = randomUUID();
  db.prepare(`INSERT INTO entities (id, type, name, aliases, properties, created_at, updated_at) 
    VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))`).run(
    id, type, name, JSON.stringify(aliases), JSON.stringify(properties)
  );
  log(`  Added: ${name} (${id.substring(0,8)}) type=${type}`);
  return id;
}

addEntity('مركز تسهيل', 'organization', ["Tasheel", "Tasheel Center"], {"parent": "Injazat", "location": "Sharjah"});
addEntity('مركز توجيه', 'organization', ["Tawjeeh", "Tawjeeh Center"], {"parent": "Injazat", "location": "Sharjah"});

log('');

// ─── Task 2: Soft-Delete Duplicate Memories ────────────────

log('## Task 2: Soft-Delete Duplicate Memories');

// Find memories with very similar content
const activeMemories = db.prepare(`
  SELECT id, content, importance, created_at, tags 
  FROM memories 
  WHERE status = 'active' 
  ORDER BY content
`).all();

// Group by similar content (first 80 chars)
const groups = {};
for (const m of activeMemories) {
  const key = m.content.substring(0, 80).trim().toLowerCase();
  if (!groups[key]) groups[key] = [];
  groups[key].push(m);
}

let totalDeleted = 0;
for (const [key, mems] of Object.entries(groups)) {
  if (mems.length < 2) continue;
  
  // Sort by importance desc, then created_at desc — keep first
  mems.sort((a, b) => (b.importance || 0) - (a.importance || 0) || b.created_at.localeCompare(a.created_at));
  
  const keep = mems[0];
  const dupes = mems.slice(1);
  
  if (dupes.length > 0) {
    log(`  Duplicate group (${mems.length}x): "${key.substring(0, 60)}..."`);
    log(`    Keeping: ${keep.id.substring(0,8)} (importance=${keep.importance})`);
    
    for (const d of dupes) {
      db.prepare("UPDATE memories SET status = 'deleted', updated_at = datetime('now') WHERE id = ?").run(d.id);
      log(`    Deleted: ${d.id.substring(0,8)} (importance=${d.importance})`);
      totalDeleted++;
    }
  }
}

log(`\n  Total soft-deleted: ${totalDeleted}`);
log('');

// ─── Task 4: Link Memories to Entities ─────────────────────

log('## Task 4: Link Memories to Injazat Entity');

if (injazat) {
  const linked = db.prepare(`
    INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, role)
    SELECT m.id, ?, 'client'
    FROM memories m 
    WHERE m.status = 'active' 
    AND (m.content LIKE '%Tasheel%' OR m.content LIKE '%إتمام%' OR m.content LIKE '%Etmam%' 
         OR m.content LIKE '%إنجازات%' OR m.content LIKE '%Injazat%'
         OR m.content LIKE '%تسهيل%' OR m.content LIKE '%توجيه%')
  `).run(injazat.id);
  log(`  Linked ${linked.changes} memories to Injazat`);
}

// Also link to Etmam entity
if (etmam) {
  const linked = db.prepare(`
    INSERT OR IGNORE INTO memory_entities (memory_id, entity_id, role)
    SELECT m.id, ?, 'subject'
    FROM memories m 
    WHERE m.status = 'active' 
    AND (m.content LIKE '%إتمام%' OR m.content LIKE '%Etmam%' OR m.content LIKE '%Tasheel AI%')
  `).run(etmam.id);
  log(`  Linked ${linked.changes} memories to Etmam`);
}

log('');

// ─── Summary ───────────────────────────────────────────────

log('## Summary');
const entityCount = db.prepare('SELECT COUNT(*) as c FROM entities').get().c;
const activeCount = db.prepare("SELECT COUNT(*) as c FROM memories WHERE status = 'active'").get().c;
const deletedCount = db.prepare("SELECT COUNT(*) as c FROM memories WHERE status = 'deleted'").get().c;
const linkCount = db.prepare('SELECT COUNT(*) as c FROM memory_entities').get().c;

log(`  Entities: ${entityCount}`);
log(`  Active memories: ${activeCount}`);
log(`  Deleted memories: ${deletedCount}`);
log(`  Memory-Entity links: ${linkCount}`);

db.close();

// Write report
import { writeFileSync, mkdirSync } from 'fs';
mkdirSync('/home/node/openclaw/memory', { recursive: true });
writeFileSync('/home/node/openclaw/memory/cleanup-report.md', report.join('\n'));
console.log('\n✅ Report written to /home/node/openclaw/memory/cleanup-report.md');
