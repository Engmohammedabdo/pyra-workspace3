/**
 * Bayra Memory System — Auto Fact Extraction (Upgrade 2)
 * 
 * Extracts facts from conversations, detects conflicts with existing memories,
 * and auto-supersedes outdated facts.
 * 
 * Core Functions:
 *   extractFacts(messages) → [{content, type, importance, entities, tags}]
 *   detectConflicts(db, newFact) → {hasConflict, oldMemory, similarity}
 *   autoIngestFacts(db, messages, options) → {extracted, ingested, superseded, skipped}
 *   resolveEntity(db, name, type) → entity
 */

import { readFileSync } from 'node:fs';
import OpenAI from 'openai';
import {
  embed, embedWithRetry, embeddingToBuffer, bufferToEmbedding,
  cosineSimilarity,
} from './embeddings.mjs';
import {
  createMemory, findEntity, createEntity,
  linkMemoryEntity, createRelation, supersedeMemory, getMemory,
} from './db.mjs';

// ─── API Key Resolution ───────────────────────────────────────────────

function resolveApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const env = readFileSync('/home/node/.openclaw/credentials/pyra-voice.env', 'utf8');
    const m = env.match(/^OPENAI_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  throw new Error('OPENAI_API_KEY not found');
}

const openai = new OpenAI({ apiKey: resolveApiKey() });

// ─── Trivial Message Filter ──────────────────────────────────────────

const TRIVIAL_PATTERNS = [
  /^(أهلاً?|مرحبا|السلام عليكم|وعليكم السلام|هلا|هاي|hi|hello|hey)\s*!?\.?$/i,
  /^(تمام|أوك|أوكي|ok|okay|sure|yep|yeah|yes|نعم|أيوا|إيه|ماشي|حاضر|خلاص)\s*!?\.?$/i,
  /^(شكراً?|ثانكس|thanks|thank you|مشكور)\s*!?\.?$/i,
  /^(باي|مع السلامة|bye|goodbye|see you)\s*!?\.?$/i,
  /^(good|great|nice|cool|حلو|ممتاز|رائع|جميل)\s*!?\.?$/i,
  /^[\p{Emoji}\s]+$/u,  // emoji-only messages
  /^.{0,5}$/,           // very short messages (5 chars or less)
];

/**
 * Check if a message is trivial (greeting, filler, etc.)
 */
export function isTrivialMessage(text) {
  if (!text || typeof text !== 'string') return true;
  const trimmed = text.trim();
  if (!trimmed) return true;
  return TRIVIAL_PATTERNS.some(p => p.test(trimmed));
}

// ─── Conversation Extraction Prompt ──────────────────────────────────

const CONVERSATION_EXTRACTION_PROMPT = `You are a fact extraction system for a business assistant's memory.
Given conversation messages, extract ONLY important facts, decisions, and changes worth remembering long-term.

For each fact, return:
- content: A concise, standalone statement of the fact (understandable without context)
- type: "semantic" (fact/preference/decision/price) or "episodic" (event) or "procedural" (workflow/how-to)
- subtype: more specific (fact, preference, decision, price_change, migration, tool_setup, etc.)
- importance: 1-10 (10=critical business decision, 1=trivial)
- entities: [{name, type}] — people, projects, tools, companies mentioned
- tags: relevant keywords for search

Rules:
- SKIP greetings, filler, acknowledgments ("ok", "تمام", "thanks", "أهلاً")
- Each fact must be STANDALONE — understandable without the conversation
- Prefer semantic facts over episodic events
- Capture price changes, tool migrations, decisions, new projects
- Be concise but complete — include numbers, names, specifics
- If a message contains a change (old → new), mention BOTH values clearly: "X changed from OLD to NEW"
- For prices/numbers, ALWAYS include the specific numbers
- For migrations/changes, state what changed and to what
- Return valid JSON

Return: { "facts": [{ content, type, subtype, importance, entities: [{name, type}], tags: [] }] }
If no meaningful facts found, return: { "facts": [] }`;

// ─── Conflict Detection Prompt ───────────────────────────────────────

const CONFLICT_CHECK_PROMPT = `You are a fact conflict detector for a business memory system. Given an OLD fact and a NEW fact, determine if the new fact UPDATES or REPLACES the old one.

CONFLICT = YES when:
- Both facts are about the SAME subject (person, service, tool, price, company, setting)
- But contain DIFFERENT values, numbers, states, or status
- Examples: price changed, tool migrated, name changed, status changed, location moved

CONFLICT = NO when:
- Facts are about COMPLETELY different subjects
- Facts are complementary (both can be true at the same time)
- New fact adds detail without contradicting old fact

IMPORTANT: Focus on the SUBJECT/TOPIC, not the exact wording. These are conflicts:
- "WhatsApp service costs 5000 AED" vs "WhatsApp bot price is 8000 dirhams" → YES (same service, different price)
- "Company name is Pyramedia Marketing" vs "Pyramedia rebranded to Pyramedia AI Solutions" → YES (same company, different name)
- "Email hosted on Bluehost" vs "Migrated email to Zoho" → YES (same service, different provider)

Respond with JSON only:
{ "conflict": true/false, "reason": "brief explanation" }`;

// ─── Core: Extract Facts ─────────────────────────────────────────────

/**
 * Extract facts from conversation messages.
 * Filters trivial messages before sending to LLM.
 * 
 * @param {Array<{role: string, content: string}>} messages 
 * @param {object} options
 * @returns {Promise<Array<{content, type, subtype, importance, entities, tags}>>}
 */
export async function extractFacts(messages, options = {}) {
  const { model = 'gpt-4o-mini' } = options;

  // Filter out trivial messages
  const meaningful = messages.filter(m => !isTrivialMessage(m.content));
  
  if (meaningful.length === 0) {
    return [];
  }

  const conversationText = meaningful
    .map(m => `${m.role || 'user'}: ${m.content}`)
    .join('\n');

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: CONVERSATION_EXTRACTION_PROMPT },
        { role: 'user', content: `Extract facts from this conversation:\n\n${conversationText}` },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    });

    const raw = response.choices[0]?.message?.content;
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    const facts = parsed.facts || parsed.memories || parsed;
    if (!Array.isArray(facts)) return [];

    return facts.filter(f => f && f.content && f.type).map(f => ({
      content: f.content,
      type: f.type,
      subtype: f.subtype || null,
      importance: Math.min(10, Math.max(1, Number(f.importance) || 5)),
      entities: Array.isArray(f.entities) ? f.entities : [],
      tags: Array.isArray(f.tags) ? f.tags : [],
    }));
  } catch (err) {
    console.error('[extractFacts] Error:', err.message);
    return [];
  }
}

// ─── Core: Detect Conflicts ──────────────────────────────────────────

/**
 * Find semantically similar memories and check for conflicts using LLM.
 * 
 * @param {import('better-sqlite3').Database} db
 * @param {{content: string, type: string}} newFact 
 * @param {object} options
 * @returns {Promise<{hasConflict: boolean, oldMemory?: object, similarity?: number}>}
 */
export async function detectConflicts(db, newFact, options = {}) {
  const { 
    similarityThreshold = 0.60,
    conflictModel = 'gpt-4o-mini',
    maxCandidates = 10,
  } = options;

  // 1. Generate embedding for the new fact
  const embedding = await embedWithRetry(newFact.content);
  if (!embedding) {
    return { hasConflict: false, reason: 'embedding_failed' };
  }

  // 2. Vector search for similar memories
  let candidates = [];
  try {
    const embBuf = embeddingToBuffer(embedding);
    const rows = db.prepare(`
      SELECT memory_id, distance
      FROM memory_embeddings
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT ?
    `).all(embBuf, maxCandidates);

    for (const row of rows) {
      // sqlite-vec returns L2 distance; convert to cosine similarity approx
      // For normalized vectors: cosine_sim ≈ 1 - (distance² / 2)
      const similarity = 1 - (row.distance * row.distance) / 2;
      if (similarity >= similarityThreshold) {
        const mem = db.prepare(
          "SELECT * FROM memories WHERE id = ? AND status = 'active'"
        ).get(row.memory_id);
        if (mem) {
          candidates.push({ memory: mem, similarity });
        }
      }
    }
  } catch (err) {
    if (!err.message.includes('no rows')) {
      console.warn('[detectConflicts] Vector search error:', err.message);
    }
    return { hasConflict: false, reason: 'vector_search_error' };
  }

  if (candidates.length === 0) {
    return { hasConflict: false };
  }

  // 3. Use LLM to verify conflict for each candidate (highest similarity first)
  candidates.sort((a, b) => b.similarity - a.similarity);

  for (const candidate of candidates) {
    try {
      const response = await openai.chat.completions.create({
        model: conflictModel,
        messages: [
          { role: 'system', content: CONFLICT_CHECK_PROMPT },
          {
            role: 'user',
            content: `Old fact: ${candidate.memory.content}\nNew fact: ${newFact.content}`,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
        max_tokens: 150,
      });

      const raw = response.choices[0]?.message?.content;
      if (!raw) continue;

      const result = JSON.parse(raw);
      if (result.conflict === true) {
        return {
          hasConflict: true,
          oldMemory: candidate.memory,
          similarity: candidate.similarity,
          reason: result.reason,
        };
      }
    } catch (err) {
      console.warn('[detectConflicts] LLM conflict check error:', err.message);
    }
  }

  return { hasConflict: false };
}

// ─── Entity Resolution (Enhanced) ────────────────────────────────────

/**
 * Resolve an entity by name with fuzzy matching and alias support.
 * 
 * @param {import('better-sqlite3').Database} db
 * @param {string} name
 * @param {string} [type]
 * @returns {object|null} Resolved or newly created entity
 */
export function resolveEntity(db, name, type = 'unknown') {
  if (!name || !name.trim()) return null;
  const trimmed = name.trim();

  // 1. Exact match (case-insensitive)
  const exact = findEntity(trimmed);
  if (exact) return exact;

  // 2. Alias match via JSON search (already in findEntity, but let's do extended)
  // findEntity already checks aliases with COLLATE NOCASE

  // 3. Fuzzy match: contains-based search
  const allEntities = db.prepare('SELECT * FROM entities').all();
  
  for (const ent of allEntities) {
    const entName = ent.name.toLowerCase();
    const searchName = trimmed.toLowerCase();
    
    // Check if search name is contained in entity name or vice versa
    if (entName.includes(searchName) || searchName.includes(entName)) {
      return ent;
    }
    
    // Check aliases
    if (ent.aliases) {
      try {
        const aliases = JSON.parse(ent.aliases);
        for (const alias of aliases) {
          const aliasLower = alias.toLowerCase();
          if (aliasLower.includes(searchName) || searchName.includes(aliasLower)) {
            return ent;
          }
        }
      } catch {}
    }

    // Levenshtein-like: check if names share significant overlap
    // "حسين الشامسي" should match "حسين الغزال الشامسي"
    const searchTokens = searchName.split(/\s+/);
    const nameTokens = entName.split(/\s+/);
    
    if (searchTokens.length >= 2 && nameTokens.length >= 2) {
      const matchingTokens = searchTokens.filter(t => 
        nameTokens.some(nt => nt === t || nt.includes(t) || t.includes(nt))
      );
      // If >50% of search tokens match, consider it a match
      if (matchingTokens.length / searchTokens.length > 0.5) {
        return ent;
      }
    }
  }

  // 4. No match found — create new entity
  const entity = createEntity({
    type,
    name: trimmed,
    aliases: JSON.stringify([trimmed]),
  });
  return entity;
}

// ─── Core: Auto-Ingest Facts Pipeline ────────────────────────────────

/**
 * Full pipeline: extract facts from messages, detect conflicts, auto-supersede.
 * 
 * @param {import('better-sqlite3').Database} db
 * @param {Array<{role: string, content: string}>} messages
 * @param {object} options
 * @returns {Promise<{extracted: number, ingested: number, superseded: number, skipped: number, errors: number, details: Array}>}
 */
export async function autoIngestFacts(db, messages, options = {}) {
  const {
    source = 'conversation',
    channel = null,
    session_id = null,
    similarityThreshold = 0.60,
    extractModel = 'gpt-4o-mini',
    conflictModel = 'gpt-4o-mini',
  } = options;

  const result = {
    extracted: 0,
    ingested: 0,
    superseded: 0,
    skipped: 0,
    errors: 0,
    details: [],
  };

  // 1. Extract facts
  const facts = await extractFacts(messages, { model: extractModel });
  result.extracted = facts.length;

  if (facts.length === 0) {
    return result;
  }

  // 2. Process each fact
  for (const fact of facts) {
    try {
      // 2a. Check for conflicts
      const conflict = await detectConflicts(db, fact, {
        similarityThreshold,
        conflictModel,
      });

      // 2b. Generate embedding
      const embedding = await embedWithRetry(fact.content);
      if (!embedding) {
        result.errors++;
        result.details.push({ fact: fact.content, action: 'error', reason: 'embedding_failed' });
        continue;
      }

      // 2c. Create the new memory
      const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
      const tagsStr = [...(fact.tags || []), 'auto-extracted'].join(',');
      
      const newMemory = createMemory({
        type: fact.type,
        subtype: fact.subtype,
        content: fact.content,
        summary: fact.content.length > 100 ? fact.content.substring(0, 97) + '...' : fact.content,
        importance: fact.importance,
        source,
        session_id,
        channel,
        tags: tagsStr,
        valid_from: now,
      });

      // 2d. Store embedding
      const embBuf = embeddingToBuffer(embedding);
      db.prepare(
        'INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)'
      ).run(newMemory.id, embBuf);

      // 2e. If conflict → supersede old memory
      if (conflict.hasConflict && conflict.oldMemory) {
        try {
          supersedeMemory(db, conflict.oldMemory.id, newMemory.id, conflict.reason);
          result.superseded++;
          result.details.push({
            fact: fact.content,
            action: 'superseded',
            oldId: conflict.oldMemory.id,
            oldContent: conflict.oldMemory.content,
            reason: conflict.reason,
          });
        } catch (err) {
          console.warn('[autoIngestFacts] Supersede error:', err.message);
          // Still ingested, just couldn't supersede
          result.ingested++;
          result.details.push({ fact: fact.content, action: 'ingested', note: 'supersede_failed' });
        }
      } else {
        result.ingested++;
        result.details.push({ fact: fact.content, action: 'ingested' });
      }

      // 2f. Resolve and link entities
      for (const ent of fact.entities) {
        try {
          const resolved = resolveEntity(db, ent.name, ent.type || 'unknown');
          if (resolved) {
            linkMemoryEntity(newMemory.id, resolved.id, ent.role || ent.type || null);
          }
        } catch (err) {
          console.warn('[autoIngestFacts] Entity link error:', err.message);
        }
      }
    } catch (err) {
      console.error('[autoIngestFacts] Fact processing error:', err.message);
      result.errors++;
      result.details.push({ fact: fact.content, action: 'error', reason: err.message });
    }
  }

  // 3. Create relations between facts from same batch
  const ingestedIds = result.details
    .filter(d => d.action === 'ingested' || d.action === 'superseded')
    .map(d => d.fact);

  console.log(`[autoIngestFacts] Done: ${result.extracted} extracted, ${result.ingested} ingested, ${result.superseded} superseded, ${result.skipped} skipped, ${result.errors} errors`);

  return result;
}

export { CONVERSATION_EXTRACTION_PROMPT, CONFLICT_CHECK_PROMPT };
