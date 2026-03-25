# AI Agent Memory Systems Research — February 2026

> Research compiled 2026-02-19. Focus: what's changed since our current stack was implemented, and what upgrades to consider.

## Our Current Stack (Baseline)
- **better-sqlite3** v12.6.2 + **sqlite-vec** v0.1.7 + FTS5
- **text-embedding-3-small** (512 dims)
- RRF fusion (vector + FTS5)
- Multi-signal scoring: relevance 0.45, recency 0.25, importance 0.20, access frequency 0.10
- 4-tier taxonomy: Episodic, Semantic, Procedural, Working
- Soft-delete with decay
- Dedup threshold cosine > 0.92

---

## 1. SQLite + Vector Search Improvements

### sqlite-vec (current: v0.1.7)
- **Status:** Still pre-v1, active development. Latest: **v0.1.7-alpha.10** (Feb 13, 2026)
- Alpha releases include CI/CD fixes, segfault fix on invalid inputs to `vec_each()`, and npm linux-arm build fixes
- No major feature releases beyond 0.1.7 stable yet
- Still supports float, int8, and binary vectors in `vec0` virtual tables
- Pure C, zero dependencies — runs anywhere SQLite runs
- **Companion tools:** `sqlite-rembed` (remote embedding APIs), `sqlite-lembed` (local GGUF embeddings)

### better-sqlite3 (current: v12.6.2)
- **Status:** v12.6.2 is the latest (Jan 16, 2026). No new releases since.
- Stable and mature — no breaking changes expected

### Alternatives to Consider
| Alternative | Notes | Priority |
|---|---|---|
| **Turso/libSQL** | SQLite fork with native vector search, edge replication. Sponsor of sqlite-vec. | Medium — overkill for single-node |
| **sqlite-rembed** | Generate embeddings directly in SQL via OpenAI/Ollama. Useful for batch ops | Low — we already embed externally |
| **sqlite-lembed** | Local GGUF embedding models in SQLite. Zero API calls | Medium — interesting for offline/cost reduction |

### Verdict
> **No urgent upgrades needed.** Our sqlite-vec v0.1.7 is current stable. Watch for v0.2.0 which may bring HNSW indexing (currently brute-force KNN). The alpha releases are CI fixes only.

**Priority:** 🟡 Low | **Difficulty:** N/A (stay on current)

---

## 2. Memory Architectures for AI Agents

### 🔥 Letta (formerly MemGPT) — v0.12.1 (latest)
Major architectural shift with **letta_v1_agent**:
- **No more heartbeat system** — simpler base prompt, modern LLMs handle control loops natively
- **No send_message tool required** — works with non-tool-calling models
- **Memory Omni-Tool** — unified memory interface for dynamic block management. Agents can create/delete memory blocks on-the-fly
- **Enhanced Archival Memory** — hybrid search (full-text + semantic), datetime filtering
- **Parallel tool calling** — multiple tools execute simultaneously in sandboxes
- **Human-in-the-loop** — tools can require human approval before execution
- **Filesystem as memory** — Letta found that a simple filesystem + grep/search beats specialized memory tools on LoCoMo benchmark (74.0% with GPT-4o-mini vs Mem0's 68.5%)

**Key Insight:** Letta's research shows agents are highly effective at filesystem operations (likely in training data). Specialized single-hop retrieval tools underperform vs. iterative agent-driven search.

### Mem0 — v1.0.4 (Feb 17, 2026)
- **v1.0.0 milestone** (Oct 2025): API modernization, expanded vector store support
- **Reranker support** added: Cohere, ZeroEntropy, HuggingFace, sentence transformers, and LLM-based rerankers
- **Graph memory** with configurable embedding similarity thresholds
- **MCP tool integration** — delete_memories via MCP
- **OpenClaw plugin** — auto-recall injection and auto-capture (PR #4065, Feb 2026!)
- **Metadata filtering** for OSS version
- **Research paper** claims +26% accuracy over OpenAI Memory on LOCOMO, 91% faster, 90% fewer tokens

### Zep — v1.0.2 (latest)
- Shifted to **Community Edition** (v1.0.0, Sep 2025)
- Focus on CrewAI integration (v1.1.1 compatibility fix)
- Graph-based memory with knowledge extraction
- Less active development compared to Mem0/Letta

### 🔥 Anthropic Memory Tool (Claude 4.5 Sonnet+)
- **First frontier model post-trained for context management**
- Filesystem-like API: create/read/update/delete files in `/memories` directory
- Client-side tool — you control storage infrastructure
- Claude automatically checks memory directory before tasks
- Works across Claude Opus 4.x, Sonnet 4.x, Haiku 4.5
- **Letta integrated this** as a built-in tool that maps to their memory blocks

**Priority:** 🔴 High (Memory Omni-Tool pattern) | **Difficulty:** Medium

---

## 3. Auto-Ingestion Patterns

### Current Best Practices (2026)

#### Mem0's Approach
```
User message → LLM extracts facts → Dedup check → Upsert to vector store
```
- Uses LLM to extract structured memories from conversations
- Auto-capture on every `memory.add(messages)` call
- Configurable embedding similarity threshold for graph store matching

#### Letta's Approach
- Agent uses tools to self-manage memory (read/write/delete blocks)
- **Memory blocks** = editable text in context window
- **Archival memory** = vector-searched external storage
- Agent decides what to store vs. what to keep in-context
- **New: Filesystem approach** — dump conversations to files, let agent grep/search iteratively

#### Anthropic's Memory Tool Pattern
- Model is post-trained to understand context limitations
- Automatically manages memory files without heavy prompting
- Creates/reorganizes memory files as it learns
- Cross-conversation persistence via client-side storage

### Recommendations for Our Stack
1. **LLM-guided extraction** — Use the LLM to extract structured facts from each conversation turn (we may already do something similar)
2. **Self-organizing categories** — Let the agent create new memory categories dynamically (like Letta's dynamic block creation)
3. **Conversation-level summaries** — Auto-generate summaries after N turns, store as episodic memories

**Priority:** 🟡 Medium | **Difficulty:** Medium

---

## 4. Memory Consolidation & Forgetting

### 🔥 FadeMem (arXiv:2601.18642, Jan 2026)
**"Biologically-Inspired Forgetting for Efficient Agent Memory"**

This paper is directly relevant to our architecture:
- **Dual-layer memory hierarchy** with differential decay rates
- **Adaptive exponential decay** modulated by:
  - Semantic relevance
  - Access frequency
  - Temporal patterns
- **LLM-guided conflict resolution** — uses LLM to detect and merge conflicting memories
- **Intelligent memory fusion** — consolidates related info while letting irrelevant details fade
- **Results:** 45% storage reduction while maintaining superior multi-hop reasoning on LoCoMo, LTI-Bench

**Comparison to our approach:**
| Feature | Our System | FadeMem |
|---|---|---|
| Decay | Soft-delete with basic decay | Adaptive exponential decay (multi-signal) |
| Consolidation | Dedup at cosine > 0.92 | LLM-guided fusion + conflict resolution |
| Signals | relevance, recency, importance, freq | semantic relevance, access frequency, temporal patterns |
| Storage reduction | N/A | 45% reduction |

### STEAM (arXiv:2601.16872, Jan 2026)
**"Structured and Evolving Agent Memory"**
- **Atomic memory units** — decomposes preferences into distinct interest dimensions
- **Community-based organization** — groups similar memories across users, generates prototype memories
- **Adaptive evolution:** consolidation (refining) + formation (new interests)
- Focus on recommendation systems but patterns are transferable

### The Pensieve Paradigm / StateLM (arXiv:2602.12108, Feb 2026)
**"Stateful Language Models Mastering Their Own Context"**
- Trains foundation models with internal reasoning loop for self-state management
- Memory tools: context pruning, document indexing, note-taking
- Model actively manages its own context window
- Results: 10-20% accuracy improvement on chat memory; 52% vs 5% on BrowseComp-Plus
- **Key idea:** Train the model itself to be context-aware, not just bolt on tools

### MAPLE (AAMAS 2026 Workshop, Feb 2026)
**"Sub-Agent Architecture for Memory, Learning, and Personalization"**
- Separates memory concerns into dedicated sub-agents
- Addresses the "architectural conflation" where current systems mix memory/reasoning/action

### Survey: "Rethinking Memory in LLM-based Agents" (arXiv:2505.00675, updated Dec 2025)
Comprehensive taxonomy defining **6 core memory operations:**
1. **Consolidation** — strengthening/merging memories
2. **Updating** — modifying existing memories with new info
3. **Indexing** — organizing for efficient retrieval
4. **Forgetting** — removing/decaying irrelevant memories
5. **Retrieval** — finding relevant memories
6. **Condensation** — compressing memories to save space

### Recommended Upgrades

#### A. Implement FadeMem-style Adaptive Decay (HIGH PRIORITY)
Replace our linear soft-delete decay with adaptive exponential decay:
```
decay_rate = base_rate * (1 - semantic_relevance) * (1 - access_frequency_norm) * temporal_factor
score = importance * exp(-decay_rate * time_since_last_access)
```
**Priority:** 🔴 High | **Difficulty:** Low-Medium (formula change + tuning)

#### B. LLM-Guided Memory Fusion (MEDIUM PRIORITY)
Instead of simple cosine > 0.92 dedup, use LLM to:
- Detect semantically related but not identical memories
- Merge them into consolidated entries
- Resolve conflicts between contradicting memories
- Run as periodic background job (e.g., nightly consolidation)

**Priority:** 🟠 Medium-High | **Difficulty:** Medium (LLM calls cost + prompt engineering)

#### C. Memory Condensation (MEDIUM PRIORITY)
Periodically summarize clusters of episodic memories into semantic memories:
- Group related episodic entries by topic/entity
- Generate condensed summary
- Archive originals, keep summary as primary

**Priority:** 🟡 Medium | **Difficulty:** Medium

---

## 5. Hybrid Retrieval (Vector + Keyword + Graph)

### Current State of the Art

#### Our Current: RRF (Vector + FTS5)
Reciprocal Rank Fusion is still widely used but newer approaches exist:

#### Mem0's Approach (v1.0)
- Vector search + **rerankers** (Cohere, ZeroEntropy, HuggingFace, sentence transformers, LLM-based)
- Optional **graph memory** layer (Neo4j-based knowledge graphs)
- Configurable embedding similarity thresholds

#### Letta's Hybrid Search (Cloud)
- Full-text + semantic search combined
- DateTime filtering on archival memory
- Agent-driven iterative search (multi-hop)

#### Emerging Techniques

**1. Learned Sparse Retrieval (SPLADE v3)**
- Learns term importance weights, better than BM25/FTS5 for semantic matching
- Can run alongside vector search for true hybrid

**2. LLM-as-Reranker**
- Use small LLM (e.g., gpt-4.1-nano) to rerank top-K results from initial retrieval
- More accurate than RRF for ambiguous queries
- Trade-off: latency + cost per query

**3. Graph-Enhanced Retrieval**
- Store entity relationships in SQLite (no need for Neo4j)
- Query pattern: vector search → extract entities → traverse relations → expand context
- Can be implemented with SQLite recursive CTEs

**4. Adaptive Fusion Weights**
- Instead of fixed RRF, learn fusion weights per query type
- Simple approach: classify query type (factual/temporal/relational) → adjust weights

### Recommended Upgrades

#### A. Add LLM Reranking for Top-K (MEDIUM PRIORITY)
After RRF, pass top-10 results through a small LLM for reranking:
```
RRF top-10 → gpt-4.1-nano reranker → top-3 final results
```
**Priority:** 🟡 Medium | **Difficulty:** Low (simple API call)

#### B. Entity-Relation Graph in SQLite (LOW-MEDIUM PRIORITY)
Add entity extraction and store relations:
```sql
CREATE TABLE memory_entities (
  memory_id INTEGER, entity TEXT, entity_type TEXT
);
CREATE TABLE entity_relations (
  entity_a TEXT, relation TEXT, entity_b TEXT, weight REAL
);
```
Query: find memories connected to entities mentioned in query.
**Priority:** 🟡 Medium | **Difficulty:** Medium

#### C. Adaptive RRF Weights (LOW PRIORITY)
Instead of fixed 1/k+60, use query-type-dependent k values.
**Priority:** 🟢 Low | **Difficulty:** Low

---

## 6. Priority Summary

| Upgrade | Priority | Difficulty | Impact |
|---|---|---|---|
| **FadeMem-style adaptive decay** | 🔴 HIGH | Low-Medium | Better memory lifecycle, 45% storage savings |
| **LLM-guided memory fusion** | 🔴 HIGH | Medium | Smarter dedup, conflict resolution |
| **Memory Omni-Tool pattern** (Letta-style) | 🟠 MEDIUM-HIGH | Medium | Agent self-manages memory |
| **LLM reranking** for retrieval | 🟡 MEDIUM | Low | Better retrieval accuracy |
| **Memory condensation** (episodic→semantic) | 🟡 MEDIUM | Medium | Reduce storage, improve coherence |
| **Entity-relation graph** in SQLite | 🟡 MEDIUM | Medium | Multi-hop reasoning support |
| **Dynamic memory categories** | 🟡 MEDIUM | Low | Flexible taxonomy |
| **Adaptive RRF weights** | 🟢 LOW | Low | Marginal retrieval improvement |
| **sqlite-lembed** for local embeddings | 🟢 LOW | Low | Cost reduction, offline capability |
| **Upgrade sqlite-vec** (when v0.2.0 drops) | 🟢 LOW | Low | Potential HNSW indexing |

---

## 7. Key Takeaways

1. **Forgetting is the new frontier.** FadeMem (Jan 2026) shows that biologically-inspired decay with multi-signal modulation outperforms binary retention. Our soft-delete approach should evolve to adaptive exponential decay.

2. **LLM-guided consolidation > simple cosine dedup.** Using an LLM to merge, resolve conflicts, and condense memories is now standard practice in Mem0 and Letta.

3. **Context management is being baked into models.** Anthropic's memory tool and StateLM show the trend: models will increasingly manage their own context. Our architecture should prepare for this.

4. **Filesystem-as-memory works surprisingly well.** Letta's benchmark showing filesystem+grep beating specialized memory tools (74% vs 68.5% on LoCoMo) suggests that agent-driven iterative search may be more important than retrieval mechanism sophistication.

5. **Reranking > better initial retrieval.** Adding a lightweight LLM reranker after RRF is a cheap win compared to complex retrieval pipeline changes.

6. **Memory taxonomy research converges on 6 operations.** The "Rethinking Memory" survey defines: Consolidation, Updating, Indexing, Forgetting, Retrieval, Condensation. Our system covers Retrieval and basic Forgetting well but could improve on Consolidation and Condensation.

---

## 8. Recommended Implementation Roadmap

### Phase 1 (Quick Wins — 1-2 weeks)
- [ ] Implement adaptive exponential decay (replace linear soft-delete)
- [ ] Add LLM reranking step after RRF (gpt-4.1-nano, top-10 → top-3)
- [ ] Lower dedup threshold from 0.92 to 0.88 and add LLM verification for near-dupes

### Phase 2 (Core Improvements — 2-4 weeks)
- [ ] Build periodic consolidation job (nightly LLM-guided memory fusion)
- [ ] Add memory condensation (episodic clusters → semantic summaries)
- [ ] Implement entity extraction and relation storage in SQLite

### Phase 3 (Architecture Evolution — 4-8 weeks)
- [ ] Memory Omni-Tool pattern — let agent dynamically create/delete memory categories
- [ ] Adaptive RRF weights based on query classification
- [ ] Explore StateLM-style self-managing context (when models support it natively)

---

## References

1. **FadeMem** — Wei et al., arXiv:2601.18642, Jan 2026
2. **STEAM** — Liao et al., arXiv:2601.16872, Jan 2026
3. **StateLM / Pensieve Paradigm** — Liu et al., arXiv:2602.12108, Feb 2026
4. **MAPLE** — Piskala, AAMAS 2026 Workshop, Feb 2026
5. **Rethinking Memory in LLM Agents** — Du et al., arXiv:2505.00675, updated Dec 2025
6. **Letta v0.12.1** — github.com/letta-ai/letta
7. **Mem0 v1.0.4** — github.com/mem0ai/mem0
8. **Anthropic Memory Tool** — docs.anthropic.com
9. **Benchmarking AI Agent Memory** — letta.com/blog, 2025
10. **Mem0 Research Paper** — Chhikara et al., arXiv:2504.19413, 2025
