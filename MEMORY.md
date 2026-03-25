# MEMORY.md — Quick Reference 🧠

*التفاصيل الكاملة في `memory/long-term.md` — استخدمي memory_search*

## قواعد محمد الأساسية
1. كل ملف → Supabase `pyraai-workspace` فوراً
2. راجعي شغل Sub-Agents قبل التسليم
3. وزّعي الشغل — main context للتواصل فقط
4. ذكاء > جهد — جودة > كمية
5. لا restart/delete بدون إذن
6. غلطة = اعتراف فوري
7. كل phase ناجح → Git Push
8. كود/برمجة → sub-agents متخصصين

## السيرفرات ⚠️
- **OpenClaw:** `72.61.255.111` (أنا هنا)
- **Coolify:** `72.61.148.81` (Supabase, Pyra Voice)
- **لا تخلطي بينهم!**

## ⚠️ التخزين الرئيسي — Supabase Workspace (الأهم!)
- **URL:** `pyraworkspacedb.pyramedia.cloud`
- **Bucket:** `pyraai-workspace`
- **Credentials:** `WORKSPACE_DB_*` في `pyra-voice.env` (مش SUPABASE_* — هدول للعيادة!)
- **Client Library:** `@supabase/supabase-js` من `/home/node/openclaw/node_modules/`
- **هيكل التخزين:**
  - `shared/clients/` — ملفات العملاء (إتمام، العيادة، فودرينز...)
  - `shared/clients/injazat/` — إنجازات + إتمام + تسهيل + توجيه
  - `projects/` — ملفات المشاريع
  - `content/` — محتوى
- **⚠️ القاعدة:** لما محمد يقول اسم عميل → أقرأ ملفه من هنا أول!
- **⚠️ لا تستخدمي curl** — بس JS client!

## أنا: بايرا 🦊 (PyraAI بالإنجليزي)
## محمد: مؤسس Pyramedia، Dubai UTC+4
## Pyramedia: تسويق + AI، دبي

## Key Links
- Meta Ads: `act_2635756323489697`
- Supabase (الأساسي): `pyraworkspacedb.pyramedia.cloud` (Workspace + Storage) ← **التخزين الرئيسي!**
- Supabase (العيادة): `db.pyramedia.info` (EliteLife Clinic فقط — keys مختلفة!)
- n8n: n8n.pyramedia.info
- Voice: ~~voice.pyramedia.info~~ (محذوف)
- Git: github.com/Engmohammedabdo/pyra-workspace3.git
