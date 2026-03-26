# 🧠 بحث: أنظمة الذاكرة وإدارة الكونتكست لـ AI Agents

**تاريخ البحث:** 2026-02-20
**نظامنا الحالي:** OpenClaw — Docker, Linux, Node.js 22, Claude Opus 4, SQLite + FTS5 + OpenAI embeddings (text-embedding-3-small)

---

## 📊 ملخص تنفيذي

نظامنا الحالي (SQLite + embeddings + FTS5 + markdown files) **جيد ومناسب** للاستخدام الحالي. لكن فيه فرص تحسين كبيرة:

### أهم 3 ترقيات مقترحة (بالأولوية):
1. **🥇 Tool Call Tombstones** — توفير 90%+ من الكونتكست (سهل التطبيق، مجاني)
2. **🥈 AI Memory System (Gemini compression)** — ضغط المحادثات 20-100x (سهل، مجاني)
3. **🥉 LanceDB** — ترقية vector search من SQLite إلى embedded DB أسرع (مجاني، Node.js native)

---

## 📋 القسم الأول: أنظمة الذاكرة (Memory Systems)

### 1. Mem0 ⭐⭐⭐⭐⭐
| | |
|---|---|
| **GitHub** | https://github.com/mem0ai/mem0 |
| **النجوم** | ⭐ 47,664 |
| **آخر تحديث** | 2026-02-20 (نشط جداً) |
| **الترخيص** | Apache 2.0 |
| **إيش يعمل** | طبقة ذاكرة ذكية للـ AI agents — يحفظ تفضيلات المستخدم، يتعلم مع الوقت، يدعم ذاكرة على مستوى User/Session/Agent |
| **التكلفة** | مجاني (self-hosted) / مدفوع (Cloud) |
| **يشتغل عندنا؟** | ✅ نعم — عنده npm package (`mem0ai`), يحتاج OpenAI API |
| **درجة الفائدة** | 8/10 |

**المميزات:**
- +26% دقة أكثر من OpenAI Memory
- 91% أسرع، 90% أقل tokens
- يدعم Python و Node.js (npm install mem0ai)
- Multi-level memory: User + Session + Agent state
- Self-hosted أو Cloud

**كيف نطبقه:**
```bash
npm install mem0ai
```
```javascript
import { Memory } from 'mem0ai';
const memory = new Memory({ apiKey: process.env.OPENAI_API_KEY });

// حفظ ذاكرة
await memory.add(messages, { user_id: "mohammed" });

// بحث
const results = await memory.search("database choice", { user_id: "mohammed" });
```

**مقارنة مع نظامنا:**
- نظامنا: SQLite + embeddings → بحث vector يدوي
- Mem0: يضيف طبقة ذكية فوق — يستخرج facts تلقائياً، يدير التناقضات، يتعلم
- **التوصية:** يمكن دمجه كطبقة إضافية فوق نظامنا الحالي

---

### 2. Letta (formerly MemGPT) ⭐⭐⭐⭐
| | |
|---|---|
| **GitHub** | https://github.com/letta-ai/letta |
| **النجوم** | ⭐ 21,173 |
| **آخر تحديث** | 2026-01-29 |
| **الترخيص** | Apache 2.0 |
| **إيش يعمل** | منصة لبناء stateful agents مع ذاكرة متقدمة — الـ agent يقدر يعدل ذاكرته بنفسه ويتعلم مع الوقت |
| **التكلفة** | مجاني (self-hosted) / مدفوع (Cloud API) |
| **يشتغل عندنا؟** | ✅ نعم — Node.js SDK (`@letta-ai/letta-client`), يحتاج Letta API key |
| **درجة الفائدة** | 6/10 |

**المميزات:**
- Hierarchical memory (core memory + archival memory + recall memory)
- Self-editing memory — الـ agent يقرر إيش يحفظ وإيش يحذف
- يدعم skills و subagents
- Model agnostic

**لماذا 6/10 وليس أعلى:**
- نظامنا (OpenClaw) يعمل شي مشابه بالفعل (MEMORY.md + daily logs + embeddings)
- Letta أعقد من اللازم لحالتنا
- يحتاج Letta API key (أو self-host server)
- **نظامنا أبسط وأكثر تحكم**

---

### 3. ChromaDB ⭐⭐⭐⭐
| | |
|---|---|
| **GitHub** | https://github.com/chroma-core/chroma |
| **النجوم** | ⭐ 26,202 |
| **آخر تحديث** | 2026-02-20 (نشط جداً) |
| **الترخيص** | Apache 2.0 |
| **إيش يعمل** | Vector database مفتوح المصدر — يخزن embeddings ويبحث بـ nearest neighbors |
| **التكلفة** | مجاني (self-hosted) / Chroma Cloud مدفوع |
| **يشتغل عندنا؟** | ⚠️ جزئياً — Python primary, عنده JS client بس يحتاج Chroma server يشتغل |
| **درجة الفائدة** | 5/10 |

**لماذا 5/10:**
- نظامنا الحالي (SQLite + embeddings) يعمل نفس الشي تقريباً
- ChromaDB يحتاج server process منفصل
- الفائدة الإضافية محدودة لحجم بياناتنا الحالي
- **يستاهل فقط لو حجم البيانات كبر بشكل كبير**

---

### 4. LanceDB ⭐⭐⭐⭐⭐ (مُوصى به!)
| | |
|---|---|
| **GitHub** | https://github.com/lancedb/lancedb |
| **النجوم** | ⭐ 9,014 |
| **آخر تحديث** | 2026-02-19 (نشط) |
| **الترخيص** | Apache 2.0 |
| **إيش يعمل** | Embedded vector database — يشتغل مباشرة بدون server، مبني على Lance columnar format |
| **التكلفة** | مجاني 100% |
| **يشتغل عندنا؟** | ✅ ممتاز! — عنده TypeScript SDK أصلي، embedded (لا يحتاج server)، يشتغل على Linux بدون GPU |
| **درجة الفائدة** | 8/10 |

**لماذا LanceDB ممتاز لنا:**
- **Embedded** = يشتغل داخل process واحد مثل SQLite (لا يحتاج server منفصل!)
- Native TypeScript/Node.js support
- Full-text search + vector search + SQL في مكان واحد
- أسرع من SQLite للـ vector operations
- يدعم multimodal (text, images, etc.)
- Zero-copy, automatic versioning

**كيف نطبقه (بديل لـ SQLite vectors):**
```bash
npm install @lancedb/lancedb
```
```javascript
import lancedb from '@lancedb/lancedb';

const db = await lancedb.connect('/home/node/openclaw/data/lancedb');
const table = await db.createTable('memories', [
  { text: 'Mohammed prefers dark mode', vector: [0.1, 0.2, ...], timestamp: Date.now() }
]);

// Vector search
const results = await table.search([0.1, 0.2, ...]).limit(5).toArray();

// Full-text search
const results2 = await table.search('dark mode', { queryType: 'fts' }).toArray();
```

**خطة الترقية:**
1. تثبيت LanceDB
2. migrate بيانات الـ embeddings من SQLite
3. استخدام LanceDB للـ vector search + FTS
4. إبقاء SQLite للـ structured data (facts, preferences)

---

### 5. Graphiti (by Zep) ⭐⭐⭐⭐
| | |
|---|---|
| **GitHub** | https://github.com/getzep/graphiti |
| **النجوم** | ⭐ 22,952 |
| **آخر تحديث** | 2026-02-20 (نشط جداً) |
| **الترخيص** | Apache 2.0 |
| **إيش يعمل** | Knowledge graph framework مع temporal awareness — يبني graph من المحادثات تلقائياً، يتتبع التغييرات مع الوقت |
| **التكلفة** | مجاني (self-hosted) / Zep Cloud مدفوع |
| **يشتغل عندنا؟** | ⚠️ يحتاج Neo4j database (ثقيل على Docker الحالي) |
| **درجة الفائدة** | 7/10 (مفهومياً ممتاز، تطبيقياً ثقيل) |

**المميزات الفريدة:**
- Bi-temporal data model — يتتبع "متى صار الشي" و "متى عرفنا عنه"
- Hybrid retrieval: semantic + keyword + graph traversal
- يعالج التناقضات تلقائياً (temporal edge invalidation)
- MCP server متوفر!
- Sub-second latency

**لماذا 7 وليس أعلى:**
- يحتاج Neo4j (graph database) = heavy dependency
- Python-first (لا TypeScript SDK أصلي)
- أعقد من حاجتنا الحالية

**بديل خفيف نقدر نطبقه:**
- نأخذ **المفهوم** (temporal knowledge graph) ونطبقه على SQLite
- نضيف `valid_from` / `valid_until` لكل fact
- نربط الـ facts بـ relations بسيطة في جدول SQLite

---

### 6. Zep (Cloud Platform)
| | |
|---|---|
| **GitHub** | https://github.com/getzep/zep |
| **النجوم** | ⭐ 4,072 |
| **آخر تحديث** | 2026-02-14 |
| **إيش يعمل** | Context engineering platform — يجمع context من مصادر متعددة ويوصله للـ LLM بـ <200ms |
| **التكلفة** | مدفوع (Cloud only — الـ Community Edition deprecated!) |
| **يشتغل عندنا؟** | ❌ Cloud only — ما يشتغل self-hosted |
| **درجة الفائدة** | 3/10 |

**ملاحظة مهمة:** Zep Community Edition تم إيقافه. الآن cloud-only.
**التوصية:** تجاهل — Graphiti (المحرك المفتوح) أفضل خيار.

---

### 7. Supermemory ⭐⭐⭐
| | |
|---|---|
| **GitHub** | https://github.com/supermemoryai/supermemory |
| **النجوم** | ⭐ 16,541 |
| **آخر تحديث** | 2026-02-20 (نشط) |
| **الترخيص** | Open source |
| **إيش يعمل** | Memory engine — يحفظ من URLs, PDFs, text + يدعم MCP لربط مع Claude/Cursor |
| **التكلفة** | مجاني (self-host) / مدفوع (Cloud) |
| **يشتغل عندنا؟** | ⚠️ يمكن self-host بس يحتاج setup ثقيل |
| **درجة الفائدة** | 4/10 |

**لماذا 4 فقط:**
- مصمم أكثر للـ consumer use (حفظ bookmarks, articles)
- ما يضيف كثير على نظامنا الحالي
- MCP integration مفيد بس نقدر نبنيه بأنفسنا

---

### 8. Microsoft GraphRAG ⭐⭐⭐
| | |
|---|---|
| **GitHub** | https://github.com/microsoft/graphrag |
| **النجوم** | ⭐ 30,996 |
| **آخر تحديث** | 2026-02-20 (نشط جداً) |
| **الترخيص** | MIT |
| **إيش يعمل** | يستخرج knowledge graph من documents، يبني community summaries، يحسن RAG |
| **التكلفة** | مجاني بس **الـ indexing غالي جداً** (يستخدم LLM كثير) |
| **يشتغل عندنا؟** | ⚠️ Python only, الـ indexing يستهلك tokens كثيرة |
| **درجة الفائدة** | 4/10 |

**لماذا 4 فقط:**
- مصمم للـ static documents (batch processing)
- غالي جداً في الـ indexing
- Python only
- أبطأ من Graphiti (seconds vs sub-second)
- **Graphiti أفضل لحالتنا**

---

## 📋 القسم الثاني: إدارة الكونتكست (Context Management)

### 9. Tool Call Tombstones ⭐⭐⭐⭐⭐ (مُوصى به بشدة!)
| | |
|---|---|
| **GitHub** | https://github.com/Mellow-Artificial-Intelligence/tool-call-tombstones |
| **النجوم** | صغير (جديد) |
| **آخر تحديث** | 2025-10-30 |
| **إيش يعمل** | يضغط outputs الطويلة من tool calls إلى ملخصات قصيرة، يوفر 90%+ من الكونتكست |
| **التكلفة** | مجاني 100% |
| **يشتغل عندنا؟** | ✅ ممتاز! — مفهوم بسيط نقدر نطبقه مباشرة |
| **درجة الفائدة** | 9/10 |

**كيف يعمل:**
```
# قبل: tool output ~600 tokens
{ full CRM profile, engagement history, purchase data, support metrics... }

# بعد: summary ~50 tokens  
[TOOL SUMMARY] CustomerProfile: Active customer, 3 purchases, VIP tier, last contact 2 days ago
```

**كيف نطبقه عندنا:**
- بعد كل tool call، نستخدم نموذج خفيف (Claude Haiku / GPT-4o-mini) لتلخيص الـ output
- نستبدل الـ output الأصلي في الـ conversation history بالملخص
- **النتيجة:** 90%+ توفير في الكونتكست!

**خطة التنفيذ:**
```javascript
async function compressToolOutput(toolName, output) {
  if (output.length < 200) return output; // short outputs stay
  
  const summary = await llm.complete({
    model: 'claude-haiku', // cheap & fast
    prompt: `Summarize this ${toolName} output in 1-2 sentences, preserving key facts:\n${output}`
  });
  
  return `[COMPRESSED] ${summary}`;
}
```

---

### 10. LLMLingua (Microsoft) ⭐⭐⭐
| | |
|---|---|
| **GitHub** | https://github.com/microsoft/LLMLingua |
| **النجوم** | ⭐ 5,844 |
| **آخر تحديث** | 2025-10-28 (أقل نشاط) |
| **إيش يعمل** | Prompt compression — يزيل tokens غير مهمة، يحقق 20x compression |
| **التكلفة** | مجاني |
| **يشتغل عندنا؟** | ❌ يحتاج GPU + Python + small LLM model (GPT2/LLaMA) |
| **درجة الفائدة** | 3/10 |

**لماذا 3 فقط:**
- **يحتاج GPU** لتشغيل compression model = ما يشتغل على سيرفرنا
- Python only
- الـ compression يأخذ وقت (inference على model)
- **Tool Call Tombstones أبسط وأفعل لحالتنا**

---

### 11. AI Memory System (Gemini Compression) ⭐⭐⭐⭐⭐ (مُوصى به!)
| | |
|---|---|
| **GitHub** | https://github.com/jamesarslan/ai-memory-system |
| **النجوم** | جديد (Feb 2026) |
| **آخر تحديث** | 2026-02-07 |
| **إيش يعمل** | نظام ذاكرة ثلاثي الطبقات — يضغط المحادثات بنسبة 20:1 إلى 100:1 باستخدام Gemini |
| **التكلفة** | مجاني (Gemini API free tier: 2M tokens/day) |
| **يشتغل عندنا؟** | ✅ ممتاز! — Python script واحد، يستخدم Gemini API (عندنا key!) |
| **درجة الفائدة** | 9/10 |

**لماذا ممتاز لنا:**
- **مصمم خصيصاً لـ OpenClaw!** (مذكور بالاسم في الـ README)
- Three-layer architecture:
  1. Daily logs (raw) — **عندنا بالفعل:** `memory/YYYY-MM-DD.md`
  2. Compressed index — **نحتاج نضيفه**
  3. Long-term knowledge — **عندنا بالفعل:** `MEMORY.md`
- يستخدم Gemini API (مجاني 2M tokens/يوم — **عندنا key!**)
- Semantic search على الذاكرة المضغوطة
- نظام بسيط: ملف Python واحد + JSON files

**كيف نطبقه:**
```bash
git clone https://github.com/jamesarslan/ai-memory-system.git
export GEMINI_API_KEY="REDACTED_GOOGLE_API_KEY_2"

# ضغط محادثة
memory compress "We decided to use PostgreSQL for the project. Mohammed prefers dark mode."

# بحث
memory search "database choice"
```

**خطة الدمج مع نظامنا:**
1. أضف compression layer بين daily logs و MEMORY.md
2. استخدم Gemini لضغط المحادثات اليومية
3. خزن الملخصات المضغوطة في `memory/compressed/`
4. أضف semantic search على الملخصات

---

### 12. Recursive Summarization (تقنية — ليست أداة)
| | |
|---|---|
| **إيش يعمل** | تلخيص المحادثة بشكل متكرر — كل ما يمتلئ الكونتكست، لخص ثم استمر |
| **التكلفة** | تكلفة API calls فقط |
| **يشتغل عندنا؟** | ✅ نقدر نبنيه |
| **درجة الفائدة** | 7/10 |

**الفكرة:**
```
محادثة طويلة (50K tokens)
    ↓ لخص
ملخص (2K tokens) + آخر 10K من المحادثة
    ↓ لخص مرة ثانية لو امتلأ
ملخص الملخص (500 tokens) + آخر 10K
```

**كيف نطبقه:**
- لما الـ context يوصل 150K من 200K، نلخص أول 100K إلى 5K
- نحط الملخص في بداية الـ context
- نكمل بآخر 50K من المحادثة الأصلية
- **النتيجة:** context دائماً تحت السقف مع الحفاظ على المعلومات المهمة

---

### 13. Sliding Window + Summary (تقنية)
| | |
|---|---|
| **إيش يعمل** | يحتفظ بآخر N messages كاملة + ملخص لكل شي قبلها |
| **التكلفة** | مجاني (API calls فقط) |
| **يشتغل عندنا؟** | ✅ |
| **درجة الفائدة** | 7/10 |

**تطبيق عملي:**
```
[System prompt] (2K tokens)
[Summary of conversation so far] (1-3K tokens)
[Last 20 messages] (variable)
[Retrieved memories from DB] (2-5K tokens)
```

---

## 📋 القسم الثالث: أدوات مساعدة (Frameworks)

### 14. LlamaIndex
| | |
|---|---|
| **GitHub** | https://github.com/run-llama/llama_index |
| **النجوم** | ⭐ 47,084 |
| **إيش يعمل** | Framework كامل للـ RAG — data connectors, indexing, retrieval, query engines |
| **يشتغل عندنا؟** | ⚠️ Python primary (TypeScript version موجودة بس أقل features) |
| **درجة الفائدة** | 4/10 (overkill لحالتنا) |

---

## 🏆 التوصيات النهائية

### المرحلة 1: تحسينات سريعة (أسبوع واحد) 🚀

| التحسين | الصعوبة | التأثير | التكلفة |
|---------|---------|---------|---------|
| **Tool Call Tombstones** | سهل | 90%+ توفير context | مجاني |
| **AI Memory Compression** | سهل | 20-100x ضغط للمحادثات | مجاني (Gemini) |
| **Sliding Window Summary** | سهل | context لا ينتهي | API calls فقط |

### المرحلة 2: ترقيات متوسطة (2-4 أسابيع) 🔧

| التحسين | الصعوبة | التأثير | التكلفة |
|---------|---------|---------|---------|
| **LanceDB migration** | متوسط | vector search أسرع 10x+ | مجاني |
| **Temporal facts** | متوسط | تتبع تغيرات المعلومات | مجاني |
| **Recursive summarization** | متوسط | context management أفضل | API calls |

### المرحلة 3: ترقيات متقدمة (شهر+) 🎯

| التحسين | الصعوبة | التأثير | التكلفة |
|---------|---------|---------|---------|
| **Mem0 integration** | متوسط-صعب | ذاكرة ذكية adaptive | OpenAI API |
| **Knowledge Graph (mini)** | صعب | فهم العلاقات | مجاني |
| **MCP Memory Server** | متوسط | memory عبر أي أداة | مجاني |

---

## 🔄 مقارنة شاملة مع نظامنا الحالي

| الميزة | نظامنا الحالي | بعد التحسين |
|--------|---------------|-------------|
| **ذاكرة طويلة المدى** | ✅ MEMORY.md | ✅ MEMORY.md + compressed index |
| **ذاكرة يومية** | ✅ memory/YYYY-MM-DD.md | ✅ + auto-compression |
| **Vector Search** | ✅ SQLite + embeddings | ✅ LanceDB (أسرع 10x) |
| **Full-Text Search** | ✅ FTS5 | ✅ FTS5 + LanceDB FTS |
| **Context Compression** | ❌ لا يوجد | ✅ Tombstones + summaries |
| **Temporal Awareness** | ❌ بسيط | ✅ valid_from/valid_until |
| **Knowledge Graph** | ❌ لا يوجد | ⚡ SQLite-based mini graph |
| **Auto-learning** | ❌ يدوي | ✅ Mem0 auto-extraction |

---

## 💡 أفكار تطبيقية فورية

### 1. Tool Output Compression (اليوم)
```javascript
// في OpenClaw gateway أو middleware
function afterToolCall(toolName, output) {
  if (output.length > 500) {
    // Replace with summary in conversation history
    return summarizeWithHaiku(toolName, output);
  }
  return output;
}
```

### 2. Daily Log Compression (هذا الأسبوع)
```bash
# cron job يومي: compress yesterday's log
export GEMINI_API_KEY="..."
node compress-daily-log.mjs memory/2026-02-19.md > memory/compressed/2026-02-19.json
```

### 3. Smart Context Assembly (الأسبوع القادم)
```
Context Template:
├── System Prompt (2K)
├── SOUL.md highlights (1K)
├── Relevant memories from LanceDB (3K)
├── Compressed conversation summary (2K)
├── Last 15 messages (variable)
└── Current user message
Total: ~20-30K from 200K available
```

---

## 📚 مصادر إضافية

- [Mem0 Research Paper](https://mem0.ai/research) — Production-Ready AI Agents with Scalable Long-Term Memory
- [Graphiti/Zep Paper](https://arxiv.org/abs/2501.13956) — Temporal Knowledge Graph for Agent Memory
- [LLMLingua Paper](https://aclanthology.org/2023.emnlp-main.825/) — Prompt Compression
- [Microsoft GraphRAG Paper](https://arxiv.org/pdf/2404.16130) — Graph-based RAG

---

*تم البحث بواسطة PyraAI Research Subagent — 2026-02-20*
