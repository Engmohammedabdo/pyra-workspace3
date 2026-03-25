#!/usr/bin/env node
/**
 * build-relations.mjs — Build memory relation graph
 * Strategies: shared entities, shared tags, temporal sequence, semantic patterns
 * Target: importance >= 7, max 200 relations
 */
import { getDb } from './db.mjs';

const db = getDb();
let totalAdded = 0;
const stats = { relates_to: 0, caused_by: 0, follows: 0, supports: 0, part_of: 0, contradicts: 0 };

function addRelation(sourceId, targetId, relation, weight = 1.0) {
  try {
    const r = db.prepare('INSERT OR IGNORE INTO memory_relations (source_id, target_id, relation, weight) VALUES (?, ?, ?, ?)').run(sourceId, targetId, relation, weight);
    if (r.changes > 0) {
      totalAdded++;
      stats[relation] = (stats[relation] || 0) + 1;
      return true;
    }
    return false;
  } catch { return false; }
}

// ============================================================
// 1. SHARED ENTITY RELATIONS
// ============================================================
console.log('=== Strategy 1: Shared Entities ===');

// Get pairs of high-importance memories sharing entities (excluding Mohammed/Bayra which are everywhere)
const entityPairs = db.prepare(`
  SELECT me1.memory_id as m1, me2.memory_id as m2, 
         GROUP_CONCAT(e.name, ', ') as shared_entities,
         COUNT(DISTINCT e.id) as entity_count
  FROM memory_entities me1
  JOIN memory_entities me2 ON me1.entity_id = me2.entity_id AND me1.memory_id < me2.memory_id
  JOIN entities e ON e.id = me1.entity_id
  JOIN memories m1_ ON m1_.id = me1.memory_id AND m1_.status = 'active' AND m1_.importance >= 7
  JOIN memories m2_ ON m2_.id = me2.memory_id AND m2_.status = 'active' AND m2_.importance >= 7
  WHERE e.name NOT IN ('Mohammed', 'Bayra', 'Pyramedia')
  GROUP BY me1.memory_id, me2.memory_id
  HAVING entity_count >= 2
  ORDER BY entity_count DESC
  LIMIT 80
`).all();

console.log(`  Found ${entityPairs.length} pairs with 2+ shared entities`);
for (const p of entityPairs) {
  const weight = Math.min(0.5 + (p.entity_count * 0.1), 0.9);
  addRelation(p.m1, p.m2, 'relates_to', weight);
}

// ============================================================
// 2. SHARED TAGS RELATIONS
// ============================================================
console.log('\n=== Strategy 2: Shared Tags ===');

const mems = db.prepare(`
  SELECT id, tags, type, subtype, content, importance, created_at
  FROM memories WHERE status = 'active' AND importance >= 7 AND tags IS NOT NULL AND tags != ''
  ORDER BY importance DESC
`).all();

// Parse tags
function parseTags(tagsStr) {
  if (!tagsStr) return [];
  try {
    const parsed = JSON.parse(tagsStr);
    if (Array.isArray(parsed)) return parsed.map(t => t.toLowerCase().trim());
  } catch {}
  return tagsStr.split(',').map(t => t.toLowerCase().trim()).filter(Boolean);
}

let tagRelCount = 0;
for (let i = 0; i < mems.length && tagRelCount < 60; i++) {
  const tags1 = parseTags(mems[i].tags);
  if (tags1.length === 0) continue;
  for (let j = i + 1; j < mems.length && tagRelCount < 60; j++) {
    const tags2 = parseTags(mems[j].tags);
    const shared = tags1.filter(t => tags2.includes(t))
      .filter(t => !['auto-ingest', '2026-02-19', '2026-02-17', 'api', 'security'].includes(t));
    if (shared.length >= 2) {
      const weight = Math.min(0.4 + (shared.length * 0.1), 0.8);
      if (addRelation(mems[i].id, mems[j].id, 'relates_to', weight)) {
        tagRelCount++;
      }
    }
  }
}
console.log(`  Added ${tagRelCount} tag-based relations`);

// ============================================================
// 3. TEMPORAL SEQUENCE (follows)
// ============================================================
console.log('\n=== Strategy 3: Temporal Sequences ===');

// Project-based temporal chains
const projects = ['Etmam', 'Pyra Voice', 'Pyra Workspace', 'EliteLife', 'Chatwoot'];
let followsCount = 0;

for (const project of projects) {
  const projMems = db.prepare(`
    SELECT DISTINCT m.id, m.created_at, m.content, m.importance
    FROM memories m
    JOIN memory_entities me ON me.memory_id = m.id
    JOIN entities e ON e.id = me.entity_id
    WHERE e.name = ? AND m.status = 'active' AND m.importance >= 8
    ORDER BY m.created_at ASC
  `).all(project);

  for (let i = 0; i < projMems.length - 1 && followsCount < 30; i++) {
    // Link consecutive events in same project
    if (addRelation(projMems[i].id, projMems[i + 1].id, 'follows', 0.6)) {
      followsCount++;
    }
  }
}
console.log(`  Added ${followsCount} temporal follows relations`);

// ============================================================
// 4. SEMANTIC PATTERNS (caused_by, supports, part_of)
// ============================================================
console.log('\n=== Strategy 4: Semantic Patterns ===');

// 4a. Lessons/bugfixes caused_by events
const lessons = db.prepare(`
  SELECT id, content, tags, created_at FROM memories 
  WHERE status='active' AND importance >= 7 
  AND (subtype IN ('lesson', 'bugfix') OR type = 'procedural')
  ORDER BY created_at DESC
`).all();

const events = db.prepare(`
  SELECT id, content, tags, created_at FROM memories 
  WHERE status='active' AND importance >= 7 
  AND subtype IN ('event', 'deployment', 'conversation')
  ORDER BY created_at DESC
`).all();

let causedByCount = 0;
for (const lesson of lessons) {
  const lessonTags = parseTags(lesson.tags);
  // Find events with shared context that happened before the lesson
  for (const event of events) {
    if (causedByCount >= 25) break;
    if (event.created_at > lesson.created_at) continue;
    const eventTags = parseTags(event.tags);
    const shared = lessonTags.filter(t => eventTags.includes(t))
      .filter(t => !['auto-ingest', '2026-02-19', '2026-02-17', 'api', 'security'].includes(t));
    if (shared.length >= 2) {
      if (addRelation(event.id, lesson.id, 'caused_by', 0.8)) {
        causedByCount++;
      }
    }
  }
}
console.log(`  Added ${causedByCount} caused_by relations`);

// 4b. Rules support other rules (supports)
const rules = db.prepare(`
  SELECT id, content, tags FROM memories 
  WHERE status='active' AND importance >= 8 AND subtype = 'rule'
  ORDER BY created_at ASC
`).all();

let supportsCount = 0;
for (let i = 0; i < rules.length; i++) {
  for (let j = i + 1; j < rules.length && supportsCount < 15; j++) {
    const tags1 = parseTags(rules[i].tags);
    const tags2 = parseTags(rules[j].tags);
    const shared = tags1.filter(t => tags2.includes(t));
    // Rules from same source support each other
    if (shared.length >= 1 || 
        (rules[i].content.includes('قواعد محمد') && rules[j].content.includes('قواعد محمد'))) {
      if (addRelation(rules[i].id, rules[j].id, 'supports', 0.7)) {
        supportsCount++;
      }
    }
  }
}
console.log(`  Added ${supportsCount} supports relations`);

// 4c. part_of: Infrastructure/reference memories part of bigger systems
const infraMems = db.prepare(`
  SELECT id, content, tags FROM memories 
  WHERE status='active' AND importance >= 7 
  AND (subtype IN ('infrastructure', 'reference', 'credential'))
  ORDER BY created_at ASC
`).all();

let partOfCount = 0;
// Group by shared project entity
for (const project of ['Pyra Voice', 'Pyra Workspace', 'EliteLife', 'Chatwoot']) {
  const projEntity = db.prepare(`SELECT id FROM entities WHERE name = ?`).get(project);
  if (!projEntity) continue;
  
  const projMems = db.prepare(`
    SELECT DISTINCT m.id FROM memories m
    JOIN memory_entities me ON me.memory_id = m.id
    WHERE me.entity_id = ? AND m.status = 'active' AND m.importance >= 7
    AND m.subtype IN ('infrastructure', 'reference', 'credential', 'deployment', 'bugfix')
  `).all(projEntity.id);

  const mainMem = db.prepare(`
    SELECT DISTINCT m.id FROM memories m
    JOIN memory_entities me ON me.memory_id = m.id
    WHERE me.entity_id = ? AND m.status = 'active' AND m.importance >= 8
    AND m.subtype IN ('event', 'deployment')
    ORDER BY m.importance DESC LIMIT 1
  `).get(projEntity.id);

  if (mainMem) {
    for (const pm of projMems) {
      if (pm.id === mainMem.id) continue;
      if (partOfCount >= 30) break;
      if (addRelation(pm.id, mainMem.id, 'part_of', 0.7)) {
        partOfCount++;
      }
    }
  }
}
console.log(`  Added ${partOfCount} part_of relations`);

// 4d. Specific semantic: AI bot problems → system prompt v3 (caused_by)
const botProblems = db.prepare(`
  SELECT id FROM memories WHERE status='active' AND importance >= 9
  AND content LIKE '%AI bot%'
`).all();

const promptV3 = db.prepare(`
  SELECT id FROM memories WHERE status='active' 
  AND content LIKE '%system prompt v3%' AND importance >= 9
`).all();

for (const prob of botProblems) {
  for (const fix of promptV3) {
    addRelation(prob.id, fix.id, 'caused_by', 0.9);
  }
}

// 4e. Memory system decision → implementation (follows)
const memSysMems = db.prepare(`
  SELECT id, content, created_at FROM memories 
  WHERE status='active' AND importance >= 7 
  AND (content LIKE '%memory system%' OR content LIKE '%Memory Phase%' OR content LIKE '%dual-write%')
  ORDER BY created_at ASC
`).all();

for (let i = 0; i < memSysMems.length - 1; i++) {
  addRelation(memSysMems[i].id, memSysMems[i + 1].id, 'follows', 0.7);
}

// 4f. New rules caused by mistakes
const newRules = db.prepare(`
  SELECT id, content FROM memories WHERE status='active' AND importance = 10
  AND content LIKE '%قواعد جديدة%'
`).all();

const mistakeLesson = db.prepare(`
  SELECT id FROM memories WHERE status='active' AND importance = 10
  AND content LIKE '%لازم أسجّل ذكريات%'
`).all();

for (const rule of newRules) {
  for (const mistake of mistakeLesson) {
    addRelation(mistake.id, rule.id, 'caused_by', 0.9);
  }
}

// 4g. Evaluate-Loop chain
const evalMems = db.prepare(`
  SELECT id, content, created_at FROM memories
  WHERE status='active' AND importance >= 8
  AND (content LIKE '%Evaluate-Loop%' OR content LIKE '%Evaluator Agent%' OR content LIKE '%evaluation domain%')
  ORDER BY created_at ASC
`).all();

for (let i = 0; i < evalMems.length - 1; i++) {
  addRelation(evalMems[i].id, evalMems[i + 1].id, 'follows', 0.7);
}

// 4h. WhatsApp data analysis → prompt v3 → deployment (chain)
const waAnalysis = db.prepare(`
  SELECT id FROM memories WHERE status='active' AND importance >= 8
  AND content LIKE '%WhatsApp Data Analysis%completed%'
`).all();

const waPrompt = db.prepare(`
  SELECT id FROM memories WHERE status='active' AND importance >= 8
  AND content LIKE '%system prompt v3%deployed%'
  OR content LIKE '%WhatsApp Prompt v3%deployed%'
`).all();

for (const a of waAnalysis) {
  for (const p of waPrompt) {
    addRelation(a.id, p.id, 'caused_by', 0.8);
  }
}

// 4i. Sub-agent lessons support sub-agent rules
const subagentLesson = db.prepare(`
  SELECT id FROM memories WHERE status='active' AND importance >= 9
  AND content LIKE '%sub-agent%' AND (subtype = 'lesson' OR type = 'procedural')
`).all();

const subagentRule = db.prepare(`
  SELECT id FROM memories WHERE status='active' AND importance >= 9
  AND content LIKE '%Sub-Agent%' AND subtype = 'rule'
`).all();

for (const l of subagentLesson) {
  for (const r of subagentRule) {
    addRelation(l.id, r.id, 'supports', 0.8);
  }
}

// ============================================================
// SUMMARY
// ============================================================
const finalCount = db.prepare('SELECT COUNT(*) as c FROM memory_relations').get().c;

console.log('\n========================================');
console.log(`TOTAL NEW RELATIONS ADDED: ${totalAdded}`);
console.log(`TOTAL RELATIONS IN DB: ${finalCount}`);
console.log('By type:', JSON.stringify(stats, null, 2));
console.log('========================================');

db.close();
