#!/usr/bin/env node
/**
 * Memory Dashboard — Quick status overview
 * Run: node tools/memory/dashboard.mjs [--json]
 * 
 * Shows: memory stats, entity counts, relation stats, knowledge files, health
 */

import { getDb, closeDb, getStats } from './db.mjs';
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join } from 'path';

const JSON_MODE = process.argv.includes('--json');
const BASE = '/home/node/openclaw';

function getEntityStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as c FROM entities').get().c;
  const byType = db.prepare('SELECT type, COUNT(*) as c FROM entities GROUP BY type ORDER BY c DESC').all();
  return { total, byType };
}

function getRelationStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) as c FROM entity_relations').get().c;
  const byType = db.prepare('SELECT relation_type, COUNT(*) as c FROM entity_relations GROUP BY relation_type ORDER BY c DESC').all();
  return { total, byType };
}

function getGraphStats() {
  const gPath = join(BASE, 'memory/ontology/graph.jsonl');
  if (!existsSync(gPath)) return { entities: 0, relations: 0, lines: 0 };
  const content = readFileSync(gPath, 'utf8');
  const lines = content.split('\n').filter(l => l.trim());
  let entities = 0, relations = 0;
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'entity') entities++;
      if (obj.type === 'relation') relations++;
    } catch {}
  }
  return { entities, relations, lines: lines.length };
}

function getKnowledgeStats() {
  const kDir = join(BASE, 'memory/knowledge');
  if (!existsSync(kDir)) return { files: 0, totalSize: 0 };
  
  let files = 0, totalSize = 0;
  function walk(dir) {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f);
      const s = statSync(p);
      if (s.isDirectory()) walk(p);
      else { files++; totalSize += s.size; }
    }
  }
  walk(kDir);
  return { files, totalSizeKB: (totalSize / 1024).toFixed(1) };
}

function getDailyMemoryStats() {
  const memDir = join(BASE, 'memory');
  const files = readdirSync(memDir).filter(f => /^2026-\d{2}-\d{2}\.md$/.test(f)).sort().reverse();
  const recent = files.slice(0, 7).map(f => {
    const s = statSync(join(memDir, f));
    return { date: f.replace('.md', ''), sizeKB: (s.size / 1024).toFixed(1) };
  });
  return { totalFiles: files.length, recent };
}

function getHealth() {
  const issues = [];
  const db = getDb();
  
  // Check for too many unlinked memories
  const unlinked = db.prepare(`
    SELECT COUNT(*) as c FROM memories m 
    LEFT JOIN memory_entities me ON m.id = me.memory_id 
    WHERE m.status = 'active' AND me.memory_id IS NULL
  `).get().c;
  if (unlinked > 500) issues.push(`⚠️ ${unlinked} memories have no linked entities`);
  
  // Check for duplicate content
  const dupes = db.prepare(`
    SELECT COUNT(*) as c FROM (
      SELECT content, COUNT(*) as cnt FROM memories WHERE status = 'active' GROUP BY content HAVING cnt > 1
    )
  `).get().c;
  if (dupes > 10) issues.push(`⚠️ ${dupes} duplicate memory groups found — run consolidate.mjs`);
  
  // Check DB size
  const stats = getStats();
  if (parseFloat(stats.dbSizeMB) > 100) issues.push(`⚠️ DB size: ${stats.dbSizeMB} MB — consider archiving`);
  
  if (issues.length === 0) issues.push('✅ All healthy!');
  return issues;
}

// ─── Main ────────────────────────────────────────────────────────────

function main() {
  const memStats = getStats();
  const entityStats = getEntityStats();
  const relStats = getRelationStats();
  const graphStats = getGraphStats();
  const knowledgeStats = getKnowledgeStats();
  const dailyStats = getDailyMemoryStats();
  const health = getHealth();
  
  closeDb();
  
  if (JSON_MODE) {
    console.log(JSON.stringify({ memStats, entityStats, relStats, graphStats, knowledgeStats, dailyStats, health }, null, 2));
    return;
  }
  
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║         🧠 Bayra Memory Dashboard               ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║ 💾 Memories                                     ║');
  console.log(`║   Active: ${String(memStats.totalActive).padEnd(8)} Total: ${String(memStats.totalAll).padEnd(10)}  ║`);
  console.log(`║   DB Size: ${memStats.dbSizeMB} MB                            ║`);
  for (const [type, count] of Object.entries(memStats.byType)) {
    console.log(`║   ${type}: ${count}`.padEnd(51) + '║');
  }
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║ 👥 Entities                                     ║');
  console.log(`║   Total: ${entityStats.total}`.padEnd(51) + '║');
  for (const t of entityStats.byType.slice(0, 5)) {
    console.log(`║   ${t.type}: ${t.c}`.padEnd(51) + '║');
  }
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║ 🔗 Entity Relations                             ║');
  console.log(`║   DB: ${relStats.total}  |  Graph: ${graphStats.entities} entities, ${graphStats.relations} rels`.padEnd(51) + '║');
  for (const t of relStats.byType.slice(0, 5)) {
    console.log(`║   ${t.relation_type}: ${t.c}`.padEnd(51) + '║');
  }
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║ 📚 Knowledge Base                               ║');
  console.log(`║   Files: ${knowledgeStats.files}  |  Size: ${knowledgeStats.totalSizeKB} KB`.padEnd(51) + '║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║ 📅 Daily Memory Files                           ║');
  console.log(`║   Total: ${dailyStats.totalFiles} files`.padEnd(51) + '║');
  for (const d of dailyStats.recent.slice(0, 5)) {
    console.log(`║   ${d.date}: ${d.sizeKB} KB`.padEnd(51) + '║');
  }
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║ 🏥 Health                                       ║');
  for (const h of health) {
    console.log(`║   ${h}`.padEnd(51) + '║');
  }
  console.log('╚══════════════════════════════════════════════════╝');
}

main();
