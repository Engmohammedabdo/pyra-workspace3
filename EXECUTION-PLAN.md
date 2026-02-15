# 🚀 Pyra Workspace 3.0 — Execution Plan
# خطة التنفيذ التسلسلية

> **الإصدار:** 1.0
> **التاريخ:** 2026-02-15
> **المرجع الأساسي:** `PYRA-WORKSPACE-3.0-PRD.md` + 4 ملفات PRD مساندة
> **الهدف:** Claude Code (AI Developer)
> **الفلسفة:** لا هلوسة، لا نسيان، لا تخمين — كل سطر كود يرجع لمرجع في الـ PRD

---

## 📑 فهرس المراحل

| المرحلة | الاسم | المدة | يعتمد على |
|---------|-------|-------|-----------|
| **PHASE 0** | تأسيس المشروع + قاعدة البيانات | يوم 1 | — |
| **PHASE 1** | المصادقة + Middleware + الأنواع | يوم 2-3 | Phase 0 |
| **PHASE 2** | هيكل الواجهة (Sidebar + Topbar + Routing) | يوم 4-5 | Phase 1 |
| **PHASE 3** | مدير الملفات (الوحدة الأساسية) | يوم 6-10 | Phase 2 |
| **PHASE 4** | المستخدمون + الفرق + الصلاحيات | يوم 11-14 | Phase 3 |
| **PHASE 5** | المراجعات + الإشعارات + النشاط + البحث | يوم 15-19 | Phase 4 |
| **PHASE 6** | لوحة التحكم + الإعدادات + المحذوفات + المشاركة + الإصدارات | يوم 20-24 | Phase 5 |
| **PHASE 7** | نظام عروض الأسعار (لوحة الأدمن) | يوم 25-29 | Phase 6 |
| **PHASE 8** | بوابة العميل الكاملة | يوم 30-37 | Phase 7 |
| **PHASE 9** | التعريب + RTL + الوصولية + الوضع الداكن | يوم 38-40 | Phase 8 |
| **PHASE 10** | الاختبارات + PWA + DevOps + النشر | يوم 41-45 | Phase 9 |

---

# ═══════════════════════════════════════════════════════════════
# 📜 القواعد الذهبية — تُقرأ قبل كل مرحلة
# GOLDEN RULES — Read Before Every Phase
# ═══════════════════════════════════════════════════════════════

## ⛔ قواعد عدم الهلوسة (Anti-Hallucination Rules)

هذه القواعد **إجبارية** ولا يمكن تجاوزها تحت أي ظرف:

### القاعدة 1: لا شيء من العدم
```
❌ ممنوع: اختراع feature غير موجودة في الـ PRD
✅ المطلوب: كل feature يجب أن يكون لها مرجع (Section + رقم)
```

### القاعدة 2: لا أعمدة وهمية
```
❌ ممنوع: إضافة أعمدة لقاعدة البيانات غير موجودة في Section 2.3 أو Section 12.2
✅ المطلوب: الـ 22 جدول موجودين بالفعل — لا تغيير في الهيكل
   الاستثناء الوحيد: جدول pyra_auth_mapping (Section 12.2)
```

### القاعدة 3: لا مكتبات إضافية
```
❌ ممنوع: إضافة npm packages غير موجودة في Section 21
✅ المطلوب: استخدم فقط المكتبات المذكورة في PRD Section 21.1 و 21.2
   إذا احتجت مكتبة إضافية: توقف واسأل قبل الإضافة
```

### القاعدة 4: لا API routes وهمية
```
❌ ممنوع: إنشاء endpoint غير موجود في Section 7.1 (الجداول من Group 1 إلى Group 18)
✅ المطلوب: 88 endpoint مذكورين بالتحديد — التزم بهم
   الإجمالي: 66 admin + 22 portal = 88 endpoint
```

### القاعدة 5: لا مكونات UI وهمية
```
❌ ممنوع: اختراع مكونات غير مذكورة في Section 5 أو Section 3.3
✅ المطلوب: shadcn/ui (Section 5.1) + Magic UI (5.2) + Aceternity (5.3) + Custom (5.4)
```

### القاعدة 6: لا تغيير في البنية
```
❌ ممنوع: تغيير project structure عن المذكور في Section 3.3
✅ المطلوب: التزم بالبنية الدقيقة:
   app/(auth)/, app/(dashboard)/, app/portal/, app/api/
   components/ui/, components/layout/, components/files/, components/quotes/
   lib/supabase/, lib/auth/, lib/pdf/, lib/utils/
   hooks/, types/
```

### القاعدة 7: لا ألوان مختلفة
```
❌ ممنوع: استخدام ألوان غير مذكورة في Section 4.2
✅ المطلوب: --pyra-orange: #E87A2E كـ accent رئيسي
   راجع Section 4.2 لكل الألوان المعتمدة
```

### القاعدة 8: لا placeholder في production
```
❌ ممنوع: "TODO", "FIXME", "placeholder", بيانات وهمية
✅ المطلوب: كل كود يكون production-ready مع error handling كامل
```

### القاعدة 9: لا تخطي Error Handling
```
❌ ممنوع: .catch(() => {}) أو try/catch فارغ
✅ المطلوب: كل error يُعالج بشكل صحيح مع رسائل واضحة للمستخدم
```

### القاعدة 10: لا افتراضات
```
❌ ممنوع: "أعتقد أن..." أو "ربما يحتاج..."
✅ المطلوب: ارجع للـ PRD. إذا لم تجد إجابة واضحة → توقف واسأل
```

---

## 🧠 قواعد عدم النسيان (Anti-Forgetting Rules)

### القاعدة 1: قائمة التحقق إجبارية
```
كل مرحلة لها قائمة تحقق (Checklist) — لا تنتقل للمرحلة التالية
إلا بعد اكتمال 100% من القائمة.
العنصر الذي لا ينطبق يُعلَّم كـ [N/A] مع السبب.
```

### القاعدة 2: Gate Tests إجبارية
```
كل مرحلة لها 3 مستويات من الاختبارات:
  Level 1 — BUILD:    tsc --noEmit && next build (يجب أن ينجح)
  Level 2 — FUNCTION: الميزات تعمل (اختبار يدوي + آلي)
  Level 3 — INTEGRATION: يعمل مع المراحل السابقة
لا يُسمح بالانتقال إذا فشل أي مستوى.
```

### القاعدة 3: أعد القراءة عند فقدان السياق
```
إذا ضاع السياق (context window محدود):
1. اقرأ هذا الملف (EXECUTION-PLAN.md) — خاصة المرحلة الحالية
2. اقرأ الـ PRD sections المرجعية للمرحلة
3. تحقق من الملفات المنجزة (ls + wc -l)
4. لا تبدأ من الصفر — تابع من حيث توقفت
```

### القاعدة 4: تحقق من وجود الملفات
```
بعد إنشاء أي ملف:
  ls -la <filepath>  ← تأكد أنه موجود
  wc -l <filepath>   ← تأكد أنه ليس فارغاً
  head -5 <filepath>  ← تأكد من المحتوى الصحيح
```

### القاعدة 5: لا تتخطى
```
❌ ممنوع: "سأعود لهذا لاحقاً"
✅ المطلوب: أكمل كل عنصر قبل الانتقال للتالي
   الاستثناء: إذا كان العنصر يعتمد على مرحلة لاحقة (يُوثَّق ويُتبع)
```

### القاعدة 6: سجل التنفيذ
```
في نهاية كل مرحلة، سجّل:
  📁 الملفات المنشأة (مع عدد الأسطر)
  ✅ الاختبارات الناجحة
  ⚠️ المشاكل المكتشفة وحلولها
  📌 ملاحظات للمراحل القادمة
```

### القاعدة 7: Cross-Reference
```
في نهاية كل مرحلة:
  1. افتح الـ PRD sections المرجعية
  2. قارن كل متطلب مع ما تم تنفيذه
  3. أي متطلب مفقود = يُضاف فوراً
  4. أي متطلب إضافي (غير في PRD) = يُحذف فوراً
```

---

# ═══════════════════════════════════════════════════════════════
# PHASE 0: تأسيس المشروع + قاعدة البيانات
# Project Scaffold + Database Setup
# ═══════════════════════════════════════════════════════════════

## 📍 السياق (Context)
لا يوجد كود سابق. نبدأ من الصفر.

## 🎯 الهدف (Goal)
- إنشاء مشروع Next.js 15 مع كل الإعدادات
- تثبيت جميع المكتبات
- إعداد قاعدة البيانات (Functions, Views, Triggers, Indexes)
- التحقق من اتصال Supabase

## 📖 مرجع PRD
| القسم | الملف | الموضوع |
|-------|-------|---------|
| Section 3.2 | Master PRD | Technology Stack |
| Section 3.3 | Master PRD | Project Structure |
| Section 21 | Master PRD | Dependencies & Libraries |
| Section 12.2 | Master PRD | New Tables (pyra_auth_mapping) |
| Full file | PRD-database-architecture.md | Functions, Views, Triggers |

## 📁 الملفات المطلوبة

### مرحلة 0A: Project Init
```
pyra-workspace-3/
├── package.json                    ← Section 21.1 + 21.2
├── tsconfig.json                   ← TypeScript 5.6+ strict mode
├── next.config.ts                  ← Security headers (Section 11.2)
├── tailwind.config.ts              ← Pyra theme tokens (Section 4.2)
├── postcss.config.js
├── .env.local                      ← Section 18.2 (template only, no real keys)
├── .env.example                    ← Same as .env.local with placeholder values
├── .eslintrc.json
├── .prettierrc
└── .gitignore
```

### مرحلة 0B: Directory Structure
```
app/
├── layout.tsx                      ← Root layout (fonts, metadata)
├── globals.css                     ← Tailwind imports + Pyra CSS vars
├── (auth)/
│   └── layout.tsx                  ← Auth layout (empty for now)
├── (dashboard)/
│   └── layout.tsx                  ← Dashboard layout (empty for now)
├── portal/
│   └── layout.tsx                  ← Portal layout (empty for now)
└── api/
    └── health/route.ts             ← Health check endpoint

components/
├── ui/                             ← shadcn/ui (installed via CLI)
lib/
├── supabase/
│   ├── server.ts                   ← Section 3.4 (Server Client Factory)
│   ├── client.ts                   ← Section 3.4 (Browser Client Factory)
│   └── middleware.ts               ← Section 3.4 (Middleware Client Factory)
├── utils/
│   ├── cn.ts                       ← clsx + tailwind-merge helper
│   └── id.ts                       ← ID generation helpers
types/
├── database.ts                     ← Section 12.4 (TypeScript types for 22 tables)
hooks/
middleware.ts                        ← Empty placeholder (built in Phase 1)
```

### مرحلة 0C: Database Setup (Supabase SQL)
```sql
-- Run in Supabase SQL Editor:
-- 1. pyra_auth_mapping table (Section 12.2)
-- 2. All Functions from PRD-database-architecture.md Section 1
-- 3. All Views from PRD-database-architecture.md Section 2
-- 4. All Triggers from PRD-database-architecture.md Section 3
-- 5. Full-Text Search setup from PRD-database-architecture.md Section 4
-- 6. Enums from PRD-database-architecture.md Section 5
-- 7. pg_cron jobs from PRD-database-architecture.md Section 6
-- 8. Advanced Indexes from PRD-database-architecture.md Section 8
-- 9. Enable RLS on all tables (Section 12.3)
```

## 🔧 خطوات التنفيذ (Implementation Steps)

### Step 0.1: Create Next.js project
```bash
npx create-next-app@latest pyra-workspace-3 \
  --typescript --tailwind --eslint --app --src=no \
  --import-alias "@/*" --turbopack
cd pyra-workspace-3
```

### Step 0.2: Install ALL dependencies from Section 21
```bash
# Production deps (Section 21.1) — copy EXACTLY from PRD
pnpm add next@^15 react@^19 react-dom@^19 \
  @supabase/supabase-js@^2.45 @supabase/ssr@^0.5 \
  @tanstack/react-query@^5.60 \
  tailwindcss@^4 class-variance-authority@^0.7.1 clsx@^2.1.1 tailwind-merge@^3 \
  framer-motion@^12 \
  react-hook-form@^7.64 @hookform/resolvers@^5 zod@^4 \
  jspdf@^4.1 react-signature-canvas@^1.1.0-alpha.2 \
  lucide-react sonner next-themes@^0.4 \
  recharts@^2.15 cmdk@^1 \
  @radix-ui/react-dialog @radix-ui/react-dropdown-menu \
  @radix-ui/react-select @radix-ui/react-tabs \
  @radix-ui/react-tooltip @radix-ui/react-avatar \
  @radix-ui/react-checkbox @radix-ui/react-switch \
  @radix-ui/react-progress @radix-ui/react-scroll-area \
  @radix-ui/react-separator @radix-ui/react-label \
  @radix-ui/react-popover @radix-ui/react-slot \
  vaul@^1.1 input-otp@^1.4 nanoid@^5 date-fns@^3

# Dev deps (Section 21.2)
pnpm add -D typescript@^5.6 @types/react@^19 @types/react-dom@^19 \
  @types/node@^22 @types/react-signature-canvas@^1 \
  vitest@^2.1 @testing-library/react@^16 @playwright/test@^1.48 \
  eslint@^9 eslint-config-next@^15 prettier@^3.6 \
  @tailwindcss/typography postcss autoprefixer
```

### Step 0.3: Initialize shadcn/ui
```bash
npx shadcn@latest init
# Theme: Zinc, Style: Default, CSS Variables: Yes, Tailwind config: tailwind.config.ts
# Then install ALL components from Section 5.1:
npx shadcn@latest add button input dialog sheet tabs table \
  command dropdown-menu toast tooltip badge card skeleton \
  separator switch checkbox avatar progress scroll-area \
  select popover label textarea
```

### Step 0.4: Create Supabase client files
- `lib/supabase/server.ts` — Copy EXACTLY from PRD Section 3.4 (Server-Side Client Factory)
- `lib/supabase/client.ts` — Copy EXACTLY from PRD Section 3.4 (Client-Side Client Factory)
- `lib/supabase/middleware.ts` — Copy EXACTLY from PRD Section 3.4 (Middleware Client Factory)

### Step 0.5: Create TypeScript types
- `types/database.ts` — Define interfaces for ALL 22 tables (Section 12.4)
  - `PyraUser`, `PyraReview`, `PyraTrash`, `PyraActivityLog`
  - `PyraNotification`, `PyraShareLink`, `PyraTeam`, `PyraTeamMember`
  - `PyraFilePermission`, `PyraFileVersion`, `PyraFileIndex`, `PyraSetting`
  - `PyraSession`, `PyraLoginAttempt`
  - `PyraClient`, `PyraProject`, `PyraProjectFile`
  - `PyraFileApproval`, `PyraClientComment`, `PyraClientNotification`
  - `PyraQuote`, `PyraQuoteItem`
  - `PyraAuthMapping` (new table)

### Step 0.6: Create globals.css with Pyra theme
- CSS variables from Section 4.2
- Font imports: DM Sans, JetBrains Mono, Noto Kufi Arabic (Section 4.3)
- Base styles, scrollbar customization

### Step 0.7: Create root layout
- `app/layout.tsx` — Fonts, metadata, ThemeProvider
- `app/globals.css` — Theme tokens

### Step 0.8: Create health check API
- `app/api/health/route.ts` — Returns { status: 'ok', timestamp, supabase: true/false }

### Step 0.9: Run Database SQL
- Execute ALL SQL from PRD-database-architecture.md in Supabase SQL Editor:
  - Section 1: 8 PL/pgSQL Functions
  - Section 2: 5 Views + 2 Materialized Views
  - Section 3: 6+ Triggers
  - Section 4: Full-Text Search (tsvector + GIN)
  - Section 5: PostgreSQL Enums
  - Section 6: pg_cron Jobs
  - Section 8: Advanced Indexes
  - From Master PRD Section 12.2: pyra_auth_mapping table
  - From Master PRD Section 12.3: RLS on all 22 tables

## ⛔ Anti-Hallucination لهذه المرحلة
- لا تضف مكتبات غير موجودة في Section 21
- لا تنشئ routes غير health check في هذه المرحلة
- لا تنشئ components أو pages في هذه المرحلة (فقط الهيكل الفارغ)
- لا تضف middleware logic (يأتي في Phase 1)
- لا تتصل بـ Supabase Auth (يأتي في Phase 1) — فقط تأكد أن الاتصال يعمل
- types/database.ts يحتوي الأنواع فقط — لا logic

## 🧠 Anti-Forgetting لهذه المرحلة
- [ ] تأكد أن كل حزمة في Section 21.1 مثبتة
- [ ] تأكد أن كل حزمة في Section 21.2 مثبتة كـ devDependency
- [ ] تأكد أن shadcn/ui مُهيأ مع كل الـ 20 component من Section 5.1
- [ ] تأكد أن الـ 3 Supabase client files مطابقة تماماً لـ Section 3.4
- [ ] تأكد أن types/database.ts يحتوي interfaces لكل الـ 22 جدول + pyra_auth_mapping
- [ ] تأكد أن .env.example موجود مع كل المتغيرات من Section 18.2
- [ ] تأكد أن next.config.ts يحتوي Security Headers من Section 11.2
- [ ] تأكد أن CSS variables مطابقة لـ Section 4.2 بالضبط

## ✅ بوابة الاختبار (Gate Tests)

### Level 1 — BUILD
```bash
pnpm tsc --noEmit              # ← يجب 0 أخطاء
pnpm next build                 # ← يجب أن ينجح
```

### Level 2 — FUNCTION
```bash
pnpm dev                        # ← يجب أن يعمل على localhost:3000
curl http://localhost:3000/api/health  # ← يجب أن يرجع {"status":"ok","supabase":true}
```

### Level 3 — INTEGRATION
```sql
-- في Supabase SQL Editor:
SELECT generate_quote_number('test_team');  -- ← يجب أن يرجع 'QT-0001'
SELECT get_admin_dashboard('admin', 'admin');  -- ← يجب أن يرجع JSONB
SELECT check_path_access('admin', 'test/', 'read');  -- ← يجب TRUE
```

## 📋 قائمة التحقق النهائية
```
[ ] package.json يحتوي كل الـ dependencies من Section 21
[ ] tsconfig.json مع strict mode
[ ] next.config.ts مع security headers
[ ] tailwind.config.ts مع Pyra theme tokens
[ ] .env.example مع كل المتغيرات
[ ] app/layout.tsx مع الخطوط الصحيحة
[ ] app/globals.css مع CSS variables
[ ] lib/supabase/server.ts مطابق لـ PRD
[ ] lib/supabase/client.ts مطابق لـ PRD
[ ] lib/supabase/middleware.ts مطابق لـ PRD
[ ] types/database.ts يحتوي 23 interface
[ ] app/api/health/route.ts يعمل
[ ] shadcn/ui مُهيأ مع 20 component
[ ] Database Functions (8) مُنفذة
[ ] Database Views (7) مُنشأة
[ ] Database Triggers (6+) مربوطة
[ ] Full-Text Search مُفعل
[ ] RLS مُفعل على كل الجداول
[ ] BUILD يمر بنجاح
[ ] HEALTH CHECK يرجع supabase: true
```

---

# ═══════════════════════════════════════════════════════════════
# PHASE 1: المصادقة + Middleware + الأنواع
# Authentication + Middleware + Type Guards
# ═══════════════════════════════════════════════════════════════

## 📍 السياق (Context)
المشروع مُنشأ مع كل المكتبات. Supabase متصل. قاعدة البيانات جاهزة.

## 🎯 الهدف (Goal)
- تسجيل دخول Admin/Employee عبر Supabase Auth
- حماية الـ routes عبر Middleware
- Auth guards (requireAuth, requireAdmin, requirePermission)
- صفحة تسجيل الدخول تعمل

## 📖 مرجع PRD
| القسم | الملف | الموضوع |
|-------|-------|---------|
| Section 8 | Master PRD | Authentication & Authorization |
| Section 8.1 | Master PRD | Auth Migration table |
| Section 8.2 | Master PRD | Middleware Auth Flow |
| Section 8.3 | Master PRD | RBAC Guards |
| Section 8.4 | Master PRD | Supabase RLS Policies |
| Section 6.1 | Master PRD | Login Page spec |
| Section 1.5 | PRD-database-architecture.md | check_path_access() |

## 📁 الملفات المطلوبة
```
middleware.ts                        ← Section 8.2 (Auth + locale + redirect)
app/(auth)/
├── layout.tsx                       ← Auth layout (centered, background effect)
└── login/
    └── page.tsx                     ← Login form (Section 6.1)
lib/auth/
├── guards.ts                        ← requireAuth, requireAdmin, requirePermission (Section 8.3)
└── permissions.ts                   ← checkPathPermission, canWritePath, isAdmin
app/api/auth/
├── login/route.ts                   ← POST: signInWithPassword
├── logout/route.ts                  ← POST: signOut
└── session/route.ts                 ← GET: check auth state
```

## 🔧 خطوات التنفيذ

### Step 1.1: middleware.ts
- Copy EXACTLY from PRD Section 8.2
- Protect `/dashboard/*` → redirect to `/login` if no user
- Protect `/portal/*` → redirect to `/portal/login` if no client
- Protect `/api/*` → return 401 if no auth (except public routes)
- Matcher: `['/dashboard/:path*', '/portal/:path*', '/api/:path*']`

### Step 1.2: lib/auth/guards.ts
- `requireAuth()` — Copy from Section 8.3
  - Gets Supabase user from server client
  - Fetches pyra_users profile
  - Redirects to /login if not authenticated
  - Returns { user, pyraUser }
- `requireAdmin()` — Copy from Section 8.3
  - Calls requireAuth() + checks role === 'admin'
- `requirePermission(path, action)` — Copy from Section 8.3
  - Calls requireAuth() + calls check_path_access RPC

### Step 1.3: lib/auth/permissions.ts
- `checkPathPermission(user, path, action)` — Uses Supabase RPC `check_path_access()`
- `canWritePath(path, user)` — Wrapper for write permission check
- `isAdmin(user)` — Simple role check

### Step 1.4: Login page (app/(auth)/login/page.tsx)
- Full screen, split design (Section 6.1)
- Left: Login form (email + password + remember me)
- Right: Branding (Pyramedia logo, background effect)
- Uses Supabase Auth `signInWithPassword`
- Error handling: invalid credentials, rate limiting
- Redirect to `/dashboard` on success

### Step 1.5: Auth API routes
- `/api/auth/login` — POST: `supabase.auth.signInWithPassword()`
- `/api/auth/logout` — POST: `supabase.auth.signOut()`
- `/api/auth/session` — GET: Return current user + profile

## ⛔ Anti-Hallucination لهذه المرحلة
- لا تنشئ client portal auth (Phase 8)
- لا تنشئ forgot password (ليس في PRD)
- لا تنشئ register/signup (المسؤول هو من ينشئ المستخدمين)
- لا تستخدم NextAuth.js — استخدم Supabase Auth فقط (Section 3.2)
- لا تضف OAuth providers (ليس في PRD)
- Login page لا تحتوي أي animation بعد — فقط الوظيفة الأساسية

## 🧠 Anti-Forgetting لهذه المرحلة
- [ ] middleware.ts يحمي كل routes المذكورة
- [ ] guards.ts يحتوي الـ 3 functions بالضبط
- [ ] permissions.ts يستخدم RPC check_path_access (لا JS-side permission check)
- [ ] Login page يتعامل مع الأخطاء (credentials خاطئة، network error)
- [ ] Redirect بعد login يعمل (/dashboard)
- [ ] Redirect بعد logout يعمل (/login)
- [ ] Session check يرجع user + pyraUser profile

## ✅ بوابة الاختبار (Gate Tests)

### Level 1 — BUILD
```bash
pnpm tsc --noEmit   # ← 0 errors
pnpm next build      # ← success
```

### Level 2 — FUNCTION
```
Manual tests:
1. فتح /dashboard → يحول لـ /login            ✓
2. تسجيل دخول ببيانات صحيحة → /dashboard      ✓
3. تسجيل دخول ببيانات خاطئة → رسالة خطأ       ✓
4. تسجيل خروج → /login                         ✓
5. /api/auth/session → يرجع user data           ✓
6. /api/auth/session بدون auth → 401            ✓
```

### Level 3 — INTEGRATION
```
1. Health check لا يزال يعمل (/api/health)       ✓
2. Supabase اتصال سليم عبر Login flow           ✓
```

## 📋 قائمة التحقق النهائية
```
[ ] middleware.ts يحمي /dashboard و /portal و /api
[ ] requireAuth() يعمل ويرجع user + pyraUser
[ ] requireAdmin() يعمل
[ ] requirePermission() يستخدم check_path_access RPC
[ ] Login page تعمل بشكل كامل
[ ] API auth routes (3) تعمل
[ ] Redirect flows تعمل
[ ] Error states معالجة
[ ] BUILD ينجح
[ ] DEV SERVER يعمل
```

---

# ═══════════════════════════════════════════════════════════════
# PHASE 2: هيكل الواجهة — Sidebar + Topbar + Routing
# Admin Layout Shell
# ═══════════════════════════════════════════════════════════════

## 📍 السياق (Context)
Auth يعمل. Login page جاهزة. Routes محمية.

## 🎯 الهدف (Goal)
- Admin layout كامل (Sidebar + Topbar + Content Area)
- Navigation بين كل الصفحات (فارغة مؤقتاً)
- Mobile responsive navigation
- Theme toggle (dark/light)

## 📖 مرجع PRD
| القسم | الملف | الموضوع |
|-------|-------|---------|
| Section 3.3 | Master PRD | Project Structure (app/(dashboard)/*) |
| Section 4.4 | Master PRD | Spacing & Layout Grid |
| Section 4.5 | Master PRD | Dark Mode |
| Section 5.4 | Master PRD | Custom Components (layout section) |
| Section 6.2 | Master PRD | Dashboard page spec |
| Appendix E.3 | Master PRD | Admin File Explorer Wireframe (sidebar) |

## 📁 الملفات المطلوبة
```
components/layout/
├── Sidebar.tsx                      ← Sidebar with nav items from Section 3.3
├── Topbar.tsx                       ← Search bar + notifications bell + user menu
├── Breadcrumb.tsx                   ← Dynamic breadcrumb trail
└── MobileNav.tsx                    ← Responsive mobile navigation (Sheet)

app/(dashboard)/
├── layout.tsx                       ← Sidebar + Topbar + {children}
├── page.tsx                         ← Dashboard (placeholder — built in Phase 6)
├── files/page.tsx                   ← Placeholder
├── users/page.tsx                   ← Placeholder
├── teams/page.tsx                   ← Placeholder
├── permissions/page.tsx             ← Placeholder
├── reviews/page.tsx                 ← Placeholder
├── quotes/page.tsx                  ← Placeholder
├── clients/page.tsx                 ← Placeholder
├── projects/page.tsx                ← Placeholder
├── notifications/page.tsx           ← Placeholder
├── activity/page.tsx                ← Placeholder
├── trash/page.tsx                   ← Placeholder
└── settings/page.tsx                ← Placeholder
```

## 🔧 خطوات التنفيذ

### Step 2.1: Dashboard Layout
- `app/(dashboard)/layout.tsx`
  - Server Component that wraps with Sidebar + Topbar
  - Sidebar width: 280px (collapsed: 72px) — Section 4.4
  - Content padding: 24px (mobile: 16px)
  - Uses `requireAuth()` to get user data

### Step 2.2: Sidebar Component
- `components/layout/Sidebar.tsx`
  - Navigation items matching PRD Section 3.3 pages:
    - 🏠 الرئيسية (Dashboard) → `/dashboard`
    - 📁 الملفات (Files) → `/dashboard/files`
    - 👥 المستخدمون (Users) → `/dashboard/users`
    - 🏢 الفرق (Teams) → `/dashboard/teams`
    - 📋 عروض الأسعار (Quotes) → `/dashboard/quotes`
    - 📊 النشاط (Activity) → `/dashboard/activity`
    - 🗑 المحذوفات (Trash) → `/dashboard/trash`
    - ⚙ الإعدادات (Settings) → `/dashboard/settings`
  - Collapsible (72px collapsed width)
  - Active route highlighting (orange indicator)
  - Pyramedia logo at top

### Step 2.3: Topbar Component
- `components/layout/Topbar.tsx`
  - Search bar (Ctrl+K shortcut — placeholder for Phase 5)
  - Notification bell (placeholder count — Phase 5)
  - User avatar + dropdown (profile, theme toggle, logout)
  - Theme toggle button (dark/light)

### Step 2.4: Mobile Navigation
- `components/layout/MobileNav.tsx`
  - Uses Sheet component (bottom/side slide)
  - Hamburger menu button (visible < 768px)
  - Same nav items as Sidebar

### Step 2.5: Placeholder Pages
- Create ALL pages from Section 3.3 as simple placeholder components
- Each placeholder shows: Page name + "Coming in Phase X"
- This ensures routing works before building features

### Step 2.6: Theme Provider
- Install + configure `next-themes` (Section 4.5)
- Light/Dark toggle in Topbar
- Stored in localStorage, respects system preference

## ⛔ Anti-Hallucination لهذه المرحلة
- لا تنشئ محتوى الصفحات (فقط placeholders)
- لا تنشئ Dashboard cards أو charts (Phase 6)
- لا تنشئ Command Palette/Search logic (Phase 5)
- لا تنشئ Notification dropdown logic (Phase 5)
- Sidebar nav items يجب أن تطابق PRD Section 3.3 فقط — لا صفحات إضافية

## 🧠 Anti-Forgetting لهذه المرحلة
- [ ] Sidebar يحتوي كل الـ nav items من Section 3.3
- [ ] كل route يعمل (navigation بدون أخطاء)
- [ ] Mobile responsive (< 768px يظهر hamburger)
- [ ] Dark mode toggle يعمل
- [ ] Breadcrumb يعكس المسار الحالي
- [ ] User dropdown يحتوي logout
- [ ] Sidebar collapsible (280px ↔ 72px)
- [ ] Active route highlighting بالبرتقالي

## ✅ بوابة الاختبار (Gate Tests)

### Level 1 — BUILD
```bash
pnpm tsc --noEmit   # ← 0 errors
pnpm next build      # ← success
```

### Level 2 — FUNCTION
```
1. Login → Dashboard layout يظهر مع Sidebar          ✓
2. كل nav link يحول للصفحة الصحيحة                   ✓
3. Sidebar collapse/expand يعمل                       ✓
4. Mobile hamburger menu يعمل                          ✓
5. Dark/Light toggle يعمل                              ✓
6. Logout من User dropdown يعمل                        ✓
7. Breadcrumb يتحدث مع التنقل                         ✓
```

### Level 3 — INTEGRATION
```
1. Auth يعمل (login → dashboard → navigate → logout)  ✓
2. Route protection يعمل (unauthenticated → redirect)  ✓
```

---

# ═══════════════════════════════════════════════════════════════
# PHASE 3: مدير الملفات — الوحدة الأساسية
# File Manager — Core Module
# ═══════════════════════════════════════════════════════════════

## 📍 السياق (Context)
Admin layout جاهز. Auth يعمل. كل الـ routes موجودة كـ placeholders.

## 🎯 الهدف (Goal)
مدير ملفات كامل: عرض، رفع، تنزيل، حذف، إعادة تسمية، إنشاء مجلدات، معاينة، سحب وإفلات

## 📖 مرجع PRD
| القسم | الملف | الموضوع |
|-------|-------|---------|
| Section 6.3 | Master PRD | File Explorer page spec |
| Section 7.1 Group 2 | Master PRD | File API routes (13 endpoints) |
| Section 9 | Master PRD | File Storage & Management |
| Section 9.1 | Master PRD | Storage Configuration |
| Section 9.2 | Master PRD | Upload Pipeline |
| Section 9.3 | Master PRD | File Preview System |
| 12.1 | PRD-migration-specs.md | File Manager Module (complete) |
| 1.7 | PRD-database-architecture.md | move_file_to_trash() |

## 📁 الملفات المطلوبة
```
app/(dashboard)/files/
├── page.tsx                         ← Server Component - initial file list
├── layout.tsx                       ← File manager layout
└── [...path]/
    └── page.tsx                     ← Dynamic folder navigation

components/files/
├── FileExplorer.tsx                 ← Main container (Client)
├── FileGrid.tsx                     ← Grid view with thumbnails
├── FileList.tsx                     ← Table/list view
├── FileToolbar.tsx                  ← Action toolbar (upload, new folder, etc.)
├── FileBreadcrumbs.tsx              ← Path breadcrumbs
├── FilePreview.tsx                  ← Right-side preview panel
├── FileContextMenu.tsx              ← Right-click context menu
├── FileUploadZone.tsx               ← Drag-drop upload with progress
├── FileSearch.tsx                   ← Search overlay (placeholder — Phase 5)
├── FileRenameDialog.tsx             ← Rename modal
├── FileMoveDialog.tsx               ← Move/copy modal
└── BatchActionsBar.tsx              ← Multi-select action bar

app/api/files/
├── route.ts                         ← GET (list) + POST (upload) + DELETE (delete)
├── batch/route.ts                   ← DELETE (batch delete)
├── rename/route.ts                  ← PATCH (rename)
├── content/route.ts                 ← GET (file content) + PUT (save)
├── folder/route.ts                  ← POST (create folder)
├── proxy/route.ts                   ← GET (proxy with MIME)
├── download/route.ts                ← GET (signed URL download)
├── public-url/route.ts              ← GET (public URL)
├── search/route.ts                  ← GET (deep search)
└── index/rebuild/route.ts           ← POST (rebuild index)

lib/utils/
├── path.ts                          ← Section 11.3 (sanitizePath, sanitizeFileName)
├── format.ts                        ← Date, file size, currency formatters

hooks/
├── useFiles.ts                      ← TanStack Query hooks for files
```

## 🔧 خطوات التنفيذ

### Step 3.1: Path & File Utilities
- `lib/utils/path.ts` — Copy EXACTLY from Section 11.3
  - `sanitizePath()` — Remove `..`, leading slashes, illegal chars
  - `sanitizeFileName()` — Replace dangerous chars, limit 255 chars

### Step 3.2: File API Routes (13 endpoints from Section 7.1 Group 2)
كل route يجب أن:
1. يتحقق من Auth (requireAuth)
2. يتحقق من الصلاحيات (check_path_access RPC)
3. يتعامل مع Supabase Storage
4. يرجع JSON response مع error handling

| Route | Method | Logic |
|-------|--------|-------|
| `/api/files` | GET | List files via `supabase.storage.from().list(prefix)` + RBAC filter |
| `/api/files` | POST | Upload via `supabase.storage.from().upload()` (Section 9.2) |
| `/api/files` | DELETE | Move to trash via `move_file_to_trash()` RPC |
| `/api/files/batch` | DELETE | Loop + move each to trash |
| `/api/files/rename` | PATCH | `supabase.storage.from().move()` |
| `/api/files/content` | GET | Fetch + return text content |
| `/api/files/content` | PUT | Upload text content |
| `/api/files/folder` | POST | Upload `.keep` placeholder |
| `/api/files/proxy` | GET | Proxy with correct MIME type |
| `/api/files/download` | GET | Generate signed URL (1hr) |
| `/api/files/public-url` | GET | Get public URL |
| `/api/files/search` | GET | Use `search_files()` RPC from DB architecture |
| `/api/files/index/rebuild` | POST | Rebuild `pyra_file_index` |

### Step 3.3: TanStack Query Hooks
- `hooks/useFiles.ts` — Query keys from PRD-migration-specs.md Section 12.1.2:
  ```typescript
  fileKeys.all, fileKeys.list(path), fileKeys.search(query),
  fileKeys.content(path), fileKeys.preview(path)
  ```
- Mutations: uploadFile, deleteFile, renameFile, createFolder, batchDelete

### Step 3.4: File Explorer Components
- `FileExplorer.tsx` — Container with grid/list toggle, breadcrumbs, toolbar
- `FileGrid.tsx` — Thumbnail grid (images preview, folder icons)
- `FileList.tsx` — Table with columns: Name, Type, Size, Date (Section 6.3)
- `FileToolbar.tsx` — Upload button, New Folder, Search, View toggle, Sort
- `FileUploadZone.tsx` — Drag-drop zone with upload progress
- `FileContextMenu.tsx` — Right-click: Open, Download, Share, Rename, Move, Delete, History
- `FileBreadcrumbs.tsx` — Clickable path segments
- `FilePreview.tsx` — Sheet panel with preview + metadata
- `FileRenameDialog.tsx` — Dialog with input field
- `BatchActionsBar.tsx` — Appears when multiple files selected

### Step 3.5: File Preview System (Section 9.3)
| File Type | Preview Method |
|-----------|---------------|
| Images | `<img>` with Supabase public URL |
| PDF | `<iframe>` with signed URL |
| Video | `<video>` with signed URL |
| Audio | `<audio>` with signed URL |
| Code/Text | Monospace div with content |

## ⛔ Anti-Hallucination لهذه المرحلة
- لا تنشئ versioning UI (Phase 6) — فقط auto-version on upload
- لا تنشئ share links UI (Phase 6)
- لا تنشئ review panel (Phase 5)
- لا تنشئ search logic (Phase 5) — placeholder فقط
- Storage bucket name: `pyraai-workspace` فقط (Section 9.1)
- لا تضف file types غير مذكورة في Section 9.3
- Arabic file names: sanitize to ASCII, store original in pyra_file_index (Section 12.1.1)

## 🧠 Anti-Forgetting لهذه المرحلة
- [ ] 13 API routes مُنشأة ومتطابقة مع Section 7.1 Group 2
- [ ] كل route يتحقق من Auth + Permissions
- [ ] Upload يعمل (single + multiple)
- [ ] Delete يستخدم move_file_to_trash() RPC (لا حذف مباشر)
- [ ] Folder navigation يعمل (nested paths)
- [ ] Grid view يعمل
- [ ] List view يعمل
- [ ] Context menu يعمل
- [ ] Breadcrumbs يعمل
- [ ] File preview يعمل لكل نوع مذكور
- [ ] Upload progress bar يظهر
- [ ] Drag & Drop upload يعمل
- [ ] Arabic file names تُحفظ في pyra_file_index
- [ ] RBAC يمنع الوصول غير المصرح
- [ ] Rename يعمل
- [ ] Batch delete يعمل
- [ ] Create folder يعمل

## ✅ بوابة الاختبار (Gate Tests)

### Level 1 — BUILD
```bash
pnpm tsc --noEmit && pnpm next build
```

### Level 2 — FUNCTION
```
1. Navigate to /dashboard/files → shows root files           ✓
2. Click folder → navigates inside                            ✓
3. Upload file → appears in list                              ✓
4. Upload multiple files → all appear                         ✓
5. Drag & Drop → uploads correctly                            ✓
6. Right-click → context menu appears                         ✓
7. Rename file → name updates                                 ✓
8. Delete file → moves to trash (disappears from list)        ✓
9. Create folder → appears in list                            ✓
10. Preview image → shows in panel                            ✓
11. Download file → downloads correctly                       ✓
12. Grid/List toggle → switches view                          ✓
13. Breadcrumbs → navigable                                   ✓
14. Batch select + delete → works                             ✓
15. Non-admin user → can only see permitted folders           ✓
```

### Level 3 — INTEGRATION
```
1. Login → Files → Upload → Logout → Login → File still there  ✓
2. Admin sees all, Employee sees limited folders                ✓
```

---

# ═══════════════════════════════════════════════════════════════
# PHASE 4: المستخدمون + الفرق + الصلاحيات
# Users + Teams + Permissions
# ═══════════════════════════════════════════════════════════════

## 📍 السياق (Context)
File Manager يعمل. Auth يعمل. RBAC يعمل على مستوى API.

## 🎯 الهدف (Goal)
- إدارة المستخدمين CRUD
- إدارة الفرق CRUD
- محرر الصلاحيات البصري
- كل ذلك admin-only

## 📖 مرجع PRD
| القسم | الملف | الموضوع |
|-------|-------|---------|
| Section 7.1 Group 6 | Master PRD | Users API (6 endpoints) |
| Section 7.1 Group 7 | Master PRD | Teams API (6 endpoints) |
| Section 7.1 Group 8 | Master PRD | Permissions API (4 endpoints) |
| 12.2 | PRD-migration-specs.md | User Management Module |
| 12.3 | PRD-migration-specs.md | Team Management Module |

## 📁 الملفات المطلوبة
```
app/(dashboard)/users/
├── page.tsx                         ← User list (server component)
└── _components/
    ├── user-table.tsx               ← Sortable/filterable user table
    ├── user-create-dialog.tsx       ← Create user modal
    ├── user-edit-dialog.tsx         ← Edit user + permissions
    ├── user-delete-dialog.tsx       ← Confirmation dialog
    └── permission-builder.tsx       ← Visual path permission editor

app/(dashboard)/teams/
├── page.tsx                         ← Team list
└── _components/
    ├── team-card-grid.tsx           ← Team cards with member avatars
    ├── team-create-dialog.tsx       ← Create team modal
    ├── team-edit-dialog.tsx         ← Edit team
    ├── team-members-list.tsx        ← Member list with add/remove
    └── add-member-combobox.tsx      ← Searchable user selector

app/api/users/
├── route.ts                         ← GET (list) + POST (create)
├── lite/route.ts                    ← GET (lite list)
└── [username]/
    ├── route.ts                     ← PATCH (update) + DELETE (delete)
    └── password/route.ts            ← PATCH (change password)

app/api/teams/
├── route.ts                         ← GET (list) + POST (create)
└── [teamId]/
    ├── route.ts                     ← PATCH (update) + DELETE (delete)
    └── members/
        ├── route.ts                 ← POST (add member)
        └── [username]/route.ts      ← DELETE (remove member)

app/api/permissions/
├── route.ts                         ← GET + POST (manage permissions)

hooks/
├── useUsers.ts                      ← TanStack Query hooks
├── useTeams.ts                      ← TanStack Query hooks
```

## 🔧 خطوات التنفيذ

### Step 4.1: User API Routes (6 endpoints)
- GET `/api/users` — List all users (admin only, requireAdmin)
- GET `/api/users/lite` — Username + display_name only
- POST `/api/users` — Create: Supabase Auth + pyra_users insert
- PATCH `/api/users/[username]` — Update role/permissions/display_name
- DELETE `/api/users/[username]` — Cannot delete self, Supabase Auth + pyra_users
- PATCH `/api/users/[username]/password` — Change password via Supabase Admin API

### Step 4.2: Team API Routes (6 endpoints)
- GET `/api/teams` — List all teams with member counts
- POST `/api/teams` — Create team with permissions
- PATCH `/api/teams/[teamId]` — Update team name/description/permissions
- DELETE `/api/teams/[teamId]` — Delete team (cascades members)
- POST `/api/teams/[teamId]/members` — Add member
- DELETE `/api/teams/[teamId]/members/[username]` — Remove member

### Step 4.3: Permission Builder Component
- Tree view showing Supabase Storage folder structure
- Checkboxes: browse / upload / full per folder
- Per-folder granular: can_upload, can_delete, can_rename, can_share
- Shows team inheritance preview

### Step 4.4: User Management UI
- DataTable with columns: Avatar, Name, Username, Role, Teams, Created
- Create dialog: username, display_name, email, password, role, permissions
- Edit dialog: display_name, role, permissions (username immutable)
- Delete dialog: confirmation with warning

### Step 4.5: Team Management UI
- Card grid: team name, description, member count, member avatars
- Create/Edit: name, description, permissions (permission builder)
- Members: add via combobox search, remove with confirmation

## ⛔ Anti-Hallucination لهذه المرحلة
- لا تنشئ client management (Phase 8)
- لا تنشئ project management (Phase 8)
- لا يمكن تغيير username بعد الإنشاء (PRD restriction)
- لا ترجع password_hash في API responses (PRD restriction)
- Permission JSON structure يجب أن يطابق الهيكل الحالي في Section 12.2.1
- لا تنشئ bulk user operations (ليس في PRD)

## 🧠 Anti-Forgetting لهذه المرحلة
- [ ] 6 user API routes تعمل (كلها admin-only)
- [ ] 6 team API routes تعمل
- [ ] User creation يستخدم Supabase Auth + pyra_users insert
- [ ] Cannot delete self validation
- [ ] Password never exposed in responses
- [ ] Username immutable after creation
- [ ] Permission builder shows folder tree
- [ ] Team permissions merge with user permissions
- [ ] Add/Remove team members works
- [ ] DataTable sortable + filterable

## ✅ بوابة الاختبار (Gate Tests)

### Level 1 — BUILD
```bash
pnpm tsc --noEmit && pnpm next build
```

### Level 2 — FUNCTION
```
1. Admin creates user → appears in list                       ✓
2. Admin edits user role → updates                            ✓
3. Admin changes user password → works                        ✓
4. Admin deletes user (not self) → removed                    ✓
5. Admin tries to delete self → error                         ✓
6. Admin creates team → appears in grid                       ✓
7. Admin adds member to team → member appears                 ✓
8. Admin removes member → member gone                         ✓
9. Admin sets folder permissions → permission builder works   ✓
10. Non-admin tries /users → forbidden                        ✓
```

### Level 3 — INTEGRATION
```
1. Create user → Login as new user → See only permitted files   ✓
2. Add user to team → User gets team's file access             ✓
3. Remove user from team → Access revoked                       ✓
```

---

# ═══════════════════════════════════════════════════════════════
# PHASE 5: المراجعات + الإشعارات + النشاط + البحث
# Reviews + Notifications + Activity + Search
# ═══════════════════════════════════════════════════════════════

## 📍 السياق (Context)
Files, Users, Teams, Permissions كلها تعمل.

## 🎯 الهدف (Goal)
- نظام المراجعات والتعليقات على الملفات
- الإشعارات المباشرة (Supabase Realtime)
- سجل النشاط
- البحث العميق (Command Palette + Full-Text Search)

## 📖 مرجع PRD
| القسم | الملف | الموضوع |
|-------|-------|---------|
| Section 7.1 Group 5 | Master PRD | Reviews API (4 endpoints) |
| Section 7.1 Group 9 | Master PRD | Notifications API (4 endpoints) |
| Section 7.1 Group 10 | Master PRD | Activity API (1 endpoint) |
| Section 10 | Master PRD | Real-Time & Notifications |
| 12.4 | PRD-migration-specs.md | Review Module |
| 12.5 | PRD-migration-specs.md | Notification Module |
| 12.6 | PRD-migration-specs.md | Activity Log Module |
| 4 | PRD-database-architecture.md | Full-Text Search |

## 📁 الملفات المطلوبة
```
components/files/
├── ReviewPanel.tsx                   ← Side panel for file reviews
├── ReviewThread.tsx                  ← Threaded comment display
├── ReviewCompose.tsx                 ← Comment input with @mention
├── MentionAutocomplete.tsx           ← @mention user picker

components/layout/
├── NotificationBell.tsx              ← Bell icon with unread badge
├── NotificationDropdown.tsx          ← Dropdown list of notifications

app/(dashboard)/notifications/
├── page.tsx                          ← Full notification history
└── _components/
    ├── notification-list.tsx
    └── notification-filters.tsx

app/(dashboard)/activity/
├── page.tsx                          ← Activity log timeline
└── _components/
    └── activity-timeline.tsx

app/api/reviews/
├── route.ts                          ← GET (list) + POST (create)
└── [id]/
    ├── resolve/route.ts              ← PATCH (toggle resolve)
    └── route.ts                      ← DELETE

app/api/notifications/
├── route.ts                          ← GET (paginated list)
├── unread-count/route.ts             ← GET (count)
├── [id]/read/route.ts                ← PATCH (mark read)
└── read-all/route.ts                 ← PATCH (mark all read)

app/api/activity/route.ts             ← GET (paginated activity log)

hooks/
├── useReviews.ts
├── useNotifications.ts
├── useRealtime.ts                    ← Supabase Realtime subscription
```

## 🔧 خطوات التنفيذ

### Step 5.1: Review API Routes (4 endpoints)
- GET `/api/reviews?path=...` — Reviews for file path (threaded)
- POST `/api/reviews` — Add review with @mention parsing
- PATCH `/api/reviews/[id]/resolve` — Toggle resolve
- DELETE `/api/reviews/[id]` — Delete review

### Step 5.2: Review UI Components
- ReviewPanel — Opens as Sheet on file right-click "Reviews"
- ReviewThread — Threaded display (parent + children)
- ReviewCompose — Input with @mention autocomplete
- @mention triggers notification via `create_notification_for_path()` RPC

### Step 5.3: Notification API Routes (4 endpoints)
- GET `/api/notifications` — Paginated notifications
- GET `/api/notifications/unread-count` — Count
- PATCH `/api/notifications/[id]/read` — Mark read
- PATCH `/api/notifications/read-all` — Mark all read

### Step 5.4: Realtime Notifications
- `hooks/useRealtime.ts` — Copy from PRD Section 10.1
- Subscribe to `pyra_notifications` table changes
- Show toast on new notification
- Update badge count automatically

### Step 5.5: Notification Bell + Dropdown
- Bell icon in Topbar with unread count badge
- Dropdown shows last 10 notifications
- Click → navigate to target + mark read

### Step 5.6: Activity Log
- GET `/api/activity` — Paginated activity with filters
- Timeline component showing activities chronologically
- Filters by action type, user, date range

### Step 5.7: Search (Command Palette)
- Ctrl+K opens Command palette (cmdk library)
- Uses `search_files()` RPC from PRD-database-architecture.md Section 4
- Full-text search with PostgreSQL tsvector + GIN
- Results show: filename, path, matches

## ⛔ Anti-Hallucination لهذه المرحلة
- Review types: only `comment` and `approval` (Section 12.4.1)
- لا تنشئ file annotations (ليس في PRD)
- Notification types: exactly as listed in Section 10.2
- لا تنشئ email notifications (Phase 10)
- Search uses `search_files()` RPC — NOT JavaScript-side filtering
- Activity log is read-only — no manual entries

## 🧠 Anti-Forgetting لهذه المرحلة
- [ ] 4 review API routes تعمل
- [ ] Threaded comments (parent_id) تعمل
- [ ] @mention parsing + notification creation يعمل
- [ ] 4 notification API routes تعمل
- [ ] Supabase Realtime subscription يعمل
- [ ] Toast notification يظهر للإشعارات الجديدة
- [ ] Badge count يتحدث تلقائياً
- [ ] Activity log timeline يعرض كل العمليات
- [ ] Command palette (Ctrl+K) يعمل
- [ ] Full-text search يرجع نتائج دقيقة
- [ ] Review resolve/unresolve toggle يعمل

## ✅ بوابة الاختبار (Gate Tests)

### Level 1 — BUILD
```bash
pnpm tsc --noEmit && pnpm next build
```

### Level 2 — FUNCTION
```
1. Add comment on file → appears in review panel              ✓
2. Reply to comment → threaded correctly                      ✓
3. @mention user → notification created                       ✓
4. Resolve comment → status updates                           ✓
5. Notification bell shows count                              ✓
6. Click notification → navigates to target                   ✓
7. Mark all read → count resets to 0                          ✓
8. Realtime: open 2 browsers → notification appears live     ✓
9. Activity log shows upload/delete/rename events             ✓
10. Ctrl+K → search → results appear                          ✓
11. Search Arabic filename → found via FTS                    ✓
```

### Level 3 — INTEGRATION
```
1. Upload file → Activity logged → Notification sent          ✓
2. Add review → Notification → Realtime bell update           ✓
3. Search → Click result → Navigate to file                   ✓
```

---

# ═══════════════════════════════════════════════════════════════
# PHASE 6: لوحة التحكم + الإعدادات + المحذوفات + المشاركة + الإصدارات
# Dashboard + Settings + Trash + Share Links + Versioning
# ═══════════════════════════════════════════════════════════════

## 📍 السياق (Context)
كل الوحدات الأساسية تعمل: Files, Users, Teams, Reviews, Notifications, Search.

## 🎯 الهدف (Goal)
- لوحة التحكم مع الإحصائيات والرسوم البيانية
- صفحة الإعدادات
- سلة المحذوفات (استعادة + حذف نهائي)
- روابط المشاركة
- إصدارات الملفات

## 📖 مرجع PRD
| القسم | الملف | الموضوع |
|-------|-------|---------|
| Section 6.2 | Master PRD | Dashboard page spec |
| Section 7.1 Groups 3,4,8-13 | Master PRD | Remaining API endpoints |
| 12.6-12.11 | PRD-migration-specs.md | Remaining modules |
| 1.3 | PRD-database-architecture.md | get_admin_dashboard() |

## 📁 الملفات المطلوبة
```
app/(dashboard)/page.tsx              ← Dashboard with stats + charts
app/(dashboard)/_components/
├── DashboardCards.tsx                ← Stat cards (NumberTicker)
├── DashboardCharts.tsx              ← Recharts (upload trends, storage)
├── QuickActions.tsx                  ← Action dock
└── RecentActivity.tsx               ← Activity stream

app/(dashboard)/settings/page.tsx     ← Settings form
app/(dashboard)/trash/page.tsx        ← Trash bin
app/(dashboard)/trash/_components/
└── TrashTable.tsx                    ← Trash items with restore/purge

components/files/
├── ShareDialog.tsx                   ← Create share link dialog
├── VersionPanel.tsx                  ← File version history panel

app/api/trash/
├── route.ts                         ← GET (list) + POST (restore) + DELETE (purge)

app/api/shares/
├── route.ts                         ← GET (list) + POST (create)
└── [id]/route.ts                    ← PATCH (deactivate)
├── download/[token]/route.ts        ← GET (public download)

app/api/files/[...path]/versions/route.ts    ← GET versions
app/api/files/versions/[id]/restore/route.ts ← POST restore
app/api/files/versions/[id]/route.ts         ← DELETE version

app/api/dashboard/route.ts           ← GET dashboard data (uses RPC)
app/api/settings/route.ts            ← GET + PUT settings
app/api/favorites/route.ts           ← GET + POST + DELETE favorites
```

## 🔧 خطوات التنفيذ

### Step 6.1: Dashboard
- Uses `get_admin_dashboard()` RPC — single call (Section 1.3 PRD-database-architecture)
- Cards: Total files, Active projects, Pending approvals, Storage usage
- NumberTicker animations (Magic UI)
- Recharts: Upload trends (weekly), Storage breakdown (by type)
- Recent activity stream (from dashboard RPC data)

### Step 6.2: Settings
- App configuration: company name, logo, theme
- Quote settings: prefix, default expiry, VAT rate
- Bank details
- Storage settings
- Uses `pyra_settings` K/V table

### Step 6.3: Trash
- List trashed files with: name, original path, deleted date, auto-purge date
- Restore: move file back to original location + restore pyra_file_index
- Permanent delete: remove from storage + trash record
- Auto-purge handled by pg_cron (already set up in Phase 0)

### Step 6.4: Share Links
- ShareDialog: Generate link with optional expiry + password
- Share link list per file
- Deactivate share link
- Public download endpoint (`/api/shares/download/[token]`)
- Also need `/share/[token]/page.tsx` — public page

### Step 6.5: File Versioning
- VersionPanel: Shows version history for a file
- Restore version: copy version to original path
- Delete version: remove from .versions/ storage
- Auto-version on upload already works (Phase 3)

## ⛔ Anti-Hallucination لهذه المرحلة
- Dashboard uses `get_admin_dashboard()` RPC — NOT 6 separate queries
- Recharts only — no other chart libraries
- Trash auto-purge is pg_cron — NOT JavaScript cron
- Share links expire based on DB data — NOT client-side timer
- لا تنشئ favorite folders system beyond simple toggle (Section 7.1 Group 12)

## 🧠 Anti-Forgetting لهذه المرحلة
- [ ] Dashboard loads in single RPC call
- [ ] NumberTicker animations work
- [ ] Charts render correctly
- [ ] Settings save/load works
- [ ] Trash list shows items with expiry countdown
- [ ] Restore from trash works
- [ ] Share links generate correctly
- [ ] Share links expire as configured
- [ ] Public share download works (unauthenticated)
- [ ] Version history shows for files
- [ ] Version restore works
- [ ] All API routes match Section 7.1

## ✅ بوابة الاختبار (Gate Tests)

### Level 1 — BUILD
```bash
pnpm tsc --noEmit && pnpm next build
```

### Level 2 — FUNCTION
```
1. Dashboard shows correct stats                              ✓
2. Charts render with data                                    ✓
3. Settings save and reload                                   ✓
4. Trash shows deleted files                                  ✓
5. Restore file from trash → back in original location        ✓
6. Create share link → link works in incognito                ✓
7. Expired share link → returns error                         ✓
8. Version history shows past versions                        ✓
9. Restore version → file reverts                             ✓
```

### Level 3 — INTEGRATION
```
1. Delete file (Phase 3) → appears in Trash (Phase 6)        ✓
2. Upload file → auto-version → version list shows           ✓
3. Dashboard counts match actual data                          ✓
```

---

# ═══════════════════════════════════════════════════════════════
# PHASE 7: نظام عروض الأسعار — لوحة الأدمن
# Quotation System — Admin Panel
# ═══════════════════════════════════════════════════════════════

## 📍 السياق (Context)
كل وحدات الأدمن جاهزة. Dashboard يعمل. Settings يعمل.

## 🎯 الهدف (Goal)
- Quote Builder كامل (إنشاء، تعديل، حذف، نسخ)
- PDF generation (jsPDF direct drawing)
- إرسال العرض للعميل
- قائمة العروض مع الفلترة

## 📖 مرجع PRD
| القسم | الملف | الموضوع |
|-------|-------|---------|
| Section 14 | Master PRD | Quote/Invoice System (complete) |
| Section 14.2 | Master PRD | Quote Builder UI |
| Section 14.3 | Master PRD | PDF Generation Engine |
| Section 14.4 | Master PRD | Signature Pad Component |
| Section 14.5 | Master PRD | Quote Builder Component |
| Section 14.7 | Master PRD | Currency & Localization |
| Section 7.1 Group 15 | Master PRD | Quotes API (8 endpoints) |
| 1.1 | PRD-database-architecture.md | generate_quote_number() |
| 1.2 | PRD-database-architecture.md | recalculate_quote_totals() trigger |
| 1.8 | PRD-database-architecture.md | get_quote_with_items() |
| 2.1 | PRD-database-architecture.md | v_quotes_with_client view |

## 📁 الملفات المطلوبة
```
app/(dashboard)/quotes/
├── page.tsx                          ← Quotes list
├── new/page.tsx                      ← New quote builder
└── [id]/page.tsx                     ← Edit quote / view details

components/quotes/
├── QuoteBuilder.tsx                  ← Section 14.5 (full builder)
├── QuotePreview.tsx                  ← Read-only preview
├── QuoteItemsTable.tsx               ← Dynamic items table
├── QuotePdfGenerator.tsx             ← PDF generation wrapper
├── SignaturePad.tsx                  ← Section 14.4
└── QuoteStatusBadge.tsx              ← Status badge component

lib/pdf/
├── generateQuotePdf.ts              ← Section 14.3 (jsPDF engine)
└── logoData.ts                       ← Base64 encoded PYRAMEDIA X logo

app/api/quotes/
├── route.ts                          ← GET (list) + POST (create)
└── [id]/
    ├── route.ts                      ← GET (detail) + PATCH (update) + DELETE
    ├── duplicate/route.ts            ← POST (duplicate)
    └── send/route.ts                 ← POST (send to client)

app/api/clients/
├── route.ts                          ← GET (list) + POST (create)
└── [id]/route.ts                     ← GET + PATCH + DELETE

hooks/
├── useQuotes.ts                      ← TanStack Query hooks
```

## 🔧 خطوات التنفيذ

### Step 7.1: Client API (needed for quote client selection)
- GET `/api/clients` — List all clients
- POST `/api/clients` — Create client
- GET `/api/clients/[id]` — Get client detail
- PATCH `/api/clients/[id]` — Update client
- DELETE `/api/clients/[id]` — Delete client

### Step 7.2: Quote API Routes (8 endpoints)
- GET `/api/quotes` — List quotes (uses `v_quotes_with_client` view)
- POST `/api/quotes` — Create: use `generate_quote_number()` RPC, insert quote + items
- GET `/api/quotes/[id]` — Detail: use `get_quote_with_items()` RPC
- PATCH `/api/quotes/[id]` — Update: replace items, totals auto-recalculated by trigger
- DELETE `/api/quotes/[id]` — Delete (cascade items)
- POST `/api/quotes/[id]/duplicate` — Copy with new number, status=draft
- POST `/api/quotes/[id]/send` — Set status=sent, sent_at=now(), create notification

### Step 7.3: PDF Generation Engine
- `lib/pdf/generateQuotePdf.ts` — Copy from Section 14.3
- jsPDF direct drawing (NOT html2canvas)
- Colors: ORANGE #E87A2E, DARK #2D2D2D, etc.
- Logo via base64 PNG
- A4 format, pixel-perfect matching reference design

### Step 7.4: Quote Builder Component
- Layout matching Section 14.2:
  1. Company Header (logo + name)
  2. Client Info (dropdown from pyra_clients)
  3. Quote Details (auto-generated number, dates, project name)
  4. Services Table (dynamic rows, auto-calculate)
  5. Totals (subtotal, VAT 5%, total)
  6. Notes textarea
  7. Bank Details (hardcoded — Appendix C)
  8. Terms & Conditions (hardcoded — Appendix D)
  9. Footer (hardcoded)
- Toolbar: Save Draft / Save & Send / Generate PDF / Close

### Step 7.5: Quote List Page
- Filter tabs: All / Draft / Sent / Viewed / Signed / Expired
- Table: Quote #, Client, Project, Total, Status, Date
- Actions: Edit, Duplicate, Delete, Send

## ⛔ Anti-Hallucination لهذه المرحلة
- PDF uses jsPDF direct drawing — NOT html2canvas (Section 14.3 critical decision)
- Currency: AED (not SAR) — Section 14.7
- VAT: 5% (not 15%) — Section 14.7
- Date format: dd-mm-yyyy — Section 14.7
- Bank details: Emirates NBD — hardcoded (Appendix C)
- Terms: 3 specific terms — hardcoded (Appendix D)
- Quote totals: auto-calculated by DB trigger — NOT JavaScript
- Quote number: generated by DB function — NOT JavaScript
- لا تنشئ client portal quote view (Phase 8)
- لا تنشئ invoice system (only quotation)

## 🧠 Anti-Forgetting لهذه المرحلة
- [ ] Quote number uses generate_quote_number() RPC (atomic)
- [ ] Quote totals auto-calculated by trigger (insert item → totals update)
- [ ] PDF matches reference design exactly (colors, layout, fonts)
- [ ] PDF includes: logo, client info, items, totals, bank, terms, footer
- [ ] Client dropdown auto-fills client info
- [ ] Services table: add row, remove row, auto-calculate
- [ ] Status flow: draft → sent → viewed → signed
- [ ] Duplicate creates new number + resets to draft
- [ ] Send creates client notification
- [ ] Quotes list filterable by status
- [ ] Currency formatted: AED with 2 decimals
- [ ] Client CRUD API (4 endpoints) works

## ✅ بوابة الاختبار (Gate Tests)

### Level 1 — BUILD
```bash
pnpm tsc --noEmit && pnpm next build
```

### Level 2 — FUNCTION
```
1. Create quote → draft saved                                 ✓
2. Add 3 items → totals auto-calculate                        ✓
3. Select client → fields auto-fill                           ✓
4. Generate PDF → downloads correctly formatted file          ✓
5. PDF matches reference (logo, colors, layout)               ✓
6. Send quote → status=sent, notification created             ✓
7. Duplicate quote → new number, status=draft                 ✓
8. Delete quote → removed (with items cascade)                ✓
9. Quote list filters work (draft/sent/signed)                ✓
10. Quote number auto-increments (QT-0001, QT-0002)          ✓
```

### Level 3 — INTEGRATION
```
1. Create client → Create quote for client → Send             ✓
2. Dashboard shows correct quote counts                        ✓
3. Activity log shows quote operations                         ✓
```

---

# ═══════════════════════════════════════════════════════════════
# PHASE 8: بوابة العميل الكاملة
# Client Portal — Complete
# ═══════════════════════════════════════════════════════════════

## 📍 السياق (Context)
كل وحدات الأدمن كاملة. عروض الأسعار تعمل. العملاء مُسجلين.

## 🎯 الهدف (Goal)
- تسجيل دخول العملاء
- لوحة تحكم العميل
- مشاريع العميل + معاينة الملفات + الموافقة
- عروض الأسعار + التوقيع الإلكتروني
- التعليقات بين العميل والفريق
- إشعارات العميل

## 📖 مرجع PRD
| القسم | الملف | الموضوع |
|-------|-------|---------|
| Section 15 | Master PRD | Client Portal System |
| Section 14.6 | Master PRD | Client Portal Quote View |
| Section 7.1 Group 18 | Master PRD | Portal API (22 endpoints) |
| Appendix E.1 | Master PRD | Portal Dashboard Wireframe |
| Appendix E.2 | Master PRD | Portal Quote + Signature Wireframe |
| 1.4 | PRD-database-architecture.md | get_client_dashboard() |
| Full file | PRD-client-portal.md | Complete portal specs |

## 📁 الملفات المطلوبة
```
app/portal/
├── layout.tsx                        ← Portal layout (simplified sidebar)
├── login/page.tsx                    ← Client login
├── page.tsx                          ← Client dashboard (Section 15.3)
├── projects/
│   ├── page.tsx                      ← Client projects list
│   └── [id]/page.tsx                 ← Project detail (files, comments, approvals)
├── quotes/
│   ├── page.tsx                      ← Client quotes list
│   └── [id]/page.tsx                 ← Quote detail + signature (Section 14.6)
├── notifications/page.tsx            ← Client notifications
└── profile/page.tsx                  ← Client profile

components/portal/
├── PortalSidebar.tsx                 ← Simplified navigation
├── PortalDashboard.tsx               ← Dashboard cards
├── ProjectCard.tsx                   ← Project card component
├── FileApproval.tsx                  ← Approve / Request Revision UI
├── ClientSignature.tsx               ← Signature capture for quotes
├── ClientComments.tsx                ← Threaded comments
└── PortalNotifications.tsx           ← Notification list

app/api/portal/
├── auth/
│   ├── login/route.ts                ← Client login
│   ├── logout/route.ts               ← Client logout
│   └── session/route.ts              ← Client session check
├── dashboard/route.ts                ← get_client_dashboard() RPC
├── projects/
│   ├── route.ts                      ← GET (client projects)
│   └── [id]/route.ts                 ← GET (project detail)
├── files/[id]/
│   ├── preview/route.ts              ← File preview
│   ├── download/route.ts             ← File download
│   ├── approve/route.ts              ← POST (approve file)
│   └── revision/route.ts             ← POST (request revision)
├── quotes/
│   ├── route.ts                      ← GET (client quotes)
│   └── [id]/
│       ├── route.ts                  ← GET (quote detail, auto-mark viewed)
│       └── sign/route.ts             ← POST (submit signature)
├── comments/route.ts                 ← GET + POST
├── notifications/
│   ├── route.ts                      ← GET
│   └── read/route.ts                 ← PATCH (mark read)
└── profile/route.ts                  ← GET + PATCH
```

## 🔧 خطوات التنفيذ

### Step 8.1: Portal Auth
- Client login via Supabase Auth with pyra_clients table
- Separate from admin auth (different user types)
- Portal middleware check (client_id in JWT)

### Step 8.2: Portal Dashboard
- Uses `get_client_dashboard()` RPC — single call
- Cards: Active Projects, Pending Approvals, Quotes, Notifications
- Welcome card: client name, company
- Recent updates stream

### Step 8.3: Projects
- List client's projects (only assigned projects)
- Project detail: files with preview, approval actions
- File approval workflow: Approve / Request Revision (comment required)

### Step 8.4: Client Quote View + Signature
- Read-only quote document (white paper layout matching PDF)
- Auto-update status: sent → viewed (on first access)
- Signature pad using react-signature-canvas (Section 14.4)
- Name input + checkbox "I agree to terms"
- Submit signature → status changes to "signed"
- If already signed → show signature image + date

### Step 8.5: Client-Team Comments
- Threaded comments on projects
- Both client and team can comment
- Read status tracking (is_read_by_client, is_read_by_team)

### Step 8.6: Client Notifications
- Supabase Realtime on pyra_client_notifications
- Types: file_shared, review_request, review_response, new_quote, quote_updated

## ⛔ Anti-Hallucination لهذه المرحلة
- Portal uses pyra_clients table — NOT pyra_users
- Client can ONLY see their own data (client_id filter on all queries)
- Client CANNOT access admin routes
- Signature uses react-signature-canvas — NOT raw canvas API
- Quote view is READ-ONLY (client cannot edit quote content)
- Auto-viewed status update happens server-side (not client-side)
- لا تنشئ client self-registration (admin creates clients)
- Portal layout is simplified — fewer nav items than admin

## 🧠 Anti-Forgetting لهذه المرحلة
- [ ] Client login works (separate from admin)
- [ ] Client can only see their own projects/quotes
- [ ] Portal dashboard uses get_client_dashboard() RPC
- [ ] Project files with preview work
- [ ] File approval workflow: approve / request revision
- [ ] Request revision requires comment
- [ ] Notifications sent to admin on approval/revision
- [ ] Quote detail auto-marks as "viewed"
- [ ] Signature pad works (mouse + touch)
- [ ] Signature submission changes status to "signed"
- [ ] Signature + signed_by + signed_at saved correctly
- [ ] Signed_ip captured from request
- [ ] Already-signed quotes show signature image
- [ ] Client-team comments work bidirectionally
- [ ] Client notifications with Realtime
- [ ] Portal responsive on mobile
- [ ] All 22 portal API routes work

## ✅ بوابة الاختبار (Gate Tests)

### Level 1 — BUILD
```bash
pnpm tsc --noEmit && pnpm next build
```

### Level 2 — FUNCTION
```
1. Client login → portal dashboard                            ✓
2. Dashboard shows correct counts                              ✓
3. Projects list → only assigned projects visible              ✓
4. Project detail → files with preview                         ✓
5. Approve file → status updates, admin notified               ✓
6. Request revision → comment required, admin notified         ✓
7. Quotes list → only client's quotes (non-draft)             ✓
8. View quote → status changes to "viewed"                     ✓
9. Sign quote → signature captured, status "signed"            ✓
10. Signed quote → shows signature + date                      ✓
11. Comments → client and team can communicate                 ✓
12. Notifications → real-time updates                          ✓
13. Profile → update name, email                               ✓
```

### Level 3 — INTEGRATION (Full Lifecycle Test)
```
Admin creates client → Admin creates project → Admin assigns files →
Admin sends quote → Client logs in → Client sees project →
Client approves file → Admin notified →
Client views quote → Status: viewed →
Client signs quote → Status: signed → Admin sees signature →
Admin generates PDF with signature included                    ✓
```

---

# ═══════════════════════════════════════════════════════════════
# PHASE 9: التعريب + RTL + الوصولية + الوضع الداكن
# i18n + RTL + Accessibility + Dark Mode Polish
# ═══════════════════════════════════════════════════════════════

## 📍 السياق (Context)
كل الوحدات تعمل. كل الـ features مُنفذة.

## 🎯 الهدف (Goal)
- Arabic / English bilingual support
- RTL layout (Arabic-first)
- WCAG 2.1 AA accessibility
- Dark mode polish على كل الصفحات

## 📖 مرجع PRD
| القسم | الملف | الموضوع |
|-------|-------|---------|
| Section 16 | Master PRD | Accessibility & Internationalization |
| Appendix F | Master PRD | i18n Translation Structure |
| Appendix G | Master PRD | RTL/LTR CSS Logical Properties |
| Appendix H | Master PRD | WCAG 2.1 AA Compliance Checklist |
| Full file | PRD-client-portal.md | Accessibility deep-dive |

## 📁 الملفات المطلوبة
```
messages/
├── ar/
│   ├── common.json                   ← Appendix F.1
│   ├── files.json                    ← Appendix F.2
│   ├── quotes.json                   ← Appendix F.3
│   └── portal.json
├── en/
│   ├── common.json
│   ├── files.json
│   ├── quotes.json
│   └── portal.json

lib/i18n/
├── config.ts                         ← Language configuration
├── server.ts                         ← Server-side translation
└── client.ts                         ← Client-side translation hook
```

## 🔧 خطوات التنفيذ

### Step 9.1: i18n Setup
- Configure next-intl or custom i18n
- Arabic translations from Appendix F
- English translations (mirror structure)
- Language switcher in Topbar

### Step 9.2: RTL Support
- `<html lang="ar" dir="rtl">` as default
- Replace ALL physical properties with logical (Appendix G):
  - `ml-*` → `ms-*`, `mr-*` → `me-*`
  - `pl-*` → `ps-*`, `pr-*` → `pe-*`
  - `text-left` → `text-start`, `text-right` → `text-end`
  - `border-l-*` → `border-s-*`
  - `float-left` → `float-start`

### Step 9.3: Accessibility (Appendix H)
- Skip navigation link
- All ARIA attributes from Appendix H table
- Keyboard shortcuts (Appendix H keyboard table)
- Color contrast verification (all pass 4.5:1)
- Focus visible outlines (orange ring)
- Reduced motion support (Appendix H CSS)
- Screen reader announcements for dynamic content

### Step 9.4: Dark Mode Polish
- Verify every page works in dark mode
- Fix any contrast issues
- Ensure orange accent preserved in both modes

## ⛔ Anti-Hallucination لهذه المرحلة
- Use logical CSS properties ONLY from Appendix G
- ARIA attributes EXACTLY from Appendix H
- Translation keys EXACTLY from Appendix F
- لا تنشئ Hijri calendar (not in PRD)
- لا تنشئ multi-language beyond AR/EN (not in PRD)
- Date format uses Intl.DateTimeFormat — not custom parsing

## 🧠 Anti-Forgetting لهذه المرحلة
- [ ] Arabic translations for ALL UI strings
- [ ] English translations mirror Arabic
- [ ] RTL layout works on every page
- [ ] Logical CSS properties used everywhere
- [ ] Skip navigation link
- [ ] All ARIA attributes from Appendix H
- [ ] Keyboard shortcuts work (Ctrl+K, Escape, Tab, etc.)
- [ ] Color contrast ≥ 4.5:1 everywhere
- [ ] Focus outlines visible
- [ ] Reduced motion CSS applied
- [ ] Dark mode works on every page
- [ ] Language switcher works

## ✅ بوابة الاختبار (Gate Tests)

### Level 1 — BUILD
```bash
pnpm tsc --noEmit && pnpm next build
```

### Level 2 — FUNCTION
```
1. Switch to Arabic → all text Arabic, RTL layout              ✓
2. Switch to English → all text English, LTR layout            ✓
3. Tab through entire page → focus visible on all elements     ✓
4. Ctrl+K → command palette opens                              ✓
5. Escape → closes any open modal                              ✓
6. Screen reader reads page correctly                          ✓
7. Zoom to 200% → layout still usable                          ✓
8. Reduced motion → no animations                              ✓
9. Dark mode → every page looks correct                        ✓
10. Color contrast checker → all pass                          ✓
```

---

# ═══════════════════════════════════════════════════════════════
# PHASE 10: الاختبارات + PWA + DevOps + النشر
# Testing + PWA + DevOps + Deployment
# ═══════════════════════════════════════════════════════════════

## 📍 السياق (Context)
كل الميزات مُنفذة. التعريب والوصولية جاهزين.

## 🎯 الهدف (Goal)
- كتابة وتنفيذ الاختبارات (Unit, Component, Integration, E2E)
- PWA configuration
- CI/CD pipeline
- نشر على Vercel
- Performance optimization

## 📖 مرجع PRD
| القسم | الملف | الموضوع |
|-------|-------|---------|
| Section 17 | Master PRD | Testing Strategy |
| Section 17.3 | Master PRD | E2E Test Example |
| Section 18 | Master PRD | DevOps & Deployment |
| Section 22 | Master PRD | Acceptance Criteria |

## 📁 الملفات المطلوبة
```
tests/
├── unit/
│   ├── utils/path.test.ts
│   ├── utils/format.test.ts
│   ├── utils/id.test.ts
│   └── lib/permissions.test.ts
├── integration/
│   ├── api/files.test.ts
│   ├── api/users.test.ts
│   ├── api/quotes.test.ts
│   └── api/portal.test.ts
├── e2e/
│   ├── auth.spec.ts
│   ├── files.spec.ts
│   ├── quotes.spec.ts                ← Section 17.3 (copy example)
│   └── portal.spec.ts

.github/workflows/
├── deploy.yml                        ← Section 18.3 (CI/CD)

public/
├── manifest.json                     ← PWA manifest
├── sw.js                             ← Service worker

vitest.config.ts
playwright.config.ts
```

## 🔧 خطوات التنفيذ

### Step 10.1: Unit Tests (Target: 80%+)
- Path utilities: sanitizePath, sanitizeFileName
- Format utilities: formatDate, formatCurrency, formatFileSize
- ID generation: generateQuoteId, etc.
- Permission logic

### Step 10.2: Integration Tests
- API route tests with mocked Supabase
- Auth flow tests
- File CRUD tests
- Quote CRUD tests

### Step 10.3: E2E Tests (Playwright)
- Full quote lifecycle test (Section 17.3)
- Login flows (admin + client)
- File upload + preview + delete
- Client portal approval workflow

### Step 10.4: PWA
- `manifest.json` with Pyramedia branding
- Service worker for offline caching
- Add to Home Screen support

### Step 10.5: CI/CD
- GitHub Actions workflow from Section 18.3
- Run: TypeScript check → Vitest → Playwright → Deploy

### Step 10.6: Deploy to Vercel
- Connect GitHub repo
- Set environment variables
- Configure custom domain
- SSL automatic

### Step 10.7: Performance Optimization
- Target: Lighthouse ≥ 90 (Section 22.2)
- FCP < 1.5s, TTI < 3s
- Bundle size < 250KB first load JS
- Image optimization, code splitting

## ⛔ Anti-Hallucination لهذه المرحلة
- Testing pyramid targets from Section 17.1 — don't over/under test
- E2E test from Section 17.3 — use as reference
- CI/CD YAML from Section 18.3 — copy exactly
- Lighthouse targets from Section 22.2 — don't invent metrics
- لا تنشئ monitoring dashboard (use Vercel Analytics — Section 18.4)
- لا تنشئ custom error tracking (use Sentry — Section 18.4)

## 🧠 Anti-Forgetting لهذه المرحلة
- [ ] Unit tests written + passing (80%+ coverage)
- [ ] Integration tests written + passing
- [ ] E2E tests written + passing (4 critical flows)
- [ ] PWA manifest correct
- [ ] CI/CD pipeline works on GitHub
- [ ] Vercel deployment successful
- [ ] Custom domain configured
- [ ] Lighthouse ≥ 90
- [ ] FCP < 1.5s
- [ ] TTI < 3s
- [ ] Bundle < 250KB
- [ ] Zero TypeScript errors
- [ ] All 22 acceptance criteria from Section 22.1 pass
- [ ] All 11 non-functional criteria from Section 22.2 pass
- [ ] All 8 security criteria from Section 22.3 pass

## ✅ بوابة الاختبار النهائية (Final Gate)

### Level 1 — BUILD + TESTS
```bash
pnpm tsc --noEmit                    # ← 0 errors
pnpm next build                       # ← success
pnpm test                             # ← all unit + integration pass
pnpm test:e2e                         # ← all E2E pass
```

### Level 2 — PERFORMANCE
```
Lighthouse audit on every page:
  Performance: ≥ 90
  Accessibility: ≥ 90
  Best Practices: ≥ 90
  SEO: ≥ 90
```

### Level 3 — ACCEPTANCE (Section 22 — complete checklist)
```
FUNCTIONAL (Section 22.1):
[ ] Admin login + dashboard
[ ] File Explorer (upload, download, rename, delete, preview)
[ ] File versions tracked + restorable
[ ] Trash with 30-day auto-purge
[ ] Share links generate + expire
[ ] User CRUD with RBAC
[ ] Team CRUD with members
[ ] File/folder permissions
[ ] Reviews threaded
[ ] Notifications real-time
[ ] Activity log captures all
[ ] Deep search by name + content
[ ] Settings controls all config
[ ] Client portal login + dashboard
[ ] Client views projects + files
[ ] Client approve / request revision
[ ] Client-team comments bidirectional
[ ] Quote builder creates + saves
[ ] PDF matches reference design
[ ] Client views + signs quotes
[ ] Signature captured + saved

NON-FUNCTIONAL (Section 22.2):
[ ] Lighthouse ≥ 90
[ ] FCP < 1.5s
[ ] TTI < 3s
[ ] Bundle < 250KB
[ ] RTL Arabic correct
[ ] Dark mode all pages
[ ] Mobile responsive (320px - 1440px)
[ ] API routes < 500ms
[ ] Zero TS errors
[ ] Unit coverage ≥ 80%
[ ] E2E pass all
[ ] WCAG 2.1 AA

SECURITY (Section 22.3):
[ ] All routes require auth
[ ] RLS prevents cross-user access
[ ] Rate limiting on auth
[ ] File uploads validated
[ ] No SQL injection
[ ] XSS prevented (CSP)
[ ] HTTPS enforced
[ ] Cookies httpOnly + Secure + SameSite
```

---

# ═══════════════════════════════════════════════════════════════
# 📊 ملخص المراحل — PHASE SUMMARY
# ═══════════════════════════════════════════════════════════════

| المرحلة | الملفات الجديدة (تقريباً) | الـ API Routes | الاختبارات |
|---------|-------------------------|---------------|-----------|
| Phase 0 | ~25 files | 1 (health) | Build + DB |
| Phase 1 | ~8 files | 3 (auth) | Login flow |
| Phase 2 | ~18 files | 0 | Navigation |
| Phase 3 | ~20 files | 13 (files) | File CRUD |
| Phase 4 | ~18 files | 16 (users+teams+perms) | RBAC |
| Phase 5 | ~15 files | 9 (reviews+notif+activity) | Realtime |
| Phase 6 | ~15 files | 12 (dashboard+trash+shares+versions) | Integration |
| Phase 7 | ~12 files | 12 (quotes+clients) | PDF + Quote |
| Phase 8 | ~18 files | 22 (portal) | Full lifecycle |
| Phase 9 | ~12 files | 0 | Accessibility |
| Phase 10 | ~15 files | 0 | All tests |
| **Total** | **~176 files** | **88 endpoints** | **180-275 tests** |

---

# ═══════════════════════════════════════════════════════════════
# 🔄 بروتوكول استعادة السياق — Context Recovery Protocol
# ═══════════════════════════════════════════════════════════════

عندما يفقد الـ AI السياق (context window ينتهي أو يُعاد تشغيله):

## الخطوة 1: اقرأ هذا الملف
```
اقرأ EXECUTION-PLAN.md — خاصة المرحلة الحالية + القواعد الذهبية
```

## الخطوة 2: افحص الحالة الحالية
```bash
# ما هي الملفات الموجودة؟
find . -name "*.tsx" -o -name "*.ts" | wc -l

# هل يبني بنجاح؟
pnpm tsc --noEmit 2>&1 | tail -5

# هل الخادم يعمل؟
curl -s http://localhost:3000/api/health | jq .

# ما آخر route تم إنشاؤه؟
ls -la app/api/
```

## الخطوة 3: حدد المرحلة الحالية
```
1. هل Phase 0 مكتمل؟ → تحقق: package.json + types/database.ts
2. هل Phase 1 مكتمل؟ → تحقق: middleware.ts + login page
3. هل Phase 2 مكتمل؟ → تحقق: Sidebar + Topbar + layout
4. هل Phase 3 مكتمل؟ → تحقق: 13 file API routes
5. هل Phase 4 مكتمل؟ → تحقق: users + teams API routes
6. هل Phase 5 مكتمل؟ → تحقق: reviews + notifications routes
7. هل Phase 6 مكتمل؟ → تحقق: dashboard + trash + shares
8. هل Phase 7 مكتمل؟ → تحقق: quotes API + PDF
9. هل Phase 8 مكتمل؟ → تحقق: portal/ directory
10. هل Phase 9 مكتمل؟ → تحقق: messages/ translations
11. هل Phase 10 مكتمل؟ → تحقق: tests/ + .github/workflows
```

## الخطوة 4: تابع من حيث توقفت
```
❌ لا تبدأ من الصفر
❌ لا تعيد إنشاء ملفات موجودة
❌ لا تفترض أن شيئاً ناقص بدون فحص
✅ اقرأ الملفات الموجودة أولاً
✅ أكمل ما هو ناقص في المرحلة الحالية
✅ شغّل Gate Tests للتأكد
```

---

# ═══════════════════════════════════════════════════════════════
# 📎 مرفقات — ملفات PRD المرجعية
# ═══════════════════════════════════════════════════════════════

| الملف | الحجم | يُستخدم في |
|-------|-------|-----------|
| `PYRA-WORKSPACE-3.0-PRD.md` | 2,496 سطر | كل المراحل |
| `PRD-database-architecture.md` | 1,595 سطر | Phase 0, 3, 5, 6, 7, 8 |
| `PRD-backend-security.md` | 3,583 سطر | Phase 1, 3, 4, 5, 7, 8 |
| `PRD-client-portal.md` | 4,710 سطر | Phase 8, 9 |
| `PRD-migration-specs.md` | 3,075 سطر | Phase 3-8, 10 |

---

**نهاية ملف التنفيذ**

> 📋 هذا الملف هو الدليل التنفيذي الوحيد — أي كود يُنتَج يجب أن يرجع لمرحلة ومرجع PRD محدد
> ⛔ أي feature غير مذكورة هنا = هلوسة = ممنوعة
> 🧠 أي feature مذكورة هنا ولم تُنفَّذ = نسيان = يجب تداركها
> 🔄 عند فقدان السياق → بروتوكول استعادة السياق (أعلاه)
