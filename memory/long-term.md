# Long-Term Memory (PyraAI 🦊) — 2026-03-20

## 🚨 القاعدة الصفرية (Rule #0)
**ممنوع الهبد. التحقق أولاً، الجواب ثانياً.** 
لا تدعي أن شيئاً "مفعّل" أو "موجود" بدون فحص الكود أو تشغيل أمر `ls`/`cat` فعلياً. "الملف موجود ≠ شغال".

---

## 🧠 القرارات والسياسات الكبرى (Core Decisions)
- **Supabase Workspace:** أي تقرير أو ملف يُحفظ فوراً في `pyraai-workspace`. محمد يرفض الحفظ المحلي فقط.
- **Sub-Agents:** المهام الثقيلة (>10k tokens) تذهب لـ sub-agents. المهمة الواحدة لا تزيد عن 2 توكيلات لمنع الـ timeout.
- **Git Strategy:** عمل `git push` بعد كل مرحلة ناجحة لتحديث `PROGRESS.md`.
- **Search:** البحث العميق دايماً بـ **Crawl4AI**. الـ `web_search` للأسئلة السريعة فقط.
- **Infrastructure:** لا تعديل/حذف/إعادة تشغيل (restart) لأي خدمة على Coolify أو VPS بدون إذن محمد.
- **Evolution API:** ممنوع تغيير الـ webhook الرئيسي (`/webhook/pyraai`). أضيفي فلاتر أو ووك-هوك إضافي.

---

## 👤 أشخاص مهمون (Key People)
- **محمد (Mohammed):** المؤسس، شريكي، خلفية تسويق عقاري. يحب الحلول "خارج الصندوق" ويكره التكرار والتعقيد.
- **حسين (Hussain):** شريك في مركز إتمام (إنجازات).
- **ليلى (Leila):** مدير مركز إتمام للخدمات القضائية. (واتساب: `971545586754`).
- **أفراح وخلود:** فريق مركز اتصال إتمام (أهداف مشروع الأتمتة).

---

## 🛠️ البنية التحتية والأدوات (Infrastructure & Tools)
- **VPS 1:** OpenClaw (أنا هنا 🦊) - IP: `72.61.255.111`.
- **VPS 2:** Coolify & Services (Supabase, Voice) - IP: `72.61.148.81`.
- **Meta Ads:** حساب `act_2635756323489697` (New PyramediaX). ميزانية ~100 AED/يوم.
- **Evolution API:** `evo.pyramedia.info` | Instance: `pyraai` | Num: `971565799505`.
- **n8n:** `n8n.pyramedia.info` | 92 workflows (25 active).
- **Models:** 
  - Tier 1: Gemini 3 Flash (Default for sub-agents).
  - Tier 2: Gemini 3.1 Pro (Triager, Planner).
  - Tier 3: Claude Sonnet 4.6 / Opus (Coding, Complex Fixes).
- **Antfarm:** v0.2.0 لإدارة مهام البرمجة والأتمتة المعقدة.

---

## 💼 المشاريع النشطة والعملاء (Active Projects)
- **مركز إتمام (Injazat):** أكبر عميل. 
  - مشروع "مركز الاتصال الذكي": بوت واتساب + مساعد موظف + تذاكر.
  - مشروع "منصة المحامين": شراكة استراتيجية لجذب المحامين كشركاء.
  - محتوى مرئي: سكريبتات فيديو قانونية (وصلنا للنسخة v4 المعتمدة).
- **Pyra Voice:** موقع مباشر (`voice.pyramedia.info`) لخدمات الصوت بالذكاء الاصطناعي.
- **EliteLife Clinic:** أتمتة مواعيد (No-Show) وقاعدة بيانات على Supabase.

---

## 📚 دروس تقنية (Technical Lessons)
- **PostgreSQL:** عند تغيير أعمدة الـ View، يجب عمل `DROP VIEW CASCADE` أولاً ثم `CREATE`.
- **Crawl4AI:** يحتاج تعيين `LD_LIBRARY_PATH` ليعمل الكروميوم (`/home/node/.local/lib/chromium-deps`).
- **n8n:** الفروع تعمل بالتوالي (Sequential) وليس بالتوازي.
- **Next.js:** لا يمكن عمل Proxy للـ WebSockets عبر rewrites؛ يحتاج Custom Server.
- **WhatsApp:** البحث بالـ LID ضروري بعد تحديثات ميتا الأخيرة.
- **Ad Sets:** يفضل فصل الجماهير في Ad Sets مستقلة بدل وضعهم في Ad Set واحد (CBO logic).
- **Embedding Migration:** عند تغيير model/dimensions، لازم `DROP TABLE` و recreate الـ vec0 table + re-embed كل شي.
- **OpenClaw LCM Bug:** Sub-agents تفشل بـ `missing tool result in session history` — مشكلة context compaction. حل مؤقت: شغّل يدوي.

---

## 🧠 نظام الذاكرة V3 (Memory System — March 2026)
- **DB:** SQLite + sqlite-vec (45 MB)
- **Embeddings:** Google `gemini-embedding-001` (768d, مجاني, أقوى بالعربي)
- **المكونات:**
  - `tools/memory/db.mjs` — CRUD + entity relations
  - `tools/memory/embeddings.mjs` — Google Gemini embeddings
  - `tools/memory/consolidate.mjs` — حذف duplicates أسبوعياً
  - `tools/memory/dashboard.mjs` — تقرير صحة الذاكرة
  - `tools/memory/ontology-query.mjs` — بحث ذكي في entities + relations
  - `tools/ontology-sync.mjs` — استخراج entities+relations بـ Gemini من الملفات اليومية
- **Knowledge Base:** `memory/knowledge/` — 11 ملف مصنف (clients, tools, business)
- **أتمتة:** Weekly cron (أحد 4am دبي) للتنظيف + Dashboard
- **الإحصائيات (20 مارس):** 1,209 ذاكرة نشطة | 141 entity | 128 graph entity | 27 relation
