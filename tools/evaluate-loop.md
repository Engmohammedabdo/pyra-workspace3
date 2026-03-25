# 🔄 Evaluate-Loop Protocol — نظام حلقة التقييم

> كل شغل sub-agent لازم يمر على مقيّم قبل ما يتسلّم لمحمد.
> "الجودة مش رفاهية — هي الحد الأدنى."

---

## متى نستخدمه؟

| الحالة | الإجراء |
|--------|---------|
| مهمة بسيطة (كابشن، سؤال سريع) | ❌ Skip — مراجعة ذاتية تكفي |
| مهمة متوسطة (صفحة، workflow، script) | ✅ جولة تقييم واحدة |
| مهمة حرجة (deliverable للعميل، campaign) | ✅ تقييم صارم + loop كامل |
| مشروع كبير (full project) | ✅ تقييم لكل مرحلة على حدة |

---

## الخطوات

```
┌─────────────┐
│  1. SPAWN   │ ← بعث worker sub-agent بالمهمة
│  (Worker)   │
└──────┬──────┘
       ▼
┌─────────────┐
│  2. WAIT    │ ← استنى يخلص
│  (Complete) │
└──────┬──────┘
       ▼
┌─────────────┐
│  3. EVALUATE│ ← بعث evaluator sub-agent يراجع الشغل
│  (Review)   │
└──────┬──────┘
       ▼
┌─────────────────────────────────────┐
│  4. DECIDE                          │
│                                     │
│  🟢 PASS (8-10) → سلّم لمحمد       │
│  🟡 MINOR (6-7) → أرسل fixes       │──→ ارجع لـ Step 3 (max 3)
│  🔴 FAIL (0-5)  → أعد من الصفر     │──→ ارجع لـ Step 1 (max 1)
│                                     │
└──────┬──────────────────────────────┘
       ▼
┌─────────────┐
│  5. DELIVER │ ← سلّم النتيجة النهائية
│  أو ESCALATE│ ← لو فشل 3 مرات → بلّغ محمد
└─────────────┘
```

---

## التنفيذ في OpenClaw

### مثال 1 — مهمة كود:

```
# Step 1: Worker
sessions_spawn(
  task="Build login page with OAuth for workspace.pyramedia.cloud...",
  label="worker-login"
)

# Step 3: Evaluator (بعد ما الـ worker يخلص)
sessions_spawn(
  task="Evaluate the code at /path/to/output. Use CODE REVIEW criteria:
  - Functionality (works? edge cases?)
  - Security (no hardcoded secrets? validation?)
  - Performance (no N+1? caching?)
  - Best practices (DRY, SOLID, error handling?)
  - Documentation
  Score 1-10. Format: PASS/MINOR/FAIL + specific issues.",
  label="eval-login"
)

# Step 4a: لو MINOR
sessions_spawn(
  task="Fix these issues in /path/to/output:
  1. Add input validation on email field
  2. Add rate limiting on login endpoint
  Write fixes immediately.",
  label="fix-login-r1"
)

# Step 4b: لو PASS
message → "✅ Login page ready!"
```

### مثال 2 — مهمة محتوى:

```
# Worker
sessions_spawn(task="Write 10 Instagram captions for restaurant in JBR...", label="worker-captions")

# Evaluator
sessions_spawn(
  task="Review captions at /path. CONTENT criteria:
  - Hook strength (first 3 seconds)
  - Arabic grammar & dialect consistency
  - CTA clarity
  - Hashtag relevance
  - Platform format (Instagram specs)
  Score 1-10.",
  label="eval-captions"
)
```

### مثال 3 — حملة تسويقية:

```
# Worker
sessions_spawn(task="Plan Meta Ads campaign for dental clinic, budget 5000 AED...", label="worker-campaign")

# Evaluator
sessions_spawn(
  task="Review campaign plan. MARKETING criteria:
  - Strategy alignment with client goals
  - Budget allocation efficiency
  - Audience targeting accuracy
  - UAE market fit (regulations, culture)
  - Expected ROI realistic?
  Score 1-10.",
  label="eval-campaign"
)
```

---

## ميزانية الـ Tokens

| المرحلة | الـ Tokens المتوقعة |
|---------|-------------------|
| Worker | ~5-15K |
| Evaluator | ~2-5K |
| Fix round | ~3-8K |
| **إجمالي (بدون fixes)** | **~10-20K** |
| **إجمالي (مع fix واحد)** | **~15-28K** |
| **إجمالي (مع 3 fixes)** | **~25-45K** |

---

## معايير التقييم حسب المجال

### 🔧 كود (Code)
| المعيار | الوزن |
|---------|------|
| يشتغل بدون أخطاء | 30% |
| أمان (لا secrets, validation) | 25% |
| أداء (لا N+1, caching) | 15% |
| best practices (DRY, SOLID) | 15% |
| توثيق | 10% |
| اختبارات | 5% |

### ✍️ محتوى (Content)
| المعيار | الوزن |
|---------|------|
| دقة المعلومات | 25% |
| صوت العلامة التجارية | 20% |
| جودة العربي/الإنجليزي | 20% |
| SEO | 15% |
| CTA واضح | 10% |
| مناسب للمنصة | 10% |

### 📈 تسويق (Marketing)
| المعيار | الوزن |
|---------|------|
| توافق مع أهداف العميل | 25% |
| كفاءة الميزانية | 25% |
| استهداف الجمهور | 20% |
| ملاءمة السوق الإماراتي | 15% |
| تميّز تنافسي | 15% |

### 🏗️ بنية تحتية (Infrastructure)
| المعيار | الوزن |
|---------|------|
| معمارية قابلة للتوسع | 25% |
| جاهز للنشر | 25% |
| قاعدة بيانات سليمة | 20% |
| API صحيح | 15% |
| أمان | 15% |

---

## قواعد بايرا

1. **ما تسلّمي شغل بدون تقييم** إلا المهام البسيطة
2. **Max 3 fix rounds** — بعدها بلّغي محمد
3. **الـ evaluator لازم يكون sub-agent مستقل** — مش نفس الـ worker
4. **سجّلي كل evaluation** في `memory/YYYY-MM-DD.md`
5. **لو نفس الخطأ يتكرر** — حدّثي الـ agent definition اللي عمل الخطأ

---

*هذا البروتوكول حي — بيتحدث كل ما نتعلم أكتر.*
