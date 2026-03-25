# 🧠 Memory Upgrade Research — بايرا v4

## الهدف
تطوير 3 أنظمة ذاكرة مستوحاة من memU لتحسين بايرا:
1. Memory Caching — تقليل tokens
2. Auto-flush — حفظ قبل compaction
3. Semantic Search أقوى

---

## 📊 الوضع الحالي

### ما عندنا:
- **DB:** SQLite via better-sqlite3 (20 MB، 1,025 ذكرى)
- **FTS:** memories_fts (FTS5 full-text search) ✅ شغال
- **Vector:** memory_embeddings (vec0 module) ❌ **معطل!** — vec0 مش محمّل
- **Hybrid Search:** search.mjs (RRF fusion) — موجود بس vector جزء منه معطل
- **Embedding:** OpenAI text-embedding-3-small (512 dims)
- **Cache:** embedding_cache (2,142 entries) + response_cache table
- **Proactive:** proactive-surface.mjs — موجود بس مش مفعّل بالكامل
- **OpenClaw Built-in:** memory_search + memory_get (يبحث في Markdown files)

### المشكلة الأساسية:
1. **Vector search معطل** — vec0 module مش محمّل في better-sqlite3
2. **كل الـ context يتحمّل** — مفيش selective memory injection
3. **Compaction يضيّع context** — OpenClaw عنده memoryFlush بس مش مفعّل عندنا
4. **Search بطيء** — FTS فقط بدون vector = نتائج أضعف

---

## 1️⃣ Memory Caching — تقليل الـ Tokens

### المشكلة:
كل session بتحمّل MEMORY.md + daily files + أي context = tokens كتير. memU يقول إنهم وفّروا 90% من الـ tokens.

### الحل — Context-Selective Memory Injection:

**بدل ما نحمّل كل الذكريات، نحمّل بس اللي relevant:**

```
User message → Extract intent/topics → Search memories → Inject top-K only
```

### التنفيذ:

#### Phase 1: Smart Context Builder (سهل — أسبوع)
```javascript
// context-builder.mjs
export async function buildSmartContext(userMessage, options = {}) {
  const { maxTokens = 2000, topK = 10 } = options;
  
  // 1. Extract key topics from user message
  const topics = extractTopics(userMessage);
  
  // 2. Search memories by relevance
  const results = await hybridSearch(db, userMessage, embedding, {
    limit: topK,
    tokenBudget: maxTokens
  });
  
  // 3. Format as compact context block
  return results.map(r => `[${r.type}] ${r.summary || r.content}`).join('\n');
}
```

#### Phase 2: Response Cache (موجود! بس محتاج تفعيل)
- `response-cache.mjs` **موجود بالفعل** في tools/memory/
- يحفظ نتائج البحث بـ SHA-256 hash
- TTL: ساعة واحدة
- **المطلوب:** تفعيله وربطه بالـ memory_search tool

#### Phase 3: Insight Caching (متوسط — 2 أسابيع)
```javascript
// insight-cache.mjs
// Pre-compute summaries for common query patterns
export async function cacheInsight(topic, memories) {
  const summary = await llm.summarize(memories); // One LLM call
  await db.prepare(`
    INSERT OR REPLACE INTO insight_cache (topic_hash, topic, summary, memory_ids, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(hash(topic), topic, summary, JSON.stringify(memories.map(m => m.id)), now());
}
```

### التأثير المتوقع:
- **Token reduction:** 40-60% (مش 90% زي ما memU يقولوا — هذا مبالغة)
- **السبب:** أغلب الـ tokens تروح على الـ system prompt + tools مش الذاكرة

---

## 2️⃣ Auto-flush — حفظ قبل الـ Compaction

### المشكلة:
لما OpenClaw يعمل compaction، الـ context القديم يتلخص وممكن تضيع تفاصيل مهمة.

### الخبر الحلو — OpenClaw عنده الميزة جاهزة! 🎉

من الـ docs:
```json
{
  "agents": {
    "defaults": {
      "compaction": {
        "reserveTokensFloor": 20000,
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 4000,
          "systemPrompt": "Session nearing compaction. Store durable memories now.",
          "prompt": "Write any lasting notes to memory files; reply with NO_REPLY if nothing to store."
        }
      }
    }
  }
}
```

### التنفيذ:

#### Phase 1: تفعيل memoryFlush الموجود (سهل جداً — ساعة!)
- **بس نفعّله في openclaw.json**
- OpenClaw بيعمل "silent agentic turn" قبل الـ compaction
- بيطلب من الموديل يكتب أي معلومات مهمة قبل ما تضيع

#### Phase 2: Auto-extract + DB Save (متوسط — أسبوع)
```javascript
// pre-compaction-hook.mjs
// يشتغل تلقائي قبل كل compaction

export async function preCompactionFlush(sessionMessages) {
  // 1. Extract facts from recent messages
  const facts = await extractFacts(sessionMessages.slice(-20));
  
  // 2. Save to bayra.db
  for (const fact of facts) {
    await createMemory({
      type: fact.type, // semantic, episodic, procedural
      content: fact.content,
      importance: fact.importance,
      source: 'auto-flush',
      tags: JSON.stringify(fact.tags)
    });
  }
  
  // 3. Also append to daily log
  appendToDaily(facts);
  
  return facts.length;
}
```

#### Phase 3: Smart Summarization (متقدم — 2 أسابيع)
- بدل ما نحفظ كل شي، نحفظ بس: قرارات، أرقام، أسماء، مواعيد، اتفاقات
- نستخدم الـ fact-extractor.mjs الموجود (عندنا بالفعل!)

### التأثير المتوقع:
- **Zero data loss** على الـ compaction
- **أهم ميزة** من الثلاثة — لأن الحين ممكن تضيع معلومات فعلاً

---

## 3️⃣ Semantic Search أقوى

### المشكلة:
- vec0 module **مش شغال** — vector search معطل تماماً!
- نعتمد على FTS5 فقط = keyword matching بس
- مفيش re-ranking أو multi-query

### الخيارات المتاحة:

| الحل | السرعة | الجودة | التعقيد | ملاحظات |
|------|--------|--------|---------|---------|
| **sqlite-vec** (إصلاح) | ⚡⚡⚡ | ⭐⭐⭐ | سهل | محتاج نحمّل vec0 extension |
| **In-memory cosine** | ⚡⚡⚡ | ⭐⭐⭐ | سهل | نحمّل embeddings في RAM |
| **LanceDB** | ⚡⚡ | ⭐⭐⭐⭐ | متوسط | عندنا migrate-to-lancedb.mjs جاهز! |
| **QMD** (OpenClaw built-in) | ⚡⚡ | ⭐⭐⭐⭐⭐ | سهل | BM25 + vectors + reranking |
| **Qdrant** | ⚡ | ⭐⭐⭐⭐⭐ | صعب | محتاج سيرفر منفصل |

### التوصية: QMD (OpenClaw Built-in) + In-memory Fallback

#### Phase 1: إصلاح Vector Search (سهل — ساعات)
```javascript
// in-memory-vector.mjs
// بدل vec0، نحمّل embeddings في الـ RAM ونعمل cosine similarity

export function inMemoryVectorSearch(db, queryEmbedding, options = {}) {
  const { limit = 20 } = options;
  
  // Load all embeddings from cache
  const rows = db.prepare(`
    SELECT ec.text_hash, ec.embedding, m.id, m.content, m.type, m.importance
    FROM embedding_cache ec
    JOIN memories m ON m.id = (
      SELECT memory_id FROM memory_entity_embeddings WHERE hash = ec.text_hash LIMIT 1
    )
    WHERE m.status = 'active'
  `).all();
  
  // Compute cosine similarity
  const scored = rows.map(row => ({
    ...row,
    similarity: cosineSimilarity(queryEmbedding, deserializeEmbedding(row.embedding))
  }));
  
  scored.sort((a, b) => b.similarity - a.similarity);
  return scored.slice(0, limit);
}

function cosineSimilarity(a, b) {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

#### Phase 2: تفعيل QMD Backend (سهل — يوم)
OpenClaw عنده QMD backend جاهز:
```json
{
  "memory": {
    "backend": "qmd"
  }
}
```
- BM25 + vectors + **reranking** 
- يشتغل locally بدون API
- يدعم session JSONL indexing

#### Phase 3: Multi-Query RAG (متوسط — أسبوع)
```javascript
// multi-query-rag.mjs (موجود بالفعل!)
// يعمل reformulate للـ query من عدة زوايا

export async function multiQuerySearch(originalQuery, db) {
  // Generate 3 query variations
  const queries = await generateQueryVariations(originalQuery);
  // queries = ["original", "rephrased", "keywords-only"]
  
  // Search with each, merge results
  const allResults = [];
  for (const q of queries) {
    const results = await hybridSearch(db, q, await embed(q));
    allResults.push(...results);
  }
  
  // Deduplicate and re-rank
  return deduplicateAndRank(allResults);
}
```

### التأثير المتوقع:
- **Search quality:** من 60% → 90%+ recall
- **الأهم:** بنلاقي ذكريات حتى لو الصياغة مختلفة تماماً

---

## 📋 خطة التنفيذ المرحلية

### Sprint 1 — Quick Wins (يوم-يومين) ⚡
1. ✅ تفعيل `memoryFlush` في openclaw.json (ساعة)
2. ✅ إصلاح vector search بـ in-memory cosine (ساعات)
3. ✅ تفعيل response-cache.mjs (ساعة)

### Sprint 2 — Core Upgrades (أسبوع) 🔧
4. بناء context-builder.mjs (Smart Context Selection)
5. تفعيل QMD backend أو إصلاح sqlite-vec
6. تفعيل multi-query-rag.mjs

### Sprint 3 — Advanced (2 أسابيع) 🚀
7. بناء pre-compaction-hook مع fact extraction
8. Insight caching system
9. Memory lifecycle automation (consolidation, decay, cleanup)

---

## ⚠️ المخاطر

1. **QMD** — محتاج Bun + SQLite with extensions — ممكن ما يشتغل على الـ container
2. **In-memory vector** — لو الذكريات كترت (10K+) ممكن يبطئ
3. **LLM calls for caching** — كل insight cache = API call = تكلفة
4. **memoryFlush** — ممكن يبطئ الـ compaction بثانيتين (مقبول)

## 💡 الخلاصة

- **أسهل وأكبر تأثير:** تفعيل memoryFlush + إصلاح vector search
- **أكبر توفير tokens:** Smart Context Builder
- **أفضل جودة بحث:** QMD أو multi-query RAG
- **memU مش سحر** — أغلب اللي يقولوه عندنا أدواته جاهزة، بس مش مفعّلة!

---
*Research by بايرا 🦊 — 2 مارس 2026*
