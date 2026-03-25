# SQLite + Vector Search for AI Memory Systems — Research Report
**Date:** Feb 17, 2026 | **Status:** Verified via web research

---

## 1. SQLite Vector Extensions (2025-2026)

### sqlite-vec ⭐ RECOMMENDED
- **Version:** v0.1.7-alpha.10 (latest, Feb 13, 2026)
- **GitHub:** github.com/asg017/sqlite-vec — **~6.9k stars**
- **Status:** Pre-v1, actively developed (alpha releases every few days)
- **Author:** Alex Garcia (Mozilla Builders project)
- **Sponsors:** Mozilla, Fly.io, Turso, SQLite Cloud, Shinkai

**Key Capabilities:**
- Store & query **float, int8, and binary vectors** in `vec0` virtual tables
- Written in **pure C**, zero dependencies
- Runs **everywhere**: Linux/Mac/Windows, WASM (browser), Raspberry Pi, mobile
- Metadata, auxiliary, and partition key columns
- KNN search via `WHERE column MATCH '...' ORDER BY distance`
- Matryoshka embedding support (adaptive-length)
- Binary & scalar quantization support
- Chunk-based storage (doesn't need everything in RAM)
- **Currently exhaustive full-scan only** — no ANN (HNSW/IVF planned)

**Node.js Installation:**
```bash
npm install sqlite-vec
```

**Code Example (better-sqlite3):**
```js
import * as sqliteVec from "sqlite-vec";
import Database from "better-sqlite3";

const db = new Database(":memory:");
sqliteVec.load(db);

// Create vector table (1536 dimensions for OpenAI embeddings)
db.exec(`CREATE VIRTUAL TABLE vec_memories USING vec0(
  embedding float[1536]
)`);

// Insert
const embedding = new Float32Array([0.1, 0.2, ...]); // 1536 dims
db.prepare("INSERT INTO vec_memories(rowid, embedding) VALUES (?, ?)")
  .run(1, embedding.buffer);

// KNN search
const query = new Float32Array([0.1, 0.2, ...]); // query vector
const results = db.prepare(`
  SELECT rowid, distance
  FROM vec_memories
  WHERE embedding MATCH ?
  ORDER BY distance
  LIMIT 10
`).all(query.buffer);
```

**Code Example (node:sqlite):**
```js
import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

const db = new DatabaseSync(":memory:", { allowExtension: true });
sqliteVec.load(db);

const embedding = new Float32Array([0.1, 0.2, 0.3, 0.4]);
const { result } = db
  .prepare("SELECT vec_length(?) as result")
  .get(new Uint8Array(embedding.buffer));
```

**Compatibility:** Works with node:sqlite, better-sqlite3, node-sqlite3, bun:sqlite, Deno @db/sqlite

**Recommendation:** ✅ **USE** — The clear winner for SQLite vector search. Actively maintained, great Node.js support, and the only viable option.

---

### sqlite-vss ❌ DEPRECATED
- **Version:** v0.1.2 (final)
- **Status:** **NOT in active development** — officially replaced by sqlite-vec
- **Why deprecated:**
  - Depended on Faiss (C++ library) — hard to compile
  - Only worked on Linux + MacOS (no Windows, WASM, mobile)
  - Stored all vectors in memory
  - Transaction-related bugs
  - Missing quantization operations

**Recommendation:** ❌ **AVOID** — Use sqlite-vec instead.

---

### Related Extensions Worth Knowing
- **sqlite-rembed** — Generate embeddings from remote APIs (OpenAI/Nomic/Ollama) directly in SQL
- **sqlite-lembed** — Generate embeddings locally from GGUF models in SQL
- Both by the same author (Alex Garcia), useful for testing/SQL scripts

---

## 2. Embedding Models (Feb 2026)

### OpenAI Embedding Models

| Model | Dimensions | MTEB Score | Price (per 1M tokens) | Max Input |
|-------|-----------|------------|----------------------|-----------|
| **text-embedding-3-small** | 1536 (default), reducible to 256/512 | 62.3% | ~$0.02 | 8192 tokens |
| **text-embedding-3-large** | 3072 (default), reducible to 256/512/1024 | 64.6% | ~$0.13 | 8192 tokens |
| text-embedding-ada-002 | 1536 (fixed) | 61.0% | ~$0.10 | 8192 tokens |

**Key Feature:** Both v3 models support **Matryoshka embeddings** — you can reduce dimensions via the `dimensions` API parameter without retraining. A text-embedding-3-large at 256 dims outperforms ada-002 at 1536 dims!

**⚠️ Note:** As of Feb 2026, OpenAI has NOT released a v4 embedding model. The text-embedding-3 series (Jan 2024) remains the latest. The pricing page still lists only these three embedding models.

**Recommendation for AI Memory:**
- **text-embedding-3-small at 1536 dims** — Best cost/performance ratio for most use cases
- **text-embedding-3-large at 256 dims** — Good if you want smaller vectors with decent quality
- **text-embedding-3-large at 1024 dims** — Sweet spot for high quality + manageable storage

### Google Embedding Models

| Model | Dimensions | Notes |
|-------|-----------|-------|
| **gemini-embedding-001** | 3072 (default) | Latest Google embedding model via Vertex AI |
| text-embedding-004/005 | 768 | Previous generation |

**Note:** Google's gemini-embedding-001 uses 3072 dimensions by default. Available via Vertex AI API.

### Open-Source / Local Embedding Models

**Transformers.js** (by Hugging Face)
- **Package:** `@huggingface/transformers`
- **GitHub:** github.com/huggingface/transformers.js
- **Runtime:** ONNX Runtime (browser + Node.js)
- **Capabilities:** Run embedding models locally, no API needed
- **Supports:** WebGPU acceleration, quantized models
- **Popular Models:** all-MiniLM-L6-v2 (384d), nomic-embed-text-v1.5 (768d)

```js
import { pipeline } from '@huggingface/transformers';
const embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
const output = await embedder('Hello world', { pooling: 'mean', normalize: true });
// output: Float32Array[384]
```

**Recommendation:** ✅ **USE** for local/free embeddings. Great for development and when API costs are a concern.

### Standard Dimensions in 2026
- **256** — Compact, good for large-scale search with Matryoshka models
- **384** — Common for small local models (MiniLM)
- **768** — Standard for medium models (Nomic, BERT-based)
- **1024** — Good balance point for reduced text-embedding-3-large
- **1536** — OpenAI text-embedding-3-small default (most common in production)
- **3072** — OpenAI text-embedding-3-large / Google gemini-embedding-001 full

**For AI Memory System:** 1536 (text-embedding-3-small) is the industry standard. Use 256-512 if storage is a concern.

---

## 3. Node.js SQLite Libraries (2025-2026)

### better-sqlite3 ⭐ RECOMMENDED
- **Version:** v12.6.2 (Jan 16, 2026)
- **GitHub:** ~5k stars
- **Status:** Actively maintained, mature, battle-tested
- **Key Features:**
  - Synchronous API (faster for single-threaded use)
  - Full FTS5 support
  - Extension loading (required for sqlite-vec)
  - WAL mode support
  - Prepared statements
  - User-defined functions
  - Excellent documentation

**Recommendation:** ✅ **USE** — The gold standard for Node.js SQLite. Best sqlite-vec compatibility.

### node:sqlite (Built-in Node.js)
- **Status:** Experimental (but no longer behind --experimental-sqlite flag since Node 22.13.0/23.4.0)
- **Current Node.js:** v25.6.1 (latest docs), v22.x LTS
- **Class:** `DatabaseSync` — synchronous API
- **Key Features (as of v25):**
  - `allowExtension` option for loading extensions like sqlite-vec ✅
  - `timeout` option (busy timeout) — added v24.0.0
  - `readOnly` mode
  - Foreign key constraints
  - Prepared statements
  - **NO async API yet** (DatabaseSync only)
  - `defensive` mode (enabled by default in v25.5.0)

**sqlite-vec Compatibility:** ✅ Works! Requires `allowExtension: true` and Node.js ≥ 23.5.0 for best results.

```js
import { DatabaseSync } from "node:sqlite";
import * as sqliteVec from "sqlite-vec";

const db = new DatabaseSync(":memory:", { allowExtension: true });
sqliteVec.load(db);
```

**Recommendation:** 👀 **WATCH** — Getting better but still experimental. No async API is a limitation. For production, stick with better-sqlite3. For new projects on Node 22+, viable option to reduce dependencies.

### Drizzle ORM + SQLite
- **Status:** Fully supported
- **Drivers:** libsql, better-sqlite3, bun:sqlite
- **Features:** Schema definition, migrations, type-safe queries
- **Limitation:** No native virtual table support (vec0 must use raw SQL)

```js
import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';

const sqlite = new Database('memory.db');
const db = drizzle(sqlite);

// Regular tables via Drizzle, vector tables via raw SQL
db.run(sql`CREATE VIRTUAL TABLE vec_memories USING vec0(embedding float[1536])`);
```

**Recommendation:** ✅ **USE** for regular tables (memories metadata, chunks, etc.), but use raw SQL for vec0 virtual tables.

### libsql (Turso)
- Fork of SQLite optimized for edge/distributed use
- Has built-in vector search support (no extension needed)
- **Recommendation:** 👀 **WATCH** — Interesting if you need distributed SQLite, but adds complexity vs plain SQLite + sqlite-vec

---

## 4. Hybrid Search Best Practices

### Architecture: FTS5 + sqlite-vec Combined

```sql
-- Regular table for memory storage
CREATE TABLE memories (
  id INTEGER PRIMARY KEY,
  content TEXT NOT NULL,
  metadata JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- FTS5 for keyword search
CREATE VIRTUAL TABLE memories_fts USING fts5(
  content,
  content=memories,
  content_rowid=id
);

-- Vector table for semantic search  
CREATE VIRTUAL TABLE vec_memories USING vec0(
  embedding float[1536]
);

-- Triggers to keep FTS5 in sync
CREATE TRIGGER memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
END;
```

### Hybrid Search Query Pattern

```js
function hybridSearch(db, queryText, queryEmbedding, limit = 10) {
  // 1. Vector search (semantic)
  const vectorResults = db.prepare(`
    SELECT rowid, distance
    FROM vec_memories
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `).all(queryEmbedding.buffer, limit * 2);

  // 2. FTS5 search (keyword)
  const ftsResults = db.prepare(`
    SELECT rowid, rank
    FROM memories_fts
    WHERE memories_fts MATCH ?
    ORDER BY rank
    LIMIT ?
  `).all(queryText, limit * 2);

  // 3. Merge with Reciprocal Rank Fusion (RRF)
  return reciprocalRankFusion(vectorResults, ftsResults, limit);
}
```

### Reciprocal Rank Fusion (RRF) vs Weighted Merge

**RRF Formula:** `score = Σ 1/(k + rank_i)` where k is typically 60

```js
function reciprocalRankFusion(vectorResults, ftsResults, limit, k = 60) {
  const scores = new Map();
  
  vectorResults.forEach((r, i) => {
    const current = scores.get(r.rowid) || 0;
    scores.set(r.rowid, current + 1 / (k + i + 1));
  });
  
  ftsResults.forEach((r, i) => {
    const current = scores.get(r.rowid) || 0;
    scores.set(r.rowid, current + 1 / (k + i + 1));
  });
  
  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([rowid, score]) => ({ rowid, score }));
}
```

**Weighted Merge Alternative:**
```js
function weightedMerge(vectorResults, ftsResults, vectorWeight = 0.7, keywordWeight = 0.3) {
  // Normalize scores to 0-1 range, then combine
  // vectorScore * 0.7 + keywordScore * 0.3
}
```

### Weight Recommendations
| Use Case | Vector Weight | Keyword Weight | Notes |
|----------|--------------|----------------|-------|
| General memory recall | 0.7 | 0.3 | Good default |
| Concept/semantic search | 0.8 | 0.2 | When meaning matters more |
| Exact fact retrieval | 0.5 | 0.5 | Names, dates, specific terms |
| Code/technical content | 0.4 | 0.6 | Syntax matters more |

**Recommendation:** ✅ **RRF is generally preferred** — it's parameter-free (except k), robust, and handles different score distributions well. The 0.7/0.3 weighted approach also works but requires score normalization.

### Re-ranking Strategies
1. **Cross-encoder re-ranking** — Use a small model to re-score top-N results (most accurate, but slow)
2. **LLM re-ranking** — Ask the LLM to pick the most relevant results from top-N
3. **Metadata boosting** — Boost recent memories, frequently accessed ones, or those with matching tags
4. **For memory systems:** Recency decay (exponential or linear) is critical — recent memories should score higher

---

## 5. Memory Chunking Strategies

### Markdown Chunking for Memory Files

**Best Approach: Heading-Aware Chunking**
```js
function chunkMarkdown(markdown, maxChunkSize = 1000) {
  const chunks = [];
  const lines = markdown.split('\n');
  let currentChunk = '';
  let currentHeadings = [];
  
  for (const line of lines) {
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    
    if (headingMatch) {
      // Save current chunk if it has content
      if (currentChunk.trim()) {
        chunks.push({
          text: currentHeadings.join(' > ') + '\n' + currentChunk.trim(),
          headings: [...currentHeadings]
        });
      }
      
      const level = headingMatch[1].length;
      currentHeadings = currentHeadings.slice(0, level - 1);
      currentHeadings[level - 1] = headingMatch[2];
      currentChunk = '';
    } else {
      currentChunk += line + '\n';
      
      // Split if too large
      if (currentChunk.length > maxChunkSize) {
        chunks.push({
          text: currentHeadings.join(' > ') + '\n' + currentChunk.trim(),
          headings: [...currentHeadings]
        });
        currentChunk = '';
      }
    }
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      text: currentHeadings.join(' > ') + '\n' + currentChunk.trim(),
      headings: [...currentHeadings]
    });
  }
  
  return chunks;
}
```

### Optimal Chunk Sizes

| Chunk Size | Best For | Notes |
|-----------|----------|-------|
| 256-512 tokens | Fine-grained retrieval, Q&A | More precise but may lose context |
| 512-1024 tokens | **Memory recall (RECOMMENDED)** | Good balance of context and precision |
| 1024-2048 tokens | Long-form content, summaries | Better context but less precise matching |

**For AI Memory:** **512-800 tokens** is the sweet spot. Each memory entry should be self-contained with enough context to be useful.

### Heading Preservation vs Sliding Window

| Strategy | Pros | Cons |
|----------|------|------|
| **Heading-aware** ⭐ | Preserves document structure, natural boundaries | Uneven chunk sizes |
| Sliding window | Uniform sizes, captures cross-boundary content | Loses structure, duplicates content |
| Paragraph-based | Natural text boundaries | Can be too small or too large |
| Semantic chunking | Most accurate boundaries | Requires an extra model call |

**Recommendation:** ✅ Heading-aware chunking with a max size fallback. Always prepend the heading hierarchy to each chunk for context.

---

## 6. Similar Projects to Study

### mem0 (mem-zero) ⭐
- **GitHub:** github.com/mem0ai/mem0 — Very popular (couldn't get exact stars from page, but trending #1)
- **Version:** v1.0.0 (major release!)
- **License:** Apache 2.0
- **YC-backed** company

**Architecture:**
- Universal memory layer for AI agents
- Multi-level memory: User, Session, and Agent state
- Uses LLM to extract and consolidate memories from conversations
- Vector store for semantic retrieval
- SDKs for Python and Node.js (`npm install mem0ai`)
- Default LLM: gpt-4.1-nano

**Research Claims:**
- +26% accuracy over OpenAI Memory (LOCOMO benchmark)
- 91% faster responses than full-context
- 90% lower token usage than full-context

**Key Design Pattern:**
```python
# mem0's approach:
# 1. User sends message
# 2. Search for relevant existing memories
# 3. Inject memories into system prompt
# 4. Generate response
# 5. Extract NEW memories from the conversation
# 6. Store/update memories (deduplication, consolidation)
```

**Recommendation:** ✅ **STUDY** — Best reference architecture for AI memory systems. The add→search→consolidate pattern is the gold standard.

### LangChain Memory
- Multiple memory types: ConversationBuffer, Summary, VectorStore, Entity
- VectorStoreRetrieverMemory is most relevant
- Heavy framework dependency
- **Recommendation:** 👀 Study the patterns, but don't adopt the framework for a lightweight system

### Other Notable Projects

**Letta (formerly MemGPT)**
- github.com/letta-ai/letta
- Self-editing memory for LLM agents
- Hierarchical memory (core memory + archival memory + recall memory)
- Good inspiration for memory tiers

**ChromaDB**
- Popular vector database, but not SQLite-based
- Has interesting API patterns for memory management

**LlamaIndex**
- Good chunking and indexing strategies
- Over-engineered for a simple memory system

---

## 7. Recommended Architecture for AI Agent Memory

Based on this research, here's the optimal stack:

### Tech Stack
| Component | Choice | Reason |
|-----------|--------|--------|
| SQLite driver | **better-sqlite3** | Most mature, best sqlite-vec support |
| Vector search | **sqlite-vec** | Only viable SQLite vector extension |
| Full-text search | **FTS5** (built into SQLite) | Free, fast, well-tested |
| Embeddings | **text-embedding-3-small (1536d)** | Best cost/quality ratio |
| ORM (optional) | **Drizzle** for metadata tables | Type-safe, lightweight |
| Chunking | Heading-aware + max 800 tokens | Preserves structure |
| Hybrid search | **RRF** (k=60) | Robust, parameter-free |

### Database Schema
```sql
-- Core memory table
CREATE TABLE memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  content TEXT NOT NULL,
  source TEXT,          -- file path, conversation, etc.
  memory_type TEXT,     -- 'fact', 'episode', 'preference', 'skill'
  importance REAL DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  last_accessed DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  metadata JSON
);

-- FTS5 index
CREATE VIRTUAL TABLE memories_fts USING fts5(
  content,
  content=memories,
  content_rowid=id
);

-- Vector index
CREATE VIRTUAL TABLE vec_memories USING vec0(
  embedding float[1536]
);

-- Sync triggers
CREATE TRIGGER memories_insert AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content) VALUES (new.id, new.content);
END;

CREATE TRIGGER memories_delete AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content) VALUES('delete', old.id, old.content);
  DELETE FROM vec_memories WHERE rowid = old.id;
END;
```

### Performance Estimates (sqlite-vec exhaustive scan)
| Vector Count | Dimensions | Search Time | Notes |
|-------------|-----------|-------------|-------|
| 1,000 | 1536 | ~1ms | Instant |
| 10,000 | 1536 | ~5-10ms | Fast enough |
| 100,000 | 1536 | ~50-100ms | Still usable |
| 1,000,000 | 1536 | ~500ms-1s | May need optimization |

For an AI agent memory system, you'll rarely exceed 100k memories, so exhaustive scan is fine.

---

## 8. What I Could NOT Verify

1. **OpenAI embedding pricing** — The main pricing page doesn't show embedding-specific prices in the truncated content I retrieved. The ~$0.02/1M tokens for small and ~$0.13/1M tokens for large are from my training data (Jan 2024 pricing).
2. **Cohere embed models** — Couldn't fetch their docs (404). They had embed-v3 models, likely still relevant.
3. **MTEB leaderboard** — Dynamic content, couldn't render. The scores listed are from OpenAI's own documentation.
4. **sqlite-vec GitHub stars** — Page shows "6.9k" in the 404 page sidebar, which is approximate.
5. **better-sqlite3 exact GitHub stars** — Couldn't get exact count from releases page.
6. **ZeroClaw project** — No reference found at the URL provided. May be a private/different project.
7. **OpenAI open-weight models** — Interestingly, OpenAI's models page lists `gpt-oss-120b` and `gpt-oss-20b` as open-weight models. These are new but I couldn't verify if they have embedding capabilities.

---

## 9. Key Takeaways

1. **sqlite-vec is THE answer** for SQLite vector search in 2026. No real alternatives.
2. **better-sqlite3 remains king** for Node.js SQLite, though node:sqlite is catching up.
3. **text-embedding-3-small (1536d)** is still the best bang-for-buck embedding model. No new OpenAI embedding model has been released since Jan 2024.
4. **Hybrid search (FTS5 + vectors + RRF)** significantly outperforms either approach alone.
5. **mem0's pattern** (search→inject→generate→extract→store) is the standard for AI memory.
6. **Heading-aware chunking at 512-800 tokens** is optimal for memory files.
7. **For <100k memories, exhaustive scan is fast enough** — no ANN index needed.
