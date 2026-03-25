#!/usr/bin/env node
/**
 * ontology-query.mjs — Query interface for the Ontology Knowledge Graph
 * Usage: node tools/ontology-query.mjs <command> [args]
 */

import { readFileSync, existsSync } from 'fs';

const GRAPH_PATH = '/home/node/openclaw/memory/ontology/graph.jsonl';

// ─── Load Graph ────────────────────────────────────────────────────────────

function loadGraph() {
  if (!existsSync(GRAPH_PATH)) return { entities: [], relations: [] };
  const lines = readFileSync(GRAPH_PATH, 'utf8').trim().split('\n').filter(Boolean);
  const entities = [];
  const relations = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === 'entity') entities.push(obj);
      else if (obj.type === 'relation') relations.push(obj);
    } catch {}
  }
  return { entities, relations };
}

// ─── Fuzzy/Partial Match ───────────────────────────────────────────────────

// Simple transliteration map: Arabic chars → rough Latin equivalents
const AR_TO_LATIN = {
  'م': 'm', 'ح': 'h', 'م': 'm', 'د': 'd',
  'أ': 'a', 'ا': 'a', 'إ': 'i', 'آ': 'a',
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j',
  'خ': 'kh', 'ذ': 'th', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh', 'ص': 's', 'ض': 'd',
  'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l',
  'ن': 'n', 'ه': 'h', 'و': 'w', 'ي': 'y',
  'ى': 'a', 'ة': 'h', 'ء': '', 'ئ': 'y',
  'ؤ': 'w', 'ّ': '', 'َ': '', 'ِ': '', 'ُ': '',
  'ً': '', 'ٍ': '', 'ٌ': '', 'ْ': '',
  'ل': 'l', 'لا': 'la',
};

function normalizeText(text) {
  if (!text) return '';
  let result = text.toLowerCase();
  // Replace Arabic chars with Latin equivalents
  let latin = '';
  for (const ch of result) {
    latin += AR_TO_LATIN[ch] ?? ch;
  }
  return latin.replace(/\s+/g, ' ').trim();
}

// Known Arabic ↔ English name aliases for cross-lingual search
const NAME_ALIASES = {
  'ليلى': ['layla', 'leila', 'lyla'],
  'محمد': ['mohammed', 'mohamed', 'mohamed abdou'],
  'أحمد': ['ahmed', 'ahmad'],
  'بايرا': ['bayra', 'pyraai', 'pyra'],
  'أفراح': ['afrah'],
  'خلود': ['khuloud'],
  'حسين': ['hussein', 'mr. hussein'],
};

function getAliases(query) {
  const q = query.toLowerCase().trim();
  const results = [q];
  for (const [arabic, english] of Object.entries(NAME_ALIASES)) {
    if (arabic === q || english.includes(q)) {
      results.push(arabic, ...english);
    }
  }
  return [...new Set(results)];
}

function scoreMatch(query, entity) {
  const aliases = getAliases(query);
  const name = normalizeText(entity.name || '');
  const rawName = (entity.name || '').toLowerCase().trim();
  const ctx = normalizeText(entity.context || '');
  const id = (entity.id || '').toLowerCase();
  const eType = (entity.entityType || '').toLowerCase();

  let bestScore = 0;
  
  for (const alias of aliases) {
    const q = normalizeText(alias);
    let score = 0;
    
    // Exact name match (raw or normalized)
    if (name === q || rawName === alias) score = Math.max(score, 100);
    // Name starts with query
    else if (name.startsWith(q)) score = Math.max(score, 80);
    // Name contains query
    else if (name.includes(q) || rawName.includes(alias)) score = Math.max(score, 60);
    // Context contains (only for primary query, not aliases)
    else if (alias === aliases[0] && ctx.includes(q)) score = Math.max(score, 30);
    
    bestScore = Math.max(bestScore, score);
  }
  
  // Legacy: check original non-normalized
  const rawQ = query.toLowerCase();
  if ((entity.name || '').toLowerCase().includes(rawQ) && bestScore === 0) bestScore = 50;
  if ((entity.context || '').toLowerCase().includes(rawQ) && bestScore < 20) bestScore = Math.max(bestScore, 20);
  
  return bestScore;

  return bestScore;
}

// ─── Exported Functions ────────────────────────────────────────────────────

export function searchEntity(query, options = {}) {
  const { entities, relations } = loadGraph();
  const minScore = options.minScore ?? 40; // Default: name-level matches only
  const limit = options.limit ?? 20;
  const results = [];
  for (const entity of entities) {
    const score = scoreMatch(query, entity);
    if (score >= minScore) results.push({ entity, score });
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function getEntityById(id) {
  const { entities } = loadGraph();
  return entities.find(e => e.id === id) || null;
}

export function getRelations(entityId) {
  const { relations } = loadGraph();
  return relations.filter(r => r.from === entityId || r.to === entityId);
}

export function getStats() {
  const { entities, relations } = loadGraph();
  const entityCounts = {};
  for (const e of entities) {
    entityCounts[e.entityType] = (entityCounts[e.entityType] || 0) + 1;
  }
  return {
    entities: entityCounts,
    totalEntities: entities.length,
    relations: relations.length,
  };
}

export function getTimeline(entityId) {
  const { entities, relations } = loadGraph();
  const entity = entities.find(e => e.id === entityId);
  const timeline = [];
  if (entity?.createdAt) {
    timeline.push({ date: entity.createdAt, event: `Entity created: ${entity.name}` });
  }
  // Add relations as events
  const rels = relations.filter(r => r.from === entityId || r.to === entityId);
  for (const rel of rels) {
    if (rel.createdAt) {
      const other = entities.find(e => e.id === (rel.from === entityId ? rel.to : rel.from));
      timeline.push({
        date: rel.createdAt,
        event: `Relation: ${rel.relation} → ${other?.name || rel.to}`,
      });
    }
  }
  timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
  return timeline;
}

export async function askGraph(question) {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error('GOOGLE_API_KEY not set');

  const { entities, relations } = loadGraph();

  // Build compact graph summary (cap at ~8000 chars to stay within limits)
  let graphText = '';
  graphText += `=== ENTITIES (${entities.length}) ===\n`;
  for (const e of entities) {
    graphText += `[${e.entityType}] ${e.name} (id:${e.id})\n`;
    if (e.context) graphText += `  Context: ${e.context}\n`;
    if (e.metadata && Object.keys(e.metadata).length) {
      graphText += `  Meta: ${JSON.stringify(e.metadata)}\n`;
    }
  }
  graphText += `\n=== RELATIONS (${relations.length}) ===\n`;
  for (const r of relations) {
    const fromE = entities.find(e => e.id === r.from);
    const toE = entities.find(e => e.id === r.to);
    const fromName = fromE?.name || r.from;
    const toName = toE?.name || r.to;
    graphText += `${fromName} --[${r.relation}]--> ${toName}`;
    if (r.context) graphText += ` (${r.context})`;
    graphText += '\n';
  }

  if (graphText.length > 12000) {
    graphText = graphText.substring(0, 12000) + '\n... [truncated]';
  }

  const prompt = `You are a knowledge graph assistant. Here is the knowledge graph:\n\n${graphText}\n\nAnswer this question based on the graph:\n${question}\n\nBe concise and accurate.`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gemini API error: ${res.status} — ${err}`);
  }

  const data = await res.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No answer from Gemini.';
}

// ─── CLI ───────────────────────────────────────────────────────────────────

function printEntity(entity, relations, allEntities) {
  console.log(`\n📌 ${entity.name} [${entity.entityType}]`);
  console.log(`   ID: ${entity.id}`);
  if (entity.confidence !== undefined) console.log(`   Confidence: ${entity.confidence}`);
  if (entity.createdAt) console.log(`   Created: ${entity.createdAt}`);
  if (entity.context) console.log(`   Context: ${entity.context}`);
  if (entity.metadata && Object.keys(entity.metadata).length) {
    console.log(`   Metadata: ${JSON.stringify(entity.metadata)}`);
  }

  const rels = relations.filter(r => r.from === entity.id || r.to === entity.id);
  if (rels.length) {
    console.log(`   Relations (${rels.length}):`);
    for (const r of rels) {
      const isFrom = r.from === entity.id;
      const otherId = isFrom ? r.to : r.from;
      const other = allEntities.find(e => e.id === otherId);
      const arrow = isFrom ? `→` : `←`;
      console.log(`     ${arrow} [${r.relation}] ${other?.name || otherId}`);
      if (r.context) console.log(`       (${r.context})`);
    }
  }
}

async function main() {
  const [,, command, ...args] = process.argv;

  if (!command || command === 'help') {
    console.log(`
Ontology Query Tool 🔮

Commands:
  search <query>     Search entities by name/context (fuzzy)
  list <type>        List entities by type (person, project, org, ...)
  relations <query>  Show relations for a matched entity
  stats              Graph statistics
  ask <question>     Ask Gemini about the graph
  help               Show this help
`);
    return;
  }

  const { entities, relations } = loadGraph();

  if (command === 'stats') {
    const stats = getStats();
    console.log('\n📊 Graph Statistics\n');
    console.log(`Total Entities: ${stats.totalEntities}`);
    console.log(`Total Relations: ${stats.relations}`);
    console.log('\nEntities by Type:');
    for (const [type, count] of Object.entries(stats.entities)) {
      console.log(`  ${type}: ${count}`);
    }
    return;
  }

  if (command === 'search') {
    const query = args.join(' ');
    if (!query) { console.error('Usage: search <query>'); process.exit(1); }
    const results = searchEntity(query);
    if (!results.length) {
      console.log(`No results for "${query}"`);
      return;
    }
    console.log(`\n🔍 Search results for "${query}" (${results.length} found):`);
    for (const { entity, score } of results) {
      printEntity(entity, relations, entities);
    }
    return;
  }

  if (command === 'list') {
    const type = (args[0] || '').toLowerCase();
    if (!type) { console.error('Usage: list <type>'); process.exit(1); }
    const filtered = entities.filter(e => e.entityType?.toLowerCase() === type);
    if (!filtered.length) {
      console.log(`No entities of type "${type}"`);
      return;
    }
    console.log(`\n📋 Entities of type "${type}" (${filtered.length}):\n`);
    for (const e of filtered) {
      console.log(`  • ${e.name} — ${e.context?.substring(0, 80) || ''}${e.context?.length > 80 ? '...' : ''}`);
    }
    return;
  }

  if (command === 'relations') {
    const query = args.join(' ');
    if (!query) { console.error('Usage: relations <query>'); process.exit(1); }
    const results = searchEntity(query);
    if (!results.length) {
      console.log(`No entity found matching "${query}"`);
      return;
    }
    const { entity } = results[0];
    const rels = getRelations(entity.id);
    console.log(`\n🔗 Relations for "${entity.name}" (${rels.length}):\n`);
    if (!rels.length) {
      console.log('  No relations found.');
      return;
    }
    for (const r of rels) {
      const isFrom = r.from === entity.id;
      const otherId = isFrom ? r.to : r.from;
      const other = entities.find(e => e.id === otherId);
      const direction = isFrom ? `${entity.name} → [${r.relation}] → ${other?.name || otherId}`
                                : `${other?.name || otherId} → [${r.relation}] → ${entity.name}`;
      console.log(`  ${direction}`);
      if (r.context) console.log(`    Context: ${r.context}`);
    }
    return;
  }

  if (command === 'ask') {
    const question = args.join(' ');
    if (!question) { console.error('Usage: ask <question>'); process.exit(1); }
    console.log(`\n🤖 Asking Gemini: "${question}"\n`);
    try {
      const answer = await askGraph(question);
      console.log(answer);
    } catch (e) {
      console.error('Error:', e.message);
      process.exit(1);
    }
    return;
  }

  console.error(`Unknown command: ${command}. Run with "help" for usage.`);
  process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
