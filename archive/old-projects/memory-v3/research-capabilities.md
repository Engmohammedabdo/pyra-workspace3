# بحث: القدرات المتبقية

> تاريخ البحث: 2026-02-21
> البيئة: Node.js v22, Docker Linux x64, Claude Opus 4, Telegram Bot, Supabase

---

## التوصية النهائية (فقط الحلول 100% قابلة للتطبيق)

| القدرة | الحل الموصى | الجهد | التكلفة |
|--------|------------|-------|---------|
| Vision Enhancement | تحسين Prompting + Sharp للصور | ⭐ منخفض | $0 |
| Social Media Posting | Meta Graph API عبر n8n | ⭐⭐ متوسط | $0 |
| Translation | Claude نفسه + DeepL Free API | ⭐ منخفض | $0 |
| Mini-CRM | Supabase tables (عندنا أصلاً!) | ⭐⭐ متوسط | $0 |
| Browser Automation | Crawl4AI (موجود!) + Puppeteer | ⭐ منخفض | $0 |
| Context Compression | إعدادات OpenClaw الموجودة | ⭐ منخفض | $0 |

---

## 1. Vision Enhancement ✅ 100% قابل للتطبيق

### المشكلة
التحليل سطحي بسبب prompting ضعيف — Claude Opus 4 عنده vision ممتازة لكن ما نستغلها.

### الحل: Structured Vision Prompting

#### أفضل ممارسات Claude Vision (من وثائق Anthropic الرسمية):
1. **الصور قبل النص** — Claude يشتغل أفضل لما الصورة تكون أول شي
2. **حجم مثالي:** max 1568px على أطول ضلع (أكثر = تكلفة بدون فايدة)
3. **حجم الصورة:** tokens ≈ (width × height) / 750
4. **يدعم:** JPEG, PNG, GIF, WebP
5. **حد أقصى:** 100 صورة بطلب واحد (API)

#### Template: تحليل Dashboards/Screenshots
```
Analyze this dashboard screenshot systematically:

## STRUCTURE
1. Layout: Identify all sections, panels, charts, tables
2. Navigation: What page/tab is active?

## DATA EXTRACTION  
3. For EACH metric/KPI visible:
   - Metric name
   - Current value (exact number)
   - Trend direction (↑↓→)
   - Comparison period if shown
   - Color coding (red/yellow/green)

4. For EACH chart:
   - Chart type (bar/line/pie/etc)
   - X and Y axis labels
   - Key data points
   - Notable patterns or anomalies

## INSIGHTS
5. Top 3 positive signals
6. Top 3 concerning signals  
7. Recommended actions based on data

Be precise with numbers. If text is unclear, say "[unclear: best guess]".
```

#### Template: تحليل تصاميم/Ads
```
Analyze this design/advertisement with expert marketing eyes:

## VISUAL ANALYSIS
1. Layout & composition (rule of thirds, hierarchy)
2. Color palette (list hex codes if distinguishable)
3. Typography (fonts, sizes, weights)
4. Imagery (photos, illustrations, icons)
5. White space usage

## MARKETING ANALYSIS
6. Primary message/headline
7. Call-to-action (CTA) — text, placement, visibility
8. Target audience (inferred)
9. Emotional appeal (fear, joy, urgency, etc.)
10. Brand consistency elements

## TECHNICAL QUALITY
11. Resolution/clarity assessment
12. Text readability (contrast ratio estimate)
13. Mobile-friendliness (if applicable)

## COMPETITIVE ASSESSMENT
14. Design trend alignment (current? outdated?)
15. Strengths vs common competitor patterns
16. Top 3 improvement suggestions with reasoning

Rate overall effectiveness: /10 with justification.
```

#### Template: تحليل Meta Ads Performance
```
Analyze this Meta Ads dashboard/report:

Extract ALL visible metrics into this structure:
| Campaign/Ad Set/Ad | Spend | Impressions | Reach | CTR | CPC | CPM | Conversions | CPA | ROAS |

Then analyze:
1. Best performing ad/campaign and WHY
2. Worst performing and what to change
3. Budget reallocation recommendation
4. Audience insights from the data
5. Creative patterns (what's working visually)
```

### Image Pre-processing: Sharp ✅
- **الحزمة:** `sharp` v0.34.5 (متوفرة على npm)
- **تشتغل بدون GPU:** ✅ نعم (تستخدم libvips)
- **القدرات:** resize, crop, rotate, enhance, format conversion
- **استخدام مثالي:**
  ```javascript
  import sharp from 'sharp';
  
  // تصغير للحجم المثالي لـ Claude
  await sharp('input.jpg')
    .resize(1568, 1568, { fit: 'inside' })
    .jpeg({ quality: 85 })
    .toFile('optimized.jpg');
  
  // قص جزء معين (crop dashboard section)
  await sharp('dashboard.png')
    .extract({ left: 0, top: 0, width: 800, height: 600 })
    .toFile('section.png');
  
  // تحسين الوضوح
  await sharp('blurry.jpg')
    .sharpen()
    .normalize() // enhance contrast
    .toFile('enhanced.jpg');
  ```

### Jimp (بديل خفيف) ✅
- **الحزمة:** `jimp` v1.6.0
- **بدون GPU:** ✅ (pure JavaScript)
- **أبطأ من Sharp لكن بدون native dependencies**

### التنفيذ المقترح:
1. إنشاء ملف `tools/vision-templates.mjs` فيه كل الـ templates
2. Pre-process الصور بـ Sharp قبل الإرسال لـ Claude
3. استخدام structured prompts حسب نوع الصورة (dashboard, ad, design)

---

## 2. Social Media Posting ⚠️ جزئياً قابل للتطبيق

### الخيارات المبحوثة:

#### ❌ Ayrshare — غير قابل للتطبيق حالياً
- **السبب:** لا يوجد free tier! أقل خطة $149/شهر (Premium) أو $299/شهر (Launch)
- **ما يستاهل للمرحلة الحالية**

#### ❌ Buffer API — غير قابل للتطبيق
- **السبب:** Buffer API متاح فقط للـ Enterprise plans
- **الـ free plan ما يعطي API access**

#### ✅ Meta Graph API — قابل للتطبيق (Facebook + Instagram)
- **التكلفة:** $0 (عندنا Meta Ads access أصلاً!)
- **المنصات:** Facebook Pages + Instagram Business
- **المطلوب:**
  - Page Access Token (من Facebook Developer Console)
  - Instagram Business Account مربوط بـ Facebook Page
- **النشر على Facebook:**
  ```
  POST /{page-id}/feed
  Body: { message: "...", link: "..." }
  Headers: { Authorization: "Bearer PAGE_TOKEN" }
  ```
- **النشر على Instagram:**
  ```
  // Step 1: Create media container
  POST /{ig-user-id}/media
  Body: { image_url: "...", caption: "..." }
  
  // Step 2: Publish
  POST /{ig-user-id}/media_publish  
  Body: { creation_id: "container_id" }
  ```
- **القيود:** Instagram يتطلب صور hosted على URL عام (نقدر نستخدم Supabase Storage!)

#### ✅ n8n Social Nodes — قابل للتطبيق
- **n8n عندنا أصلاً!** (https://n8n.pyramedia.info)
- **المتوفر:**
  - Facebook Pages node ✅
  - LinkedIn node ✅ (OAuth required)
  - Twitter/X node ✅ (API access مطلوب - $100/mo للـ Basic)
  - Instagram (عبر Meta Graph API)
- **الأفضل:** بناء workflow في n8n يستقبل محتوى ويوزعه

### الحل الموصى:
1. **المرحلة 1:** Meta Graph API مباشرة عبر n8n → Facebook + Instagram (مجاني)
2. **المرحلة 2:** إضافة LinkedIn (مجاني مع OAuth)
3. **Twitter/X:** مؤجل (API غالي $100/mo) — استخدام browser automation كبديل مؤقت

### الـ Setup المطلوب:
1. إنشاء Facebook App (أو استخدام الموجود من Meta Ads)
2. الحصول على Page Access Token مع permissions: `pages_manage_posts`, `instagram_basic`, `instagram_content_publish`
3. بناء n8n workflow: Webhook → Format Content → Post to Facebook + Instagram
4. ربط مع PyraAI: أمر `/publish` يرسل المحتوى للـ workflow

---

## 3. Translation ✅ 100% قابل للتطبيق

### الخيارات:

#### ✅ Claude نفسه — أفضل خيار للعربية!
- **التكلفة:** $0 إضافية (نستخدمه أصلاً)
- **جودة العربية:** ممتازة — أفضل من أي API للترجمة خصوصاً للـ:
  - ترجمة تسويقية (يفهم السياق)
  - Localization (يعرف الفرق بين عربي خليجي/مصري/شامي)
  - ترجمة تقنية
- **العيب:** يستهلك tokens

#### ✅ DeepL API Free — بديل ممتاز
- **الحزمة:** `deepl-node` v1.24.0 (متوفرة)
- **Free tier:** 500,000 characters/شهر (كافية!)
- **يدعم العربية:** ✅ نعم
- **التسجيل:** https://www.deepl.com/pro-api → Free plan
- **الاستخدام:**
  ```javascript
  import * as deepl from 'deepl-node';
  const translator = new deepl.Translator('AUTH_KEY');
  const result = await translator.translateText('Hello', null, 'ar');
  console.log(result.text); // "مرحبا"
  ```
- **المميزات:** Glossaries, formality control, document translation

#### ⚠️ Google Translate API — غير مجاني
- **الحزمة:** `@google-cloud/translate` v9.3.0 (متوفرة)
- **التكلفة:** $20 لأول 500,000 characters ثم $20/million
- **مش مجاني** — DeepL Free أفضل

#### ⚠️ LibreTranslate — ممكن لكن غير ضروري
- **Self-hosted:** يحتاج Docker container إضافي + ~2GB RAM
- **الجودة:** أقل من DeepL و Claude
- **غير ضروري** مع وجود DeepL Free

### الحل الموصى:
1. **الأساسي:** Claude نفسه للترجمة التسويقية والإبداعية
2. **للحجم الكبير:** DeepL Free API (500K chars/شهر)
3. **إنشاء tool:** `tools/translate.mjs` يختار تلقائياً:
   - نص قصير تسويقي → Claude
   - نص طويل/تقني → DeepL API

---

## 4. Mini-CRM ✅ 100% قابل للتطبيق

### الخيارات:

#### ✅ Supabase Tables — الحل الأفضل! (عندنا أصلاً)
- **التكلفة:** $0 (Supabase موجود على db.pyramedia.info)
- **Node.js:** ✅ @supabase/supabase-js
- **الجهد:** ⭐⭐ متوسط (يوم-يومين)
- **المميزات:**
  - Real-time subscriptions
  - Row Level Security
  - Full PostgreSQL power
  - REST API تلقائي
  - Dashboard مجاني

**Schema مقترح:**
```sql
-- العملاء
CREATE TABLE crm_contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  company TEXT,
  source TEXT, -- 'whatsapp', 'instagram', 'website', 'referral'
  status TEXT DEFAULT 'lead', -- 'lead', 'prospect', 'client', 'churned'
  tags TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- التفاعلات
CREATE TABLE crm_interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES crm_contacts(id),
  type TEXT, -- 'call', 'message', 'meeting', 'email', 'ad_click'
  summary TEXT,
  channel TEXT, -- 'whatsapp', 'telegram', 'instagram'
  created_at TIMESTAMPTZ DEFAULT now()
);

-- الصفقات/Deals
CREATE TABLE crm_deals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  contact_id UUID REFERENCES crm_contacts(id),
  title TEXT NOT NULL,
  value NUMERIC,
  currency TEXT DEFAULT 'AED',
  stage TEXT DEFAULT 'new', -- 'new', 'contacted', 'proposal', 'negotiation', 'won', 'lost'
  expected_close DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Views
CREATE VIEW crm_pipeline AS
SELECT 
  d.stage,
  COUNT(*) as deals,
  SUM(d.value) as total_value,
  c.name as contact_name
FROM crm_deals d
JOIN crm_contacts c ON d.contact_id = c.id
GROUP BY d.stage, c.name;
```

#### ⚠️ HubSpot Free CRM API
- **التكلفة:** Free tier متاح
- **Node.js:** ✅ `@hubspot/api-client`
- **العيب:** API rate limits صارمة (100 calls/10sec), بيانات على سيرفرات خارجية
- **غير ضروري** — Supabase أفضل وأكثر مرونة

#### ⚠️ Airtable API
- **Free tier:** 1,000 records per base, 5 bases
- **العيب:** محدود جداً, بطيء, بيانات خارجية
- **غير ضروري**

### الحل الموصى:
**Supabase Mini-CRM** — لأن:
1. عندنا Supabase أصلاً ✅
2. لا تكلفة إضافية ✅
3. Full control على البيانات ✅
4. يتكامل مع كل شي (n8n, WhatsApp, Telegram) ✅
5. يقدر PyraAI يقرأ/يكتب مباشرة ✅

### الجهد المقدر:
- إنشاء Tables: 30 دقيقة
- API Helper functions: 2-3 ساعات
- ربط مع Telegram commands: 2-3 ساعات
- **المجموع: ~1 يوم عمل**

---

## 5. Browser Automation ✅ 100% قابل للتطبيق

### الوضع الحالي:
- **Crawl4AI:** ✅ مثبت وشغال! (v0.8.0)
- **Chromium:** ✅ موجود في `/home/node/.local/lib/chromium-deps/`
- **مساحة القرص:** 39GB متاح

### الخيارات:

#### ✅ Crawl4AI — موجود ويشتغل!
- **الأفضل لـ:** Web scraping, page reading, data extraction
- **بدون GPU:** ✅
- **مثبت:** ✅
- **Helper:** `/home/node/openclaw/tools/crawl4ai_helper.py`

#### ✅ Puppeteer — قابل للتثبيت
- **الحزمة:** v24.37.5 (متوفرة على npm)
- **بدون GPU:** ✅
- **الأفضل لـ:** Complex interactions, form filling, screenshots
- **التثبيت:**
  ```bash
  npm install puppeteer
  # أو بدون تحميل Chromium (نستخدم الموجود)
  npm install puppeteer-core
  ```
- **استخدام مع Chromium الموجود:**
  ```javascript
  import puppeteer from 'puppeteer-core';
  const browser = await puppeteer.launch({
    executablePath: '/home/node/.local/lib/chromium-deps/chromium-1208/chrome',
    headless: true,
    args: ['--no-sandbox', '--disable-gpu']
  });
  ```

#### ✅ Playwright — قابل للتثبيت
- **الحزمة:** v1.58.2 (متوفرة على npm)
- **بدون GPU:** ✅
- **الأفضل لـ:** Multi-browser, complex automation
- **العيب:** يحتاج تحميل browsers (~400MB)
- **بديل:** استخدام Chromium الموجود مع `playwright-core`

#### ⚠️ Stagehand — ممكن لكن غير ضروري
- **الحزمة:** v3.0.8
- **يعتمد على Playwright**
- **يضيف AI layer — لكن عندنا Claude أصلاً**
- **غير ضروري**

### الحل الموصى:
1. **الأساسي:** Crawl4AI (موجود!) للـ scraping والقراءة
2. **المتقدم:** Puppeteer-core مع Chromium الموجود للـ interactions
3. **لا حاجة لتثبيت Playwright أو Stagehand**

---

## 6. Context Compression ✅ 100% قابل للتطبيق

### الوضع الحالي:
```json
"compaction": { "mode": "safeguard" }
```

### ما يوفره OpenClaw:

#### 1. Compaction (موجود)
- **الوضع الحالي:** `safeguard` (يشتغل تلقائي لما يقرب Context يمتلي)
- **خيارات أخرى:** يمكن تعديل الإعدادات
- **`/compact`:** أمر يدوي لضغط السياق في أي وقت
- **`/compact Focus on decisions`:** ضغط مع توجيه

#### 2. Session Pruning (غير مفعّل!)
- **هذا هو الحل الأهم!**
- **ما يسوي:** يقص tool outputs القديمة من الـ context
- **الإعدادات المتاحة:**
  ```json5
  {
    "agents": {
      "defaults": {
        "contextPruning": {
          "mode": "cache-ttl",  // تفعيل!
          "ttl": "5m",
          "keepLastAssistants": 3,
          "softTrim": {
            "maxChars": 4000,
            "headChars": 1500,
            "tailChars": 1500
          },
          "hardClear": {
            "enabled": true,
            "placeholder": "[Old tool result cleared]"
          }
        }
      }
    }
  }
  ```
- **النتيجة:** Tool outputs القديمة تتقلص تلقائياً

#### 3. Best Practices لتقليل Context Usage:
1. **تفعيل contextPruning** بـ `cache-ttl` mode ← **أهم خطوة!**
2. **استخدام `/compact` بانتظام** في الجلسات الطويلة
3. **كتابة النتائج في ملفات** بدل ما تضل في الكونتكست
4. **استخدام subagents** للمهام الكبيرة (كل subagent عنده context مستقل)
5. **تصغير tool outputs:** لما نكتب tools خاصة، نرجع بس المعلومات المهمة
6. **`/new` أو `/reset`** لما الجلسة تصير ثقيلة

### التنفيذ الفوري:
```bash
# تفعيل Session Pruning
openclaw config set agents.defaults.contextPruning.mode "cache-ttl"
openclaw config set agents.defaults.contextPruning.ttl "5m"
```

### 100% implementable?: **YES** ✅

---

## ملخص التنفيذ (ترتيب الأولوية)

### فوري (اليوم):
1. ✅ **Context Pruning** — سطر واحد في الـ config
2. ✅ **Vision Templates** — ملف واحد `tools/vision-templates.mjs`

### هذا الأسبوع:
3. ✅ **Mini-CRM** — Supabase tables + helper functions
4. ✅ **Translation Tool** — `tools/translate.mjs` (Claude + DeepL)

### الأسبوع القادم:
5. ✅ **Social Media Posting** — Meta Graph API عبر n8n workflow
6. ✅ **Browser Automation** — تثبيت puppeteer-core وربطه

### مؤجل:
- Twitter/X posting (API غالي)
- Stagehand / Playwright (غير ضروري)
- LibreTranslate (غير ضروري)
- HubSpot/Airtable (Supabase أفضل)
