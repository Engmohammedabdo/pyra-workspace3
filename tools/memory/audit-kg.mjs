import { getDb, closeDb } from './db.mjs';
const db = getDb();

// 1. Total entities
const totalEntities = db.prepare("SELECT COUNT(*) as cnt FROM entities").get().cnt;
console.log('Total entities:', totalEntities);

// 2. Orphans (entities with no linked memories)
const orphans = db.prepare(`
  SELECT e.name, e.type 
  FROM entities e 
  LEFT JOIN memory_entities me ON e.id = me.entity_id 
  WHERE me.entity_id IS NULL
`).all();
console.log('Orphan entities count:', orphans.length);
if (orphans.length > 0) {
  console.log('Sample orphans:', orphans.slice(0, 5));
}

// 3. Duplicates (same name and type)
const duplicates = db.prepare(`
  SELECT name, type, COUNT(*) as cnt 
  FROM entities 
  GROUP BY name, type 
  HAVING cnt > 1
`).all();
console.log('Duplicate entities count:', duplicates.length);
if (duplicates.length > 0) {
  console.log('Sample duplicates:', duplicates.slice(0, 5));
}

// 4. Memory Relations Integrity
const badSource = db.prepare(`
  SELECT COUNT(*) as cnt FROM memory_relations 
  WHERE source_id NOT IN (SELECT id FROM memories)
`).get().cnt;
const badTarget = db.prepare(`
  SELECT COUNT(*) as cnt FROM memory_relations 
  WHERE target_id NOT IN (SELECT id FROM memories)
`).get().cnt;
console.log('Relations with invalid source_id:', badSource);
console.log('Relations with invalid target_id:', badTarget);

closeDb();
