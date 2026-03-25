/**
 * Bayra Memory System — Phase 4: Ingestion Pipeline
 * LLM-powered memory extraction, deduplication, and ingestion.
 */

import { readFileSync } from 'node:fs';
import {
  embed, embedWithRetry, embeddingToBuffer, bufferToEmbedding,
  cosineSimilarity, textHash, setCacheDb, openai as sharedOpenai,
} from './embeddings.mjs';
import {
  getDb, createMemory, updateMemory, getMemory,
  createEntity, findEntity, linkMemoryEntity, createRelation,
} from './db.mjs';

// Use shared OpenAI client from embeddings.mjs
const openai = sharedOpenai;

// ─── LLM Extraction Prompt ───────────────────────────────────────────

export const EXTRACTION_SYSTEM_PROMPT = `You are a memory extraction system. Given a conversation or text, extract key memories worth remembering.

For each memory, return:
- content: A concise, standalone statement of the fact/event/decision
- type: "episodic" (event/conversation), "semantic" (fact/preference/decision), or "procedural" (workflow/how-to)
- subtype: more specific category (fact, preference, decision, conversation, workflow, etc.)
- importance: 1-10 (10=critical, 1=trivial)
- entities: [{name, type}] — people, projects, tools, companies mentioned
- tags: relevant keywords for search

Rules:
- Each memory should be a STANDALONE statement (understandable without context)
- Skip greetings, filler ("ok", "thanks", "got it"), and trivial messages
- Prefer semantic memories (facts/decisions) over episodic (conversations)
- Be concise but complete
- Return valid JSON

Return JSON object: { "memories": [{ content, type, subtype, importance, entities: [{name, type}], tags: [] }] }`;

// ─── Sensitive Data Filters ──────────────────────────────────────────

const SENSITIVE_PATTERNS = [
  // API keys
  /sk-[A-Za-z0-9_-]{20,}/g,
  /ghp_[A-Za-z0-9]{36,}/g,
  /gho_[A-Za-z0-9]{36,}/g,
  /glpat-[A-Za-z0-9_-]{20,}/g,
  /xoxb-[A-Za-z0-9-]+/g,
  /xoxp-[A-Za-z0-9-]+/g,
  // Bearer tokens
  /Bearer\s+[A-Za-z0-9._\-\/+=]{20,}/g,
  // Generic API key patterns
  /(?:api[_-]?key|apikey|api[_-]?secret|secret[_-]?key)\s*[=:]\s*['"]?[A-Za-z0-9_\-./+=]{16,}['"]?/gi,
  // Passwords in config
  /(?:password|passwd|pwd)\s*[=:]\s*['"]?[^\s'"]{6,}['"]?/gi,
  // AWS keys
  /AKIA[A-Z0-9]{16}/g,
  // Credit card patterns (basic)
  /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13})\b/g,
  // Private keys
  /-----BEGIN (?:RSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA )?PRIVATE KEY-----/g,
  // JWT tokens
  /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_\-+/=]{10,}/g,
];

export function sanitizeContent(content) {
  let sanitized = content;
  for (const pattern of SENSITIVE_PATTERNS) {
    // Reset regex lastIndex for global patterns
    pattern.lastIndex = 0;
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  }
  return sanitized;
}

export function isSensitive(content) {
  for (const pattern of SENSITIVE_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(content)) return true;
  }
  return false;
}

// ─── Memory Extraction ───────────────────────────────────────────────

export async function extractMemories(messages, options = {}) {
  const { model = 'gpt-4o-mini' } = options;

  const conversationText = messages
    .map(m => `${m.role}: ${m.content}`)
    .join('\n');

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: `Extract memories from this conversation:\n\n${conversationText}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const memories = parsed.memories || parsed;
    if (!Array.isArray(memories)) return [];
    // Validate each memory has required fields
    return memories.filter(m => m && m.content && m.type).map(m => ({
      content: m.content,
      type: m.type,
      subtype: m.subtype || null,
      importance: Math.min(10, Math.max(1, Number(m.importance) || 5)),
      entities: Array.isArray(m.entities) ? m.entities : [],
      tags: Array.isArray(m.tags) ? m.tags : [],
    }));
  } catch (err) {
    console.error('[extractMemories] JSON parse error:', err.message);
    console.error('[extractMemories] Raw response:', raw?.substring(0, 500));
    return [];
  }
}

export async function extractFromText(text, source = 'manual', options = {}) {
  const { model = 'gpt-4o-mini' } = options;

  const response = await openai.chat.completions.create({
    model,
    messages: [
      { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
      { role: 'user', content: `Extract memories from this text:\n\n${text}` },
    ],
    response_format: { type: 'json_object' },
    temperature: 0.3,
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw);
    const memories = parsed.memories || parsed;
    if (!Array.isArray(memories)) return [];
    return memories.filter(m => m && m.content && m.type).map(m => ({
      content: m.content,
      type: m.type,
      subtype: m.subtype || null,
      importance: Math.min(10, Math.max(1, Number(m.importance) || 5)),
      entities: Array.isArray(m.entities) ? m.entities : [],
      tags: Array.isArray(m.tags) ? m.tags : [],
      source,
    }));
  } catch (err) {
    console.error('[extractFromText] JSON parse error:', err.message);
    return [];
  }
}

// ─── Confidence Management ───────────────────────────────────────────

/**
 * Decrease confidence for a memory (e.g., when contradicted or corrected).
 * @param {object} db - Database instance
 * @param {string} memoryId - Memory to downgrade
 * @param {number} penalty - How much to reduce (default 0.2)
 * @param {string} reason - Why confidence was reduced
 * @returns {object|null} Updated memory or null
 */
export function decreaseConfidence(db, memoryId, penalty = 0.2, reason = 'contradiction') {
  const memory = getMemory(memoryId);
  if (!memory) return null;

  const currentConfidence = memory.confidence ?? 1.0;
  const newConfidence = Math.max(0.0, currentConfidence - penalty);

  const metadata = memory.metadata ? JSON.parse(memory.metadata) : {};
  if (!metadata.confidenceLog) metadata.confidenceLog = [];
  metadata.confidenceLog.push({
    action: 'decrease',
    from: currentConfidence,
    to: newConfidence,
    reason,
    at: new Date().toISOString(),
  });

  const updated = updateMemory(memoryId, {
    confidence: newConfidence,
    metadata: JSON.stringify(metadata),
  });

  console.log(`[confidence] ${memoryId}: ${currentConfidence.toFixed(2)} → ${newConfidence.toFixed(2)} (${reason})`);
  return updated;
}

// ─── Text Similarity (word overlap) ──────────────────────────────────

/**
 * Simple word-overlap similarity (Jaccard-like).
 * Returns 0-1 score. Fast, no LLM/embedding needed.
 */
function textSimilarity(a, b) {
  if (!a || !b) return 0;
  const wordsA = new Set(a.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  const wordsB = new Set(b.toLowerCase().split(/\s+/).filter(w => w.length > 2));
  if (wordsA.size === 0 || wordsB.size === 0) return 0;
  let intersection = 0;
  for (const w of wordsA) { if (wordsB.has(w)) intersection++; }
  return intersection / Math.max(wordsA.size, wordsB.size);
}

// ─── Deduplication ───────────────────────────────────────────────────

export async function findDuplicate(db, content, embedding, threshold = 0.92) {
  // 1. Check exact content match
  const exact = db.prepare(
    "SELECT * FROM memories WHERE content = ? AND status != 'deleted' LIMIT 1"
  ).get(content);
  if (exact) {
    return { isDuplicate: true, existingMemory: exact, similarity: 1.0 };
  }

  // 2. Vector similarity search
  try {
    const embBuf = embeddingToBuffer(embedding);
    const rows = db.prepare(`
      SELECT memory_id, distance
      FROM memory_embeddings
      WHERE embedding MATCH ?
      ORDER BY distance
      LIMIT 5
    `).all(embBuf);

    for (const row of rows) {
      // sqlite-vec returns L2 distance; convert to cosine similarity approx
      // For normalized vectors: cosine_sim ≈ 1 - (distance² / 2)
      const similarity = 1 - (row.distance * row.distance) / 2;
      if (similarity >= threshold) {
        const existingMemory = getMemory(row.memory_id);
        if (existingMemory && existingMemory.status !== 'deleted') {
          return { isDuplicate: true, existingMemory, similarity };
        }
      }
    }
  } catch (err) {
    // Vector table might be empty
    if (!err.message.includes('no rows')) {
      console.warn('[findDuplicate] Vector search error:', err.message);
    }
  }

  return { isDuplicate: false };
}

// ─── Entity Resolution ───────────────────────────────────────────────

function resolveEntity(db, extractedEntity) {
  const { name, type } = extractedEntity;
  if (!name) return null;

  // Try finding existing entity
  const existing = findEntity(name);
  if (existing) return existing;

  // Create new entity
  const entity = createEntity({
    type: type || 'unknown',
    name,
    aliases: JSON.stringify([name]),
  });
  return entity;
}

// ─── Store Embedding in vec0 ─────────────────────────────────────────

function storeEmbedding(db, memoryId, embedding) {
  const embBuf = embeddingToBuffer(embedding);
  db.prepare(
    'INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)'
  ).run(memoryId, embBuf);
}

// ─── Summary Generation ──────────────────────────────────────────────

async function generateSummary(content) {
  if (content.length <= 200) return content.substring(0, 100);
  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Summarize in one concise sentence (max 100 chars). Arabic or English based on input language.' },
        { role: 'user', content }
      ],
      max_tokens: 60,
      temperature: 0,
    });
    return response.choices[0]?.message?.content?.trim() || content.substring(0, 100);
  } catch { return content.substring(0, 100); }
}

// ─── Full Ingestion Pipeline ─────────────────────────────────────────

export async function ingestMemory(db, content, options = {}) {
  const {
    type = 'semantic',
    subtype = null,
    importance = 5,
    entities = [],
    tags = [],
    source = null,
    session_id = null,
    channel = null,
    duplicateThreshold = 0.85,
  } = options;

  // 0. Source-based dedup: skip if same source already ingested similar content
  if (source) {
    const sourceExisting = db.prepare(
      "SELECT id, content FROM memories WHERE source = ? AND status != 'deleted'"
    ).all(source);
    for (const existing of sourceExisting) {
      // Simple text overlap check (normalized)
      const overlap = textSimilarity(content.trim(), existing.content.trim());
      if (overlap > 0.7) {
        return { action: 'skipped', reason: 'source_duplicate', existingId: existing.id };
      }
    }
  }

  // 1. Sanitize
  const sanitized = sanitizeContent(content);

  // 2. Generate embedding
  const embedding = await embedWithRetry(sanitized);
  if (!embedding) {
    console.error('[ingestMemory] Failed to generate embedding');
    return { action: 'skipped', reason: 'embedding_failed' };
  }

  // 3. Check duplicates
  const dupCheck = await findDuplicate(db, sanitized, embedding, duplicateThreshold);

  if (dupCheck.isDuplicate) {
    // Update existing: bump importance, merge tags, and UPDATE CONFIDENCE
    const existing = dupCheck.existingMemory;
    const newImportance = Math.min(10, Math.max(existing.importance, importance) + 0.5);

    // Confidence tracking: reinforce when same fact is seen again
    // High similarity (>0.95) = strong confirmation → bigger boost
    // Medium similarity (0.92-0.95) = partial confirmation → smaller boost
    const currentConfidence = existing.confidence ?? 1.0;
    const similarityBoost = dupCheck.similarity >= 0.95 ? 0.15 : 0.08;
    const newConfidence = Math.min(1.0, currentConfidence + similarityBoost * (1.0 - currentConfidence));

    // Merge tags
    let mergedTags = existing.tags || '';
    if (tags.length > 0) {
      const existingTags = new Set((existing.tags || '').split(',').map(t => t.trim()).filter(Boolean));
      for (const t of tags) existingTags.add(t);
      mergedTags = [...existingTags].join(',');
    }

    const updated = updateMemory(existing.id, {
      importance: newImportance,
      confidence: newConfidence,
      tags: mergedTags,
    });

    return { action: 'updated', memory: updated, duplicate: dupCheck, confidenceChange: { from: currentConfidence, to: newConfidence } };
  }

  // 4-6. Create memory, store embedding, and link entities in a single transaction
  const tagsStr = Array.isArray(tags) ? tags.join(',') : tags;
  const summary = await generateSummary(sanitized);
  const memory = db.transaction(() => {
    // 4. Create new memory
    const mem = createMemory({
      type,
      subtype,
      content: sanitized,
      summary,
      importance,
      source,
      session_id,
      channel,
      tags: tagsStr,
    });

    // 5. Store embedding in vec0
    storeEmbedding(db, mem.id, embedding);

    // 6. Resolve and link entities
    for (const ent of entities) {
      try {
        const resolved = resolveEntity(db, ent);
        if (resolved) {
          linkMemoryEntity(mem.id, resolved.id, ent.role || ent.type || null);
        }
      } catch (err) {
        console.warn('[ingestMemory] Entity link error:', err.message);
      }
    }

    return mem;
  })();

  return { action: 'created', memory };
}

export async function ingestConversation(db, messages, options = {}) {
  const {
    source = 'conversation',
    session_id = null,
    channel = null,
  } = options;

  // 1. Extract memories via LLM
  const extracted = await extractMemories(messages, options);
  if (extracted.length === 0) {
    return { created: 0, updated: 0, skipped: 0, memories: [] };
  }

  let created = 0, updated = 0, skipped = 0;
  const memories = [];

  // 2. Ingest each extracted memory
  for (const mem of extracted) {
    const result = await ingestMemory(db, mem.content, {
      type: mem.type,
      subtype: mem.subtype,
      importance: mem.importance,
      entities: mem.entities,
      tags: mem.tags,
      source,
      session_id,
      channel,
    });

    if (result.action === 'created') created++;
    else if (result.action === 'updated') updated++;
    else skipped++;

    if (result.memory) memories.push(result.memory);
  }

  // 3. Create relations between memories extracted from same conversation
  if (memories.length > 1) {
    for (let i = 0; i < memories.length - 1; i++) {
      for (let j = i + 1; j < memories.length; j++) {
        try {
          createRelation(memories[i].id, memories[j].id, 'same_conversation', 0.5);
        } catch (err) {
          // Ignore duplicate relation errors
        }
      }
    }
  }

  return { created, updated, skipped, memories };
}

export async function ingestMarkdownFile(db, filePath, source = 'file') {
  // 1. Read file
  const content = readFileSync(filePath, 'utf-8');

  // 2. Split into sections by headers or double newlines
  const sections = content
    .split(/(?=^#{1,3}\s)/m)
    .filter(s => s.trim().length > 30); // Skip tiny sections

  if (sections.length === 0) {
    // Fall back to paragraph splitting
    const paragraphs = content
      .split(/\n\n+/)
      .filter(p => p.trim().length > 30);
    if (paragraphs.length === 0) {
      return { created: 0, updated: 0, skipped: 0, total: 0 };
    }
    return await _ingestSections(db, paragraphs, source);
  }

  return await _ingestSections(db, sections, source);
}

async function _ingestSections(db, sections, source) {
  let created = 0, updated = 0, skipped = 0;

  for (const section of sections) {
    const extracted = await extractFromText(section.trim(), source);
    for (const mem of extracted) {
      const result = await ingestMemory(db, mem.content, {
        type: mem.type,
        subtype: mem.subtype,
        importance: mem.importance,
        entities: mem.entities,
        tags: mem.tags,
        source,
      });

      if (result.action === 'created') created++;
      else if (result.action === 'updated') updated++;
      else skipped++;
    }
  }

  return { created, updated, skipped, total: created + updated + skipped };
}
