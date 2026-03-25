#!/usr/bin/env node
/**
 * ontology-realtime.mjs
 * Real-time entity extraction from conversation text
 * Phase 4: Auto-Learning
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

const GRAPH_PATH = '/home/node/openclaw/memory/ontology/graph.jsonl';
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${process.env.GOOGLE_API_KEY}`;
const MIN_CONFIDENCE = 0.5;

// ─── Graph Helpers ────────────────────────────────────────────────────────────

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

function appendToGraph(items) {
  const lines = items.map(i => JSON.stringify(i)).join('\n');
  writeFileSync(GRAPH_PATH, (existsSync(GRAPH_PATH) ? readFileSync(GRAPH_PATH, 'utf8') : '') + lines + '\n');
}

function rewriteGraph(entities, relations) {
  const all = [...entities, ...relations];
  writeFileSync(GRAPH_PATH, all.map(i => JSON.stringify(i)).join('\n') + '\n');
}

// ─── Gemini Call ──────────────────────────────────────────────────────────────

async function callGemini(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const res = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, responseMimeType: 'application/json' }
      }),
      signal: controller.signal
    });
    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    return JSON.parse(text);
  } finally {
    clearTimeout(timeout);
  }
}

// ─── Extract Entities from Conversation ──────────────────────────────────────

export async function extractFromConversation(text, options = {}) {
  const minConfidence = options.minConfidence ?? MIN_CONFIDENCE;

  const prompt = `Extract entities and relations from this Arabic/English conversation text.

Text: """${text}"""

Return JSON with this exact structure:
{
  "entities": [
    {
      "name": "entity name",
      "entityType": "person|organization|project|tool|event|location|document",
      "context": "brief description",
      "confidence": 0.0-1.0,
      "metadata": {}
    }
  ],
  "relations": [
    {
      "from": "entity name",
      "relation": "works_at|manages|owns|uses|part_of|knows|left|joined|located_in|related_to",
      "to": "entity name",
      "confidence": 0.0-1.0
    }
  ]
}

Rules:
- Only extract clear, concrete entities (people, companies, projects, tools)
- confidence: 1.0 = explicitly stated, 0.7 = strongly implied, 0.5 = inferred
- For "left company" relations, use relation="left"
- Return empty arrays if nothing found
- Be conservative — quality over quantity`;

  let extracted;
  try {
    extracted = await callGemini(prompt);
  } catch (err) {
    return { added: [], skipped: [], conflicts: [], error: err.message };
  }

  const rawEntities = extracted.entities || [];
  const rawRelations = extracted.relations || [];

  // Filter by confidence
  const highConfEntities = rawEntities.filter(e => e.confidence >= minConfidence);
  const highConfRelations = rawRelations.filter(r => r.confidence >= minConfidence);

  // Load current graph
  const { entities: existingEntities, relations: existingRelations } = loadGraph();

  const added = [];
  const skipped = [];
  const conflicts = [];
  const newItems = [];
  const nameToId = {};

  // Build name lookup
  for (const e of existingEntities) {
    nameToId[e.name.toLowerCase()] = e.id;
  }

  // Process entities
  for (const e of highConfEntities) {
    const key = e.name.toLowerCase();
    const existing = existingEntities.find(ex => ex.name.toLowerCase() === key);

    if (existing) {
      // Check for type conflict
      if (existing.entityType !== e.entityType && e.confidence > 0.7) {
        conflicts.push({
          entity: e.name,
          field: 'entityType',
          old: existing.entityType,
          new: e.entityType,
          confidence: e.confidence
        });
      }
      skipped.push(e.name);
      nameToId[key] = existing.id;
    } else {
      const id = randomUUID();
      nameToId[key] = id;
      const newEntity = {
        type: 'entity',
        entityType: e.entityType,
        name: e.name,
        id,
        metadata: e.metadata || {},
        createdAt: new Date().toISOString(),
        context: e.context || '',
        confidence: e.confidence,
        lastMentioned: new Date().toISOString()
      };
      newItems.push(newEntity);
      added.push(e.name);
    }
  }

  // Process relations — also detect conflicts
  for (const r of highConfRelations) {
    const fromId = nameToId[r.from.toLowerCase()];
    const toId = nameToId[r.to.toLowerCase()];

    if (!fromId || !toId) {
      skipped.push(`relation:${r.from}->${r.relation}->${r.to} (entity not found)`);
      continue;
    }

    // Check for conflicting relations
    const conflictingRelations = existingRelations.filter(
      ex => ex.from === fromId && ex.relation === r.relation && ex.to !== toId
    );

    for (const cr of conflictingRelations) {
      // Find entity names for conflict report
      const oldTarget = existingEntities.find(e => e.id === cr.to);
      const newTarget = existingEntities.find(e => e.id === toId) ||
                        newItems.find(e => e.id === toId);
      conflicts.push({
        entity: r.from,
        field: r.relation,
        old: oldTarget?.name || cr.to,
        new: newTarget?.name || r.to,
        confidence: r.confidence
      });
    }

    // Check duplicate
    const duplicate = existingRelations.find(
      ex => ex.from === fromId && ex.relation === r.relation && ex.to === toId
    );
    if (duplicate) {
      skipped.push(`relation:${r.from}->${r.relation}->${r.to}`);
      continue;
    }

    const newRelation = {
      type: 'relation',
      id: randomUUID(),
      from: fromId,
      relation: r.relation,
      to: toId,
      confidence: r.confidence,
      createdAt: new Date().toISOString()
    };
    newItems.push(newRelation);
    added.push(`${r.from}->${r.relation}->${r.to}`);
  }

  if (newItems.length > 0) {
    appendToGraph(newItems);
  }

  return { added, skipped, conflicts };
}

// ─── Confidence Decay ─────────────────────────────────────────────────────────

export async function decayConfidence() {
  const { entities, relations } = loadGraph();
  const now = new Date();
  let decayed = 0;
  let flaggedStale = 0;

  const updatedEntities = entities.map(entity => {
    const created = new Date(entity.createdAt || now);
    const lastMentioned = entity.lastMentioned ? new Date(entity.lastMentioned) : created;
    const daysSinceMention = (now - lastMentioned) / (1000 * 60 * 60 * 24);

    let newConfidence = entity.confidence ?? 1.0;
    let changed = false;

    if (daysSinceMention > 90) {
      newConfidence -= 0.2;
      changed = true;
    } else if (daysSinceMention > 30) {
      newConfidence -= 0.1;
      changed = true;
    }

    if (!changed) return entity;

    newConfidence = Math.max(0, Math.round(newConfidence * 100) / 100);
    decayed++;

    const updated = { ...entity, confidence: newConfidence };
    if (newConfidence < 0.3) {
      updated.stale = true;
      flaggedStale++;
    }

    return updated;
  });

  rewriteGraph(updatedEntities, relations);

  return { decayed, flaggedStale, total: entities.length };
}

// ─── CLI ──────────────────────────────────────────────────────────────────────

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [,, command, ...args] = process.argv;

  if (command === 'extract') {
    const text = args.join(' ');
    if (!text) {
      console.error('Usage: node ontology-realtime.mjs extract "<text>"');
      process.exit(1);
    }
    if (!process.env.GOOGLE_API_KEY) {
      console.error('Error: GOOGLE_API_KEY not set');
      process.exit(1);
    }
    console.log('🔍 Extracting entities from:', text.slice(0, 80) + '...');
    const result = await extractFromConversation(text);
    console.log('\n✅ Result:');
    console.log('  Added:', result.added.length ? result.added.join(', ') : '(none)');
    console.log('  Skipped:', result.skipped.length ? result.skipped.join(', ') : '(none)');
    if (result.conflicts.length) {
      console.log('  ⚠️  Conflicts:');
      for (const c of result.conflicts) {
        console.log(`    - ${c.entity}.${c.field}: "${c.old}" → "${c.new}" (confidence: ${c.confidence})`);
      }
    }
    if (result.error) console.error('  Error:', result.error);

  } else if (command === 'decay') {
    console.log('⏳ Running confidence decay...');
    const result = await decayConfidence();
    console.log(`✅ Done: ${result.decayed} entities decayed, ${result.flaggedStale} flagged stale (total: ${result.total})`);

  } else {
    console.log('Usage:');
    console.log('  node ontology-realtime.mjs extract "<conversation text>"');
    console.log('  node ontology-realtime.mjs decay');
    process.exit(1);
  }
}
