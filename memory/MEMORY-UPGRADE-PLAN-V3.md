# 🧠 خطة إصلاح نظام الذاكرة والترابطات — V3
**التاريخ:** 2026-03-18
**الحالة:** معتمد من محمد

---

## 📊 التشخيص الحالي

| المكون | الحالة | المشكلة |
|--------|--------|---------|
| SQLite DB | 1,258 ذاكرة نشطة | ✅ شغال بس البحث العربي ضعيف |
| Embedding Model | OpenAI text-embedding-3-small (512d) | 🟡 ضعيف بالعربي + بيكلّف |
| Ontology Graph | 129 entity / 21 relation | 🔴 85% بدون علاقات — دفتر تليفونات مش graph |
| Daily Files | 7 أيام ناقصة من مارس | 🔴 فجوات بالذاكرة |
| long-term.md | آخر تحديث 20 فبراير | 🔴 ميت من شهر |
| bayra-knowledge.md | 6,000 سطر ملف واحد | 🟡 فوضوي وصعب البحث |
| Learnings | 33 سطر LEARNINGS + 9 ERRORS | 🟡 شبه فاضي |
| Embedding Cache | 2,700 cached | 🟡 كلها OpenAI — لازم re-embed لو غيرنا model |

---

## المرحلة 1: الإصلاح الفوري (اليوم) ⚡

### 1.1 ترقية Embedding Model → Google Gemini
**من:** `text-embedding-3-small` (OpenAI, 512d, ضعيف بالعربي)
**إلى:** `gemini-embedding-001` (Google, 768d, أقوى بالعربي + مجاني!)

**الخطوات:**
- [ ] تعديل `tools/memory/embeddings.mjs`:
  - إضافة Google Gemini embedding provider
  - `DEFAULT_MODEL = 'gemini-embedding-001'`
  - `DEFAULT_DIMS = 768`
  - fallback على OpenAI لو Google فشل
- [ ] تعديل `tools/memory/db.mjs`:
  - تحديث `vec0` table dimension من 512 → 768
  - migration script: إعادة تعبئة الـ embeddings
- [ ] Re-embed كل الـ 1,258 ذاكرة (batch) — ~5 دقائق
- [ ] اختبار البحث بالعربي قبل وبعد

**التكلفة:** $0 (Google embedding مجاني) بدل ~$0.02/1000 tokens (OpenAI)
**المكسب:** بحث عربي أقوى بكتير + 768d أدق من 512d

### 1.2 تحديث long-term.md
- [ ] مراجعة كل الملفات اليومية (فبراير + مارس)
- [ ] استخراج القرارات المهمة والدروس
- [ ] كتابة long-term.md جديد منظم

### 1.3 ملء الأيام الناقصة
- [ ] استخدام LCM expand لاسترجاع أحداث الأيام الناقصة
- [ ] كتابة ملفات يومية ولو ملخص بسيط
- [ ] تشغيل realtime-bridge على الملفات الجديدة

---

## المرحلة 2: إعادة بناء الـ Ontology (هالأسبوع) 🕸️

### 2.1 تحويل الـ Ontology من "دفتر تليفونات" لـ "Knowledge Graph" حقيقي

**المشكلة:** ontology-sync.mjs يستخرج أسماء فقط — ما يبني علاقات ذكية.

**الحل — Entity Types + Relation Types محددة:**

```
Entity Types:
├── Person (محمد، ليلى، حسين، علاء الدين...)
├── Organization (Pyramedia، إتمام، EliteLife...)
├── Project (Chatbot، Website، Call Center...)
├── Service (SEO، Google Ads، AI Solutions...)
├── Tool (n8n، Evolution API، Supabase...)
└── Client (إتمام، إنجازات، فودرينز...)

Relation Types:
├── works_at (Person → Organization)
├── manages (Person → Project)
├── client_of (Organization → Organization)
├── uses (Project → Tool)
├── provides (Organization → Service)
├── reports_to (Person → Person)
├── contacts (Person ↔ Person) + metadata: {channel, frequency}
└── part_of (Project → Project)
```

**الخطوات:**
- [ ] إعادة كتابة `ontology-sync.mjs` بنسخة ذكية:
  - يستخدم LLM (Gemini Flash) لاستخراج entities + relations
  - بدل regex matching → semantic extraction
  - يشتغل على الملفات اليومية + LCM summaries
- [ ] بناء `ontology-query.mjs`:
  - `query("من يعمل في إتمام؟")` → يرجع كل الأشخاص
  - `query("علاقة محمد بليلى")` → يرجع الترابطات
  - graph traversal (2-3 hops)
- [ ] ربط الـ ontology بالـ memory search:
  - لما أبحث عن "ليلى" → يجيب كل العلاقات المرتبطة
  - entity-aware search

### 2.2 تقسيم bayra-knowledge.md
**من:** ملف واحد 6,000 سطر
**إلى:**
```
memory/knowledge/
├── clients/
│   ├── etmam.md          ← إتمام + إنجازات
│   ├── elitelife.md      ← العيادة
│   └── foodrins.md       ← فودرينز
├── tools/
│   ├── n8n-workflows.md  ← كل workflows
│   ├── evolution-api.md  ← WhatsApp setup
│   └── supabase.md       ← DBs setup
├── people/
│   ├── contacts.md       ← أرقام + تفاصيل
│   └── team.md           ← فريق Pyramedia
└── business/
    ├── pyramedia.md       ← الشركة
    └── services.md        ← الخدمات
```
- [ ] كتابة splitter script
- [ ] تحديث bayra-knowledge.md كـ index فقط
- [ ] تحديث memory search ليشمل المجلدات الجديدة

---

## المرحلة 3: الأتمتة المستمرة 🔄

### 3.1 Heartbeat Memory Maintenance (كل heartbeat)
- [ ] `realtime-bridge.mjs` يعمل embed للمحتوى الجديد فوراً
- [ ] `ontology-sync.mjs` V2 يستخرج entities+relations بـ LLM
- [ ] لو ما فيه ملف يومي → ينشئه أوتوماتيك من الـ session

### 3.2 Weekly Consolidation (cron كل أحد)
- [ ] مراجعة الملفات اليومية للأسبوع
- [ ] تحديث long-term.md بالقرارات المهمة
- [ ] تحديث الـ ontology بالعلاقات الجديدة
- [ ] تنظيف/أرشفة الملفات القديمة (30+ يوم)
- [ ] تقرير صحة الذاكرة لمحمد

### 3.3 Auto-Learning (مستمر)
- [ ] كل غلطة → `.learnings/ERRORS.md` تلقائي (موجود بس ضعيف)
- [ ] كل تصحيح من محمد → `.learnings/LEARNINGS.md`
- [ ] مراجعة شهرية: الدروس المهمة ترقّى لـ AGENTS.md

### 3.4 Memory Health Dashboard
- [ ] سكريبت يعطي تقرير سريع:
  - عدد الذكريات الجديدة هالأسبوع
  - الأيام الناقصة
  - Entity coverage (% مع relations)
  - آخر تحديث long-term.md
  - حجم الـ embedding cache

---

## 📐 الأولويات

| # | المهمة | الأثر | الجهد | الأولوية |
|---|--------|-------|-------|----------|
| 1 | ترقية Embedding → Google | عالي (بحث عربي) | متوسط | 🔴 فوري |
| 2 | تحديث long-term.md | عالي (continuity) | قليل | 🔴 فوري |
| 3 | ملء الأيام الناقصة | متوسط | قليل | 🟡 اليوم |
| 4 | Ontology V2 (LLM extraction) | عالي جداً | عالي | 🟡 هالأسبوع |
| 5 | تقسيم knowledge base | متوسط | متوسط | 🟡 هالأسبوع |
| 6 | Weekly cron | عالي (sustainability) | قليل | 🟢 بعد المرحلة 2 |
| 7 | Memory Dashboard | قليل | قليل | 🟢 أخير |

---

## ⚠️ مخاطر

1. **Re-embedding 1,258 ذاكرة:** لازم backup قبل + migration script يتعامل مع الـ dimension change
2. **Ontology LLM extraction:** ممكن يستهلك tokens — نستخدم Gemini Flash (أرخص)
3. **تقسيم knowledge:** لازم نتأكد الملفات الجديدة مشمولة بالـ memory search

---

*هذي الخطة. محمد يعتمد، أنا أنفذ.* 🦊

---

## ✅ حالة التنفيذ (2026-03-20)

| المهمة | الحالة | التاريخ |
|--------|--------|---------|
| 1.1 ترقية Embedding → Gemini | ✅ تم | 20 مارس |
| 1.2 تحديث long-term.md | ✅ تم | 20 مارس |
| 1.3 ملء الأيام الناقصة | ✅ تم (1-6 مارس) | 20 مارس |
| 2.1 Ontology V2 (LLM + DB relations) | ✅ تم | 20 مارس |
| 2.2 تقسيم knowledge base | ✅ تم (11 ملف) | 20 مارس |
| ontology-query.mjs | ✅ تم | 20 مارس |
| 3.1 Heartbeat maintenance | ✅ موجود | سابقاً |
| 3.2 Weekly Consolidation cron | ✅ تم (أحد 4am) | 20 مارس |
| 3.3 Auto-Learning تقوية | ✅ تم | 20 مارس |
| 3.4 Memory Dashboard | ✅ تم | 20 مارس |

**النتائج:**
- 141 ذاكرة مكررة اتحذفت (1350 → 1209)
- Embedding model: OpenAI 512d → Google Gemini 768d (مجاني + أقوى بالعربي)
- Knowledge base: ملف واحد 6,679 سطر → 11 ملف منظم
- Entity relations table + CRUD في DB
- Weekly cron للصيانة التلقائية
- كل الأيام الناقصة (1-6 مارس) اتملت
