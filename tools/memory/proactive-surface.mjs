#!/usr/bin/env node
/**
 * Proactive Memory Surfacing for Bayra Memory System
 * 
 * Automatically surfaces relevant memories BEFORE being asked.
 * Useful for daily briefs, context-aware suggestions, and temporal triggers.
 */

import { getDb, closeDb, findEntity } from './db.mjs';
import { smartSearch, entitySearch, timeRangeSearch, keywordSearch, recencyScore, decayedImportance } from './search.mjs';

// ─── 1. Surface for Context ──────────────────────────────────

/**
 * Extract key topics/keywords from a context string.
 * Simple but effective: split on common delimiters, filter noise.
 */
function extractTopics(context) {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
    'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
    'should', 'may', 'might', 'shall', 'can', 'to', 'of', 'in', 'for',
    'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during',
    'before', 'after', 'above', 'below', 'between', 'out', 'off', 'over',
    'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
    'where', 'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most',
    'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same',
    'so', 'than', 'too', 'very', 'just', 'about', 'and', 'but', 'or',
    'if', 'while', 'this', 'that', 'these', 'those', 'it', 'its',
    "we're", 'working', 'work', 'project', 'need', 'want', 'get',
    'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'she', 'they',
  ]);

  const words = context
    .replace(/[^\w\s\u0600-\u06FF]/g, ' ')  // Keep Arabic + alphanumeric
    .split(/\s+/)
    .filter(w => w.length > 2 && !stopWords.has(w.toLowerCase()));

  // Also extract multi-word phrases (bigrams) for better search
  const tokens = context.split(/\s+/).filter(w => w.length > 1);
  const bigrams = [];
  for (let i = 0; i < tokens.length - 1; i++) {
    const pair = `${tokens[i]} ${tokens[i + 1]}`;
    if (pair.length > 5) bigrams.push(pair);
  }

  return { words: [...new Set(words)], phrases: bigrams.slice(0, 5) };
}

/**
 * Surface relevant memories based on current conversational context.
 */
export async function surfaceForContext(currentContext, limit = 5) {
  const db = getDb();

  // 1. Direct semantic search on the full context
  const semanticResults = await smartSearch(db, currentContext, { limit: limit * 2 });

  // 2. Extract topics and search for each
  const { words, phrases } = extractTopics(currentContext);
  const topicResults = [];

  // Search key phrases
  for (const phrase of phrases.slice(0, 3)) {
    const results = keywordSearch(db, phrase, { limit: 5 });
    topicResults.push(...results);
  }

  // Search individual important words
  for (const word of words.slice(0, 5)) {
    const results = keywordSearch(db, word, { limit: 3 });
    topicResults.push(...results);
  }

  // 3. Deduplicate and merge
  const seen = new Set();
  const contextLower = currentContext.toLowerCase();
  const allResults = [];

  for (const r of [...semanticResults, ...topicResults]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);

    // Filter out memories whose content is already in the current context
    if (contextLower.includes(r.content.toLowerCase().slice(0, 50))) continue;

    // Score: combine RRF score (if available) with importance and recency
    const relevance = r.finalScore || r.rrfScore || 0.5;
    const recency = recencyScore(r.last_accessed_at || r.created_at);
    const importance = (r.importance || 5) / 10;
    const score = relevance * 0.5 + importance * 0.3 + recency * 0.2;

    allResults.push({ ...r, surfaceScore: score });
  }

  // Sort by surface score
  allResults.sort((a, b) => b.surfaceScore - a.surfaceScore);
  return allResults.slice(0, limit);
}

// ─── 2. Temporal Triggers ────────────────────────────────────

/**
 * Find time-sensitive memories: expiring soon, anniversaries, follow-ups.
 */
export function surfaceTemporalTriggers(now = new Date()) {
  const db = getDb();
  const nowISO = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
  const yesterdayISO = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');

  // 1. Expiring memories (valid_until within next 7 days)
  let expiring = [];
  try {
    expiring = db.prepare(`
      SELECT * FROM memories 
      WHERE status = 'active' 
        AND valid_until IS NOT NULL 
        AND valid_until > ? 
        AND valid_until <= ?
      ORDER BY valid_until ASC
      LIMIT 20
    `).all(nowISO, weekFromNow);
  } catch {}

  // 2. Already expired (valid_until in last 24h — might need attention)
  let recentlyExpired = [];
  try {
    recentlyExpired = db.prepare(`
      SELECT * FROM memories 
      WHERE status = 'active' 
        AND valid_until IS NOT NULL 
        AND valid_until <= ? 
        AND valid_until > ?
      ORDER BY valid_until DESC
      LIMIT 10
    `).all(nowISO, yesterdayISO);
  } catch {}

  // 3. Follow-ups: memories tagged with follow-up related tags
  let followUps = [];
  try {
    followUps = db.prepare(`
      SELECT * FROM memories 
      WHERE status = 'active' 
        AND (tags LIKE '%follow%' OR tags LIKE '%todo%' OR tags LIKE '%reminder%' OR tags LIKE '%متابعة%')
      ORDER BY importance DESC, created_at DESC
      LIMIT 20
    `).all();
  } catch {}

  // 4. Anniversaries: memories created around this date in previous years
  const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  let anniversaries = [];
  try {
    anniversaries = db.prepare(`
      SELECT *, substr(created_at, 6, 5) as month_day
      FROM memories 
      WHERE status = 'active' 
        AND substr(created_at, 6, 5) = ?
        AND substr(created_at, 1, 4) != ?
        AND importance >= 6
      ORDER BY importance DESC
      LIMIT 10
    `).all(monthDay, String(now.getFullYear()));
  } catch {}

  return { expiring, recentlyExpired, followUps, anniversaries };
}

// ─── 3. Surface for Entity ───────────────────────────────────

/**
 * Get all memories about an entity + related entities (1-hop).
 */
export function surfaceForEntity(entityName) {
  const db = getDb();

  // Find the entity
  const entity = findEntity(entityName);
  if (!entity) {
    // Fallback: keyword search for the entity name
    const results = keywordSearch(db, entityName, { limit: 20 });
    return {
      entity: null,
      memories: results.map(r => ({ ...r, relevanceScore: decayedImportance(r) }))
        .sort((a, b) => b.relevanceScore - a.relevanceScore),
      relatedEntities: [],
    };
  }

  // Get directly linked memories
  const memories = entitySearch(db, entityName, { limit: 50 });

  // Get related entities (1-hop via shared memories)
  let relatedEntities = [];
  try {
    relatedEntities = db.prepare(`
      SELECT DISTINCT e.id, e.name, e.type, COUNT(*) as shared_memories
      FROM memory_entities me1
      JOIN memory_entities me2 ON me1.memory_id = me2.memory_id AND me1.entity_id != me2.entity_id
      JOIN entities e ON e.id = me2.entity_id
      WHERE me1.entity_id = ?
      GROUP BY e.id
      ORDER BY shared_memories DESC
      LIMIT 10
    `).all(entity.id);
  } catch {}

  // Score and sort memories
  const scored = memories.map(m => ({
    ...m,
    relevanceScore: decayedImportance(m),
  })).sort((a, b) => b.relevanceScore - a.relevanceScore);

  return { entity, memories: scored, relatedEntities };
}

// ─── 4. Surface for Project ──────────────────────────────────

/**
 * Get all memories related to a project name.
 */
export async function surfaceForProject(projectName) {
  const db = getDb();

  // Semantic search for the project
  const semanticResults = await smartSearch(db, projectName, { limit: 20 });

  // Keyword search
  const keywordResults = keywordSearch(db, projectName, { limit: 20 });

  // Entity search
  const entityResults = entitySearch(db, projectName, { limit: 20 });

  // Merge and deduplicate
  const seen = new Set();
  const allResults = [];

  for (const r of [...semanticResults, ...keywordResults, ...entityResults]) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    allResults.push({
      ...r,
      relevanceScore: decayedImportance(r),
    });
  }

  allResults.sort((a, b) => b.relevanceScore - a.relevanceScore);

  // Get entities mentioned in these memories
  const memoryIds = allResults.slice(0, 20).map(m => m.id);
  let relatedEntities = [];
  if (memoryIds.length > 0) {
    try {
      const placeholders = memoryIds.map(() => '?').join(',');
      relatedEntities = db.prepare(`
        SELECT DISTINCT e.id, e.name, e.type, COUNT(*) as mentions
        FROM memory_entities me
        JOIN entities e ON e.id = me.entity_id
        WHERE me.memory_id IN (${placeholders})
        GROUP BY e.id
        ORDER BY mentions DESC
        LIMIT 10
      `).all(...memoryIds);
    } catch {}
  }

  return { project: projectName, memories: allResults, relatedEntities };
}

// ─── 5. Daily Brief ──────────────────────────────────────────

/**
 * Generate a morning context package.
 */
export async function dailyBrief(now = new Date()) {
  const db = getDb();

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const yesterdayStart = new Date(todayStart.getTime() - 24 * 60 * 60 * 1000);

  // 1. What happened yesterday
  const yesterday = timeRangeSearch(db, yesterdayStart.toISOString(), todayStart.toISOString(), { limit: 20 });

  // 2. What happened today so far
  const today = timeRangeSearch(db, todayStart.toISOString(), now.toISOString(), { limit: 10 });

  // 3. Temporal triggers
  const temporal = surfaceTemporalTriggers(now);

  // 4. Recently active entities
  let activeEntities = [];
  try {
    activeEntities = db.prepare(`
      SELECT e.id, e.name, e.type, COUNT(*) as recent_mentions, 
             MAX(m.created_at) as last_mentioned
      FROM memory_entities me
      JOIN entities e ON e.id = me.entity_id
      JOIN memories m ON m.id = me.memory_id
      WHERE m.created_at > ?
        AND m.status = 'active'
      GROUP BY e.id
      ORDER BY recent_mentions DESC
      LIMIT 10
    `).all(yesterdayStart.toISOString());
  } catch {}

  // 5. High-importance recent memories
  let important = [];
  try {
    important = db.prepare(`
      SELECT * FROM memories 
      WHERE status = 'active' 
        AND importance >= 8
        AND created_at > ?
      ORDER BY importance DESC, created_at DESC
      LIMIT 5
    `).all(yesterdayStart.toISOString());
  } catch {}

  // 6. Unfinished business (tasks, follow-ups)
  let tasks = [];
  try {
    tasks = db.prepare(`
      SELECT * FROM memories 
      WHERE status = 'active'
        AND (tags LIKE '%task%' OR tags LIKE '%todo%' OR tags LIKE '%follow%' OR tags LIKE '%pending%' OR subtype = 'task')
        AND importance >= 5
      ORDER BY importance DESC, created_at DESC
      LIMIT 10
    `).all();
  } catch {}

  return {
    date: now.toISOString().split('T')[0],
    yesterday: yesterday.slice(0, 10),
    today,
    temporal,
    activeEntities,
    important,
    tasks,
  };
}

// ─── CLI ─────────────────────────────────────────────────────

function formatMemory(m, i) {
  const age = m.created_at ? timeSince(new Date(m.created_at)) : 'unknown';
  return `  ${i + 1}. [${m.type}${m.subtype ? '/' + m.subtype : ''}] ${m.content.slice(0, 120)}${m.content.length > 120 ? '...' : ''}
     Importance: ${m.importance} | ${age} ago${m.tags ? ' | Tags: ' + m.tags : ''}`;
}

function timeSince(date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'context': {
        const context = args.slice(1).join(' ');
        if (!context) { console.error('Usage: context <text>'); break; }
        console.log(`\n🧠 Surfacing memories for: "${context}"\n`);
        const results = await surfaceForContext(context);
        if (results.length === 0) {
          console.log('  No relevant memories found.');
        } else {
          results.forEach((r, i) => console.log(formatMemory(r, i)));
        }
        break;
      }

      case 'temporal': {
        console.log('\n⏰ Temporal Triggers\n');
        const { expiring, recentlyExpired, followUps, anniversaries } = surfaceTemporalTriggers();

        console.log(`── Expiring Soon (${expiring.length}) ──`);
        if (expiring.length === 0) console.log('  None');
        expiring.forEach((r, i) => {
          console.log(`  ${i + 1}. [expires ${r.valid_until}] ${r.content.slice(0, 100)}`);
        });

        console.log(`\n── Recently Expired (${recentlyExpired.length}) ──`);
        if (recentlyExpired.length === 0) console.log('  None');
        recentlyExpired.forEach((r, i) => {
          console.log(`  ${i + 1}. [expired ${r.valid_until}] ${r.content.slice(0, 100)}`);
        });

        console.log(`\n── Follow-ups / Tasks (${followUps.length}) ──`);
        if (followUps.length === 0) console.log('  None');
        followUps.forEach((r, i) => console.log(formatMemory(r, i)));

        console.log(`\n── Anniversaries (${anniversaries.length}) ──`);
        if (anniversaries.length === 0) console.log('  None');
        anniversaries.forEach((r, i) => {
          console.log(`  ${i + 1}. [${r.created_at.split('T')[0]}] ${r.content.slice(0, 100)}`);
        });
        break;
      }

      case 'entity': {
        const name = args.slice(1).join(' ');
        if (!name) { console.error('Usage: entity <name>'); break; }
        console.log(`\n👤 Memories about: "${name}"\n`);
        const { entity, memories, relatedEntities } = surfaceForEntity(name);

        if (entity) {
          console.log(`  Entity: ${entity.name} (${entity.type})`);
          if (entity.aliases) console.log(`  Aliases: ${entity.aliases}`);
          console.log();
        }

        console.log(`── Memories (${memories.length}) ──`);
        memories.slice(0, 15).forEach((r, i) => console.log(formatMemory(r, i)));

        if (relatedEntities.length > 0) {
          console.log(`\n── Related Entities ──`);
          relatedEntities.forEach(e => {
            console.log(`  • ${e.name} (${e.type}) — ${e.shared_memories} shared memories`);
          });
        }
        break;
      }

      case 'project': {
        const name = args.slice(1).join(' ');
        if (!name) { console.error('Usage: project <name>'); break; }
        console.log(`\n📂 Project: "${name}"\n`);
        const { memories, relatedEntities } = await surfaceForProject(name);

        console.log(`── Memories (${memories.length}) ──`);
        memories.slice(0, 15).forEach((r, i) => console.log(formatMemory(r, i)));

        if (relatedEntities.length > 0) {
          console.log(`\n── Related Entities ──`);
          relatedEntities.forEach(e => {
            console.log(`  • ${e.name} (${e.type}) — ${e.mentions} mentions`);
          });
        }
        break;
      }

      case 'brief': {
        console.log('\n📋 Daily Brief\n');
        const brief = await dailyBrief();
        console.log(`Date: ${brief.date}\n`);

        console.log(`── Today (${brief.today.length}) ──`);
        if (brief.today.length === 0) console.log('  Nothing yet.');
        brief.today.slice(0, 5).forEach((r, i) => console.log(formatMemory(r, i)));

        console.log(`\n── Yesterday (${brief.yesterday.length}) ──`);
        if (brief.yesterday.length === 0) console.log('  Nothing recorded.');
        brief.yesterday.slice(0, 5).forEach((r, i) => console.log(formatMemory(r, i)));

        console.log(`\n── High Importance (${brief.important.length}) ──`);
        brief.important.forEach((r, i) => console.log(formatMemory(r, i)));

        console.log(`\n── Tasks / Follow-ups (${brief.tasks.length}) ──`);
        if (brief.tasks.length === 0) console.log('  None pending.');
        brief.tasks.slice(0, 5).forEach((r, i) => console.log(formatMemory(r, i)));

        const { expiring, followUps } = brief.temporal;
        if (expiring.length > 0) {
          console.log(`\n── Expiring Soon (${expiring.length}) ──`);
          expiring.slice(0, 3).forEach((r, i) => {
            console.log(`  ${i + 1}. [expires ${r.valid_until}] ${r.content.slice(0, 100)}`);
          });
        }

        if (brief.activeEntities.length > 0) {
          console.log(`\n── Active Entities ──`);
          brief.activeEntities.forEach(e => {
            console.log(`  • ${e.name} (${e.type}) — ${e.recent_mentions} mentions`);
          });
        }
        break;
      }

      default:
        console.log(`Usage:
  node proactive-surface.mjs context <text>    # Surface memories for context
  node proactive-surface.mjs temporal           # Time-sensitive memories
  node proactive-surface.mjs entity <name>      # All memories about entity
  node proactive-surface.mjs project <name>     # Project-related memories
  node proactive-surface.mjs brief              # Daily morning brief`);
    }
  } catch (e) {
    console.error('Error:', e.message);
    if (process.env.DEBUG) console.error(e.stack);
  } finally {
    closeDb();
  }
}

main();
