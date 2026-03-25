#!/usr/bin/env node
/**
 * Ontology Query — Smart entity & relation search
 * 
 * Usage:
 *   node ontology-query.mjs search "ليلى"
 *   node ontology-query.mjs relations "إتمام"
 *   node ontology-query.mjs path "محمد" "إتمام"
 *   node ontology-query.mjs type person
 *   node ontology-query.mjs stats
 *   node ontology-query.mjs graph [entity_name]    — visual graph
 */

import { getDb, closeDb, findEntity, getEntity } from './db.mjs';
import { readFileSync, existsSync } from 'fs';

const GRAPH_PATH = '/home/node/openclaw/memory/ontology/graph.jsonl';

// ─── Graph Loading ───────────────────────────────────────────

function loadGraph() {
  if (!existsSync(GRAPH_PATH)) return { entities: [], relations: [] };
  const lines = readFileSync(GRAPH_PATH, 'utf8').split('\n').filter(l => l.trim());
  const entities = [], relations = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'entity') entities.push(obj);
      if (obj.type === 'relation') relations.push(obj);
    } catch {}
  }
  return { entities, relations };
}

// ─── DB Helpers ──────────────────────────────────────────────

function searchEntities(query) {
  const db = getDb();
  const q = `%${query}%`;
  return db.prepare(`
    SELECT * FROM entities 
    WHERE name LIKE ? OR type LIKE ? OR properties LIKE ? OR aliases LIKE ?
    ORDER BY name
    LIMIT 20
  `).all(q, q, q, q);
}

function getEntityRelationsFromDB(entityId, direction = 'both') {
  const db = getDb();
  if (direction === 'outgoing') {
    return db.prepare(`
      SELECT er.*, et.name as target_name, et.type as target_type 
      FROM entity_relations er 
      JOIN entities et ON er.target_entity_id = et.id 
      WHERE er.source_entity_id = ?
    `).all(entityId);
  }
  if (direction === 'incoming') {
    return db.prepare(`
      SELECT er.*, es.name as source_name, es.type as source_type 
      FROM entity_relations er 
      JOIN entities es ON er.source_entity_id = es.id 
      WHERE er.target_entity_id = ?
    `).all(entityId);
  }
  return db.prepare(`
    SELECT er.*, 
      es.name as source_name, es.type as source_type,
      et.name as target_name, et.type as target_type
    FROM entity_relations er 
    JOIN entities es ON er.source_entity_id = es.id 
    JOIN entities et ON er.target_entity_id = et.id 
    WHERE er.source_entity_id = ? OR er.target_entity_id = ?
  `).all(entityId, entityId);
}

function getLinkedMemories(entityId, limit = 5) {
  const db = getDb();
  return db.prepare(`
    SELECT m.id, m.content, m.type, m.importance, m.created_at
    FROM memory_entities me
    JOIN memories m ON me.memory_id = m.id
    WHERE me.entity_id = ? AND m.status = 'active'
    ORDER BY m.importance DESC, m.created_at DESC
    LIMIT ?
  `).all(entityId, limit);
}

// ─── Graph Helpers ───────────────────────────────────────────

function findInGraph(name) {
  const { entities, relations } = loadGraph();
  const norm = name.toLowerCase();
  const matchedEntities = entities.filter(e => 
    e.name?.toLowerCase().includes(norm) || 
    e.metadata?.context?.toLowerCase().includes(norm)
  );
  const matchedRelations = relations.filter(r =>
    r.from?.toLowerCase().includes(norm) || 
    r.to?.toLowerCase().includes(norm)
  );
  return { entities: matchedEntities, relations: matchedRelations };
}

function findPath(fromName, toName, maxHops = 3) {
  const { relations } = loadGraph();
  
  // BFS
  const visited = new Set();
  const queue = [[fromName.toLowerCase(), [fromName]]];
  visited.add(fromName.toLowerCase());
  
  while (queue.length > 0) {
    const [current, path] = queue.shift();
    if (path.length > maxHops + 1) continue;
    
    if (current === toName.toLowerCase()) return path;
    
    for (const rel of relations) {
      const from = rel.from?.toLowerCase();
      const to = rel.to?.toLowerCase();
      
      if (from === current && !visited.has(to)) {
        visited.add(to);
        queue.push([to, [...path, `—[${rel.relation}]→`, rel.to]]);
      }
      if (to === current && !visited.has(from)) {
        visited.add(from);
        queue.push([from, [...path, `←[${rel.relation}]—`, rel.from]]);
      }
    }
  }
  return null;
}

// ─── Commands ────────────────────────────────────────────────

function cmdSearch(query) {
  console.log(`\n🔍 Searching: "${query}"\n`);
  
  // DB search
  const dbResults = searchEntities(query);
  if (dbResults.length > 0) {
    console.log(`📦 DB Entities (${dbResults.length}):`);
    for (const e of dbResults) {
      const props = e.properties ? JSON.parse(e.properties) : {};
      console.log(`  • [${e.type}] ${e.name}${props.context ? ' — ' + props.context : ''}`);
      
      // Get relations
      const rels = getEntityRelationsFromDB(e.id);
      if (rels.length > 0) {
        for (const r of rels) {
          if (r.source_entity_id === e.id) {
            console.log(`    → ${r.relation_type} → ${r.target_name} [${r.target_type}]`);
          } else {
            console.log(`    ← ${r.relation_type} ← ${r.source_name} [${r.source_type}]`);
          }
        }
      }
      
      // Get linked memories
      const mems = getLinkedMemories(e.id, 3);
      if (mems.length > 0) {
        console.log(`    📝 Memories (${mems.length}):`);
        for (const m of mems) {
          console.log(`      - [imp:${m.importance}] ${m.content.slice(0, 80)}...`);
        }
      }
    }
  }
  
  // Graph search
  const graphResults = findInGraph(query);
  if (graphResults.entities.length > 0 || graphResults.relations.length > 0) {
    console.log(`\n📊 Graph (${graphResults.entities.length} entities, ${graphResults.relations.length} relations):`);
    for (const e of graphResults.entities.slice(0, 10)) {
      console.log(`  • [${e.entityType}] ${e.name}${e.metadata?.context ? ' — ' + e.metadata.context : ''}`);
    }
    for (const r of graphResults.relations.slice(0, 10)) {
      console.log(`  • ${r.from} —[${r.relation}]→ ${r.to}`);
    }
  }
  
  if (dbResults.length === 0 && graphResults.entities.length === 0) {
    console.log('  ❌ No results found');
  }
}

function cmdRelations(entityName) {
  console.log(`\n🔗 Relations for: "${entityName}"\n`);
  
  const entity = findEntity(entityName);
  if (entity) {
    const rels = getEntityRelationsFromDB(entity.id);
    console.log(`📦 DB Relations (${rels.length}):`);
    for (const r of rels) {
      if (r.source_entity_id === entity.id) {
        console.log(`  → ${r.relation_type} → ${r.target_name} [${r.target_type}] (conf: ${r.confidence})`);
      } else {
        console.log(`  ← ${r.relation_type} ← ${r.source_name} [${r.source_type}] (conf: ${r.confidence})`);
      }
    }
  }
  
  const graphResults = findInGraph(entityName);
  if (graphResults.relations.length > 0) {
    console.log(`\n📊 Graph Relations (${graphResults.relations.length}):`);
    for (const r of graphResults.relations) {
      console.log(`  ${r.from} —[${r.relation}]→ ${r.to}`);
    }
  }
}

function cmdPath(from, to) {
  console.log(`\n🛤️ Path: "${from}" → "${to}"\n`);
  const path = findPath(from, to);
  if (path) {
    console.log('  ' + path.join(' '));
  } else {
    console.log('  ❌ No path found (max 3 hops)');
  }
}

function cmdType(type) {
  const db = getDb();
  const entities = db.prepare('SELECT * FROM entities WHERE type = ? ORDER BY name').all(type);
  console.log(`\n👥 Entities of type "${type}" (${entities.length}):\n`);
  for (const e of entities) {
    const props = e.properties ? JSON.parse(e.properties) : {};
    console.log(`  • ${e.name}${props.context ? ' — ' + props.context : ''}`);
  }
  
  // Also from graph
  const { entities: graphEntities } = loadGraph();
  const graphMatches = graphEntities.filter(e => e.entityType === type);
  if (graphMatches.length > 0) {
    const dbNames = new Set(entities.map(e => e.name.toLowerCase()));
    const unique = graphMatches.filter(e => !dbNames.has(e.name.toLowerCase()));
    if (unique.length > 0) {
      console.log(`\n📊 Graph-only (${unique.length}):`);
      for (const e of unique.slice(0, 20)) {
        console.log(`  • ${e.name}${e.metadata?.context ? ' — ' + e.metadata.context : ''}`);
      }
    }
  }
}

function cmdStats() {
  const db = getDb();
  
  console.log('\n📊 Ontology Statistics\n');
  
  // DB stats
  const entityCount = db.prepare('SELECT COUNT(*) as c FROM entities').get().c;
  const entityTypes = db.prepare('SELECT type, COUNT(*) as c FROM entities GROUP BY type ORDER BY c DESC').all();
  const relCount = db.prepare('SELECT COUNT(*) as c FROM entity_relations').get().c;
  const relTypes = db.prepare('SELECT relation_type, COUNT(*) as c FROM entity_relations GROUP BY relation_type ORDER BY c DESC').all();
  const linkedMem = db.prepare('SELECT COUNT(DISTINCT entity_id) as c FROM memory_entities').get().c;
  
  console.log(`📦 DB:`);
  console.log(`  Entities: ${entityCount}`);
  for (const t of entityTypes) console.log(`    ${t.type}: ${t.c}`);
  console.log(`  Relations: ${relCount}`);
  for (const t of relTypes) console.log(`    ${t.relation_type}: ${t.c}`);
  console.log(`  Entities linked to memories: ${linkedMem}`);
  
  // Graph stats
  const { entities, relations } = loadGraph();
  console.log(`\n📊 Graph (JSONL):`);
  console.log(`  Entities: ${entities.length}`);
  console.log(`  Relations: ${relations.length}`);
  
  // Coverage
  const coverage = entityCount > 0 ? ((linkedMem / entityCount) * 100).toFixed(1) : 0;
  console.log(`\n🏥 Health:`);
  console.log(`  Entity-Memory coverage: ${coverage}%`);
  console.log(`  Entity-Relation coverage: ${relCount > 0 ? ((relCount / entityCount) * 100).toFixed(1) : 0}%`);
}

function cmdGraph(entityName) {
  console.log(`\n🕸️ Visual Graph${entityName ? ` around "${entityName}"` : ''}\n`);
  
  const { entities, relations } = loadGraph();
  let relevantRels = relations;
  
  if (entityName) {
    const norm = entityName.toLowerCase();
    relevantRels = relations.filter(r => 
      r.from?.toLowerCase().includes(norm) || r.to?.toLowerCase().includes(norm)
    );
    
    // 2nd hop
    const connected = new Set();
    for (const r of relevantRels) {
      connected.add(r.from?.toLowerCase());
      connected.add(r.to?.toLowerCase());
    }
    const hop2 = relations.filter(r => 
      connected.has(r.from?.toLowerCase()) || connected.has(r.to?.toLowerCase())
    );
    relevantRels = [...new Set([...relevantRels, ...hop2])];
  }
  
  if (relevantRels.length === 0) {
    console.log('  (no relations found)');
    return;
  }
  
  for (const r of relevantRels.slice(0, 30)) {
    console.log(`  ${r.from} ──[${r.relation}]──▶ ${r.to}`);
  }
  if (relevantRels.length > 30) {
    console.log(`  ... and ${relevantRels.length - 30} more`);
  }
}

// ─── Main ────────────────────────────────────────────────────

const [,, cmd, ...args] = process.argv;

switch (cmd) {
  case 'search':
    cmdSearch(args.join(' '));
    break;
  case 'relations':
    cmdRelations(args.join(' '));
    break;
  case 'path':
    if (args.length < 2) { console.log('Usage: path <from> <to>'); break; }
    cmdPath(args[0], args[1]);
    break;
  case 'type':
    cmdType(args[0] || 'person');
    break;
  case 'stats':
    cmdStats();
    break;
  case 'graph':
    cmdGraph(args.join(' ') || null);
    break;
  default:
    console.log(`
🕸️ Ontology Query Tool

Commands:
  search <query>       Search entities by name/context
  relations <entity>   Show all relations for an entity
  path <from> <to>     Find shortest path between entities (max 3 hops)
  type <type>          List entities by type (person/organization/project/tool/service/client)
  stats                Show ontology statistics
  graph [entity]       Visual graph (optionally centered on entity)
    `);
}

closeDb();
