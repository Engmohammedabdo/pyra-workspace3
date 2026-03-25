# AI Agent Memory System — Architecture Research & Design Document

**Date:** 2026-02-17  
**Author:** Architecture Research Sub-agent  
**For:** Bayra (OpenClaw Agent) Memory System Upgrade  
**Status:** Research Complete — Ready for Implementation Planning

---

## Table of Contents
1. [Architecture Overview](#1-architecture-overview)
2. [Memory Types & Taxonomy](#2-memory-types--taxonomy)
3. [Schema Design](#3-schema-design)
4. [Memory Lifecycle](#4-memory-lifecycle)
5. [Retrieval Strategies](#5-retrieval-strategies)
6. [Memory Graph & Relations](#6-memory-graph--relations)
7. [Concurrency & Consistency](#7-concurrency--consistency)
8. [Migration Strategy](#8-migration-strategy)
9. [Error Handling & Recovery](#9-error-handling--recovery)
10. [Privacy & Security](#10-privacy--security)
11. [Technology Stack](#11-technology-stack)
12. [Anti-Patterns](#12-anti-patterns-to-avoid)
13. [Recommended Architecture](#13-recommended-architecture)

---

## 1. Architecture Overview

### Text-Based Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        BAYRA AGENT                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                   MEMORY MANAGER                         │   │
│  │  ┌─────────────┐ ┌──────────────┐ ┌──────────────────┐  │   │
│  │  │  Ingestion   │ │  Retrieval   │ │  Consolidation   │  │   │
│  │  │  Pipeline    │ │  Engine      │ │  Engine          │  │   │
│  │  └──────┬──────┘ └──────┬───────┘ └────────┬─────────┘  │   │
│  └─────────┼───────────────┼──────────────────┼─────────────┘   │
│            │               │                  │                  │
│  ┌─────────▼───────────────▼──────────────────▼─────────────┐   │
│  │                  STORAGE LAYER                            │   │
│  │                                                           │   │
│  │  ┌─────────────────────────────────────────────────────┐  │   │
│  │  │              SQLite (WAL mode)                      │  │   │
│  │  │                                                     │  │   │
│  │  │  ┌──────────┐ ┌──────────┐ ┌────────────────────┐  │  │   │
│  │  │  │ memories │ │ entities │ │ memory_relations   │  │  │   │
│  │  │  │ (core)   │ │ (people, │ │ (links between     │  │  │   │
│  │  │  │          │ │ projects)│ │  memories+entities) │  │  │   │
│  │  │  └──────────┘ └──────────┘ └────────────────────┘  │  │   │
│  │  │                                                     │  │   │
│  │  │  ┌──────────────────────────────────────────────┐   │  │   │
│  │  │  │ vec0 virtual table (sqlite-vec)              │   │  │   │
│  │  │  │ memory_embeddings — float[1536] vectors      │   │  │   │
│  │  │  └──────────────────────────────────────────────┘   │  │   │
│  │  └─────────────────────────────────────────────────────┘  │   │
│  │                                                           │   │
│  │  ┌─────────────────────────────┐                          │   │
│  │  │ Markdown Backup (read-only) │ ← human-readable mirror │   │
│  │  │ memory/*.md, MEMORY.md      │                          │   │
│  │  └─────────────────────────────┘                          │   │
│  └───────────────────────────────────────────────────────────┘   │
│                                                                  │
│  ┌──────────────────────┐  ┌─────────────────────────────────┐  │
│  │ Embedding Service    │  │ Working Memory (in-process)     │  │
│  │ OpenAI / local       │  │ Current session context buffer  │  │
│  │ text-embedding-3-sm  │  │ Recent memories cache (LRU)     │  │
│  └──────────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Message → Working Memory Buffer
                    │
                    ├─→ [Retrieve] Query SQLite + vec0 for relevant memories
                    │              Combine: recency + relevance + importance
                    │              Return top-K to agent context
                    │
                    ├─→ [Respond] Agent generates response with memory context
                    │
                    └─→ [Capture] Extract memories from conversation
                                  │
                                  ├─→ Classify (episodic/semantic/procedural)
                                  ├─→ Extract entities (people, projects)
                                  ├─→ Generate embedding
                                  ├─→ Score importance (1-10)
                                  └─→ Write to SQLite + update relations
```

---

## 2. Memory Types & Taxonomy

### 2.1 The Four Memory Types

Inspired by cognitive science and the Stanford "Generative Agents" paper (Park et al., 2023):

| Type | What It Stores | Examples | Storage Strategy |
|------|---------------|----------|-----------------|
| **Episodic** | Events, conversations, interactions | "Mohammed asked me to analyze Meta Ads on Feb 10" | Full records with timestamps, participants, outcomes |
| **Semantic** | Facts, knowledge, decisions, preferences | "Mohammed prefers UTC+4", "Pyramedia focuses on real estate" | Deduplicated, versioned facts with confidence scores |
| **Procedural** | Learned workflows, how-to knowledge | "To deploy on Coolify: SSH → docker compose → verify" | Step-by-step sequences, linked to tools/skills |
| **Working** | Current session context | Active conversation, recent queries, temp state | In-memory only (not persisted to SQLite) |

### 2.2 Classification Strategy

**Recommendation: LLM-assisted classification at ingestion time.**

When a memory is captured, use a lightweight prompt to classify:

```
Given this memory: "{content}"
Classify as:
- episodic: an event, conversation, or interaction that happened
- semantic: a fact, preference, decision, or piece of knowledge
- procedural: a workflow, process, or how-to
Return JSON: { "type": "...", "importance": 1-10, "entities": [...] }
```

**Pros:** Accurate, context-aware  
**Cons:** Extra API call per memory  
**Mitigation:** Batch classifications, use cheap/fast model (GPT-4o-mini or Gemini Flash)

### 2.3 Sub-types for Semantic Memory

```
semantic/fact        — "Mohammed's timezone is UTC+4"
semantic/preference  — "Mohammed prefers concise reports"
semantic/decision    — "We decided to use Supabase for EliteLife"
semantic/opinion     — "Mohammed thinks n8n is better than Zapier"
semantic/rule        — "Always upload to pyraai-workspace first"
```

---

## 3. Schema Design

### 3.1 Core Tables

```sql
-- Main memory store
CREATE TABLE memories (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    type        TEXT NOT NULL CHECK (type IN ('episodic', 'semantic', 'procedural')),
    subtype     TEXT,              -- e.g., 'fact', 'preference', 'decision', 'conversation'
    content     TEXT NOT NULL,     -- the actual memory text
    summary     TEXT,              -- compressed/summarized version
    importance  REAL DEFAULT 5.0,  -- 1-10 scale
    confidence  REAL DEFAULT 1.0,  -- 0-1, for semantic memories (can degrade)
    access_count INTEGER DEFAULT 0,
    
    -- Temporal
    created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    event_at    TEXT,              -- when the event actually happened (may differ from created_at)
    last_accessed_at TEXT,
    expires_at  TEXT,              -- optional TTL for temp memories
    
    -- Context
    source      TEXT,              -- 'conversation', 'heartbeat', 'subagent', 'manual'
    session_id  TEXT,              -- which session created this
    channel     TEXT,              -- 'telegram', 'discord', 'internal'
    
    -- Metadata
    tags        TEXT,              -- JSON array: ["meta-ads", "mohammed", "decision"]
    metadata    TEXT,              -- JSON blob for flexible extra data
    
    -- Lifecycle
    status      TEXT DEFAULT 'active' CHECK (status IN ('active', 'archived', 'consolidated', 'deleted')),
    parent_id   TEXT REFERENCES memories(id),  -- if consolidated from another memory
    version     INTEGER DEFAULT 1
);

-- Entity store (people, projects, tools, concepts)
CREATE TABLE entities (
    id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
    type        TEXT NOT NULL,     -- 'person', 'project', 'tool', 'company', 'concept'
    name        TEXT NOT NULL,
    aliases     TEXT,              -- JSON array: ["Mohammed", "محمد", "Mo"]
    properties  TEXT,              -- JSON: {"timezone": "UTC+4", "role": "founder"}
    created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    updated_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);

-- Relations between memories and entities
CREATE TABLE memory_entities (
    memory_id   TEXT REFERENCES memories(id) ON DELETE CASCADE,
    entity_id   TEXT REFERENCES entities(id) ON DELETE CASCADE,
    role        TEXT,              -- 'subject', 'mentioned', 'about', 'created_by'
    PRIMARY KEY (memory_id, entity_id)
);

-- Relations between memories (graph edges)
CREATE TABLE memory_relations (
    source_id   TEXT REFERENCES memories(id) ON DELETE CASCADE,
    target_id   TEXT REFERENCES memories(id) ON DELETE CASCADE,
    relation    TEXT NOT NULL,     -- 'follows', 'contradicts', 'elaborates', 'supersedes', 'caused_by'
    weight      REAL DEFAULT 1.0,
    created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    PRIMARY KEY (source_id, target_id, relation)
);

-- Vector embeddings (sqlite-vec)
CREATE VIRTUAL TABLE memory_embeddings USING vec0(
    memory_id TEXT PRIMARY KEY,
    embedding float[1536]         -- OpenAI text-embedding-3-small dimensions
);

-- Indexes
CREATE INDEX idx_memories_type ON memories(type);
CREATE INDEX idx_memories_status ON memories(status);
CREATE INDEX idx_memories_created ON memories(created_at);
CREATE INDEX idx_memories_importance ON memories(importance);
CREATE INDEX idx_memories_tags ON memories(tags);  -- for LIKE queries on JSON
CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_name ON entities(name);
```

### 3.2 Why This Schema?

| Decision | Rationale |
|----------|-----------|
| Text IDs (hex UUIDs) | Avoid integer collision across sessions, safe for merging |
| JSON for tags/metadata | Flexible, no schema changes needed, SQLite JSON functions work well |
| Separate entities table | Normalize people/projects, enable entity-centric queries |
| `memory_relations` as edges | Lightweight knowledge graph without a full graph DB |
| `vec0` virtual table | sqlite-vec is pure C, no deps, runs anywhere, npm package ready |
| `status` field | Soft-delete + lifecycle tracking without losing data |
| `importance` + `confidence` | Dual scoring for retrieval ranking |
| `parent_id` | Track consolidation lineage |

---

## 4. Memory Lifecycle

### 4.1 Creation (Ingestion Pipeline)

```
Conversation Turn
       │
       ▼
┌─────────────────────────────┐
│ 1. Should we remember this? │  ← Quick LLM check or heuristic
│    (importance threshold)    │     Skip: "ok", "thanks", greetings
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│ 2. Classify & Extract       │  ← LLM: type, importance, entities
│    type: episodic/semantic   │
│    entities: [Mohammed, ...]│
│    importance: 7/10          │
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│ 3. Deduplicate              │  ← Check if similar memory exists
│    Cosine similarity > 0.92  │     If yes: update, don't create new
│    OR exact entity+fact match│
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│ 4. Generate Embedding       │  ← OpenAI text-embedding-3-small
└──────────┬──────────────────┘
           ▼
┌─────────────────────────────┐
│ 5. Write to SQLite          │  ← Single transaction:
│    memories + embedding      │     INSERT memory
│    + entity links            │     INSERT embedding
│    + relations               │     LINK entities
└─────────────────────────────┘
```

**When to capture (heuristics):**
- User explicitly says "remember this" → importance: 10
- Decisions or agreements → importance: 8-9
- Facts about people/projects → importance: 7-8
- Preferences expressed → importance: 7
- Task outcomes → importance: 6-7
- General conversation → importance: 3-5 (may skip if < 4)

### 4.2 Consolidation (Compression)

**Problem:** Over time, you accumulate many similar or overlapping memories.

**Strategy: Periodic consolidation during heartbeats or idle time.**

```
Consolidation Rules:
1. Merge memories with cosine similarity > 0.90 AND same type
2. Keep the most recent/important version as primary
3. Mark old versions as status='consolidated', set parent_id
4. Create a summary that combines information
5. Never consolidate across types (don't merge episodic into semantic)
```

**Example:**
```
Memory A (Feb 3): "Mohammed said he prefers short reports"
Memory B (Feb 8): "Mohammed reminded me to keep reports concise"
Memory C (Feb 15): "Mohammed wants bullet points, not paragraphs"
                ↓ Consolidate into:
Memory D: "Mohammed strongly prefers concise reporting: short, bullet-point format. 
           (Reinforced 3x: Feb 3, 8, 15)"
           importance: 9 (boosted by reinforcement)
```

### 4.3 Decay & Relevance

**Don't delete — decay importance scores over time.**

```javascript
function decayedImportance(memory) {
    const daysSinceCreated = daysBetween(memory.created_at, now());
    const daysSinceAccessed = daysBetween(memory.last_accessed_at, now());
    
    // Base importance decays logarithmically
    const timeDecay = 1 / (1 + Math.log(1 + daysSinceAccessed / 30));
    
    // But reinforcement (access count) fights decay
    const reinforcement = Math.min(memory.access_count / 10, 1.0);
    
    // High-importance memories decay slower
    const importanceShield = memory.importance / 10;
    
    return memory.importance * (timeDecay * 0.5 + reinforcement * 0.3 + importanceShield * 0.2);
}
```

**Key insight:** Don't hard-delete memories. Let them fade naturally. Frequently accessed memories self-reinforce.

### 4.4 Forgetting (Garbage Collection)

Run periodically (weekly during heartbeat):

```sql
-- Archive memories that have decayed below threshold
UPDATE memories 
SET status = 'archived'
WHERE status = 'active'
  AND importance < 3
  AND access_count < 2
  AND last_accessed_at < datetime('now', '-90 days')
  AND type = 'episodic';  -- Be more aggressive with episodic, preserve semantic

-- Hard-delete very old archived memories (6 months)
DELETE FROM memories
WHERE status = 'archived'
  AND updated_at < datetime('now', '-180 days');
```

**Rules:**
- Never auto-delete semantic memories with importance ≥ 7
- Never auto-delete procedural memories (they're rare and valuable)
- Episodic memories decay fastest (conversations from 3 months ago rarely matter)
- Always keep a markdown export before any bulk deletion

### 4.5 Reinforcement

Every time a memory is retrieved and used:
```sql
UPDATE memories 
SET access_count = access_count + 1,
    last_accessed_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
    importance = MIN(importance + 0.2, 10.0)
WHERE id = ?;
```

---

## 5. Retrieval Strategies

### 5.1 Multi-Signal Retrieval (Recommended)

Don't rely on a single retrieval method. Combine multiple signals:

```
Final Score = w1 * relevance_score     (semantic similarity)
            + w2 * recency_score       (time-based)
            + w3 * importance_score    (priority)
            + w4 * access_score        (reinforcement)
```

**Recommended weights:**
```javascript
const WEIGHTS = {
    relevance: 0.45,   // Semantic similarity is king
    recency:   0.25,   // Recent memories get a boost
    importance: 0.20,  // High-importance memories surface
    access:    0.10,   // Frequently accessed = probably useful
};
```

### 5.2 Retrieval Pipeline

```javascript
async function retrieveMemories(query, options = {}) {
    const { limit = 10, types = null, minImportance = 0, timeRange = null } = options;
    
    // Step 1: Vector search — get top 50 candidates by relevance
    const queryEmbedding = await embed(query);
    const candidates = db.prepare(`
        SELECT m.*, me.distance
        FROM memory_embeddings me
        JOIN memories m ON m.id = me.memory_id
        WHERE me.embedding MATCH ?
          AND m.status = 'active'
          ${types ? `AND m.type IN (${types.map(t => `'${t}'`).join(',')})` : ''}
          ${minImportance ? `AND m.importance >= ${minImportance}` : ''}
        ORDER BY me.distance
        LIMIT 50
    `).all(queryEmbedding);
    
    // Step 2: Score each candidate with multi-signal ranking
    const scored = candidates.map(memory => {
        const relevance = 1 - memory.distance;  // cosine distance → similarity
        const recency = recencyScore(memory.last_accessed_at || memory.created_at);
        const importance = memory.importance / 10;
        const access = Math.min(memory.access_count / 20, 1);
        
        return {
            ...memory,
            finalScore: 
                WEIGHTS.relevance * relevance +
                WEIGHTS.recency * recency +
                WEIGHTS.importance * importance +
                WEIGHTS.access * access
        };
    });
    
    // Step 3: Sort by final score, return top-K
    scored.sort((a, b) => b.finalScore - a.finalScore);
    
    // Step 4: Reinforce accessed memories
    const topK = scored.slice(0, limit);
    for (const m of topK) {
        reinforceMemory(m.id);
    }
    
    return topK;
}

function recencyScore(dateStr) {
    const hours = hoursBetween(new Date(dateStr), new Date());
    // Exponential decay: 1.0 for now, ~0.5 at 24h, ~0.1 at 7 days
    return Math.exp(-hours / 48);
}
```

### 5.3 Context-Aware Retrieval

Before querying, expand the search with context:
```javascript
async function contextAwareRetrieve(currentMessage, recentMessages) {
    // Build a richer query from conversation context
    const contextQuery = [
        currentMessage,
        ...recentMessages.slice(-3)  // Last 3 messages for context
    ].join(' ');
    
    // Also extract entities for targeted lookup
    const entities = await extractEntities(currentMessage);
    
    // Parallel retrieval
    const [vectorResults, entityResults] = await Promise.all([
        retrieveMemories(contextQuery, { limit: 8 }),
        queryByEntities(entities, { limit: 5 })
    ]);
    
    // Merge and deduplicate
    return deduplicateByID([...vectorResults, ...entityResults]).slice(0, 10);
}
```

### 5.4 Entity-Based Retrieval

```sql
-- Get all memories about a specific person
SELECT m.* FROM memories m
JOIN memory_entities me ON m.id = me.memory_id
JOIN entities e ON e.id = me.entity_id
WHERE e.name = 'Mohammed'
  AND m.status = 'active'
ORDER BY m.importance DESC, m.created_at DESC
LIMIT 20;
```

### 5.5 Retrieval Strategy Comparison

| Strategy | When To Use | Pros | Cons |
|----------|------------|------|------|
| Vector (semantic) | Default for all queries | Finds conceptually related memories | May miss exact matches |
| Time-based | "What happened yesterday?" | Fast, no embeddings needed | No relevance ranking |
| Entity-based | "What do I know about X?" | Precise, follows relationships | Requires entity extraction |
| Importance-based | Context injection at session start | Surfaces critical memories | Misses relevant low-importance ones |
| Combined (recommended) | Every retrieval | Best quality | More computation |

---

## 6. Memory Graph & Relations

### 6.1 Recommendation: Lightweight Knowledge Graph (Yes, Worth It)

**Not a full graph database** — just the `memory_relations` and `memory_entities` tables with simple joins.

**Why it's worth it:**
- Entity-centric queries ("everything about Mohammed") are common
- Following chains ("what led to this decision?") adds context
- Low implementation cost with SQLite — just junction tables

**Why NOT a full graph DB:**
- Neo4j/etc. adds operational complexity
- SQLite junction tables handle 2-hop queries fine for <100K memories
- Agent's graph is relatively sparse (not billions of edges)

### 6.2 Entity Extraction

Run at ingestion time alongside classification:

```javascript
// Prompt for entity extraction (batch with classification)
const extractionPrompt = `
Extract entities from this memory. Return JSON array:
[{"name": "...", "type": "person|project|tool|company|concept", "role": "subject|mentioned|about"}]

Memory: "${content}"
`;
```

**Entity deduplication:** Use alias matching:
```sql
-- Find entity by name or alias
SELECT * FROM entities 
WHERE name = ? 
   OR json_each.value = ?  -- search aliases JSON array
```

### 6.3 Relation Types

| Relation | Meaning | Example |
|----------|---------|---------|
| `follows` | Temporal sequence | Meeting notes → Follow-up decision |
| `elaborates` | Adds detail | "Mohammed likes X" → "Specifically, he prefers Y about X" |
| `contradicts` | Conflicting info | Old preference → New preference |
| `supersedes` | Replaces | Updated fact replacing old one |
| `caused_by` | Causal link | "Error happened" → "Because of X" |
| `related_to` | General association | Two memories about same project |

### 6.4 Multi-Hop Retrieval

```sql
-- 1-hop: Get memories directly related to a memory
SELECT m2.* FROM memory_relations mr
JOIN memories m2 ON m2.id = mr.target_id
WHERE mr.source_id = ?
  AND m2.status = 'active';

-- 2-hop: Follow the chain one more step
SELECT m3.* FROM memory_relations mr1
JOIN memory_relations mr2 ON mr1.target_id = mr2.source_id
JOIN memories m3 ON m3.id = mr2.target_id
WHERE mr1.source_id = ?
  AND m3.status = 'active';
```

**Recommendation:** Limit to 2-hop max. Beyond that, noise exceeds signal.

### 6.5 Tags vs Categories vs Graph Edges

| Approach | Use For | Storage |
|----------|---------|---------|
| **Tags** (JSON array) | Quick filtering, search | `memories.tags` column |
| **Type/Subtype** | Core classification | `memories.type` + `memories.subtype` |
| **Entity links** | Who/what a memory is about | `memory_entities` junction table |
| **Graph edges** | How memories relate to each other | `memory_relations` table |

**Use all four.** They serve different purposes and have different query patterns.

---

## 7. Concurrency & Consistency

### 7.1 SQLite WAL Mode (Critical)

```sql
PRAGMA journal_mode = WAL;
PRAGMA busy_timeout = 5000;
PRAGMA synchronous = NORMAL;  -- Good balance of safety vs speed
PRAGMA foreign_keys = ON;
```

**WAL (Write-Ahead Logging) benefits:**
- Multiple readers can read while one writer writes
- Reads don't block writes, writes don't block reads
- Only one writer at a time (SQLite limitation) — but that's fine for our use case

### 7.2 Multi-Session Writes

**Scenario:** Main agent + sub-agents + heartbeat all writing memories.

**Solution: Single writer with queue pattern.**

```javascript
class MemoryWriter {
    private writeQueue: Array<() => Promise<void>> = [];
    private processing = false;
    
    async enqueue(operation: () => Promise<void>) {
        this.writeQueue.push(operation);
        if (!this.processing) this.processQueue();
    }
    
    private async processQueue() {
        this.processing = true;
        while (this.writeQueue.length > 0) {
            const op = this.writeQueue.shift()!;
            try {
                await op();
            } catch (e) {
                console.error('Memory write failed:', e);
                // Don't lose the memory — log to fallback file
                await this.logToFallback(op);
            }
        }
        this.processing = false;
    }
}
```

### 7.3 Sub-Agent Memory Access

**Read:** Sub-agents get a read-only connection (WAL allows concurrent reads).

**Write:** Sub-agents write through the main agent's memory manager:
- Option A: Sub-agent calls a memory API endpoint
- Option B: Sub-agent writes to a staging table, main agent merges
- **Recommended: Option B** — sub-agents write to `memory_staging`, main agent reviews and promotes

```sql
CREATE TABLE memory_staging (
    id          TEXT PRIMARY KEY,
    agent_id    TEXT NOT NULL,     -- which sub-agent wrote this
    content     TEXT NOT NULL,
    type        TEXT,
    importance  REAL,
    created_at  TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
    status      TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected'))
);
```

### 7.4 Transaction Safety

All memory writes should be atomic:

```javascript
function createMemory(memory, embedding, entities) {
    db.transaction(() => {
        // All or nothing
        db.prepare('INSERT INTO memories ...').run(memory);
        db.prepare('INSERT INTO memory_embeddings ...').run(memory.id, embedding);
        for (const entity of entities) {
            db.prepare('INSERT OR IGNORE INTO entities ...').run(entity);
            db.prepare('INSERT INTO memory_entities ...').run(memory.id, entity.id);
        }
    })();
}
```

---

## 8. Migration Strategy

### 8.1 Phase 1: Parse & Import (One-Time)

```
Current Files:
  MEMORY.md          → Semantic memories (facts, rules, preferences)
  memory/long-term.md → Semantic memories (detailed archive)
  memory/YYYY-MM-DD.md → Episodic memories (daily logs)
  memory/pyra-whatsapp-workflow.md → Procedural memory
```

**Migration script approach:**

```javascript
async function migrateMarkdownToSQLite() {
    // 1. Parse MEMORY.md and long-term.md → extract semantic facts
    const semanticMemories = parseSemanticFromMarkdown('MEMORY.md', 'memory/long-term.md');
    
    // 2. Parse daily files → extract episodic entries
    const dailyFiles = glob('memory/2026-*.md');
    const episodicMemories = dailyFiles.flatMap(f => parseDailyLog(f));
    
    // 3. Parse workflow files → procedural memories
    const proceduralMemories = parseWorkflows('memory/pyra-whatsapp-workflow.md');
    
    // 4. Generate embeddings in batches (OpenAI batch API)
    const allMemories = [...semanticMemories, ...episodicMemories, ...proceduralMemories];
    const embeddings = await batchEmbed(allMemories.map(m => m.content));
    
    // 5. Write all to SQLite in a single transaction
    db.transaction(() => {
        for (let i = 0; i < allMemories.length; i++) {
            insertMemory(allMemories[i], embeddings[i]);
        }
    })();
    
    console.log(`Migrated ${allMemories.length} memories`);
}
```

### 8.2 Phase 2: Dual-Write (2-4 Weeks)

During transition, write to both systems:

```javascript
async function createMemory(memory) {
    // Write to SQLite (new system)
    await sqliteWrite(memory);
    
    // Also write to markdown (old system) — for safety
    await appendToDaily(memory);
    
    // Read from SQLite (new system)
    // Fall back to markdown search if SQLite fails
}
```

### 8.3 Phase 3: SQLite Primary (After Validation)

- SQLite becomes the source of truth
- Daily markdown files become **export/backup only**
- Weekly export: `memories → memory/YYYY-MM-DD.md` for human readability
- MEMORY.md becomes auto-generated summary (top-K most important memories)

### 8.4 Rollback Plan

- Keep all original markdown files untouched in `memory/archive/`
- SQLite DB is backed up daily to `backups/memory-YYYY-MM-DD.db`
- If SQLite fails, flip a feature flag to fall back to markdown search
- Migration script is idempotent — can re-run without duplicates

---

## 9. Error Handling & Recovery

### 9.1 Embedding API Down

```javascript
async function embedWithFallback(text) {
    try {
        // Primary: OpenAI text-embedding-3-small
        return await openaiEmbed(text);
    } catch (e) {
        if (isRateLimitOrNetworkError(e)) {
            // Queue for later embedding
            db.prepare(`
                INSERT INTO embedding_queue (memory_id, content, status)
                VALUES (?, ?, 'pending')
            `).run(memoryId, text);
            
            // Store memory WITHOUT embedding (still searchable by text/entities)
            return null;
        }
        throw e;
    }
}

// Background job: retry pending embeddings
async function processEmbeddingQueue() {
    const pending = db.prepare(
        `SELECT * FROM embedding_queue WHERE status = 'pending' LIMIT 50`
    ).all();
    
    for (const item of pending) {
        try {
            const embedding = await openaiEmbed(item.content);
            db.prepare('INSERT INTO memory_embeddings ...').run(item.memory_id, embedding);
            db.prepare('UPDATE embedding_queue SET status = ? WHERE id = ?').run('done', item.id);
        } catch (e) {
            // Will retry next cycle
        }
    }
}
```

### 9.2 SQLite DB Corruption

```javascript
// Startup integrity check
function checkDatabaseHealth() {
    try {
        const result = db.prepare('PRAGMA integrity_check').get();
        if (result.integrity_check !== 'ok') {
            console.error('DB corruption detected!');
            restoreFromBackup();
        }
    } catch (e) {
        console.error('DB unreadable:', e);
        restoreFromBackup();
    }
}

function restoreFromBackup() {
    const latestBackup = findLatestBackup('backups/memory-*.db');
    if (latestBackup) {
        fs.copyFileSync(latestBackup, DB_PATH);
        console.log(`Restored from ${latestBackup}`);
    } else {
        // Nuclear option: rebuild from markdown files
        rebuildFromMarkdown();
    }
}
```

### 9.3 Automatic Backup Strategy

```javascript
// Daily backup (run from heartbeat or cron)
function backupDatabase() {
    const date = new Date().toISOString().split('T')[0];
    const backupPath = `backups/memory-${date}.db`;
    
    // SQLite online backup API (safe even during writes)
    db.backup(backupPath);
    
    // Keep only last 30 backups
    cleanOldBackups('backups/', 30);
}
```

### 9.4 Graceful Degradation

```javascript
class MemorySystem {
    private mode: 'sqlite' | 'markdown' | 'readonly' = 'sqlite';
    
    async retrieve(query) {
        switch (this.mode) {
            case 'sqlite':
                try {
                    return await this.sqliteRetrieve(query);
                } catch (e) {
                    console.error('SQLite failed, falling back to markdown');
                    this.mode = 'markdown';
                    return this.markdownRetrieve(query);
                }
            case 'markdown':
                return this.markdownRetrieve(query);
            case 'readonly':
                return this.cachedRetrieve(query);
        }
    }
}
```

---

## 10. Privacy & Security

### 10.1 Sensitive Data: DO NOT Store in Memory DB

**Hard rule:** Passwords, API keys, tokens, and credentials must NEVER be stored in the memory database.

```javascript
const SENSITIVE_PATTERNS = [
    /api[_-]?key/i, /password/i, /token/i, /secret/i,
    /bearer\s+\S+/i, /sk-[a-zA-Z0-9]+/, /ghp_[a-zA-Z0-9]+/
];

function sanitizeBeforeStorage(content) {
    for (const pattern of SENSITIVE_PATTERNS) {
        if (pattern.test(content)) {
            content = content.replace(pattern, '[REDACTED]');
        }
    }
    return content;
}
```

### 10.2 Encryption at Rest

**Recommendation: Not needed for this deployment, but plan for it.**

- The SQLite DB lives on the same server as the agent
- Server-level disk encryption is more appropriate than app-level
- If needed later: use SQLCipher (drop-in SQLite replacement with AES-256)
- **Cost of SQLCipher:** Different npm package, ~5% performance overhead

### 10.3 Access Control Per Session Type

```javascript
const ACCESS_LEVELS = {
    main: {
        read: ['all'],
        write: ['all'],
        canAccessPersonal: true,      // MEMORY.md-equivalent content
    },
    subagent: {
        read: ['semantic', 'procedural'],  // Can read facts and workflows
        write: ['staging_only'],           // Writes go to staging table
        canAccessPersonal: false,          // No personal/private memories
    },
    group_chat: {
        read: ['semantic/fact', 'semantic/decision', 'procedural'],  // Public knowledge only
        write: ['episodic'],               // Can log conversations
        canAccessPersonal: false,          // NEVER expose personal context
    }
};
```

### 10.4 Memory Visibility Tags

```sql
-- Add visibility to memories
ALTER TABLE memories ADD COLUMN visibility TEXT DEFAULT 'private'
    CHECK (visibility IN ('private', 'internal', 'public'));

-- private: Only main session
-- internal: Main + sub-agents  
-- public: All sessions including group chats
```

---

## 11. Technology Stack

### 11.1 Recommended Stack

| Component | Technology | Why |
|-----------|-----------|-----|
| **Database** | SQLite 3.x (via better-sqlite3) | Already available, zero-ops, perfect for single-agent |
| **Vector Search** | sqlite-vec (npm package) | Pure C, no deps, works with better-sqlite3 |
| **Embeddings** | OpenAI `text-embedding-3-small` (1536 dims) | Best quality/cost ratio, already have API key |
| **ORM/Query** | Raw SQL with better-sqlite3 | Full control, no abstraction overhead |
| **Node.js Driver** | better-sqlite3 | Synchronous API (simpler), fastest Node SQLite driver |
| **Backup** | SQLite backup API + daily cron | Built-in, safe during writes |

### 11.2 NPM Packages

```json
{
    "better-sqlite3": "^11.x",
    "sqlite-vec": "^0.1.x",
    "openai": "^4.x"          // Already installed for embeddings
}
```

### 11.3 Embedding Model Comparison

| Model | Dimensions | Cost per 1M tokens | Quality | Latency |
|-------|-----------|-------------------|---------|---------|
| OpenAI text-embedding-3-small | 1536 | $0.02 | Good | ~100ms |
| OpenAI text-embedding-3-large | 3072 | $0.13 | Best | ~150ms |
| Local (all-MiniLM-L6-v2) | 384 | Free | Decent | ~50ms |

**Recommendation:** Start with `text-embedding-3-small`. Can switch to local model later if costs become a concern. 1536 dimensions is a good balance.

### 11.4 Alternative: Node.js Built-in `node:sqlite`

Node.js 22+ has a built-in `node:sqlite` module. However:
- Still experimental in Node 22
- better-sqlite3 is more battle-tested
- sqlite-vec works with both
- **Recommendation:** Use better-sqlite3 now, migrate to node:sqlite later when stable

---

## 12. Anti-Patterns to Avoid

### ❌ 1. Remembering Everything
**Problem:** Every message becomes a memory → DB bloats, retrieval quality drops.  
**Fix:** Use importance threshold. Skip greetings, confirmations, filler.

### ❌ 2. One Giant Embedding Per Conversation
**Problem:** Embedding an entire conversation loses granularity.  
**Fix:** Extract individual memories (facts, decisions, events) from conversations.

### ❌ 3. No Deduplication
**Problem:** Same fact stored 50 times → clutters results.  
**Fix:** Check similarity before inserting. Update existing memory instead.

### ❌ 4. Treating All Memory Types the Same
**Problem:** Episodic and semantic memories have different lifecycles.  
**Fix:** Different decay rates, different retrieval weights per type.

### ❌ 5. Synchronous Embedding in Hot Path
**Problem:** Waiting for embedding API blocks response.  
**Fix:** Embed asynchronously. Store memory immediately, embed in background.

### ❌ 6. No Backup Strategy
**Problem:** One corruption = total memory loss.  
**Fix:** Daily backups + markdown export + integrity checks.

### ❌ 7. Ignoring Context Window Budget
**Problem:** Retrieving 50 memories = 10K tokens of context wasted.  
**Fix:** Retrieve 5-10 most relevant, use summaries not full content.

### ❌ 8. Graph Over-Engineering
**Problem:** Full knowledge graph with ontologies, reasoning, etc.  
**Fix:** Simple junction tables. 2-hop max. Add complexity only when needed.

### ❌ 9. No Memory Visibility Controls
**Problem:** Personal memories leak into group chats.  
**Fix:** Visibility levels (private/internal/public) enforced at query time.

### ❌ 10. Hard-Deleting Memories
**Problem:** Can't undo, can't audit, can't learn from mistakes.  
**Fix:** Soft-delete with status field. Archive before delete.

---

## 13. Recommended Architecture

### Final Recommendation: **Pragmatic Hybrid — SQLite + sqlite-vec + Entity Links**

This isn't the most sophisticated possible architecture. It's the **right** architecture for Bayra's scale, environment, and constraints.

### Why This Architecture?

| Factor | Decision |
|--------|----------|
| **Scale** | <100K memories → SQLite handles this easily |
| **Ops** | Zero ops — single file, no server to manage |
| **Speed** | better-sqlite3 is synchronous = simple code, no async overhead |
| **Vector search** | sqlite-vec is pure C, works everywhere Node runs |
| **Graph** | Junction tables, not a graph DB — keeps things simple |
| **Migration** | Incremental — dual-write, then cutover |
| **Fallback** | Markdown files are always there as backup |

### Implementation Priority

| Phase | What | Effort | Impact |
|-------|------|--------|--------|
| **Phase 1** | SQLite schema + basic CRUD + embeddings | 2-3 days | Foundation |
| **Phase 2** | Multi-signal retrieval engine | 1-2 days | Major quality improvement |
| **Phase 3** | Migration script (markdown → SQLite) | 1 day | Data continuity |
| **Phase 4** | Entity extraction + relations | 2-3 days | Contextual retrieval |
| **Phase 5** | Consolidation engine + decay | 1-2 days | Long-term quality |
| **Phase 6** | Backup, error handling, monitoring | 1 day | Reliability |
| **Phase 7** | Dual-write period + validation | 2 weeks | Confidence |
| **Phase 8** | SQLite primary, markdown export only | — | Migration complete |

### Cost Estimate

- **Embeddings:** ~$0.02/1M tokens. With ~100 memories/day at ~100 tokens each, that's $0.0002/day. Negligible.
- **Classification LLM calls:** ~$0.001/memory with GPT-4o-mini. ~$0.10/day.
- **Storage:** SQLite DB will be <50MB even with 100K memories + embeddings.

---

## References & Inspiration

1. **"Generative Agents: Interactive Simulacra of Human Behavior"** (Park et al., 2023) — Stanford's foundational paper on agent memory with observation, reflection, and retrieval scoring using recency + relevance + importance.

2. **Letta (formerly MemGPT)** — Production agent memory system with memory blocks, archival memory, shared memory, and context hierarchy. Key insight: separate working memory (in context) from archival memory (in DB).

3. **sqlite-vec** (Alex Garcia) — The vector search extension we'll use. Pure C, npm package, works with better-sqlite3 and node:sqlite.

4. **Cognitive Architecture for Language Agents (CoALA)** — Framework categorizing agent memory into working memory, episodic memory, semantic memory, and procedural memory.

---

*Document generated: 2026-02-17T15:04 UTC*  
*For: Bayra Memory System Upgrade Project*
