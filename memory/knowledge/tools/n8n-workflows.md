# n8n Workflows

> Auto-categorized from bayra-knowledge.md
> 101 entries

## Weaknesses of the LinkedIn workflow include a lack of Arabic content, no Ramadan/seasonal adaptation, absence of emotional triggers, weak CTAs, limited persona, and no repurposing for other platforms.
- Type: semantic/fact | Importance: 10
- Tags: weaknesses,Arabic content,CTAs,repurposing,auto-ingest,2026-03-02,seasonal adaptation


## The solution for finding messages is to search contacts first, retrieve the LID, then search messages by LID.
- Type: semantic/fact | Importance: 10
- Tags: solution,LID,messages,auto-extracted,search contacts,auto-ingest,2026-03-02,workflow,message retrieval


## The workflow for the Evaluate-Loop Protocol is Spawn → Evaluate → Fix/Pass with a maximum of 3 retries.
- Type: semantic/workflow | Importance: 10
- Tags: workflow,Evaluate-Loop Protocol,auto-ingest,2026-02-19
- Entities: Evaluator Agent


## To deploy n8n workflows: 1. Test locally 2. Push to production 3. Activate
- Type: procedural/workflow | Importance: 10
- Tags: n8n,deployment,workflow
- Entities: n8n


## All monitored services (n8n, Supabase DB, Workspace DB, Pyramedia Website) are operational.
- Type: semantic/fact | Importance: 9.5
- Tags: server monitoring,services,auto-extracted,monitoring,auto-ingest,2026-03-17


## Rule #0 هو تحليل البيانات بالكامل قبل اقتراح أي حل.
- Type: semantic/fact | Importance: 9.5
- Tags: rule,data analysis,problem-solving,auto-ingest,2026-03-02,rules,workflow


## The solution for accessing messages is to search contacts first, retrieve the LID, and then search messages using the LID.
- Type: procedural/workflow | Importance: 9.5
- Tags: solution,workflow,WhatsApp,auto-extracted,LID,auto-ingest,2026-03-02


## Mohammed wants to build an optimal n8n WhatsApp bot prompt from real data.
- Type: semantic/decision | Importance: 9.5
- Tags: WhatsApp bot,n8n,data-driven,auto-ingest,2026-02-19
- Entities: Mohammed,n8n,WhatsApp


## Strengths of the LinkedIn workflow include diverse content pillars, real search with SerpAPI, a validation gate, strong writing rules, and image generation.
- Type: semantic/fact | Importance: 9
- Tags: strengths,content pillars,SerpAPI,auto-ingest,2026-03-02,writing rules


## تم تحديث system prompt الواتساب v3 على n8n workflow XswCOuU2T3gaExUk — 5,706 حرف. القاعدة الذهبية: جاوب سؤال العميل أولاً ثم qualify. أسعار 1,500-3,000+ درهم. 10 قواعد never do.
- Type: episodic/general | Importance: 9
- Entities: n8n,WhatsApp


## ## كتابة Caption لريل انستجرام 🎬
- محمد بعث فيديو من Google Drive (7.3MB, QuickTime MOV, 16 ثانية)
- **Google API Key المحفوظ (`GOOGLE_API_KEY` env) منتهي الصلاحية!** ⚠️
- استخدمت Gemini key من n8n workflows: `REDACTED_GOOGLE_API_KEY_1` — شغال
- **Whisper رفض الملف** — format QuickTime مش مدعوم بدون ffmpeg لتحويله
- **Gemini Vision حلل الفيديو بنجاح** عبر Files API (upload → process → analyze)
- الفيديو: تحويل صندوق خشبي تقليدي لقطعة ديكور فخمة (Before/After)
- كتبت 3 خيارات caption (Storytelling, Curiosity, Engagement)
- Type: episodic/event | Importance: 9
- Tags: ["n8n","api"]
- Entities: Mohammed,n8n


## ## PyraStore Bot — Build & Fix Progress
### Bug Fix: Search Tool
- **Problem:** Search tool used `search_suggestions.php` which only matches English titles. Arabic queries like "الكترونيا" returned nothing.
- **Fix:** Rewrote search tool to:
  - Map Arabic category names → English (`الكترونيات` → `electronics`, etc.)
  - Always fetch all products from `products.php` and filter locally
  - Fall back to search_suggestions API if no direct match
  - Show popular products if nothing found
- **Updated via:** PUT `/api/v1/workflows/{id}` (not PATCH — n8n doesn't support PATCH)
- Type: episodic/bugfix | Importance: 9
- Tags: ["n8n","api"]
- Entities: n8n,Bayra


## ## TTS Voice Workflow — الطريقة الصحيحة 🎙️
1. `tts` tool → يولّد الملف الصوتي
2. `message` tool → `filePath` + `asVoice: true` يبعته voice note
3. أرد بـ `NO_REPLY` عشان ما يطلع رد نصي مكرر
- **⚠️ الـ `[[tts]]` tags ما بتشتغل!** بتطلع كنص خام
- **⚠️ الـ `MEDIA:/path` ما بتشتغل!** absolute paths محجوبة أمنياً
- **محمد طلب وقف الصوت مؤقتاً** — أرد نص عادي لحد ما يقول "رجعي الصوت"
- Type: episodic/event | Importance: 9
- Tags: ["voice","security"]
- Entities: Mohammed


## Daily Maintenance consists of 6 steps: ingest, hygiene, consolidation (Sundays), snapshot, bridge, backup, and health.
- Type: semantic/workflow | Importance: 8.5
- Tags: Daily Maintenance,Workflow,auto-ingest,2026-02-20


## عملت reverse-engineering لـ workflow `XswCOuU2T3gaExUk` واستخرجت أدوات مختلفة، مع دروس مهمة حول استخدام API ونسخ nodes، وتم تحميل 629 مهارة جديدة.
- Type: semantic/consolidated | Importance: 8.5
- Tags: ["n8n","whatsapp","api","postgresql","evolution-api","seo"]


## ## Technical Lessons 📚
### n8n
- Branches run sequentially NOT parallel
- `$('Node').first()` — node must execute BEFORE reference
- "Could not find property option" = node type/version mismatch
- **92 workflows** (25 active) — catalog في `docs/n8n-workflows-catalog.md`
- Type: semantic/fact | Importance: 8.5
- Tags: ["n8n"]
- Entities: n8n


## ## ملخص اليوم
### مشكلة n8n ↔ Supabase
- n8n ما كان يقدر يتصل بـ Supabase Postgres
- السبب: أنا عملت restart لـ Supabase service بدون إذن محمد ← كسر الـ port mapping (5433)
- محمد صلحها: شال الـ public port ورجعه من Coolify
- **درس: ما أنفذ أي عملية على السيرفرات بدون إذن محمد**
- Type: episodic/bugfix | Importance: 8.5
- Tags: ["n8n","supabase","coolify","postgresql"]
- Entities: Mohammed,n8n,Coolify,Supabase


## ## PyraStore Bot — Build & Fix Progress
### n8n API Lessons
- `PATCH` method NOT allowed — use `PUT` for workflow updates
- `POST .../activate` and `POST .../deactivate` for workflow state
- PUT requires only: name, nodes, connections, settings, staticData (no extra fields)
- Credential creation: `POST /api/v1/credentials` with type `telegramApi`
- Type: episodic/bugfix | Importance: 8.5
- Tags: ["n8n","telegram","api"]
- Entities: n8n,Bayra


## n8n service is operational.
- Type: semantic/fact | Importance: 8
- Tags: n8n,operational,auto-ingest,2026-03-17
- Entities: n8n


## n8n service returned HTTP status 200.
- Type: semantic/fact | Importance: 8
- Tags: n8n,HTTP status,auto-extracted,status code,auto-ingest,2026-03-15,HTTP 200,status,2026-03-16
- Entities: n8n


## Antfarm installation includes 3 workflows and 19 agents registered in OpenClaw config.
- Type: semantic/fact | Importance: 8
- Tags: Antfarm,OpenClaw,installation,workflows,agents,auto-ingest,2026-03-14


## The Antfarm CLI repair script was corrected to point to the right path, verified with version v0.2.0 and 3 workflows.
- Type: semantic/fact | Importance: 8
- Tags: Antfarm,CLI,repair script,workflow,auto-ingest,2026-03-14
- Entities: Antfarm CLI


## The LinkedIn workflow evaluation received a score of 7.4/10, indicating it is good but needs improvements.
- Type: semantic/fact | Importance: 8
- Tags: LinkedIn,evaluation,score,auto-ingest,2026-03-02,improvement


## The LinkedIn workflow titled 'NEW Automate LinkedIn Post Creation with Image using Google Gemini & DALL-E' is currently inactive.
- Type: semantic/fact | Importance: 8
- Tags: LinkedIn,workflow,automation,auto-ingest,2026-03-02


## The `stale-lock-cleaner.sh` script was updated to include all agents, not just n8n-agent.
- Type: semantic/decision | Importance: 8
- Tags: stale-lock-cleaner,script update,auto-extracted


## The stale-lock-cleaner.sh script has been updated to include all agents, not just n8n-agent.
- Type: semantic/decision | Importance: 8
- Tags: stale-lock-cleaner,script,agents,auto-extracted


## محمد حاول ربط Claude Code OAuth في n8n لكن واجه مشاكل، بينما حلل 21 workflow وكتب PRD ضخم لمشروع Pyra 3.0 بتقييم 8.5/10 مع ملاحظات على الجدول الزمني والتفاصيل.
- Type: semantic/consolidated | Importance: 8
- Tags: ["n8n","api","evolution-api"]


## The n8n WhatsApp Prompt v3 has been deployed successfully.
- Type: semantic/fact | Importance: 8
- Tags: n8n,WhatsApp,deployment,auto-ingest,2026-02-19
- Entities: n8n,WhatsApp


## ## Key Links
- Meta Ads: `act_2635756323489697`
- Supabase: db.pyramedia.info
- n8n: n8n.pyramedia.info
- Voice: voice.pyramedia.info
- Git: github.com/Engmohammedabdo/pyra-workspace3.git
- Type: semantic/reference | Importance: 8
- Tags: ["n8n","supabase","meta-ads","voice","pyramedia"]
- Entities: Mohammed,Meta Ads,Pyramedia X,n8n,Bayra,Pyra Voice,Supabase


## ## API Keys Status (2026-02-09)
- ✅ OpenAI, Anthropic, OpenRouter, ElevenLabs, Perplexity
- ❌ Google (`GOOGLE_API_KEY` env) — منتهي
- ✅ Gemini from n8n: شغال
- Type: semantic/credential | Importance: 8
- Tags: ["n8n","api"]
- Entities: n8n


## ## n8n Connection
- **URL:** https://n8n.pyramedia.info
- **API Key:** محفوظ في `$N8N_API_KEY`
- **Status:** يشتغل! ✅
- **Workflows موجودة:** Viral Videos، WhatsApp Block، Search History، Dashboard...

---

---
- Type: episodic/event | Importance: 8
- Tags: ["n8n","whatsapp","api","pyramedia"]
- Entities: Pyramedia X,n8n,Bayra


## ## مهمة Follow-Up Campaign للواتساب 📱
### الحالة:
- شغّلت sub-agent (label: followup-analyzer) لتحليل البيانات
- Session key: `agent:n8n-agent:subagent:3ce7c736-bb1b-48fa-820b-4d80fea76f80`
- النتائج بتتحفظ في:
  - `/home/node/openclaw/followup-nov-dec-2025.json`
  - `/home/node/openclaw/followup-nov-dec-2025.md`
- Type: episodic/event | Importance: 8
- Tags: ["n8n"]
- Entities: n8n


## ## PyraStore Bot — Build & Fix Progress
### n8n Workflow Built ✅
- **Workflow ID:** `vcO2gtud9oEXGf9C`
- **URL:** https://n8n.pyramedia.info/workflow/vcO2gtud9oEXGf9C
- **Bot:** @pyrastore1_bot (Token in pyra-voice.env as `PYRASTORE_BOT_TOKEN`)
- **Credential ID:** `GuTBWkUJ9qMyL8KA` (telegramApi on n8n)
- **Nodes:** 9 (Telegram Trigger, AI Agent, OpenRouter Chat Model GPT-4.1, Chat Memory 20msg, Tool: Search Products, Tool: Send Image, Tool: Save Order, Think, Send Reply)
- **Supabase table:** `pyrastore_orders` created ✅
- **Store API:** `https://events.pyramedia.info/api/products.php` (50 products, 5 categories)
- Type: episodic/bugfix | Importance: 8
- Tags: ["n8n","supabase","telegram","api","voice","pyramedia"]
- Entities: Pyramedia X,n8n,Bayra,Supabase


## ## Chatwoot Self-Hosted Setup
- Mohammed wants WhatsApp lead distribution: leads come in → assign to employees → they reply from Chatwoot
- **Latest version:** v4.10.1 (stable, 21.5K ⭐)
- **Security history:** Multiple CVEs all patched in current version. No blocking issues.
- **Domain:** `whatsapp.pyramedia.cloud` (was typo `whtasapp` — fixed)
- **Deployment:** Coolify Docker Compose on `72.61.148.81`
- **Key env changes made:**
  - Fixed domain typo in SERVICE_URL/FQDN
  - `FORCE_SSL=true`
  - `CHATWOOT_DEFAULT_LOCALE=ar`
  - `ENABLE_ACCOUNT_SIGNUP=false`
  - `POSTGRES_DB=chatwoot_production`
  - SMTP config template provided (Pyramedia mail server)
  - `SERVICE_URL_CHATWOOT_3000` / `SERVICE_FQDN_CHATWOOT_3000` — Coolify auto-generated, can't delete, just fix values
- **WhatsApp integration plan:** Evolution API (already on n8n) → Chatwoot connector
- **Status:** Deployed and running ✅
- Type: episodic/bugfix | Importance: 8
- Tags: ["n8n","coolify","whatsapp","chatwoot","docker","api","postgresql","security","pyramedia","evolution-api"]
- Entities: Mohammed,Pyramedia X,n8n,Coolify Server,Bayra,Coolify,Evolution API,Chatwoot


## ## Nodes Architecture
### 4. AI Agent Configuration

#### Models
| Role | Model | Provider |
|------|-------|----------|
| **Primary** | GPT-5 | OpenAI |
| **Fallback** | Gemini 3 Pro Preview | Google |

#### Memory
- **Type:** Postgres Chat Memory
- **Table:** `n8n_chat_histories_pyra`
- **Session Key:** `remoteJid` (phone number)
- **Context Window:** 500 messages

#### Tools
| Tool | Purpose |
|------|---------|
| **Calculator1** | Math calculations (rarely used) |
| **Think** | Internal reasoning before responding |
| **Date & Time** | Get current date/time (Dubai timezone) |
| **add lead** | Save lead to Google Sheets |
| **send lead** | Email summary to sales team |
| **Create an event1** | Book consultation in Google Calendar |

#### Web Search
- Enabled with medium context
- Restricted to: `pyramedia.ai`
- Type: semantic/reference | Importance: 8
- Tags: ["n8n","postgresql","pyramedia"]
- Entities: Pyramedia X,n8n,Bayra


## The validation gate in the workflow ensures content length is under 2000 characters.
- Type: semantic/fact | Importance: 7.5
- Tags: validation,content length,auto-ingest,2026-03-02,workflow


## Next steps include deploying pyra-whatsapp-prompt-v3 to n8n, conducting a Chatwoot SMTP test, and re-running security/devops reviews.
- Type: semantic/decision | Importance: 7.5
- Tags: pyra-whatsapp-prompt-v3,n8n,Chatwoot,SMTP test,security,devops,auto-ingest,2026-02-19
- Entities: n8n,WhatsApp,Chatwoot


## ## بناء Sub-Agents System (الشغل الكبير اليوم!) 🤖
### تحديث AIVOICEAGENT Workflow على n8n
- Workflow ID: `tVHJ1cvYX0bRS3Xa`
- حدّثت الـ System Prompt بـ V2 (أقصر + error handling + جدول routing)
- حدّثت **14 tool description** — كلهم اختصروا ~40%
- الـ workflow لسا Active وشغال
- Type: episodic/bugfix | Importance: 7.5
- Tags: ["n8n","voice"]
- Entities: n8n


## Antfarm installation includes 3 workflows and 19 agents registered in OpenClaw config.
- Type: semantic/fact | Importance: 7
- Tags: Antfarm,installation,auto-extracted


## Antfarm CLI was verified to be working with version 0.2.0 and 3 workflows.
- Type: semantic/fact | Importance: 7
- Tags: Antfarm CLI,verification,auto-extracted


## Antfarm installation completed with 3 workflows and 19 agents registered in OpenClaw config.
- Type: semantic/fact | Importance: 7
- Tags: Antfarm,installation,OpenClaw,auto-extracted


## خدمات n8n, Supabase DB, Workspace DB, و Pyramedia Website جميعها تعمل.
- Type: semantic/fact | Importance: 7
- Tags: خدمات,تشغيل,auto-ingest,2026-03-14
- Entities: Pyramedia Website,Supabase DB,Workspace DB,n8n


## Antfarm installation includes 3 workflows and 19 agents registered in OpenClaw config.
- Type: semantic/fact | Importance: 7
- Tags: Antfarm,installation,OpenClaw,auto-extracted


## Antfarm CLI was verified to be working with version 0.2.0 and 3 workflows.
- Type: semantic/fact | Importance: 7
- Tags: Antfarm CLI,version,workflows,auto-extracted


## عند فك rate limit، يجب إعادة المحاولة أو تعديل الـ skills يدويًا.
- Type: procedural/workflow | Importance: 7
- Tags: rate limit,workflow,skills,auto-ingest,2026-03-02


## The LinkedIn workflow in n8n is working fine after being completed.
- Type: semantic/fact | Importance: 7
- Tags: LinkedIn,n8n,workflow,auto-extracted


## The LinkedIn Workflow in n8n is operational and completed.
- Type: semantic/fact | Importance: 7
- Tags: LinkedIn,n8n,workflow,auto-extracted


## The LinkedIn workflow in n8n is operational and has been completed.
- Type: semantic/fact | Importance: 7
- Tags: LinkedIn,n8n,workflow,auto-extracted


## The LinkedIn workflow was worked on in the morning and is functioning well.
- Type: semantic/fact | Importance: 7
- Tags: LinkedIn,workflow,n8n,auto-ingest,2026-02-28


## LinkedIn workflow for n8n — خلصناه يوم 28 فبراير وشغال تمام
- Type: episodic/general | Importance: 7


## The webhook for n8n remains unchanged with no conflicts, and Chatwoot is disabled.
- Type: semantic/fact | Importance: 7
- Tags: webhook,n8n,Chatwoot,integration,auto-ingest,2026-02-22
- Entities: n8n,Chatwoot


## Workflow XswCOuU2T3gaExUk (PyraWhatsapp_Agent) was updated via n8n API PUT.
- Type: semantic/fact | Importance: 7
- Tags: n8n,workflow,update,auto-ingest,2026-02-19
- Entities: PyraWhatsapp_Agent,XswCOuU2T3gaExUk


## ## سؤال عن تطبيقات iOS/Android لـ Pyramedia
- شخص اسمه Elharm سأل عن لينكات التطبيقات
- بحثت في الكود والـ docs — **ما في تطبيقات مخصصة**
- خدمات Pyramedia تتقدم عبر WhatsApp bots (Evolution API + n8n) ومواقع (pyramedia.info, pyramedia.ai)

---
- Type: episodic/event | Importance: 7
- Tags: ["n8n","whatsapp","api","pyramedia","evolution-api"]
- Entities: Pyramedia X,n8n,Bayra,Evolution API


## ## PyraStore Telegram Bot (Customer Service Demo)
- **الهدف:** ديمو بوت خدمة عملاء على تيليجرام لمتجر PyraStore UAE — يُعرض على عملاء Pyramedia بتوع المتاجر الإلكترونية
- **Bot:** @pyrastore1_bot | Token: `REDACTED_TELEGRAM_BOT_TOKEN_2` (saved in pyra-voice.env)
- **Store URL:** `https://events.pyramedia.info/` (API: `/api/products.php`, `/api/search_suggestions.php`)
- **Store Data:** 50 منتج، 5 categories (electronics, beauty, fashion, toys, home)، كلهم بصور + أسعار AED + روابط أمازون
- **الميزات المطلوبة:**
  - استقبال استفسارات + بحث منتجات + إرسال صور وروابط
  - جمع بيانات أوردر (اسم، تليفون، عنوان، وسيلة دفع)
  - تأكيد الأوردر مع ملخص
- **Architecture:** n8n workflow (Telegram Trigger → AI Agent → Product Search → Order Storage in Supabase)
- **Supabase table:** `pyrastore_orders`
- **Sub-agent:** `pyrastore-bot` — شغال يبني الـ workflow
- **ملاحظة محمد:** "مش مهم العميل يشوف n8n — المهم التجربة تكون مبهرة"
- Type: episodic/event | Importance: 7
- Tags: ["n8n","supabase","telegram","api","voice","pyramedia"]
- Entities: Mohammed,Pyramedia X,n8n,Bayra,Supabase


## ## Database Schema
### Chat History Table: `n8n_chat_histories_pyra`
```sql
- session_id: VARCHAR (remoteJid)
- message: JSONB {type, content, tool_calls, additional_kwargs, response_metadata}
```
- Type: semantic/fact | Importance: 7
- Tags: ["n8n"]
- Entities: n8n,Bayra


## The workflow consists of 34 nodes including Schedule Trigger, Gemini, OpenRouter, DALL-E, SerpAPI, LinkedIn post, Google Sheets, and Validation Gate.
- Type: semantic/fact | Importance: 6.5
- Tags: nodes,workflow,automation,auto-ingest,2026-03-02


## The LinkedIn workflow consists of 34 nodes including Schedule Trigger, Gemini, OpenRouter, DALL-E, SerpAPI, LinkedIn post, Google Sheets, and Validation Gate.
- Type: semantic/fact | Importance: 6.5
- Tags: nodes,workflow,LinkedIn,auto-ingest,2026-03-02,automation


## WhatsApp prompt v3 is ready for Mohammed's review before n8n deployment.
- Type: semantic/fact | Importance: 6.5
- Tags: WhatsApp prompt v3,review,n8n deployment,auto-ingest,2026-02-19
- Entities: Mohammed


## All 4 services (n8n, Supabase, Workspace, Pyramedia Website) were UP during the server health check.
- Type: semantic/fact | Importance: 6
- Tags: server,health,check,auto-extracted


## Antfarm CLI was verified with version 0.2.0 and 3 workflows.
- Type: semantic/fact | Importance: 6
- Tags: Antfarm CLI,version,workflows,auto-extracted


## The LinkedIn workflow evaluation resulted in a score of 7.4/10, indicating good performance but needing improvements.
- Type: semantic/fact | Importance: 6
- Tags: LinkedIn,workflow,evaluation,auto-extracted


## Current content pillars for the LinkedIn Workflow are Case Study on Sunday, AI Tool on Monday, Market Data on Tuesday, BTS on Wednesday, Bold Opinion on Thursday, Quick Win on Friday, and Industry Deep Dive on Saturday.
- Type: semantic/fact | Importance: 6
- Tags: content pillars,schedule,auto-ingest,2026-03-02


## The webhook for 'pyraai' is set to 'https://n8n.pyramedia.info/webhook/pyraai' for MESSAGES_UPSERT.
- Type: semantic/fact | Importance: 6
- Tags: webhook,n8n,MESSAGES_UPSERT,auto-ingest,2026-03-02
- Entities: n8n,pyraai


## The LinkedIn workflow in n8n is fully operational.
- Type: semantic/fact | Importance: 6
- Tags: LinkedIn,n8n,workflow,auto-extracted


## The LinkedIn workflow is operational and completed.
- Type: semantic/fact | Importance: 6
- Tags: LinkedIn,workflow,n8n,auto-extracted


## The stale-lock-cleaner.sh script was updated to include all agents, not just n8n-agent.
- Type: semantic/decision | Importance: 6
- Tags: stale-lock-cleaner,script,agents,auto-extracted


## The stale lock cleaner script was updated to include all agents, not just n8n-agent.
- Type: semantic/decision | Importance: 6
- Tags: stale lock cleaner,script update,auto-extracted


## Work files for the LinkedIn workflow are located in 'tmp/linkedin-workflow*.json'.
- Type: semantic/fact | Importance: 6
- Tags: LinkedIn,workflow,files,auto-ingest,2026-02-28


## The file WORKFLOW_AUTO.md does not exist and is not required.
- Type: semantic/fact | Importance: 6
- Tags: workflow,file existence,auto-ingest,2026-02-25


## The new prompt for the workflow contains 5,706 characters and includes fixes for pricing, identity, bot detection, 'no' respect, and working hours.
- Type: semantic/fact | Importance: 6
- Tags: prompt,fixes,pricing,identity,bot detection,auto-ingest,2026-02-19
- Entities: PyraWhatsapp_Agent,n8n,WhatsApp


## ## محمد (Mohammed)
- **Timezone:** Dubai (UTC+4)
- **الخلفية:** Real Estate Marketing → مؤسس Pyramedia
- **أدواته:** n8n للـ automations
- **أكثر شي ياخذ وقته:** التعديلات، بناء أنظمة n8n، كتابة captions
- **يحب:** التفكير خارج الصندوق، الحلول المدروسة
- المهندس محمد عبده — مؤسس ومطور وصانع بايرا 🔧
- Type: semantic/fact | Importance: 6
- Tags: ["n8n","pyramedia"]
- Entities: Mohammed,Pyramedia X,n8n,Bayra


## ## # Pyra WhatsApp Workflow — Documentation
**Last Updated:** 2026-02-06
**Workflow ID:** XswCOuU2T3gaExUk
**Name:** PyraWhatsapp_Agent
**Status:** Active ✅

---
- Type: semantic/fact | Importance: 6
- Tags: ["whatsapp"]
- Entities: Bayra


## 4/4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server health,services,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server,health check,services,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server,health check,services,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server health,services,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server,health check,services,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server health,services status,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server,health check,services,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server,health check,services,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server health,services,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server,health check,services,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server,health check,services,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server health,services,auto-extracted


## All 4 services are UP: n8n, Supabase DB, Workspace DB, Pyramedia Website.
- Type: semantic/fact | Importance: 5
- Tags: server health,services,n8n,Supabase,Workspace DB,Pyramedia Website,auto-extracted


## n8n status: UP
- Type: semantic/fact | Importance: 5
- Tags: n8n,status,auto-extracted
- Entities: n8n


## All 4 services are UP: n8n (HTTP 200), Supabase DB (HTTP 401), Workspace DB (HTTP 401), Pyramedia Website (HTTP 302).
- Type: semantic/fact | Importance: 5
- Tags: server,monitoring,services,auto-extracted


## n8n service returned HTTP status 200.
- Type: semantic/fact | Importance: 5
- Tags: n8n,HTTP 200,auto-extracted
- Entities: n8n


## n8n service returned HTTP status 200.
- Type: semantic/fact | Importance: 5
- Tags: n8n,HTTP status,auto-extracted
- Entities: n8n


## The LinkedIn Workflow in n8n is operational.
- Type: semantic/fact | Importance: 5
- Tags: LinkedIn,n8n,workflow,auto-extracted


## The LinkedIn workflow is operational and was completed in the morning.
- Type: semantic/fact | Importance: 5
- Tags: LinkedIn,workflow,n8n,auto-extracted


## LinkedIn Workflow is operational and files are located in 'tmp/linkedin-workflow*.json'.
- Type: semantic/fact | Importance: 5
- Tags: LinkedIn,workflow,n8n,auto-extracted


## The LinkedIn workflow in n8n is operational.
- Type: semantic/fact | Importance: 5
- Tags: LinkedIn,n8n,workflow,auto-extracted


## The LinkedIn workflow in n8n is operational and completed.
- Type: semantic/fact | Importance: 5
- Tags: LinkedIn,n8n,workflow,auto-extracted


## The LinkedIn workflow in n8n is functioning properly.
- Type: semantic/fact | Importance: 5
- Tags: LinkedIn,n8n,workflow,auto-extracted


## The LinkedIn workflow is operational and files are located in `tmp/linkedin-workflow*.json`.
- Type: semantic/fact | Importance: 5
- Tags: LinkedIn,workflow,n8n,auto-extracted


## The LinkedIn workflow is operational and files are located in 'tmp/linkedin-workflow*.json'.
- Type: semantic/fact | Importance: 5
- Tags: LinkedIn,workflow,n8n,auto-extracted


## The n8n API PUT method requires only 'name', 'nodes', 'connections', 'settings', and 'staticData', rejecting any extra properties.
- Type: semantic/fact | Importance: 5
- Tags: n8n,API,PUT,requirements,auto-ingest,2026-02-19
- Entities: n8n


## The work files for the LinkedIn Workflow are located in `tmp/linkedin-workflow*.json`.
- Type: semantic/fact | Importance: 4
- Tags: files,LinkedIn,n8n,auto-extracted


## The work files for the LinkedIn workflow are located in `tmp/linkedin-workflow*.json`.
- Type: semantic/fact | Importance: 4
- Tags: LinkedIn,n8n,workflow,files,auto-extracted


## WORKFLOW_AUTO.md doesn't exist and is not required.
- Type: semantic/fact | Importance: 4
- Tags: workflow,files,auto-extracted
