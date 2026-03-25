# AI Memory System Implementations Study
> Research conducted 2026-02-17 for OpenClaw memory system design

---

## 1. Mem0 (mem0ai/mem0)

### Data Model
- **Memory unit**: Short factual statements extracted from conversations (e.g., "User prefers sci-fi movies")
- **Scoping**: Memories are scoped by `user_id`, `session_id`, `run_id`, and `agent_id`
- **Metadata**: Arbitrary JSON metadata per memory (e.g., `{"category": "movie_recommendations"}`)
- **Memory types**: 4 layers:
  - **Conversation memory** — in-flight messages in a single turn (ephemeral)
  - **Session memory** — short-lived facts for current task (minutes to hours)
  - **User memory** — long-lived knowledge tied to a person (weeks to forever)
  - **Organizational memory** — shared context across agents/teams

### Storage Backend
- **Platform (hosted)**: Managed vector store + graph services + rerankers
- **OSS**: Pluggable vector DB — supports 18+ backends: Qdrant (default), Chroma, PGVector, Pinecone, Milvus, MongoDB, Redis, Supabase, FAISS, Elasticsearch, etc.
- **TypeScript SDK**: Currently only supports Qdrant, Redis, Valkey, Vectorize, and in-memory
- **Graph storage**: Optional graph layer for entity relationships (`enable_graph=True`)

### Search/Retrieval
- **Vector search**: Cosine similarity on embeddings
- **Filtering**: JSON logic filters (AND/OR, comparison operators) on metadata fields
- **Reranking**: Optional second-pass reranker for precision improvement
- **Threshold control**: `top_k` and `threshold` parameters for result tuning
- Pipeline: Query → Embedding → Vector search → Filter → Rerank → Results

### Memory Lifecycle
1. **Add**: Pass conversation messages → LLM extracts key facts → Conflict resolution against existing memories → Store in vector DB
2. **Search**: Natural language query → Vector similarity + filters → Ranked results
3. **Update**: Automatic conflict resolution — "latest truth wins" when `infer=True`
4. **Delete**: By memory ID or bulk by user/session
- **Key insight**: `infer=True` (default) uses LLM to extract structured memories; `infer=False` stores raw messages. Mixing modes creates duplicates.

### API Design
```javascript
// Add memories
memory.add(messages, { userId: "alice", metadata: { category: "preferences" } });

// Search memories
memory.search("What are Alice's hobbies?", { userId: "alice", limit: 3 });

// Get all memories for a user
memory.getAll({ userId: "alice" });

// Delete
memory.delete(memoryId);
```

### Strengths
- ✅ Clean, minimal API — `add()`, `search()`, `getAll()`, `delete()`
- ✅ LLM-powered extraction means the agent doesn't have to decide what to remember
- ✅ Conflict resolution prevents duplicate/contradictory memories
- ✅ Multi-level scoping (user, session, agent, org) is well thought out
- ✅ Has npm package (`mem0ai`) with TypeScript support
- ✅ Research-backed: +26% accuracy vs OpenAI Memory, 91% faster, 90% fewer tokens

### Weaknesses
- ❌ TypeScript SDK has limited vector DB support (only Qdrant, Redis, in-memory)
- ❌ Requires external LLM call for every `add()` operation (extraction step)
- ❌ No hybrid search (vector only, no keyword/FTS)
- ❌ No built-in memory consolidation/summarization over time
- ❌ Heavy dependency chain for self-hosted (needs vector DB + LLM provider)

### Lessons for Us
- **ADOPT**: The `add(messages) → LLM extracts → store` pattern is elegant
- **ADOPT**: Scoping memories by user_id/session_id is essential
- **ADOPT**: Conflict resolution on add (dedup/update existing)
- **AVOID**: Requiring external vector DB for a single-agent system — overkill
- **ADAPT**: Their 4-layer memory model maps well to OpenClaw (conversation=context window, session=WIP.md, user=MEMORY.md, org=AGENTS.md)

---

## 2. ZeroClaw (zeroclaw-labs/zeroclaw)

### Data Model
- **Memory entries**: Stored as rows in SQLite with text content + embedding vectors
- **Embedding cache**: Separate `embedding_cache` table with LRU eviction
- **Chunking**: Line-based markdown chunker with heading preservation
- **Config-driven**: `[memory]` section in TOML config

### Storage Backend
- **Primary**: SQLite — single file, zero dependencies
  - FTS5 virtual tables for keyword search
  - Embedding vectors stored as BLOBs
  - Embedding cache table with LRU eviction
- **Alternatives**: Lucid bridge (CLI sync + SQLite fallback), Markdown files, "none" (no-op)
- **Config**: `backend = "sqlite" | "lucid" | "markdown" | "none"`

### Search/Retrieval — Hybrid Search
- **Vector search**: Cosine similarity on SQLite BLOB embeddings
- **Keyword search**: FTS5 with BM25 scoring
- **Hybrid merge**: Custom weighted merge function
  - Default weights: `vector_weight = 0.7`, `keyword_weight = 0.3`
  - Configurable per deployment
- **Embedding providers**: OpenAI, custom URL, or noop (trait-based)

### Memory Lifecycle
1. **Store**: Agent uses `memory_store` tool → text embedded → stored in SQLite
2. **Recall**: Agent uses `memory_recall` tool → hybrid search → ranked results
3. **Forget**: Agent uses `memory_forget` tool → removes specific memories
4. **Reindex**: Safe rebuild of FTS5 + re-embed missing vectors atomically
- **Auto-save**: `auto_save = true` config option for automatic memory persistence

### API Design (Agent Tools)
```
memory_store  — Save a memory
memory_recall — Search memories (hybrid: vector + keyword)
memory_forget — Delete a memory
```
The agent decides when to store/recall/forget — no automatic extraction.

### Strengths
- ✅ **Zero external dependencies** — no Pinecone, no Elasticsearch, no LangChain
- ✅ **SQLite-native** — single file, atomic operations, embeddable
- ✅ **Hybrid search** (FTS5 + cosine similarity) with configurable weights
- ✅ **Embedding cache** with LRU eviction — avoids re-embedding same content
- ✅ **Atomic reindex** — safe rebuild without data loss
- ✅ **Trait-based architecture** — swap embedding provider via config
- ✅ Ultra-lightweight: <5MB RAM, <10ms startup

### Weaknesses
- ❌ Written in Rust — not directly portable to Node.js (but patterns are)
- ❌ Agent-driven memory (no automatic extraction) — agent must decide what to remember
- ❌ No memory consolidation or summarization
- ❌ Simple line-based chunking (no semantic chunking)
- ❌ No multi-user scoping (single-agent focused)

### Lessons for Us
- **ADOPT**: SQLite + FTS5 + vector BLOBs = the ideal stack for single-agent Node.js
- **ADOPT**: Hybrid search with weighted merge (0.7 vector / 0.3 keyword is a good default)
- **ADOPT**: Embedding cache with LRU eviction — critical for cost savings
- **ADOPT**: Atomic reindex strategy for data safety
- **ADOPT**: Agent tools (store/recall/forget) as the interface
- **ADAPT**: Their Rust BLOB approach → use `better-sqlite3` with Float32Array BLOBs in Node.js
- **ADAPT**: Add heading-preserving markdown chunking for document ingestion

---

## 3. Letta (formerly MemGPT)

### Data Model — MemFS (Memory Filesystem)
- **Memory = Git-backed markdown filesystem**
  - Folders of `.md` files with YAML frontmatter
  - Each file has: `description`, `limit` (char limit), `read_only` flag
  - Organized hierarchically: `system/`, `humans/`, project folders
- **Memory hierarchy**:
  - `system/` folder → **pinned to context window** (always visible)
  - Everything outside `system/` → visible in tree structure, but full contents omitted
- **Legacy**: "Memory blocks" — labeled text blobs (e.g., `human`, `persona`) editable via server-side tools

### Storage Backend
- **MemFS**: Git repository (local clone at `~/.letta/agents/<id>/memory`)
  - Agent edits files via bash tools (same tools used for code editing)
  - Must `git commit && git push` to save
  - Parallel subagents use **git worktrees** for concurrent memory edits
- **Messages/state**: Persisted via Letta API (cloud or self-hosted server)

### Search/Retrieval
- **Context window**: `system/` files are always loaded (pinned memory)
- **Tree browsing**: Agent sees directory tree of all memories, can read any file
- **Conversation search**: Messages are persisted and searchable via tools
- **No explicit vector search** on memory files — relies on LLM reading the tree

### Memory Lifecycle
1. **Init** (`/init`): Bootstrap memory from project analysis, import from Claude Code/Codex sessions
2. **Remember** (`/remember`): User-triggered or agent-triggered memory updates
3. **Sleep-time reflection**: Background subagents periodically review conversations and consolidate memories
   - Triggered by: step count, compaction event, or manual
   - Options: reminder-only (agent decides) or auto-launch
4. **Defragmentation**: On-demand subagent that cleans, deduplicates, and restructures memory
5. **Git versioning**: Full history, rollbacks, changelogs

### API Design
```
/init     — Bootstrap agent memory from project/prior sessions
/remember — Trigger memory update (with optional prompt)
/memory   — View current memory state (tree + content)
/memfs enable — Enable MemFS on existing agent
/sleeptime — Configure reflection settings
/clear, /new — New conversation, memory persists
```

### Strengths
- ✅ **Self-improving**: Agent edits its own memory over time
- ✅ **Git-backed**: Full version history, rollback, parallel edits via worktrees
- ✅ **Hierarchical**: Critical info pinned to context, rest available on-demand
- ✅ **Sleep-time reflection**: Background consolidation is a genius pattern
- ✅ **Defragmentation**: Explicit memory cleanup/restructuring
- ✅ **Cross-session persistence**: Same agent across days/months
- ✅ **Import from other agents**: Can learn from Claude Code/Codex sessions

### Weaknesses
- ❌ Requires Letta API (cloud service) for MemFS — not fully self-hostable yet
- ❌ No vector/semantic search on memory files
- ❌ Git overhead for every memory edit (commit + push)
- ❌ Memory files can get messy without active defragmentation
- ❌ Complex system — multiple subagents, git worktrees, reflection scheduling

### Lessons for Us
- **ADOPT**: Hierarchical memory (pinned/always-loaded vs. available-on-demand)
- **ADOPT**: Sleep-time reflection / periodic consolidation pattern
- **ADOPT**: Memory defragmentation as an explicit operation
- **ADOPT**: Markdown files as memory format (we already do this with MEMORY.md!)
- **ADOPT**: Agent self-editing its own memory (we already do this too)
- **ADAPT**: Git versioning → simpler file versioning or SQLite journal
- **AVOID**: Requiring cloud API for core memory functionality
- **INSIGHT**: OpenClaw's `MEMORY.md` + `memory/YYYY-MM-DD.md` pattern is actually Letta's approach, just less structured. We can formalize it.

---

## 4. LangChain Memory Patterns

> Note: LangChain has largely deprecated standalone memory modules in favor of LangGraph's persistence. But the patterns remain influential.

### Classic Memory Patterns

#### ConversationBufferMemory
- **What**: Stores all messages verbatim in a list
- **Data model**: `[{role, content, timestamp}]`
- **Search**: None — just appends all history to prompt
- **When to use**: Short conversations where all context fits in window
- **Lesson**: Simple but doesn't scale. We need this as a baseline.

#### ConversationSummaryMemory
- **What**: Uses LLM to maintain a running summary of the conversation
- **Data model**: Single text block that gets progressively summarized
- **Search**: None — summary is always injected into prompt
- **When to use**: Long conversations where full history exceeds context window
- **Lesson**: The "compaction" pattern — essential for context management

#### ConversationBufferWindowMemory
- **What**: Keeps only the last K messages
- **Data model**: Sliding window of messages
- **Search**: None — most recent K messages in prompt
- **Lesson**: Simple recency bias — combine with summary for best results

#### VectorStoreRetrieverMemory
- **What**: Embeds each message, stores in vector DB, retrieves relevant ones per query
- **Data model**: Each message → embedding → vector store
- **Search**: Semantic similarity on current query
- **When to use**: When relevant context might be far back in history
- **Lesson**: This is what mem0 does at scale. We need this for long-term memory.

#### ConversationKGMemory (Knowledge Graph)
- **What**: Extracts entities and relationships from conversations into a graph
- **Data model**: Triples: (subject, predicate, object)
- **Search**: Graph traversal from entities in current query
- **Lesson**: This is what Cognee does. Powerful but complex.

### Modern Evolution (LangGraph)
- LangChain now recommends **LangGraph** for agent memory
- "Deep Agents" with: automatic compression of long conversations, virtual filesystem, subagent-spawning
- Persistence via LangGraph's checkpointing system
- Key shift: Memory is now about **state management**, not just message history

### Lessons for Us
- **ADOPT**: Buffer + Summary hybrid (keep recent messages + summarize older ones)
- **ADOPT**: Vector retrieval for long-term memory search
- **ADAPT**: The progression Buffer → Summary → Vector mirrors short-term → long-term memory in humans
- **INSIGHT**: The move from standalone memory modules to integrated state management validates OpenClaw's file-based approach

---

## 5. Cognee (topoteretes/cognee)

### Data Model — Knowledge Graph
- **Core pipeline**: `add() → cognify() → memify() → search()`
- **Node types**: TextDocument, DocumentChunk, Entity, EntityType, TextSummary
- **Edge types**: `contains`, `is_part_of`, `is_a`, custom relationship names (e.g., `converts_documents_into`)
- **Each entity has**: name, type, description, version, topological_rank, metadata
- **Chunks have**: text, chunk_size, chunk_index, cut_type (e.g., "sentence_end")

### Storage Backend
- **Vector store**: Pluggable — supports multiple vector DBs for semantic search
- **Graph store**: Pluggable — Neo4j, NetworkX, or custom graph backends
- **Relational**: PostgreSQL or SQLite for metadata
- **30+ data source connectors** for ingestion

### Search/Retrieval
- **Vector search**: Semantic similarity on embeddings
- **Graph traversal**: Follow relationships to find connected knowledge
- **Combined**: Vector search to find entry points, then graph traversal for context
- **Search types**: Multiple search modes through the API

### Memory Lifecycle (Pipeline)
1. **Add**: `cognee.add("text")` — ingest raw data into a dataset
2. **Cognify**: `cognee.cognify()` — LLM-powered pipeline:
   - Document classification → Text chunking → Entity extraction → Relationship detection → Vector embedding → Summarization
3. **Memify**: `cognee.memify()` — Add memory algorithms to the graph
4. **Search**: `cognee.search("query")` — Query the knowledge graph
5. **Delete**: `cognee.delete(--all)` — Cleanup

### API Design
```python
await cognee.add("Cognee turns documents into AI memory.")
await cognee.cognify()  # Build knowledge graph
await cognee.memify()   # Add memory algorithms
results = await cognee.search("What does Cognee do?")
```

### Strengths
- ✅ **Knowledge graph** captures relationships, not just facts
- ✅ **Entity extraction** creates structured, queryable knowledge
- ✅ **Graph + vector** hybrid search gives both semantic and relational results
- ✅ **Modular pipeline** — customizable processing steps
- ✅ Research-backed: Paper on optimizing KG for LLM reasoning

### Weaknesses
- ❌ Python-only — no JavaScript/TypeScript SDK
- ❌ Heavy processing pipeline (LLM-intensive for every `cognify()`)
- ❌ Complex setup — graph DB + vector DB + LLM
- ❌ Overkill for a single-agent personal assistant
- ❌ No incremental updates — must re-cognify datasets

### Lessons for Us
- **CONSIDER (LATER)**: Knowledge graph for connecting entities across memories
- **ADOPT CONCEPT**: Entity extraction from conversations (who, what, where)
- **AVOID**: Full KG infrastructure — too heavy for OpenClaw's use case
- **ADAPT**: Lightweight entity tagging on memories (extract names, topics) without full graph DB

---

## Comparative Summary

| Feature | Mem0 | ZeroClaw | Letta | LangChain | Cognee |
|---------|------|----------|-------|-----------|--------|
| **Language** | Python + TS | Rust | TS (CLI) + Python | Python | Python |
| **Storage** | Pluggable vector DB | SQLite (single file) | Git + API | Pluggable | Graph + Vector DB |
| **Search** | Vector + filters | Hybrid (FTS5 + vector) | File browsing | Pattern-dependent | Graph + vector |
| **Memory extraction** | LLM-automatic | Agent-driven | Agent self-edit | Manual/chain | LLM pipeline |
| **Consolidation** | Conflict resolution | None | Sleep-time reflection | Summary chain | Re-cognify |
| **Multi-user** | Yes (user_id scoping) | No (single-agent) | Yes (agent-based) | Yes | Yes (datasets) |
| **Complexity** | Medium | Low | High | Low-Medium | High |
| **Self-hosted** | Yes (with deps) | Yes (zero deps) | Partial | Yes | Yes (with deps) |

---

## Recommendations for OpenClaw Memory System

### Architecture: Hybrid of ZeroClaw + Mem0 + Letta patterns

#### Storage Layer (from ZeroClaw)
- **SQLite + FTS5 + vector BLOBs** — single file, zero dependencies, perfect for Node.js
- Use `better-sqlite3` for synchronous, fast SQLite access
- Embedding cache with LRU eviction to minimize API calls
- Atomic operations for data safety

#### Memory Operations (from Mem0)
- **`add(messages)`** → LLM extracts key facts → dedup against existing → store
- **`search(query)`** → hybrid search (vector 0.7 + keyword 0.3) → ranked results
- **`forget(id)`** → remove specific memory
- Scope by conversation/session context

#### Memory Hierarchy (from Letta)
- **Pinned memory** (always in context): Agent identity, user preferences, current project
- **Searchable memory** (on-demand): Past conversations, decisions, learned facts
- **Archive memory** (cold storage): Old daily logs, completed projects
- **Sleep-time reflection**: Periodic background consolidation of daily notes into long-term memory

#### Memory Lifecycle (combined)
1. **Capture**: Every conversation → extract facts (Mem0 pattern)
2. **Store**: SQLite with embeddings + FTS5 index (ZeroClaw pattern)
3. **Search**: Hybrid retrieval with configurable weights (ZeroClaw pattern)
4. **Consolidate**: Periodic reflection to merge/update/clean (Letta pattern)
5. **Forget**: Explicit deletion + natural decay for old, unused memories

#### File Bridge (preserve OpenClaw's existing pattern)
- Keep `MEMORY.md` as the "pinned memory" (always loaded, human-readable)
- Keep `memory/YYYY-MM-DD.md` as daily "episodic memory" (raw notes)
- Add SQLite as the **searchable index** underneath
- Sync between files ↔ SQLite for best of both worlds

### Proposed Schema
```sql
CREATE TABLE memories (
  id TEXT PRIMARY KEY,
  content TEXT NOT NULL,
  embedding BLOB,          -- Float32Array as BLOB
  source TEXT,             -- 'conversation', 'reflection', 'manual'
  tags TEXT,               -- JSON array of extracted entities/topics
  importance REAL DEFAULT 0.5,
  access_count INTEGER DEFAULT 0,
  created_at TEXT,
  updated_at TEXT,
  expires_at TEXT           -- NULL = permanent
);

CREATE VIRTUAL TABLE memories_fts USING fts5(
  content, tags,
  content=memories, content_rowid=rowid
);

CREATE TABLE embedding_cache (
  text_hash TEXT PRIMARY KEY,
  embedding BLOB,
  created_at TEXT,
  last_used TEXT
);
```

### Priority Implementation Order
1. **Phase 1**: SQLite + FTS5 keyword search (no embeddings needed)
2. **Phase 2**: Add embedding vectors + hybrid search
3. **Phase 3**: LLM-powered memory extraction from conversations
4. **Phase 4**: Sleep-time reflection / consolidation
5. **Phase 5**: Entity extraction and relationship tracking (light KG)
