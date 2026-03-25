# 🧠 خطة ترقية ذاكرة بايرا — V2

**التاريخ:** 21 فبراير 2026
**الحالة:** مراجعة محمد
**الهدف:** 3 ترقيات تحوّل الذاكرة من "تخزين" إلى "فهم"

---

## 📊 الوضع الحالي (Baseline)

| المقياس | القيمة | ملاحظة |
|---------|--------|--------|
| **Memories** | 474 active / 528 total | 250 semantic + 218 episodic + 6 procedural |
| **Entities** | 69 | مشاريع، أشخاص، أدوات |
| **Relations** | 201 | روابط بين الذكريات |
| **Embeddings** | 527 | OpenAI text-embedding-3-small (512-dim) |
| **DB Size** | 5.44 MB | SQLite + WAL |
| **Vector Search** | 1.35ms avg | sqlite-vec brute force scan |
| **Search** | Hybrid (FTS5 + Vector + RRF) | شغال ممتاز |
| **Ingestion** | LLM extraction via OpenAI | يشتغل كل 6 ساعات (cron) |

### Schema الحالي — أعمدة memories:
```
id, type, subtype, content, summary, importance, confidence,
access_count, created_at, updated_at, event_at, last_accessed_at,
expires_at, source, session_id, channel, tags, metadata,
status, parent_id, visibility, version
```

**الملاحظة:** عندنا `event_at` (متى حصل الحدث) و `expires_at` (متى ينتهي) — بس **ما عندنا `valid_from`/`valid_until`** للحقائق اللي تتغير.

---

## 🔴 الترقية 1: Temporal Awareness (صلاحية الحقائق)

### المشكلة بمثال:
```
ذكرى قديمة: "سعر خدمة الـ WhatsApp Bot = 5,000 AED"     (يناير 2026)
ذكرى جديدة: "سعر خدمة الـ WhatsApp Bot = 7,500 AED"     (فبراير 2026)
```
الحين **الاتنين active** — لما أبحث عن السعر، ممكن أرجّع القديم!

### الحل:
1. **أعمدة جديدة:** `valid_from TEXT` + `valid_until TEXT` + `superseded_by TEXT`
2. **Supersession logic:** لما حقيقة جديدة تتعارض مع قديمة:
   - القديمة: `valid_until = الآن` + `superseded_by = ID الجديدة`
   - الجديدة: `valid_from = الآن` + `valid_until = NULL` (سارية)
3. **Search filter:** البحث يفضّل الحقائق **السارية** (valid_until IS NULL)
4. **CLI command:** `node cli.mjs supersede <old_id> <new_id>` لربط يدوي

### الملفات المتأثرة:
| الملف | التعديل |
|-------|---------|
| `schema.sql` | إضافة 3 أعمدة + index |
| `db.mjs` | تحديث `createMemory()` + إضافة `supersedeMemory()` |
| `search.mjs` | تعديل `hybridSearch()` لترتيب الحقائق السارية أعلى |
| `cli.mjs` | إضافة أمر `supersede` |
| `migrate.mjs` | سكريبت migration آمن |

### Schema Migration:
```sql
-- Migration V2: Temporal Awareness
ALTER TABLE memories ADD COLUMN valid_from TEXT;
ALTER TABLE memories ADD COLUMN valid_until TEXT;
ALTER TABLE memories ADD COLUMN superseded_by TEXT REFERENCES memories(id);

-- For existing semantic memories, set valid_from = created_at
UPDATE memories SET valid_from = created_at WHERE type = 'semantic' AND valid_from IS NULL;

-- Index for temporal queries
CREATE INDEX IF NOT EXISTS idx_memories_temporal ON memories(valid_from, valid_until);
CREATE INDEX IF NOT EXISTS idx_memories_superseded ON memories(superseded_by);
```

### Search Boost Logic:
```javascript
// في hybridSearch — بعد RRF scoring:
// حقيقة سارية (valid_until IS NULL) → bonus +0.15
// حقيقة منتهية (valid_until NOT NULL) → penalty -0.3
// هذا يخلي الحقائق الأحدث تطلع أول بدون حذف القديمة
```

### الاختبار:
1. ✅ Migration على نسخة backup
2. ✅ إنشاء حقيقتين متعارضتين + supersede
3. ✅ البحث يرجع الجديدة أول
4. ✅ الـ stats تعرض عدد الحقائق المنتهية
5. ✅ Rollback test — حذف الأعمدة بأمان

---

## 🟡 الترقية 2: Auto Fact Extraction (استخراج تلقائي)

### المشكلة:
الـ ingestion الحالي يشتغل **كل 6 ساعات على ملفات الـ daily notes فقط**. ما يعالج:
- المحادثات المباشرة (Telegram)
- الحقائق اللي تطلع من شغل الـ sub-agents
- القرارات اللي تتاخذ في نص المحادثة

### الحل — 3 طبقات:

#### Layer 1: Real-Time Extraction Hook
```javascript
// extractFromConversation(messages) — يتحلل بعد كل رسالة مهمة
// يشتغل ASYNC — ما يأخر الرد على محمد
// يستخدم نفس EXTRACTION_SYSTEM_PROMPT الموجود
```

**متى يشتغل:**
- ❌ مش كل رسالة (غالي + غير ضروري)
- ✅ كل **5 رسائل** أو كل **15 دقيقة** (أيهما أول)
- ✅ فوراً لما يقول محمد "احفظي" أو "تذكري"
- ✅ فوراً لما يتاخذ **قرار** واضح

#### Layer 2: Conflict Detection (تعارض الحقائق)
```javascript
// بعد ما نستخرج حقيقة جديدة:
// 1. نبحث عن حقائق مشابهة (vector similarity > 0.85)
// 2. لو لقينا حقيقة قديمة متعارضة → auto-supersede
// 3. لو لقينا حقيقة مشابهة بس مش متعارضة → merge/skip
```

**مثال عملي:**
```
حقيقة قديمة: "محمد يستخدم Bluehost للإيميل"
محادثة جديدة: "محمد نقل الإيميل على Zoho"
→ Auto-detect conflict → supersede القديمة → حفظ الجديدة مع valid_from
```

#### Layer 3: Entity Auto-Linking
الموجود حالياً: `findEntity()` يبحث بالاسم بس.
**التحسين:** fuzzy match + alias detection
```
"أ. حسين" = "حسين الغزال الشامسي" = "Hussein"
```

### الملفات المتأثرة:
| الملف | التعديل |
|-------|---------|
| `ingest.mjs` | إضافة `extractFromConversation()` + conflict detection |
| `db.mjs` | إضافة `findSimilarFacts()` |
| `search.mjs` | إضافة `conflictSearch()` (vector search مع threshold عالي) |
| `auto-ingest.mjs` | إضافة conversation ingestion trigger |
| **جديد:** `fact-extractor.mjs` | الموديول الأساسي للاستخراج التلقائي |

### الاختبار:
1. ✅ استخراج 5 حقائق من محادثة حقيقية
2. ✅ كشف تعارض بين حقيقتين
3. ✅ Auto-supersede يشتغل صح
4. ✅ ما يستخرج حقائق من "أهلاً" و "تمام"
5. ✅ Entity aliases تتكشف

---

## 🔵 الترقية 3: Vector Search Optimization

### تحليل الأداء الحالي:
```
527 embeddings  →   1.35ms  ✅ ممتاز
5,000 projected →  12.83ms  ✅ مقبول
50,000 projected → 128.27ms ⚠️ بطيء
```

### القرار: **sqlite-vec كافي الآن — نجهّز LanceDB كـ fallback**

**السبب:** sqlite-vec بـ brute force يعطينا 1.35ms على 527 سجل. حتى لو وصلنا 5,000 (سنة+ من الآن) = ~13ms وهذا ممتاز. LanceDB يستاهل بس لما نوصل 10,000+.

### الخطة الذكية:
1. **الآن:** تحسين sqlite-vec بـ pre-filtering (نفلتر بالـ type/status قبل الـ vector search)
2. **الآن:** إضافة embedding cache warming عند بدء التشغيل
3. **تجهيز:** كتابة `VectorBackend` interface — يشتغل مع sqlite-vec أو LanceDB
4. **لاحقاً:** لما نوصل 5,000+ → تبديل الـ backend لـ LanceDB بسطر واحد

### Abstract Vector Interface:
```javascript
// vector-backend.mjs
export class VectorBackend {
  async search(embedding, limit, filters) { throw new Error('abstract'); }
  async upsert(id, embedding) { throw new Error('abstract'); }
  async delete(id) { throw new Error('abstract'); }
  async count() { throw new Error('abstract'); }
}

export class SqliteVecBackend extends VectorBackend {
  // الموجود حالياً — نلفه بـ class
}

export class LanceDBBackend extends VectorBackend {
  // يتكتب لما نحتاجه — جاهز للتبديل
}
```

### Pre-filter Optimization:
```javascript
// بدل ما نجيب كل الـ embeddings ونفلتر بعدين:
// 1. نفلتر الـ memory IDs بالـ SQL أول (type, status, importance)
// 2. نبحث vector فقط في الـ filtered set
// هذا يقلل الـ search space بـ 40-60%
```

### الملفات المتأثرة:
| الملف | التعديل |
|-------|---------|
| **جديد:** `vector-backend.mjs` | Abstract interface + SqliteVecBackend |
| `search.mjs` | استخدام VectorBackend بدل direct sqlite-vec calls |
| `db.mjs` | Pre-filter queries |

### الاختبار:
1. ✅ Benchmark قبل وبعد الـ pre-filter
2. ✅ VectorBackend interface يشتغل مع sqlite-vec
3. ✅ نفس النتائج (لا regression)

---

## 📐 ترتيب التنفيذ (الأهم أول)

```
الترقية 1 (Temporal) ─────────────► الترقية 2 (Auto Extract) ─────────► الترقية 3 (Vector)
     ↓                                      ↓                                  ↓
  schema migration                   يعتمد على supersede()              يعتمد على الكل
  + supersedeMemory()                من الترقية 1
  + search boost
```

**لماذا هذا الترتيب:**
1. **Temporal أولاً** — لأن Auto Extract يحتاج `supersedeMemory()` لكشف التعارضات
2. **Auto Extract ثانياً** — الأكبر والأهم، يعتمد على Temporal
3. **Vector أخيراً** — تحسين أداء، مش وظيفة جديدة

---

## 🛡️ حماية البيانات (Zero Data Loss)

### قبل أي تعديل:
```bash
# 1. نسخة احتياطية كاملة
cp /home/node/.openclaw/memory/bayra.db /home/node/.openclaw/memory/bayra.db.pre-v2-backup

# 2. نسخة على Supabase
safe-upload.sh bayra.db.pre-v2-backup backups/bayra-pre-v2.db

# 3. التحقق من سلامة النسخة
sqlite3 bayra.db.pre-v2-backup "PRAGMA integrity_check;"
```

### كل migration:
- ✅ `ALTER TABLE ADD COLUMN` آمن في SQLite — ما يحذف بيانات
- ✅ كل عملية في `BEGIN/COMMIT` transaction
- ✅ `--dry-run` flag لكل أمر قبل التنفيذ الفعلي
- ✅ Rollback script جاهز

### بعد كل ترقية:
```bash
# Integrity check
node cli.mjs health

# مقارنة العدد
node cli.mjs stats  # لازم يكون نفس العدد أو أكثر — أبداً أقل
```

---

## 📋 Sub-Agent Distribution

| الـ Agent | المهمة | الملفات | المدة المتوقعة |
|----------|--------|---------|----------------|
| `upgrade-temporal` | الترقية 1: Schema + Migration + supersedeMemory() + search boost | schema.sql, db.mjs, search.mjs, cli.mjs, migrate.mjs | ~15 دقيقة |
| `upgrade-extract` | الترقية 2: fact-extractor.mjs + conflict detection + auto-ingest update | fact-extractor.mjs (جديد), ingest.mjs, auto-ingest.mjs | ~15 دقيقة |
| `upgrade-vector` | الترقية 3: vector-backend.mjs + pre-filter + search refactor | vector-backend.mjs (جديد), search.mjs | ~10 دقيقة |

**قاعدة:** كل agent ياخذ مهمة واحدة فقط. ما يلمس ملفات Agent ثاني.

---

## ⚠️ المخاطر والتخفيف

| المخاطر | الاحتمال | التأثير | التخفيف |
|---------|----------|---------|---------|
| Migration يكسر الـ DB | منخفض | عالي | backup + dry-run + integrity check |
| Auto-extract يستخرج garbage | متوسط | متوسط | importance threshold + review queue |
| Conflict detection false positives | متوسط | منخفض | similarity threshold = 0.85 (عالي) + نوع لازم يتطابق |
| OpenAI API rate limit أثناء extraction | منخفض | منخفض | retry with backoff (موجود) + queue |
| Performance regression بعد pre-filter | منخفض جداً | منخفض | benchmark comparison + rollback |

---

## ✅ معايير النجاح

| المعيار | الحد الأدنى |
|---------|-------------|
| **Zero data loss** | 474 memories بعد الترقية = 474 قبل |
| **Temporal works** | supersede حقيقة → البحث يرجع الجديدة أول |
| **Auto extract** | محادثة 10 رسائل → 3-5 حقائق مستخرجة تلقائياً |
| **Conflict detection** | حقيقة متعارضة → auto-supersede |
| **Vector no regression** | search time ≤ 2ms على 527 سجل |
| **All tests pass** | كل ملف اختبار يمر بدون أخطاء |

---

*خطة جاهزة للمراجعة — تنتظر موافقة محمد قبل التنفيذ 🦊*
