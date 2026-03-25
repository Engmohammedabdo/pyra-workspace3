# 🤖 Pyramedia Sub-Agents Directory

> بايرا هي المديرة — توجه، تشرف، وتوزع المهام على الـ Sub-Agents المتخصصين.

---

## 📊 الـ Agents المتاحين

| # | Agent | الملف | عدد Skills | الحالة | الوصف |
|---|-------|-------|-----------|--------|-------|
| 1 | 🔍 SEO Master | `seo-agent.md` | 22 | ✅ Phase 1 | تدقيق SEO، كلمات مفتاحية، محتوى محسّن، Schema، GEO |
| 2 | ✍️ Content & Copy | `content-agent.md` | 24 | ✅ Phase 1 | محتوى تسويقي، سوشيال، بريد، عروض، مستندات |
| 3 | 📈 Marketing & Growth | `marketing-agent.md` | 25 | ✅ Phase 1 | إعلانات مدفوعة، CRO، إطلاق منتجات، نمو |
| 4 | 💬 Chat & Bots | `chatbot-agent.md` | 16 | ✅ Phase 1 | بوتات واتساب/تليجرام، أتمتة n8n |
| 5 | 💼 Sales & Business | `sales-agent.md` | 26 | ✅ Phase 3 | مبيعات، CRM، تحليل أعمال، تسعير |
| 6 | 🤖 AI Architect | `ai-architect-agent.md` | 62 | ✅ Phase 2 | بناء agents، multi-agent، ذاكرة، RAG |
| 7 | 🎙️ Voice & Media | `voice-media-agent.md` | 14 | ✅ Phase 2 | AI صوتي، صور، فيديو |
| 8 | 🌐 Web Dev | `webdev-agent.md` | 60 | ✅ Phase 3 | Next.js، React، UI/UX، Shopify |
| 9 | ⚙️ Backend & Infra | `backend-agent.md` | 195 | ✅ Phase 4 | DevOps، APIs، أمان، قواعد بيانات |
| 10 | 🔬 Research & Data | `research-agent.md` | 28 | ✅ Phase 4 | بحث عميق، data science، ML |
| 11 | 🎮 Specialist | `specialist-agent.md` | 72 | ✅ Phase 4 | موبايل، ألعاب، بلوكتشين، pentesting |

### Agents أخرى (مبنية سابقاً)
| Agent | الملف | الوصف |
|-------|-------|-------|
| 📸 Caption Agent | `caption-agent.md` | توليد captions من تحليل فيديو/صور |
| ⚡ n8n Agent | `n8n-agent.md` | إدارة workflows عبر n8n API |
| 🗄️ Supabase Agent | `supabase-agent.md` | إدارة قاعدة بيانات EliteLife Clinic |

---

## 🚀 كيف بايرا تستدعي Sub-Agent

### الطريقة: sessions_spawn

كل agent عنده **System Prompt Template** جاهز في ملفه. بايرا تنسخه وتبعثه مع المهمة:

```
استدعاء sub-agent:
1. اقرأ ملف الـ agent (مثلاً agents/seo-agent.md)
2. انسخ الـ System Prompt Template
3. أضف المهمة المحددة
4. ابعث عبر sessions_spawn
5. استلم النتيجة وراجعها
```

---

## 📝 أمثلة استدعاء

### مثال 1: تدقيق SEO لموقع عميل
```
Agent: 🔍 SEO Master
Label: seo-audit-client-x
المهمة: "اعمل تدقيق SEO شامل لموقع https://example.com — ركز على Technical SEO و Core Web Vitals. الموقع ecommerce يبيع منتجات تجميل في السعودية."
```

### مثال 2: محتوى سوشيال أسبوعي
```
Agent: ✍️ Content & Copy
Label: social-content-week12
المهمة: "اكتب 5 بوستات لـ Instagram + LinkedIn لعيادة EliteLife — الموضوع: عروض رمضان. الجمهور: نساء 25-45 في بغداد. الأسلوب: احترافي ودافئ."
```

### مثال 3: حملة إعلانية
```
Agent: 📈 Marketing & Growth
Label: campaign-elitelife-ramadan
المهمة: "صمم حملة إعلانية Meta + Google لعروض رمضان — ميزانية $500/أسبوع. الهدف: حجوزات مواعيد. الجمهور: نساء 25-45 بغداد. صفحة الهبوط: https://elitelife.iq/ramadan"
```

### مثال 4: بوت واتساب
```
Agent: 💬 Chat & Bots
Label: whatsapp-bot-elitelife
المهمة: "ابني بوت واتساب لعيادة EliteLife — يرد على الأسئلة الشائعة، يحجز مواعيد عبر Supabase API، ويبعث تأكيدات. اربطه بـ n8n."
```

### مثال 5: مهمة معقدة (عدة agents)
```
بايرا تنسّق:
1. 🔍 SEO Master → تدقيق الموقع الحالي + خطة كلمات مفتاحية
2. ✍️ Content & Copy → كتابة المحتوى المحسّن
3. 📈 Marketing & Growth → إطلاق حملة إعلانية
4. 💬 Chat & Bots → ربط بوت واتساب
→ بايرا تراجع كل النتائج وتنسق بينها
```

---

## 🔀 Decision Tree — أي agent للمهمة؟

```
المهمة ↓
├── SEO / كلمات مفتاحية / تدقيق موقع → 🔍 SEO Master
├── كتابة / محتوى / سوشيال / بريد → ✍️ Content & Copy
├── إعلانات / CRO / إطلاق / نمو → 📈 Marketing & Growth
├── بوت / واتساب / تليجرام / n8n → 💬 Chat & Bots
├── بناء AI agent / chatbot / RAG → 🤖 AI Architect
├── صوت / صور / فيديو AI → 🎙️ Voice & Media
├── موقع / صفحة / تطبيق ويب → 🌐 Web Dev
├── مبيعات / تحليل أعمال / CRM → 💼 Sales & Business
├── API / DevOps / بنية تحتية / أمان → ⚙️ Backend & Infra
├── بحث / بيانات / ML / تحليلات → 🔬 Research & Data
├── موبايل / ألعاب / Web3 / pentesting → 🎮 Specialist
└── مهمة معقدة → بايرا توزع على عدة agents
```

---

## 📁 هيكل الملفات

```
agents/
├── README.md              ← أنت هنا
├── sub-agents-plan.md     ← الخطة الشاملة (11 agent)
├── seo-agent.md           ← 🔍 SEO Master (Phase 1)
├── content-agent.md       ← ✍️ Content & Copy (Phase 1)
├── marketing-agent.md     ← 📈 Marketing & Growth (Phase 1)
├── chatbot-agent.md       ← 💬 Chat & Bots (Phase 1)
├── ai-architect-agent.md  ← 🤖 AI Architect (Phase 2)
├── voice-media-agent.md   ← 🎙️ Voice & Media (Phase 2)
├── webdev-agent.md        ← 🌐 Web Dev (Phase 3)
├── sales-agent.md         ← 💼 Sales & Business (Phase 3)
├── backend-agent.md       ← ⚙️ Backend & Infra (Phase 4)
├── research-agent.md      ← 🔬 Research & Data (Phase 4)
├── specialist-agent.md    ← 🎮 Specialist (Phase 4)
├── caption-agent.md       ← 📸 Caption Agent (legacy)
├── n8n-agent.md           ← ⚡ n8n Agent (legacy)
└── supabase-agent.md      ← 🗄️ Supabase Agent (legacy)
```

---

## 📚 Skills Library

كل الـ skills موجودة في:
```
/home/node/openclaw/antigravity-awesome-skills/skills/[skill-name]/SKILL.md
```

> **634 skill** متاحة — كل agent عنده مجموعته المتخصصة + shared skills مشتركة.
