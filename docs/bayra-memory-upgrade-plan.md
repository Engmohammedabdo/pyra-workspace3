# 🧠 Bayra Memory System Upgrade — خطة تنفيذية شاملة
**التاريخ:** 2026-02-17
**الحالة:** جاهز للتنفيذ بعد موافقة محمد

---

## المشكلة الحالية

ذاكرة بايرا = ملفات Markdown فقط:
- `MEMORY.md` — فهرس (1KB محدود)
- `memory/*.md` — ملفات يومية
- البحث بيقرأ كل الملفات كل مرة = بطيء وغير دقيق
- مفيش تصنيف، مفيش علاقات، مفيش أولويات
- الـ context window بيمتلي بسرعة

## الحل: نظام ذاكرة هجين ذكي

```
┌──────────────────────────────────────────────────────┐
│                    BAYRA AGENT                        │
│                                                      │
│  ┌────────────┐  ┌────────────┐  ┌───────────────┐  │
│  │ Ingestion  │  │ Retrieval  │  │ Consolidation │  │
│  │ Pipeline   │  │ Engine     │  │ Engine        │  │
│  └─────┬──────┘  └─────┬──────┘  └──────┬────────┘  │
│        └───────────────┼─────────────────┘           │
│                        ▼                             │
│  ┌──────────────────────────────────────────────┐    │
│  │              SQLite (WAL mode)                │    │
│  │                                              │    │
│  │  memories ─── entities ─── memory_relations  │    │
│  │      │                                       │    │
│  │  FTS5 (keyword) + vec0 (vector) = Hybrid     │    │
│  └──────────────────────────────────────────────┘    │
│                        │                             │
│  ┌─────────────────────▼────────────────────────┐    │
│  │  Markdown Backup (human-readable mirror)     │    │
│  └──────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────┘
```

---

## التقنيات المختارة (متأكد منها ✅)

| التقنية | الإصدار | الحالة | السبب |
|---------|---------|--------|-------|
| **better-sqlite3** | 12.6.2 | Stable ✅ | أسرع SQLite driver لـ Node.js، 11.7x أسرع من البدائل |
| **sqlite-vec** | 0.1.7-alpha.2 | Alpha ⚠️ | أفضل vector extension لـ SQLite، pure C، صفر dependencies |
| **text-embedding-3-small** | OpenAI | Stable ✅ | 512 dims، $0.02/1M tokens، أفضل cost/quality |
| **FTS5** | SQLite built-in | Stable ✅ | Full-text search مع BM25 scoring |
| **RRF (Reciprocal Rank Fusion)** | Algorithm | Proven ✅ | أفضل طريقة لدمج keyword + vector search |

**التكلفة:** ~$0.10/يوم (embeddings + classification) = **$3/شهر** 💰

---

## أنواع الذاكرة (4 أنواع)

| النوع | إيش يخزّن | مثال | مدة البقاء |
|-------|----------|------|-----------|
| 🎬 **Episodic** | أحداث ومحادثات | "محمد طلب مني أحلل Meta Ads" | تتلاشى بعد 3 شهور |
| 📚 **Semantic** | حقائق وقرارات | "محمد يفضّل التقارير القصيرة" | دائمة |
| 🔧 **Procedural** | طرق عمل | "لعمل deploy على Coolify: الخطوات..." | دائمة |
| 💭 **Working** | سياق الجلسة الحالية | المحادثة الجارية | تنتهي مع الجلسة |

---

## الـ Schema

```sql
-- الذكريات الأساسية
memories (id, type, subtype, content, summary, importance, confidence,
          access_count, created_at, updated_at, last_accessed_at,
          source, session_id, channel, tags, metadata,
          status, parent_id, visibility, version)

-- الكيانات (أشخاص، مشاريع، أدوات)
entities (id, type, name, aliases, properties)

-- ربط الذكريات بالكيانات
memory_entities (memory_id, entity_id, role)

-- ربط الذكريات ببعض
memory_relations (source_id, target_id, relation, weight)

-- Vector embeddings (sqlite-vec)
memory_embeddings USING vec0 (embedding float[512])

-- FTS5 للبحث النصي
memories_fts USING fts5 (content, tags)

-- Embedding cache (توفير تكلفة)
embedding_cache (text_hash, embedding, created_at, last_used)

-- Staging table للـ sub-agents
memory_staging (id, agent_id, content, type, importance, status)
```

---

## خوارزمية البحث الهجين

```
Query → ┬→ FTS5 (keyword BM25) → Top 50
        └→ vec0 (cosine similarity) → Top 50
                    ↓
        Reciprocal Rank Fusion (k=60)
                    ↓
        Multi-Signal Scoring:
          45% semantic similarity
          25% recency
          20% importance
          10% access frequency
                    ↓
        Top 5-10 results → Agent context
```

---

## دورة حياة الذاكرة

```
1. CAPTURE    → هل نحفظ هذا؟ (importance threshold)
2. CLASSIFY   → نوع + أهمية + كيانات (LLM-assisted)
3. DEDUP      → موجود قبل؟ (cosine > 0.92 = update)
4. EMBED      → OpenAI embedding → SQLite
5. RETRIEVE   → hybrid search + multi-signal ranking
6. REINFORCE  → كل استخدام = importance + 0.2
7. CONSOLIDATE → دمج الذكريات المتشابهة (أسبوعي)
8. DECAY      → الأقل أهمية تتلاشى تدريجياً
9. ARCHIVE    → بعد 90 يوم بدون استخدام + importance < 3
```

---

## الأمان والخصوصية

| القاعدة | التطبيق |
|---------|---------|
| 🔒 كلمات سر وتوكنز | **أبداً** ما تدخل الـ DB — regex filter |
| 👁️ Visibility levels | `private` (أنا ومحمد), `internal` (+ sub-agents), `public` (+ group chats) |
| 🛡️ Sub-agent access | Read-only من `memories`، write فقط لـ `staging` |
| 📋 Group chats | بس `semantic/fact` و `procedural` — **صفر** بيانات شخصية |
| 💾 Backup | يومي + integrity check عند كل startup |

---

## خطة الـ Migration

```
Phase A: Dual-Write (أسبوعين)
├── SQLite = primary write
├── Markdown = backup write
├── Read from SQLite, fallback to markdown
└── مقارنة نتائج يومية

Phase B: SQLite Primary
├── SQLite = source of truth
├── Markdown = weekly export للقراءة البشرية
└── MEMORY.md = auto-generated من أهم الذكريات
```

**Rollback plan:** لو فشل SQLite → flip feature flag → رجوع فوري لـ markdown

---

## خطة التنفيذ (8 Phases)

### Phase 1: Foundation — SQLite + Schema + Basic CRUD ⏱️ يوم واحد
**إيجنت متخصص:** `memory-db-builder`
- إنشاء الـ schema كامل
- better-sqlite3 + sqlite-vec setup
- CRUD operations (create, read, update, delete)
- WAL mode + pragmas
- Unit tests

### Phase 2: Embedding Engine ⏱️ يوم واحد
**إيجنت متخصص:** `memory-embedding-engine`
- OpenAI text-embedding-3-small integration
- Embedding cache مع LRU eviction
- Batch embedding support
- Async embedding queue (لما الـ API يكون down)
- Fallback: store without embedding → retry later

### Phase 3: Hybrid Search Engine ⏱️ يوم واحد
**إيجنت متخصص:** `memory-search-engine`
- FTS5 keyword search
- Vector cosine similarity search
- RRF fusion algorithm
- Multi-signal scoring (relevance + recency + importance + access)
- Context-aware retrieval (conversation context expansion)

### Phase 4: Ingestion Pipeline ⏱️ يومين
**إيجنت متخصص:** `memory-ingestion-builder`
- LLM-powered memory extraction (GPT-4o-mini)
- Classification (type + subtype + importance)
- Entity extraction (people, projects, tools)
- Deduplication (cosine > 0.92 = update existing)
- Sensitive data filter (regex for passwords, tokens)
- Relation detection between memories

### Phase 5: Migration Script ⏱️ يوم واحد
**إيجنت متخصص:** `memory-migration-agent`
- Parse MEMORY.md → semantic memories
- Parse memory/long-term.md → semantic memories
- Parse memory/YYYY-MM-DD.md → episodic memories
- Batch embed all existing memories
- Import to SQLite with proper classification
- Validation: compare search results old vs new

### Phase 6: Consolidation & Lifecycle ⏱️ يوم واحد
**إيجنت متخصص:** `memory-lifecycle-builder`
- Periodic consolidation (merge similar memories)
- Importance decay algorithm
- Reinforcement on access
- Garbage collection (archive old, unused memories)
- Sleep-time reflection (heartbeat-triggered review)

### Phase 7: Integration & API ⏱️ يومين
**إيجنت متخصص:** `memory-integration-builder`
- OpenClaw tool integration (replace memory_search/memory_get)
- Sub-agent staging table + promotion workflow
- Visibility controls per session type
- Backup system (daily cron)
- Error handling + graceful degradation
- Monitoring + health checks

### Phase 8: Testing & Dual-Write Period ⏱️ أسبوعين
**بايرا + محمد:**
- Dual-write mode (SQLite + markdown)
- Daily comparison: are SQLite results better?
- Edge case testing
- Performance benchmarks
- Final cutover decision

---

## مقارنة: قبل وبعد

| الجانب | قبل (Markdown) | بعد (SQLite Hybrid) |
|--------|---------------|-------------------|
| سرعة البحث | ثواني (يقرأ كل ملف) | ميلي ثانية |
| دقة البحث | keyword فقط | keyword + semantic + entities |
| تصنيف | مفيش | 4 أنواع + subtypes |
| علاقات | مفيش | entities + memory links |
| أولويات | مفيش | importance + decay + reinforcement |
| أمان | كل شي في ملف واحد | visibility levels + staging |
| backup | يدوي | تلقائي يومي |
| تكلفة | $0 | ~$3/شهر |

---

## المخاطر وكيف نتعامل معها

| المخاطر | الاحتمال | الحل |
|---------|---------|------|
| sqlite-vec alpha يتغير API | متوسط | نلف الـ API بـ wrapper — تغيير مكان واحد |
| OpenAI embedding API down | منخفض | Embedding queue + retry + fallback to text search |
| SQLite DB corruption | نادر جداً | Daily backup + integrity check + markdown fallback |
| تكلفة embeddings تزيد | منخفض | Switch to local model (all-MiniLM) |
| Performance مع 100K+ memories | بعيد | SQLite يتحمل ملايين — مش مشكلة |

---

## المصادر اللي بنينا عليها

1. **ZeroClaw** — SQLite + FTS5 + vector BLOBs (النموذج الأساسي)
2. **Mem0** — LLM-powered extraction + conflict resolution (نمط الإدخال)
3. **Letta/MemGPT** — Memory hierarchy + sleep-time reflection (دورة الحياة)
4. **Stanford Generative Agents paper** — Multi-signal scoring (recency + relevance + importance)
5. **LangChain** — Buffer → Summary → Vector progression (التدرج)

---

*هذه الخطة مبنية على أبحاث 3 إيجنتس متخصصين + تحليل 5 أنظمة ذاكرة حقيقية*
