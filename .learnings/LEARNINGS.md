# Learnings Log

Captured learnings, corrections, and discoveries. Review before major tasks.

---

## 2026-03-02 — القاعدة الصفرية 🚫 (الأهم!)
- **الموقف:** قلت "كل شي تمام بعد الـ update" بدون اختبار فعلي. TTS كان معطل!
- **الموقف 2:** اقترحت حل sub-agent timeout بدون فحص الكود المصدري
- **الدرس:** ممنوع الهبد + ممنوع التخمين + ممنوع التطبيل + كل إجابة لازم حقائق
- **الإجراء:** Rule #0 في SOUL.md + AGENTS.md

## 2026-03-02 — Sub-agent Timeout Fix
- **المشكلة:** sub-agents تعمل timeout لأن: (1) بس Opus مسموح في models allowlist (2) Opus بطيء للـ sub-tasks
- **السبب الحقيقي:** `agents.defaults.models` فيه Opus بس = أي موديل تاني ممنوع
- **الحل:** إضافة Sonnet + Gemini + GPT-4o في models + تحديد subagents.model = Sonnet
- **النتيجة:** من timeout بعد 5 دقايق → خلص في 90 ثانية

---

## 2026-03-14: Heartbeat Crawl4AI check was superficial!
- **Problem:** Heartbeat checked `crawl4ai_helper.py --help` which only validates Python imports, NOT actual crawling
- **Reality:** Chromium libs (libnspr4.so) in `/home/node/.local/lib/chromium-deps/` but LD_LIBRARY_PATH wasn't set → actual crawls failed
- **Fix:** Always test with REAL crawl: `LD_LIBRARY_PATH=/home/node/.local/lib/chromium-deps:/home/node/.local/lib python3 tools/crawl4ai_helper.py "https://example.com"`
- **Rule #0 violation:** "الملف موجود ≠ شغال"
- **Lesson:** Health checks must test ACTUAL functionality, not just tool availability

## 2026-03-01: التذكيرات المهمة لازم تكون رسايل مستقلة!
- **المشكلة:** محمد ما شاف تذكير كول ليديا رغم إني كتبته مرتين
- **السبب:** التذكير كان ضمن heartbeat response — مش رسالة منفصلة
- **الحل:** كل تذكير مهم → استخدمي `message tool` لإرسال رسالة مستقلة بالتيليجرام
- **القاعدة:** Heartbeat = background checks | تذكيرات مهمة = رسالة مباشرة منفصلة
- **الأفضل:** Cron job بـ `announce` delivery بدل systemEvent للتذكيرات

## 2026-03-20: Embedding Migration — vec0 tables لا تقبل ALTER
- **المشكلة:** حاولت أغير dimension من 512 → 768 — sqlite-vec ما يدعم ALTER
- **الحل:** `DROP TABLE` + recreate + re-embed كل شي
- **القاعدة:** دايماً backup قبل migration + خلي الملف القديم يوجد كـ fallback

## 2026-03-20: OpenAI Proxy bug في embeddings.mjs
- **المشكلة:** `openai.embeddings.create` فشل بـ `undefined`
- **السبب:** OpenAI client كان يمر عبر Proxy object من OpenClaw — `chat.completions` و `embeddings` مش موجودين كـ properties
- **الحل:** استخدام `fetch` مباشرة بدل OpenAI SDK

## 2026-03-20: Sub-agents بتفشل بـ LCM transcript repair
- **المشكلة:** `[lossless-claw] missing tool result in session history`
- **السبب:** Context compaction (LCM) بيحذف tool results قبل ما يوصلوا للـ sub-agent
- **الحل المؤقت:** شغّل يدوي بدل sub-agents
- **ملاحظة:** مشكلة OpenClaw مش مشكلتنا — بس لو تكررت نبلّغ

## 2026-03-20: DB column names — تأكدي بـ PRAGMA قبل الاستخدام!
- **المشكلة:** `ontology-query.mjs` فشل بـ "no such column: metadata" — العمود اسمه `properties`
- **الحل:** `PRAGMA table_info(table_name)` أول — لا تفترضي اسم عمود
