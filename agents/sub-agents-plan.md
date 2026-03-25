# 🏗️ خطة Sub-Agents المتخصصين — Pyramedia
> **تاريخ:** 2026-02-07 | **إجمالي Skills:** 634 | **عدد Agents:** 11
> **بايرا** = المديرة (Main Agent) — توجه، تشرف، توزع المهام على الـ Sub-Agents

---

## 📊 جدول ملخص

| # | Agent | إيموجي | عدد Skills | الدور |
|---|-------|--------|-----------|-------|
| 1 | SEO Master | 🔍 | 22 | كل ما يخص SEO — تدقيق، كلمات مفتاحية، محتوى، Schema، GEO |
| 2 | Content & Copy Agent | ✍️ | 24 | إنشاء محتوى تسويقي، كتابة نصوص، سوشيال ميديا، بريد إلكتروني |
| 3 | Marketing & Growth Agent | 📈 | 25 | إعلانات مدفوعة، CRO، إطلاق منتجات، استراتيجيات نمو |
| 4 | Sales & Business Agent | 💼 | 26 | مبيعات، CRM، تحليل أعمال، تسعير، استراتيجية |
| 5 | AI Architect Agent | 🤖 | 62 | بناء agents، تنسيق multi-agent، ذاكرة، prompt engineering، RAG |
| 6 | Voice & Media Agent | 🎙️ | 14 | AI صوتي، توليد صور/فيديو، تحويل صوت لنص |
| 7 | Chat & Bots Agent | 💬 | 16 | بوتات Telegram/Discord/Slack، واتساب، أتمتة سير عمل |
| 8 | Web Dev Agent | 🌐 | 60 | Next.js، React، UI/UX، CSS، صفحات هبوط، Shopify |
| 9 | Backend & Infra Agent | ⚙️ | 195 | Backend، DevOps، قواعد بيانات، APIs، cloud، أمان، اختبارات |
| 10 | Research & Data Agent | 🔬 | 28 | بحث عميق، data science، تحليلات، ML |
| 11 | Specialist Agent | 🎮 | 72 | موبايل، ألعاب، بلوكتشين، أمن هجومي، هاردوير |
| — | **Shared Skills** | 🔄 | ~10 | skills مشتركة بين كل الـ agents |

> **ملاحظة:** بعض الـ skills موجودة في أكثر من agent (overlap مقصود للـ skills العامة)

---

## 🔄 Shared Skills (مشتركة بين الجميع)
هذي skills أساسية أي agent ممكن يحتاجها:

| Skill | السبب |
|-------|-------|
| `prompt-engineer` | كل agent يحتاج يحسّن البرومبتات |
| `prompt-engineering` | أنماط وأفضل ممارسات |
| `prompt-engineering-patterns` | تقنيات متقدمة |
| `prompt-library` | مكتبة جاهزة |
| `brainstorming` | عصف ذهني قبل أي مهمة إبداعية |
| `plan-writing` | كتابة خطط |
| `writing-plans` | تنفيذ خطط |
| `concise-planning` | تخطيط مختصر |
| `executing-plans` | تنفيذ الخطط |
| `behavioral-modes` | أوضاع تشغيل مختلفة |

---

## 1. 🔍 SEO Master Agent

### الوصف
متخصص بكل ما يخص تحسين محركات البحث — من التدقيق الشامل للموقع لحد كتابة المحتوى المحسّن واستهداف Featured Snippets. يشتغل بشكل مستقل على مشاريع SEO كاملة.

### Skills (22)
| Skill | الوظيفة |
|-------|---------|
| `seo-fundamentals` | أساسيات SEO |
| `seo-audit` | تدقيق SEO شامل |
| `seo-keyword-strategist` | استراتيجية كلمات مفتاحية |
| `seo-content-planner` | تخطيط المحتوى وتقويم النشر |
| `seo-content-writer` | كتابة محتوى محسّن |
| `seo-content-auditor` | تدقيق جودة المحتوى |
| `seo-content-refresher` | تحديث المحتوى القديم |
| `seo-meta-optimizer` | تحسين العناوين والأوصاف |
| `seo-snippet-hunter` | استهداف Featured Snippets |
| `seo-structure-architect` | هيكلة المحتوى والربط الداخلي |
| `seo-authority-builder` | بناء E-E-A-T |
| `seo-cannibalization-detector` | كشف تنافس الصفحات |
| `schema-markup` | بيانات منظمة Schema.org |
| `programmatic-seo` | SEO برمجي على نطاق واسع |
| `geo-fundamentals` | تحسين الظهور في محركات AI (GEO) |
| `competitor-alternatives` | صفحات مقارنة منافسين |
| `competitive-landscape` | تحليل المنافسة |
| `analytics-tracking` | تتبع وتحليلات |
| `app-store-optimization` | ASO للتطبيقات |
| `web-performance-optimization` | تحسين أداء الموقع (Core Web Vitals) |
| `screenshots` | لقطات شاشة تسويقية |
| `search-specialist` | متخصص بحث ويب |

### Use Cases
- 🎯 **تدقيق SEO كامل لموقع عميل جديد** → `seo-audit` → `seo-keyword-strategist` → `seo-structure-architect` → `seo-meta-optimizer`
- 📝 **كتابة مقال محسّن** → `seo-keyword-strategist` → `seo-content-planner` → `seo-content-writer` → `schema-markup`
- 🔄 **تحديث محتوى قديم** → `seo-content-auditor` → `seo-cannibalization-detector` → `seo-content-refresher`
- 🏆 **استهداف Featured Snippets** → `seo-snippet-hunter` → `seo-structure-architect` → `schema-markup`
- 🤖 **تحسين ظهور في AI** → `geo-fundamentals` → `seo-authority-builder`
- 📊 **تحليل منافسين** → `competitive-landscape` → `competitor-alternatives` → `seo-keyword-strategist`

### Workflow
```
بايرا تطلب تدقيق SEO لموقع عميل
    ↓
[seo-audit] → تقرير شامل بالمشاكل
    ↓
[seo-keyword-strategist] → خطة كلمات مفتاحية
    ↓
[seo-structure-architect] → هيكلة الصفحات والربط الداخلي
    ↓
[seo-meta-optimizer] → تحسين العناوين
    ↓
[schema-markup] → بيانات منظمة
    ↓
[seo-content-planner] → تقويم محتوى 3 أشهر
    ↓
تقرير نهائي لبايرا للمراجعة
```

---

## 2. ✍️ Content & Copy Agent

### الوصف
كاتب المحتوى والنصوص التسويقية — يكتب لكل المنصات (مواقع، سوشيال، بريد، مقالات). يعرف صوت كل علامة تجارية ويكتب بأسلوب يناسب الجمهور المستهدف.

### Skills (24)
| Skill | الوظيفة |
|-------|---------|
| `content-creator` | إنشاء محتوى تسويقي بصوت العلامة |
| `content-marketer` | استراتيجية تسويق محتوى |
| `copywriting` | نصوص تسويقية للصفحات |
| `copy-editing` | تحرير ومراجعة النصوص |
| `social-content` | محتوى سوشيال (LinkedIn, X, Instagram) |
| `email-sequence` | حملات بريد إلكتروني |
| `email-systems` | أنظمة البريد التسويقي |
| `beautiful-prose` | كتابة احترافية بأسلوب قوي |
| `x-article-publisher-skill` | نشر مقالات على X/Twitter |
| `youtube-summarizer` | تلخيص فيديوهات يوتيوب |
| `daily-news-report` | تقارير أخبار يومية |
| `data-storytelling` | تحويل بيانات لقصص مقنعة |
| `brand-guidelines-anthropic` | إرشادات هوية بصرية |
| `brand-guidelines-community` | إرشادات هوية مجتمعية |
| `doc-coauthoring` | كتابة مستندات تشاركية |
| `tutorial-engineer` | دروس تعليمية |
| `readme` | كتابة README |
| `mermaid-expert` | رسومات توضيحية |
| `frontend-slides` | عروض تقديمية HTML |
| `nanobanana-ppt-skills` | توليد عروض PPT |
| `pptx-official` | إنشاء PPTX |
| `docx-official` | إنشاء DOCX |
| `pdf-official` | معالجة PDF |
| `xlsx-official` | إنشاء جداول Excel |

### Use Cases
- 📱 **محتوى سوشيال أسبوعي** → `content-creator` → `social-content` → `copy-editing`
- 📧 **حملة بريد إلكتروني** → `email-sequence` → `copywriting` → `email-systems`
- 📰 **مقال تسويقي** → `content-marketer` → `content-creator` → `beautiful-prose` → `copy-editing`
- 🎬 **إعادة استخدام فيديو** → `youtube-summarizer` → `social-content` → `x-article-publisher-skill`
- 📊 **عرض تقديمي للعميل** → `data-storytelling` → `pptx-official` / `frontend-slides`
- 📋 **تقرير أو مستند** → `docx-official` → `copy-editing`

### Workflow
```
بايرا تطلب محتوى لعميل
    ↓
[brand-guidelines-*] → فهم هوية العلامة
    ↓
[content-creator] → إنشاء المحتوى الخام
    ↓
[copywriting] → صياغة النصوص التسويقية
    ↓
[social-content] → تكييف لكل منصة
    ↓
[copy-editing] → مراجعة نهائية
    ↓
تسليم لبايرا للموافقة
```

---

## 3. 📈 Marketing & Growth Agent

### الوصف
خبير النمو والتسويق — يدير الإعلانات المدفوعة، يحسّن معدلات التحويل، ويصمم استراتيجيات إطلاق ونمو. يركز على الأرقام والنتائج.

### Skills (25)
| Skill | الوظيفة |
|-------|---------|
| `paid-ads` | إعلانات مدفوعة (Google, Meta, LinkedIn, X) |
| `marketing-ideas` | أفكار تسويقية |
| `marketing-psychology` | علم النفس التسويقي |
| `launch-strategy` | استراتيجية إطلاق منتجات |
| `referral-program` | برامج إحالة |
| `viral-generator-builder` | أدوات تفاعلية فيروسية |
| `free-tool-strategy` | أدوات مجانية كاستراتيجية |
| `page-cro` | تحسين تحويل الصفحات |
| `form-cro` | تحسين النماذج |
| `signup-flow-cro` | تحسين تدفق التسجيل |
| `onboarding-cro` | تحسين تجربة المستخدم الجديد |
| `paywall-upgrade-cro` | تحسين شاشات الترقية |
| `popup-cro` | تحسين النوافذ المنبثقة |
| `ab-test-setup` | اختبارات A/B |
| `notion-template-business` | بيع قوالب كمنتج رقمي |
| `micro-saas-launcher` | إطلاق Micro SaaS |
| `kpi-dashboard-design` | لوحات مؤشرات الأداء |
| `interactive-portfolio` | بورتفوليو تفاعلي |
| `canvas-design` | تصميم بصري (ملصقات، PDF) |
| `claude-d3js-skill` | تصور بيانات تفاعلي |
| `stripe-integration` | تكامل Stripe |
| `paypal-integration` | تكامل PayPal |
| `payment-integration` | تكامل مدفوعات عام |
| `billing-automation` | أتمتة الفوترة |
| `algolia-search` | بحث Algolia للمواقع |

### Use Cases
- 💰 **إطلاق حملة إعلانية** → `marketing-psychology` → `paid-ads` → `ab-test-setup` → `kpi-dashboard-design`
- 🚀 **إطلاق منتج جديد** → `launch-strategy` → `marketing-ideas` → `paid-ads` → `referral-program`
- 📊 **تحسين معدل التحويل** → `page-cro` → `form-cro` → `popup-cro` → `ab-test-setup`
- 🔧 **بناء أداة تسويقية مجانية** → `free-tool-strategy` → `viral-generator-builder`
- 💳 **إعداد نظام مدفوعات** → `stripe-integration` → `billing-automation`

### Workflow
```
بايرا تطلب حملة تسويقية
    ↓
[marketing-psychology] → فهم الجمهور
    ↓
[marketing-ideas] → أفكار الحملة
    ↓
[paid-ads] → إعداد الإعلانات
    ↓
[page-cro] + [form-cro] → تحسين صفحات الهبوط
    ↓
[ab-test-setup] → اختبارات A/B
    ↓
[kpi-dashboard-design] → لوحة متابعة
    ↓
تقرير أداء لبايرا
```

---

## 4. 💼 Sales & Business Agent

### الوصف
خبير المبيعات واستراتيجية الأعمال — يؤتمت عمليات البيع، يحلل السوق والمنافسين، يبني خطط أعمال، ويدير CRM. شريك بايرا في القرارات الاستراتيجية.

### Skills (26)
| Skill | الوظيفة |
|-------|---------|
| `sales-automator` | أتمتة المبيعات |
| `hubspot-integration` | تكامل HubSpot CRM |
| `segment-cdp` | منصة بيانات العملاء |
| `customer-support` | دعم عملاء بالـ AI |
| `pricing-strategy` | استراتيجية التسعير |
| `business-analyst` | تحليل أعمال |
| `market-sizing-analysis` | تحليل حجم السوق |
| `startup-analyst` | تحليل شركات ناشئة |
| `startup-business-analyst-business-case` | حالة أعمال |
| `startup-business-analyst-financial-projections` | توقعات مالية |
| `startup-business-analyst-market-opportunity` | فرص السوق |
| `startup-financial-modeling` | نمذجة مالية |
| `startup-metrics-framework` | مقاييس SaaS |
| `product-manager-toolkit` | أدوات مدير المنتج |
| `hr-pro` | موارد بشرية |
| `legal-advisor` | مستشار قانوني |
| `employment-contract-templates` | قوالب عقود توظيف |
| `culture-index` | فهرسة ثقافة الشركة |
| `internal-comms-anthropic` | اتصالات داخلية |
| `internal-comms-community` | اتصالات داخلية مجتمعية |
| `team-composition-analysis` | تحليل تكوين الفريق |
| `salesforce-development` | تطوير Salesforce |
| `quant-analyst` | تحليل كمي |
| `risk-manager` | إدارة مخاطر |
| `risk-metrics-calculation` | حساب مقاييس مخاطر |
| `backtesting-frameworks` | أطر Backtesting |

### Use Cases
- 📞 **أتمتة مبيعات لعميل** → `sales-automator` → `hubspot-integration` → `email-sequence`
- 📊 **تحليل سوق جديد** → `market-sizing-analysis` → `competitive-landscape` → `startup-business-analyst-market-opportunity`
- 💰 **استراتيجية تسعير** → `pricing-strategy` → `startup-metrics-framework` → `ab-test-setup`
- 📋 **خطة أعمال لعميل** → `business-analyst` → `startup-business-analyst-business-case` → `startup-financial-modeling`
- 👥 **إدارة فريق** → `hr-pro` → `team-composition-analysis` → `employment-contract-templates`
- ⚖️ **استشارة قانونية** → `legal-advisor` → `employment-contract-templates`

### Workflow
```
بايرا تطلب خطة أعمال لعميل
    ↓
[market-sizing-analysis] → حجم السوق
    ↓
[competitive-landscape] → تحليل المنافسين
    ↓
[business-analyst] → تحليل SWOT
    ↓
[startup-financial-modeling] → النموذج المالي
    ↓
[pricing-strategy] → استراتيجية التسعير
    ↓
[startup-metrics-framework] → KPIs
    ↓
تقرير شامل لبايرا
```

---

## 5. 🤖 AI Architect Agent

### الوصف
**أهم agent تقنياً** — يبني ويصمم AI agents، ينسق أنظمة multi-agent، يدير الذاكرة والسياق، يبني أنظمة RAG. هو اللي يخلي Pyramedia شركة AI فعلاً.

### Skills (62)
#### بناء وتصميم Agents (18)
| Skill | الوظيفة |
|-------|---------|
| `ai-agents-architect` | تصميم وبناء agents |
| `ai-engineer` | بناء تطبيقات LLM إنتاجية |
| `ai-product` | تطوير منتجات AI |
| `ai-wrapper-product` | بناء منتجات تغلف API |
| `autonomous-agent-patterns` | أنماط agents مستقلة |
| `autonomous-agents` | أنظمة مستقلة (ReAct, Plan-Execute) |
| `computer-use-agents` | agents تتحكم بالكمبيوتر |
| `crewai` | إطار CrewAI |
| `langgraph` | بناء agents بـ LangGraph |
| `langchain-architecture` | بناء بـ LangChain |
| `loki-mode` | نظام 100+ agent |
| `mcp-builder` | خوادم MCP |
| `agent-tool-builder` | أدوات للـ agents |
| `tool-design` | تصميم أدوات |
| `skill-creator` | إنشاء skills جديدة |
| `skill-developer` | تطوير Claude Code skills |
| `skill-seekers` | تحويل repos لـ skills |
| `personal-tool-builder` | أدوات شخصية |

#### تنسيق Multi-Agent (8)
| Skill | الوظيفة |
|-------|---------|
| `agent-orchestration-improve-agent` | تحسين agents |
| `agent-orchestration-multi-agent-optimize` | تحسين multi-agent |
| `agent-manager-skill` | إدارة agents عبر tmux |
| `multi-agent-brainstorming` | عصف ذهني متعدد |
| `multi-agent-patterns` | أنماط orchestration |
| `dispatching-parallel-agents` | توزيع مهام متوازية |
| `parallel-agents` | تنسيق متوازي |
| `subagent-driven-development` | تطوير بـ subagents |

#### ذاكرة وسياق (14)
| Skill | الوظيفة |
|-------|---------|
| `agent-memory-mcp` | ذاكرة هجينة |
| `agent-memory-systems` | أنظمة ذاكرة |
| `memory-systems` | تصميم ذاكرة |
| `conversation-memory` | ذاكرة محادثات |
| `context-compression` | ضغط السياق |
| `context-degradation` | اكتشاف فشل السياق |
| `context-fundamentals` | أساسيات السياق |
| `context-management-context-restore` | استعادة السياق |
| `context-management-context-save` | حفظ السياق |
| `context-manager` | إدارة سياق متقدمة |
| `context-optimization` | تحسين السياق |
| `context-window-management` | إدارة نافذة السياق |
| `prompt-caching` | تخزين مؤقت |
| `clarity-gate` | فحص جودة البيانات |

#### RAG والبحث الدلالي (8)
| Skill | الوظيفة |
|-------|---------|
| `rag-engineer` | بناء أنظمة RAG |
| `rag-implementation` | تنفيذ RAG |
| `embedding-strategies` | استراتيجيات embeddings |
| `vector-database-engineer` | قواعد بيانات متجهات |
| `vector-index-tuning` | تحسين فهارس |
| `hybrid-search-implementation` | بحث هجين |
| `similarity-search-patterns` | بحث بالتشابه |
| `vexor` | بحث دلالي في الملفات |

#### تقييم ومراقبة LLM (4)
| Skill | الوظيفة |
|-------|---------|
| `agent-evaluation` | تقييم agents |
| `evaluation` | إطار تقييم |
| `llm-evaluation` | تقييم أداء LLM |
| `langfuse` | مراقبة تطبيقات LLM |

#### تطبيقات LLM (5)
| Skill | الوظيفة |
|-------|---------|
| `llm-app-patterns` | أنماط تطبيقات LLM |
| `llm-application-dev-ai-assistant` | تطوير مساعد AI |
| `llm-application-dev-langchain-agent` | agents بـ LangChain |
| `llm-application-dev-prompt-optimize` | تحسين برومبتات |
| `claude-code-guide` | دليل Claude Code |

#### أتمتة سير العمل (5)
| Skill | الوظيفة |
|-------|---------|
| `workflow-automation` | أتمتة (n8n, Temporal) |
| `zapier-make-patterns` | أتمتة بدون كود |
| `claude-speed-reader` | قراءة سريعة |
| `superpowers-lab` | معمل قدرات |
| `claude-ally-health` | مساعد صحي |

### Use Cases
- 🏗️ **بناء chatbot ذكي لعميل** → `ai-agents-architect` → `rag-engineer` → `agent-memory-systems` → `agent-evaluation`
- 🔧 **تحسين agent موجود** → `agent-orchestration-improve-agent` → `context-optimization` → `llm-evaluation`
- 🏭 **بناء نظام multi-agent** → `multi-agent-patterns` → `dispatching-parallel-agents` → `agent-manager-skill`
- 🧠 **تصميم نظام ذاكرة** → `memory-systems` → `agent-memory-mcp` → `conversation-memory`
- 📚 **بناء نظام RAG** → `rag-engineer` → `embedding-strategies` → `vector-database-engineer` → `hybrid-search-implementation`
- 🔌 **بناء MCP server** → `mcp-builder` → `tool-design` → `agent-tool-builder`

### Workflow
```
بايرا تطلب بناء chatbot لعميل
    ↓
[ai-agents-architect] → تصميم معماري
    ↓
[rag-engineer] → بناء نظام RAG
    ↓
[embedding-strategies] → اختيار embeddings
    ↓
[vector-database-engineer] → إعداد قاعدة بيانات
    ↓
[agent-memory-systems] → نظام ذاكرة
    ↓
[context-optimization] → تحسين السياق
    ↓
[agent-evaluation] → اختبار وتقييم
    ↓
[langfuse] → مراقبة في الإنتاج
    ↓
تسليم لبايرا
```

---

## 6. 🎙️ Voice & Media Agent

### الوصف
متخصص بالوسائط المتعددة — AI صوتي، توليد صور وفيديو، تحويل صوت لنص، رؤية حاسوبية. يشتغل مع Content Agent على المحتوى المرئي والصوتي.

### Skills (14)
| Skill | الوظيفة |
|-------|---------|
| `voice-agents` | agents صوتية |
| `voice-ai-development` | تطوير AI صوتي (Vapi, ElevenLabs) |
| `voice-ai-engine-development` | محركات محادثة صوتية |
| `fal-generate` | توليد صور وفيديو |
| `fal-audio` | تحويل صوت |
| `fal-image-edit` | تعديل صور بالـ AI |
| `fal-upscale` | تحسين جودة |
| `fal-workflow` | سلاسل عمل AI |
| `fal-platform` | إدارة منصة fal.ai |
| `imagen` | توليد صور |
| `audio-transcriber` | تحويل صوت لنص |
| `computer-vision-expert` | رؤية حاسوبية |
| `algorithmic-art` | فن خوارزمي |
| `slack-gif-creator` | إنشاء GIFs |

### Use Cases
- 🎤 **بناء نظام خدمة عملاء صوتي** → `voice-ai-development` → `voice-agents` → `voice-ai-engine-development`
- 🖼️ **توليد صور تسويقية** → `fal-generate` → `fal-image-edit` → `fal-upscale`
- 🎬 **فيديو تسويقي** → `fal-generate` → `fal-workflow`
- 📝 **تحويل اجتماع صوتي لنص** → `audio-transcriber`
- 👁️ **تحليل صور/فيديو** → `computer-vision-expert`

### Workflow
```
بايرا تطلب نظام خدمة عملاء صوتي
    ↓
[voice-ai-development] → اختيار المنصة (Vapi/ElevenLabs)
    ↓
[voice-agents] → تصميم Agent الصوتي
    ↓
[voice-ai-engine-development] → بناء المحرك
    ↓
اختبار وتسليم
```

---

## 7. 💬 Chat & Bots Agent

### الوصف
باني البوتات والأتمتة — يبني بوتات Telegram، يؤتمت واتساب، ينسّق مع n8n. القنوات الأهم لـ Pyramedia في المنطقة العربية.

### Skills (16)
| Skill | الوظيفة |
|-------|---------|
| `automate-whatsapp` | أتمتة واتساب |
| `observe-whatsapp` | مراقبة مشاكل واتساب |
| `telegram-bot-builder` | بوتات Telegram |
| `telegram-mini-app` | تطبيقات Telegram المصغرة |
| `discord-bot-architect` | بوتات Discord |
| `slack-bot-builder` | تطبيقات Slack |
| `n8n-code-python` | كود Python في n8n |
| `n8n-mcp-tools-expert` | أدوات n8n MCP |
| `n8n-node-configuration` | إعداد عقد n8n |
| `inngest` | jobs غير متزامنة |
| `trigger-dev` | مهام خلفية |
| `twilio-communications` | SMS, Voice, WhatsApp |
| `upstash-qstash` | طوابير رسائل |
| `browser-automation` | أتمتة متصفح |
| `blockrun` | استدعاء نماذج خارجية |
| `writing-skills` | كتابة skills |

### Use Cases
- 📱 **بوت واتساب لعميل** → `automate-whatsapp` → `n8n-node-configuration` → `observe-whatsapp`
- 🤖 **بوت Telegram تفاعلي** → `telegram-bot-builder` → `telegram-mini-app`
- ⚡ **أتمتة عملية بـ n8n** → `n8n-mcp-tools-expert` → `n8n-code-python` → `n8n-node-configuration`
- 📞 **نظام SMS/صوت** → `twilio-communications`
- 🔄 **أتمتة متصفح** → `browser-automation`

### Workflow
```
بايرا تطلب بوت واتساب لعميل
    ↓
[automate-whatsapp] → إعداد الأتمتة
    ↓
[n8n-mcp-tools-expert] → ربط مع n8n
    ↓
[n8n-node-configuration] → إعداد العقد
    ↓
[observe-whatsapp] → مراقبة وتشخيص
    ↓
تسليم + توثيق
```

---

## 8. 🌐 Web Dev Agent

### الوصف
مطور الويب — يبني مواقع بـ Next.js، يصمم واجهات، ينفذ صفحات هبوط، يشتغل على Shopify. يغطي كل شي من UI لحد النشر.

### Skills (60)
#### Next.js و React (14)
| Skill | الوظيفة |
|-------|---------|
| `nextjs-app-router-patterns` | Next.js 14+ App Router |
| `nextjs-best-practices` | أفضل ممارسات Next.js |
| `nextjs-supabase-auth` | مصادقة Supabase + Next.js |
| `react-best-practices` | أفضل ممارسات React |
| `react-patterns` | أنماط React حديثة |
| `react-state-management` | إدارة الحالة |
| `react-ui-patterns` | أنماط UI |
| `react-modernization` | تحديث React |
| `cc-skill-frontend-patterns` | أنماط فرونت إند |
| `frontend-developer` | مطور فرونت إند |
| `frontend-dev-guidelines` | معايير فرونت إند |
| `frontend-mobile-development-component-scaffold` | هيكلة مكونات |
| `remotion-best-practices` | فيديو بـ React |
| `fp-ts-react` | React + fp-ts |

#### Node.js و Backend ويب (7)
| Skill | الوظيفة |
|-------|---------|
| `nodejs-backend-patterns` | أنماط Node.js |
| `nodejs-best-practices` | أفضل ممارسات Node.js |
| `senior-fullstack` | Full Stack متقدم |
| `app-builder` | بناء تطبيقات كاملة |
| `nestjs-expert` | NestJS |
| `bullmq-specialist` | طوابير Redis |
| `bun-development` | Bun runtime |

#### UI/UX (12)
| Skill | الوظيفة |
|-------|---------|
| `ui-ux-designer` | تصميم واجهات |
| `ui-ux-pro-max` | تصميم متقدم |
| `ui-skills` | إرشادات UI |
| `ui-visual-validator` | تحقق بصري |
| `frontend-design` | تصميم احترافي |
| `stitch-ui-design` | تصميم بـ Stitch AI |
| `web-design-guidelines` | إرشادات تصميم الويب |
| `web-artifacts-builder` | بناء artifacts HTML |
| `scroll-experience` | تجارب تمرير تفاعلية |
| `3d-web-experience` | 3D على الويب |
| `threejs-skills` | Three.js |
| `canvas-design` | تصميم بصري |

#### CSS و Design Systems (5)
| Skill | الوظيفة |
|-------|---------|
| `tailwind-design-system` | Tailwind CSS |
| `tailwind-patterns` | أنماط Tailwind v4 |
| `radix-ui-design-system` | Radix UI |
| `core-components` | مكتبة مكونات |
| `theme-factory` | مصنع ثيمات |

#### قواعد بيانات ويب (5)
| Skill | الوظيفة |
|-------|---------|
| `postgres-best-practices` | PostgreSQL (Supabase) |
| `neon-postgres` | Neon Serverless |
| `using-neon` | دليل Neon |
| `prisma-expert` | Prisma ORM |
| `firebase` | Firebase |

#### مدفوعات (مشتركة مع Marketing)
> يستخدم `stripe-integration`, `paypal-integration`, `payment-integration` عند الحاجة

#### استضافة ونشر (5)
| Skill | الوظيفة |
|-------|---------|
| `vercel-deploy-claimable` | نشر Vercel |
| `vercel-deployment` | استضافة Vercel |
| `clerk-auth` | مصادقة Clerk |
| `shopify-apps` | تطبيقات Shopify |
| `shopify-development` | تطوير Shopify |

#### وصولية (3)
| Skill | الوظيفة |
|-------|---------|
| `accessibility-compliance-accessibility-audit` | تدقيق وصولية |
| `wcag-audit-patterns` | تدقيق WCAG 2.2 |
| `screen-reader-testing` | اختبار قارئ الشاشة |

#### Angular (5)
| Skill | الوظيفة |
|-------|---------|
| `angular` | Angular v20+ |
| `angular-best-practices` | أفضل ممارسات |
| `angular-migration` | ترحيل Angular |
| `angular-state-management` | إدارة حالة |
| `angular-ui-patterns` | أنماط UI |

#### أخرى (4)
| Skill | الوظيفة |
|-------|---------|
| `i18n-localization` | تدويل وترجمة |
| `obsidian-clipper-template-creator` | قوالب Obsidian |
| `multi-platform-apps-multi-platform` | تطبيقات متعددة المنصات |
| `browser-extension-builder` | إضافات متصفح |

### Use Cases
- 🏠 **موقع عميل جديد** → `nextjs-best-practices` → `ui-ux-designer` → `tailwind-design-system` → `nextjs-supabase-auth` → `vercel-deployment`
- 🛒 **متجر Shopify** → `shopify-development` → `shopify-apps`
- 🎨 **صفحة هبوط** → `frontend-design` → `tailwind-patterns` → `page-cro` (يطلب من Marketing)
- 🔐 **نظام مصادقة** → `clerk-auth` / `nextjs-supabase-auth` → `auth-implementation-patterns`
- ♿ **تدقيق وصولية** → `accessibility-compliance-accessibility-audit` → `wcag-audit-patterns`

### Workflow
```
بايرا تطلب موقع لعميل
    ↓
[ui-ux-designer] → تصميم الواجهة
    ↓
[nextjs-best-practices] → هيكلة المشروع
    ↓
[tailwind-design-system] → نظام التصميم
    ↓
[react-patterns] → بناء المكونات
    ↓
[nextjs-supabase-auth] → المصادقة
    ↓
[postgres-best-practices] → قاعدة البيانات
    ↓
[vercel-deployment] → النشر
    ↓
مراجعة من بايرا
```

---

## 9. ⚙️ Backend & Infrastructure Agent

### الوصف
**أكبر agent من حيث عدد الـ skills** — يغطي كل البنية التحتية: معمارية برمجيات، DevOps، اختبارات، أمان، قواعد بيانات، APIs، لغات برمجة، مراقبة. هو backbone كل المشاريع التقنية.

### Skills (195)
> **ملاحظة:** لأن هذا الـ agent كبير جداً، ممكن بايرا تقسمه لـ sub-sub-agents حسب الحاجة

#### معمارية البرمجيات (22)
`architecture`, `architecture-decision-records`, `architecture-patterns`, `architect-review`, `senior-architect`, `software-architecture`, `backend-architect`, `backend-dev-guidelines`, `backend-development-feature-development`, `backend-security-coder`, `microservices-patterns`, `event-sourcing-architect`, `event-store-design`, `cqrs-implementation`, `saga-orchestration`, `projection-patterns`, `monorepo-architect`, `monorepo-management`, `design-orchestration`, `full-stack-orchestration-full-stack-feature`, `c4-architecture-c4-architecture`, `clean-code`

#### C4 Documentation (4)
`c4-code`, `c4-component`, `c4-container`, `c4-context`

#### اختبارات (22)
`test-driven-development`, `test-automator`, `test-fixing`, `testing-patterns`, `tdd-orchestrator`, `tdd-workflow`, `tdd-workflows-tdd-cycle`, `tdd-workflows-tdd-green`, `tdd-workflows-tdd-red`, `tdd-workflows-tdd-refactor`, `e2e-testing-patterns`, `javascript-testing-patterns`, `python-testing-patterns`, `bats-testing-patterns`, `unit-testing-test-generate`, `playwright-skill`, `webapp-testing`, `performance-testing-review-ai-review`, `performance-testing-review-multi-agent-review`, `pypict-skill`, `temporal-python-testing`, `verification-before-completion`

#### Code Review (10)
`code-reviewer`, `code-review-checklist`, `code-review-excellence`, `code-review-ai-ai-review`, `codex-review`, `comprehensive-review-full-review`, `comprehensive-review-pr-enhance`, `receiving-code-review`, `requesting-code-review`, `fix-review`

#### Debugging (12)
`debugger`, `debugging-strategies`, `debugging-toolkit-smart-debug`, `systematic-debugging`, `error-detective`, `error-handling-patterns`, `error-debugging-error-analysis`, `error-debugging-error-trace`, `error-debugging-multi-agent-review`, `error-diagnostics-error-analysis`, `error-diagnostics-error-trace`, `error-diagnostics-smart-debug`

#### Refactoring (8)
`code-refactoring-refactor-clean`, `code-refactoring-tech-debt`, `code-refactoring-context-restore`, `codebase-cleanup-refactor-clean`, `codebase-cleanup-tech-debt`, `codebase-cleanup-deps-audit`, `legacy-modernizer`, `production-code-audit`

#### DevOps و CI/CD (22)
`docker-expert`, `deployment-engineer`, `deployment-pipeline-design`, `deployment-procedures`, `deployment-validation-config-validate`, `cicd-automation-workflow-automate`, `github-actions-templates`, `github-workflow-automation`, `gitlab-ci-patterns`, `gitops-workflow`, `changelog-automation`, `terraform-specialist`, `terraform-skill`, `terraform-module-library`, `helm-chart-scaffolding`, `kubernetes-architect`, `k8s-manifest-generator`, `k8s-security-policies`, `devops-troubleshooter`, `secrets-management`, `server-management`, `cost-optimization`

#### Git (9)
`git-advanced-workflows`, `git-pr-workflows-git-workflow`, `git-pr-workflows-onboard`, `git-pr-workflows-pr-enhance`, `git-pushing`, `commit`, `create-pr`, `iterate-pr`, `using-git-worktrees`

#### قواعد بيانات (16)
`database-admin`, `database-architect`, `database-design`, `database-optimizer`, `database-migration`, `database-migrations-sql-migrations`, `database-migrations-migration-observability`, `database-cloud-optimization-cost-optimize`, `postgresql`, `sql-pro`, `sql-optimization-patterns`, `nosql-expert`, `cc-skill-clickhouse-io`, `data-engineer`, `data-engineering-data-pipeline`, `data-engineering-data-driven-feature`

#### APIs (12)
`api-design-principles`, `api-patterns`, `api-documentation-generator`, `api-documenter`, `api-security-best-practices`, `api-testing-observability-api-mock`, `openapi-spec-generation`, `graphql`, `graphql-architect`, `auth-implementation-patterns`, `file-uploads`, `billing-automation`

#### Cloud (8)
`cloud-architect`, `aws-serverless`, `aws-skills`, `azure-functions`, `gcp-cloud-run`, `multi-cloud-architecture`, `hybrid-cloud-architect`, `hybrid-cloud-networking`

#### Observability (14)
`observability-engineer`, `observability-monitoring-monitor-setup`, `observability-monitoring-slo-implement`, `slo-implementation`, `distributed-tracing`, `distributed-debugging-debug-trace`, `grafana-dashboards`, `prometheus-configuration`, `incident-responder`, `incident-response-incident-response`, `incident-response-smart-fix`, `incident-runbook-templates`, `postmortem-writing`, `on-call-handoff-patterns`

#### لغات برمجة (~30)
`python-pro`, `python-patterns`, `python-packaging`, `python-performance-optimization`, `python-development-python-scaffold`, `async-python-patterns`, `typescript-pro`, `typescript-expert`, `typescript-advanced-types`, `javascript-pro`, `javascript-mastery`, `modern-javascript-patterns`, `golang-pro`, `go-concurrency-patterns`, `rust-pro`, `rust-async-patterns`, `java-pro`, `csharp-pro`, `php-pro`, `ruby-pro`, `scala-pro`, `elixir-pro`, `haskell-pro`, `julia-pro`, `c-pro`, `cpp-pro`, `django-pro`, `fastapi-pro`, `fastapi-templates`, `uv-package-manager`, `posix-shell-pro`

#### أمان (16)
`security-auditor`, `security-compliance-compliance-check`, `security-requirement-extraction`, `security-scanning-security-dependencies`, `security-scanning-security-hardening`, `security-scanning-security-sast`, `sast-configuration`, `security-bluebook-builder`, `cc-skill-security-review`, `threat-modeling-expert`, `stride-analysis-patterns`, `threat-mitigation-mapping`, `gdpr-data-handling`, `pci-compliance`, `frontend-security-coder`, `frontend-mobile-security-xss-scan`

#### توثيق (10)
`docs-architect`, `documentation-generation-doc-generate`, `documentation-templates`, `code-documentation-code-explain`, `code-documentation-doc-generate`, `reference-builder`, `environment-setup-guide`, `context-driven-development`, `design-md`, `mermaid-expert`

#### تخطيط تطوير (9)
`conductor-setup`, `conductor-new-track`, `conductor-implement`, `conductor-manage`, `conductor-revert`, `conductor-status`, `conductor-validator`, `track-management`, `workflow-patterns`

#### Service Mesh و Networking (6)
`service-mesh-expert`, `service-mesh-observability`, `istio-traffic-management`, `linkerd-patterns`, `mtls-configuration`, `network-engineer`

#### Data Engineering (4)
`data-quality-frameworks`, `dbt-transformation-patterns`, `airflow-dag-patterns`, `spark-optimization`

#### أدوات متنوعة (~15)
`cc-skill-coding-standards`, `cc-skill-backend-patterns`, `cc-skill-continuous-learning`, `cc-skill-project-guidelines-example`, `cc-skill-strategic-compact`, `dependency-management-deps-audit`, `dependency-upgrade`, `framework-migration-code-migrate`, `framework-migration-deps-upgrade`, `framework-migration-legacy-modernize`, `lint-and-validate`, `find-bugs`, `sharp-edges`, `dx-optimizer`, `file-organizer`, `finishing-a-development-branch`, `team-collaboration-issue`, `team-collaboration-standup-notes`, `kaizen`

#### Shell & System (~8)
`bash-defensive-patterns`, `bash-linux`, `bash-pro`, `linux-shell-scripting`, `powershell-windows`, `shellcheck-configuration`, `busybox-on-windows`, `varlock-claude-skill`

#### .NET (2)
`dotnet-architect`, `dotnet-backend-patterns`

#### Temporal & Workflow (2)
`temporal-python-pro`, `workflow-orchestration-patterns`

#### Monorepo Build (3)
`nx-workspace-patterns`, `turborepo-caching`, `bazel-build-optimization`

#### Performance (4)
`performance-engineer`, `performance-profiling`, `application-performance-performance-optimization`, `web-performance-optimization`

### Use Cases
- 🏗️ **بناء API جديد** → `api-design-principles` → `backend-architect` → `database-design` → `test-driven-development` → `deployment-engineer`
- 🐛 **تصحيح خطأ معقد** → `debugging-strategies` → `error-debugging-error-analysis` → `systematic-debugging`
- 🔒 **تدقيق أمني** → `security-auditor` → `threat-modeling-expert` → `security-scanning-security-sast`
- 📦 **نشر Docker + K8s** → `docker-expert` → `kubernetes-architect` → `helm-chart-scaffolding`
- 📊 **تحسين أداء DB** → `database-optimizer` → `sql-optimization-patterns`
- 🔄 **ترحيل نظام قديم** → `legacy-modernizer` → `framework-migration-code-migrate`

---

## 10. 🔬 Research & Data Agent

### الوصف
الباحث والمحلل — يبحث في الويب والمستندات، يحلل البيانات، يبني نماذج ML، يستخرج insights. يدعم كل الـ agents الثانيين بالمعلومات.

### Skills (28)
#### بحث واستخراج (10)
| Skill | الوظيفة |
|-------|---------|
| `deep-research` | بحث عميق بـ Gemini |
| `exa-search` | بحث دلالي |
| `tavily-web` | بحث ويب |
| `firecrawl-scraper` | استخراج محتوى مواقع |
| `last30days` | بحث آخر 30 يوم |
| `context7-auto-research` | بحث تلقائي عن التوثيق |
| `notebooklm` | Google NotebookLM |
| `infinite-gratitude` | بحث متوازي بـ 10 agents |
| `hugging-face-cli` | Hugging Face CLI |
| `hugging-face-jobs` | وظائف Hugging Face |

#### ML و Data Science (6)
| Skill | الوظيفة |
|-------|---------|
| `data-scientist` | علم بيانات |
| `ml-engineer` | هندسة ML |
| `ml-pipeline-workflow` | سير عمل MLOps |
| `mlops-engineer` | هندسة MLOps |
| `machine-learning-ops-ml-pipeline` | أنابيب ML |
| `claude-scientific-skills` | بحث علمي |

#### تحليلات (6)
| Skill | الوظيفة |
|-------|---------|
| `data-storytelling` | تحويل بيانات لقصص |
| `kpi-dashboard-design` | لوحات KPIs |
| `analytics-tracking` | تتبع وتحليلات |
| `research-engineer` | مهندس بحث أكاديمي |
| `linear-claude-skill` | إدارة Linear Issues |
| `oss-hunter` | اكتشاف فرص OSS |

#### أدوات متنوعة (6)
| Skill | الوظيفة |
|-------|---------|
| `using-superpowers` | استخدام superpowers |
| `claude-win11-speckit-update-skill` | إدارة Windows |
| `moodle-external-api-development` | API Moodle |
| `plaid-fintech` | تكامل Plaid |
| `skill-rails-upgrade` | تقييم ترقية Rails |
| `address-github-comments` | الرد على تعليقات GitHub |

### Use Cases
- 🔍 **بحث عن منافسين** → `deep-research` → `exa-search` → `firecrawl-scraper`
- 📊 **تحليل بيانات عميل** → `data-scientist` → `data-storytelling` → `kpi-dashboard-design`
- 🧪 **بناء نموذج ML** → `ml-engineer` → `ml-pipeline-workflow` → `mlops-engineer`
- 📰 **مراقبة أخبار** → `last30days` → `tavily-web`

---

## 11. 🎮 Specialist Agent

### الوصف
الأخصائي — يغطي المجالات المتخصصة مثل الموبايل، الألعاب، البلوكتشين، والأمن الهجومي. يُستدعى فقط عند الحاجة لمشاريع متخصصة.

### Skills (72)
#### موبايل (9)
`mobile-developer`, `mobile-design`, `mobile-security-coder`, `ios-developer`, `swiftui-expert-skill`, `flutter-expert`, `react-native-architecture`, `expo-deployment`, `upgrading-expo`

#### ألعاب (16)
`game-development`, `game-development/2d-games`, `game-development/3d-games`, `game-development/game-design`, `game-development/game-art`, `game-development/game-audio`, `game-development/mobile-games`, `game-development/multiplayer`, `game-development/pc-games`, `game-development/vr-ar`, `game-development/web-games`, `godot-gdscript-patterns`, `unity-developer`, `unity-ecs-patterns`, `unreal-engine-cpp-pro`, `minecraft-bukkit-pro`

#### بلوكتشين و Web3 (5)
`blockchain-developer`, `defi-protocol-templates`, `nft-standards`, `solidity-security`, `web3-testing`

#### أمن هجومي / Pentesting (30)
`ethical-hacking-methodology`, `pentest-checklist`, `pentest-commands`, `active-directory-attacks`, `aws-penetration-testing`, `cloud-penetration-testing`, `wordpress-penetration-testing`, `sql-injection-testing`, `sqlmap-database-pentesting`, `ssh-penetration-testing`, `smtp-penetration-testing`, `broken-authentication`, `file-path-traversal`, `html-injection-testing`, `idor-testing`, `xss-html-injection`, `api-fuzzing-bug-bounty`, `linux-privilege-escalation`, `windows-privilege-escalation`, `privilege-escalation-methods`, `red-team-tactics`, `red-team-tools`, `scanning-tools`, `shodan-reconnaissance`, `top-web-vulnerabilities`, `metasploit-framework`, `burp-suite-testing`, `ffuf-claude-skill`, `wireshark-analysis`, `vulnerability-scanner`

#### هاردوير و Embedded (3)
`arm-cortex-expert`, `firmware-analyst`, `makepad-skills`

#### Reverse Engineering (8)
`reverse-engineer`, `malware-analyst`, `binary-analysis-patterns`, `anti-reversing-techniques`, `protocol-reverse-engineering`, `memory-forensics`, `memory-safety-patterns`, `attack-tree-construction`

#### Avalonia (3)
`avalonia-zafiro-development`, `avalonia-layout-zafiro`, `avalonia-viewmodels-zafiro`

#### أخرى (2)
`systems-programming-rust-project`, `network-101`

### Use Cases
- 📱 **تطبيق موبايل** → `mobile-developer` → `flutter-expert` / `react-native-architecture` → `expo-deployment`
- 🎮 **لعبة ويب تسويقية** → `game-development/web-games` → `game-development/game-design`
- 🔐 **اختبار اختراق لعميل** → `ethical-hacking-methodology` → `pentest-checklist` → المنهجية المناسبة
- ⛓️ **مشروع Web3** → `blockchain-developer` → `solidity-security` → `web3-testing`

---

## 🔀 كيف بايرا توزع المهام؟

### Decision Tree:
```
مهمة جديدة من العميل أو محمد
    ↓
بايرا تحلل المهمة
    ↓
├── SEO؟ → 🔍 SEO Master
├── كتابة محتوى؟ → ✍️ Content & Copy
├── إعلانات / CRO؟ → 📈 Marketing & Growth  
├── مبيعات / تحليل أعمال؟ → 💼 Sales & Business
├── بناء AI agent / chatbot؟ → 🤖 AI Architect
├── صوت / صور / فيديو AI؟ → 🎙️ Voice & Media
├── بوت / أتمتة / n8n؟ → 💬 Chat & Bots
├── موقع / صفحة / تطبيق ويب؟ → 🌐 Web Dev
├── API / DevOps / بنية تحتية؟ → ⚙️ Backend & Infra
├── بحث / بيانات / ML؟ → 🔬 Research & Data
├── موبايل / ألعاب / متخصص؟ → 🎮 Specialist
└── مهمة معقدة = عدة agents → بايرا تنسق بينهم
```

### مثال مهمة معقدة:
**"بناء chatbot لعميل عيادة تجميل مع موقع وحملة تسويقية"**
```
بايرا ↓
├── 🤖 AI Architect → يبني الـ chatbot + RAG
├── 🌐 Web Dev → يبني الموقع بـ Next.js
├── ✍️ Content & Copy → يكتب المحتوى
├── 🔍 SEO Master → يحسّن الـ SEO
├── 📈 Marketing & Growth → يطلق الحملة
├── 💬 Chat & Bots → يربط الـ chatbot بواتساب
└── بايرا تراجع كل شي وتنسق
```

---

## 📈 أولويات التفعيل لـ Pyramedia

| المرحلة | الـ Agents | السبب |
|---------|----------|-------|
| **Phase 1** (فوراً) | 🔍 SEO + ✍️ Content + 📈 Marketing + 💬 Chat & Bots | Core business - أكثر شي مطلوب |
| **Phase 2** (أسبوع 2) | 🤖 AI Architect + 🎙️ Voice & Media | ميزة تنافسية - بناء AI products |
| **Phase 3** (أسبوع 3) | 🌐 Web Dev + 💼 Sales & Business | مشاريع عملاء + استراتيجية |
| **Phase 4** (حسب الحاجة) | ⚙️ Backend & Infra + 🔬 Research + 🎮 Specialist | دعم فني ومشاريع خاصة |

---

> **ملاحظة نهائية:** هذا التصنيف عملي وقابل للتعديل. بايرا ممكن تدمج agents أو تقسمهم حسب حجم الشغل. الأهم إن كل agent يعرف skills-ه ويقدر ينفذ مهام حقيقية.
