# 🔍 تحليل Midday العميق — ماذا نأخذ لـ Pyra Workspace

**تاريخ التحليل:** 2026-02-14  
**المصدر:** https://github.com/midday-ai/midday  
**الرخصة:** AGPL-3.0 (⚠️ تفاصيل مهمة بالأسفل)

---

## 1. ملخص تنفيذي

Midday هو نظام إدارة أعمال متكامل مبني بـ **Next.js 16 + Supabase + Drizzle ORM + tRPC + Hono** كـ monorepo باستخدام **Bun + Turborepo**. يحتوي على 48 جدول في قاعدة البيانات، 245 component في الـ dashboard، ونظام AI متقدم مبني على Vercel AI SDK مع multi-agent architecture. المشروع ضخم ومتشعب — بعض الأجزاء ممتازة للاستلهام (UI components، invoice system، file vault)، لكن النقل المباشر صعب بسبب الرخصة AGPL-3.0 والاعتماد الكبير على خدمات خارجية مدفوعة (Plaid, GoCardless, Trigger.dev, Polar).

**التوصية:** نستلهم الهيكل والأفكار، ننقل patterns و approaches، لكن نعيد كتابة الكود بدل النسخ المباشر بسبب قيود AGPL.

---

## 2. هيكل المشروع

### Apps (6 تطبيقات)
| App | التقنية | الوصف |
|-----|---------|-------|
| `dashboard` | Next.js 16 + React 19 | التطبيق الرئيسي |
| `api` | Hono + tRPC + Bun | API server مستقل |
| `engine` | Cloudflare Workers + Hono | Bank connections proxy |
| `website` | Next.js | الموقع التسويقي |
| `desktop` | Tauri | تطبيق سطح المكتب |
| `worker` | Bun | Background worker |

### Packages (28 حزمة داخلية)
`accounting` `app-store` `cache` `categories` `customers` `db` `desktop-client` `documents` `email` `encryption` `engine-client` `events` `health` `import` `inbox` `insights` `invoice` `job-client` `jobs` `location` `logger` `notifications` `plans` `supabase` `tsconfig` `ui` `utils` `workbench`

---

## 3. جدول الميزات — تقييم النقل والقيمة

| # | الميزة | الملفات | Dependencies خارجية | سهولة النقل (1-10) | القيمة لـ Pyramedia (1-10) | ملاحظات |
|---|--------|---------|---------------------|---------------------|---------------------------|---------|
| 1 | **Dashboard/Overview** | `apps/dashboard/src/app/[locale]/(app)/(sidebar)/` + widgets | Recharts, number-flow | 5 | 7 | Widgets قابلة للتكييف |
| 2 | **نظام الفواتير (Invoicing)** | `packages/invoice/` + `apps/dashboard/.../invoices/` | @react-pdf/renderer, QRCode, Stripe, Polar | 6 | 9 | ⭐ ممتاز — PDF generation + templates + recurring |
| 3 | **Time Tracking** | `apps/dashboard/.../tracker/` + `packages/db` (trackerEntries, trackerProjects) | لا خدمات خارجية | 7 | 6 | بسيط ومستقل نسبياً |
| 4 | **File Vault** | `apps/dashboard/.../vault/` + `packages/documents/` | Supabase Storage, LangChain, AI (Gemini) | 6 | 8 | ⭐ نقدر نستفيد منه — document processing + tagging |
| 5 | **Bank Connections** | `apps/engine/src/providers/` (Plaid, GoCardless, Teller, EnableBanking) | Plaid API, GoCardless API, Teller API | 2 | 2 | ❌ APIs غير متوفرة في المنطقة + معقد جداً |
| 6 | **Transactions** | `apps/dashboard/.../transactions/` + categories + enrichments | Bank connections + engine | 4 | 5 | مفيد لو عندنا مصدر بيانات مالية |
| 7 | **Reports** | `apps/dashboard/.../` + `packages/insights/` | Recharts + AI | 5 | 7 | Charts + metrics patterns ممتازة |
| 8 | **Team Management** | `apps/dashboard/.../settings/members/` + `usersOnTeam` + invites | Supabase Auth + RLS | 7 | 9 | ⭐ لازم — roles, invites, team switching |
| 9 | **Auth System** | `packages/supabase/src/client/` + middleware | Supabase Auth, MFA, OAuth | 8 | 10 | ⭐⭐ أهم شي — جاهز للنقل |
| 10 | **API Layer (tRPC + Hono)** | `apps/api/src/trpc/routers/` (40 router) | tRPC, Hono, Zod | 6 | 8 | ⭐ Pattern ممتاز — type-safe API |
| 11 | **Email System** | `packages/email/emails/` (18 template) | React Email, Resend | 7 | 8 | ⭐ Templates جاهزة — نغير البراند فقط |
| 12 | **AI Assistant** | `apps/api/src/ai/` — multi-agent (7 agents, 32 tools) | OpenAI, Vercel AI SDK, @ai-sdk-tools | 4 | 7 | معقد لكن مفيد — agent architecture |
| 13 | **UI Components** | `packages/ui/src/components/` (72 component) | Shadcn/ui, Radix, TailwindCSS | 8 | 9 | ⭐⭐ Shadcn-based — سهل النقل |
| 14 | **Inbox (Magic Inbox)** | `packages/inbox/` + dashboard components | Gmail/Outlook APIs + AI matching | 3 | 4 | معقد ويحتاج email APIs |
| 15 | **Customers/CRM** | `apps/dashboard/.../customers/` + enrichment | Clearbit-like enrichment | 6 | 8 | ⭐ نحتاجه لإدارة العملاء |
| 16 | **Notifications** | `packages/notifications/` | In-app + Email (Resend) | 7 | 8 | ⭐ نظام إشعارات متكامل |
| 17 | **App Store** | `packages/app-store/` | Third-party integrations | 5 | 4 | فكرة حلوة لكن مش أولوية |
| 18 | **OAuth Provider** | `oauthApplications` + `oauthAccessTokens` tables | Jose (JWT) | 6 | 5 | مفيد لو نبي نفتح API للغير |
| 19 | **Desktop App** | `apps/desktop/` | Tauri (Rust) | 3 | 2 | ❌ مش أولوية |
| 20 | **Insights (AI)** | `packages/insights/` — metrics, projections, audio | OpenAI, financial analysis | 4 | 6 | تحليلات مالية — مفيدة لاحقاً |

---

## 4. هيكل قاعدة البيانات

### إحصائيات
- **عدد الجداول:** 48
- **ORM:** Drizzle ORM (مع pgTable)
- **Auth:** Supabase Auth ✅ (users مرتبط بـ `auth.users`)
- **RLS:** نعم ✅ (pgPolicy في الـ schema)
- **Embeddings:** نعم — vector columns للبحث الذكي
- **Enums:** 25+ enum types

### الجداول الرئيسية

#### 👥 المستخدمين والفرق
| Table | الوصف |
|-------|-------|
| `users` | بيانات المستخدم (مرتبط بـ auth.users) |
| `teams` | الفرق/الشركات |
| `usersOnTeam` | العلاقة بين المستخدمين والفرق (roles: owner/member) |
| `userInvites` | دعوات الانضمام للفريق |

#### 💰 المالية
| Table | الوصف |
|-------|-------|
| `transactions` | المعاملات المالية (4000+ سطر في التعريف!) |
| `transactionCategories` | تصنيفات المعاملات |
| `transactionTags` | علامات المعاملات |
| `transactionAttachments` | مرفقات المعاملات |
| `transactionEnrichments` | إثراء بيانات المعاملات |
| `transactionEmbeddings` | Vector embeddings للبحث |
| `transactionMatchSuggestions` | اقتراحات المطابقة |
| `bankAccounts` | الحسابات البنكية |
| `bankConnections` | الربط مع البنوك |
| `exchangeRates` | أسعار الصرف |

#### 🧾 الفواتير
| Table | الوصف |
|-------|-------|
| `invoices` | الفواتير الرئيسية |
| `invoiceProducts` | منتجات/بنود الفاتورة (line items) |
| `invoiceTemplates` | قوالب الفواتير |
| `invoiceRecurring` | الفواتير المتكررة |
| `invoiceComments` | تعليقات الفواتير |

#### 📁 المستندات والـ Vault
| Table | الوصف |
|-------|-------|
| `documents` | المستندات المخزنة |
| `documentTags` | علامات المستندات |
| `documentTagAssignments` | ربط العلامات بالمستندات |
| `documentTagEmbeddings` | Vector embeddings |

#### ⏱️ تتبع الوقت
| Table | الوصف |
|-------|-------|
| `trackerProjects` | مشاريع التتبع |
| `trackerEntries` | إدخالات الوقت |
| `trackerReports` | تقارير التتبع |
| `trackerProjectTags` | علامات المشاريع |

#### 📨 Inbox
| Table | الوصف |
|-------|-------|
| `inbox` | العناصر الواردة |
| `inboxAccounts` | حسابات البريد المرتبطة |
| `inboxBlocklist` | قائمة الحظر |
| `inboxEmbeddings` | Vector embeddings |

#### 🔧 أخرى
| Table | الوصف |
|-------|-------|
| `customers` | العملاء |
| `customerTags` | علامات العملاء |
| `tags` | العلامات العامة |
| `reports` | التقارير المحفوظة |
| `apps` | التطبيقات المثبتة |
| `activities` | سجل النشاطات |
| `notificationSettings` | إعدادات الإشعارات |
| `apiKeys` | مفاتيح API |
| `oauthApplications` | تطبيقات OAuth |
| `oauthAuthorizationCodes` | أكواد التفويض |
| `oauthAccessTokens` | رموز الوصول |
| `shortLinks` | روابط مختصرة |
| `insights` | رؤى AI |
| `insightUserStatus` | حالة قراءة الرؤى |
| `accountingSyncRecords` | سجلات مزامنة المحاسبة |

---

## 5. الميزات اللي نقدر ناخذها مباشرة (Copy-Friendly)

### ✅ 1. UI Components (`packages/ui/`)
- **72 component** مبنية على Shadcn/ui + Radix
- TailwindCSS
- **النقل:** نسخ مباشر مع تعديل الألوان والبراند
- ⚠️ لكن AGPL يتطلب نشر المصدر لو ناخذها حرفياً

### ✅ 2. Email Templates (`packages/email/`)
- **18 template** بـ React Email
- invoice, welcome, invite, connection-issue, trial-expiring, insights-weekly
- **النقل:** تغيير البراند + الألوان + النصوص

### ✅ 3. Auth Patterns (`packages/supabase/src/client/`)
- Supabase Auth setup (server, client, middleware)
- MFA support
- OAuth callback handling
- **النقل:** Pattern مباشر — نفس Supabase

### ✅ 4. Invoice Templates (`packages/invoice/`)
- PDF generation بـ @react-pdf/renderer
- HTML templates
- QR code generation
- Token-based public invoice viewing
- Recurring invoice logic
- **النقل:** ممتاز — self-contained package

### ✅ 5. Time Tracker Schema + Components
- بسيط: projects → entries → reports
- Timer مباشر مع start/stop
- **النقل:** Schema + UI components

---

## 6. الميزات اللي تحتاج تعديل كبير

### 🔧 1. Dashboard Widgets
- مبنية على بيانات البنوك والمعاملات
- **المطلوب:** تكييف لبيانات Pyramedia (projects, clients, revenue)

### 🔧 2. AI Assistant
- Multi-agent architecture (7 agents متخصصة)
- 32 AI tool
- يستخدم Vercel AI SDK v5 + @ai-sdk-tools
- **المطلوب:** تغيير الأدوات والـ context لتناسب عملنا

### 🔧 3. Customers/CRM
- Enrichment features تحتاج APIs خارجية
- **المطلوب:** تبسيط + ربط مع بيانات عملائنا

### 🔧 4. Notifications System
- In-app + Email + Slack/Discord
- **المطلوب:** تكييف لقنواتنا (WhatsApp, Telegram, Email)

### 🔧 5. Reports & Charts
- Recharts-based
- Financial metrics (burn rate, runway, P&L)
- **المطلوب:** تغيير المقاييس لتناسب media agency

### 🔧 6. Documents/Vault
- AI-powered classification (LangChain + Gemini)
- PDF/DOCX parsing
- **المطلوب:** تكييف التصنيفات + ربط مع Supabase Storage الموجود

---

## 7. الميزات اللي ما تنفعنا

### ❌ 1. Bank Connections (`apps/engine/`)
- Plaid (US/Canada), GoCardless (EU), Teller (US), EnableBanking (EU)
- **السبب:** APIs غير متوفرة في المنطقة العربية/الإمارات
- **البديل:** Manual entry أو ربط مع APIs بنوك محلية لاحقاً

### ❌ 2. Magic Inbox (Email Matching)
- ربط Gmail/Outlook لسحب الفواتير تلقائياً
- **السبب:** معقد جداً + يحتاج OAuth scopes خاصة
- **البديل:** Upload يدوي + AI classification

### ❌ 3. Desktop App (Tauri)
- **السبب:** Pyramedia web-first
- **البديل:** PWA لو حبينا

### ❌ 4. Accounting Sync (Xero, QuickBooks, Fortnox)
- **السبب:** مش مستخدمة في السوق المستهدف
- **البديل:** تصدير CSV/Excel

### ❌ 5. Payment Processing (Polar/Stripe integration)
- **السبب:** عندنا نظام دفع مختلف

---

## 8. خطة النقل المقترحة

### المرحلة 1: الأساسيات (الأسبوع 1-2)
1. **Auth System** — Supabase Auth + middleware + MFA patterns
2. **UI Components** — Shadcn/ui setup (نستخدم Shadcn مباشرة مش نسخ من Midday)
3. **Database Schema** — Drizzle ORM setup + base tables (users, teams, usersOnTeam)
4. **tRPC Setup** — API layer pattern

### المرحلة 2: Core Features (الأسبوع 3-4)
5. **Team Management** — Invites, roles, team switching
6. **Customers/CRM** — Customer management (مبسط)
7. **File Vault** — Document upload + tagging (Supabase Storage)
8. **Email Templates** — React Email + Resend setup

### المرحلة 3: Business Features (الأسبوع 5-6)
9. **Invoice System** — Create, send, track invoices + PDF generation
10. **Time Tracking** — Projects + entries + timer
11. **Dashboard Widgets** — Overview with charts (Recharts)
12. **Notifications** — In-app + email notifications

### المرحلة 4: AI & Advanced (الأسبوع 7-8)
13. **AI Assistant** — Chat interface + tools
14. **Reports** — Financial reports + insights
15. **Document AI** — Classification + search

---

## 9. تحليل الرخصة ⚠️

### الرخصة: AGPL-3.0
- **GNU Affero General Public License v3.0**
- Copyright (c) 2023-present Midday Labs AB

### ماذا يعني AGPL-3.0؟
1. **✅ نقدر نقرأ الكود ونتعلم منه** — Fair use / study
2. **✅ نقدر نستلهم الأفكار والـ patterns** — لا حماية على الأفكار
3. **⚠️ لو نسخنا كود حرفياً ونشرناه كـ network service** → لازم ننشر كل كود المشروع بنفس الرخصة AGPL
4. **❌ ما نقدر ناخذ كود ونستخدمه في مشروع مغلق المصدر** بدون الالتزام بـ AGPL
5. **Midday يبيع رخصة تجارية** — ممكن نتواصل معهم لو حبينا نسخ كود مباشر

### التوصية العملية:
- **الطريقة الآمنة:** ندرس الكود → نفهم الـ approach → نعيد الكتابة بأسلوبنا (**clean-room implementation**)
- **نستخدم نفس المكتبات المفتوحة:** Shadcn/ui, Drizzle, tRPC, React Email — كلها MIT/Apache
- **ما ننسخ كود Midday حرفياً** في مشروع Pyramedia التجاري

---

## 10. المخاطر والتحديات

### 🔴 مخاطر عالية
1. **AGPL License** — نسخ الكود مباشرة يفرض نشر كامل مصدر المشروع
2. **Complexity** — المشروع ضخم (2500+ ملف) — الفهم الكامل يأخذ وقت
3. **External Dependencies** — كثير من الميزات تعتمد على خدمات مدفوعة

### 🟡 مخاطر متوسطة
4. **Version Drift** — React 19, Next.js 16, Drizzle — كلها أحدث إصدارات (ممكن bugs)
5. **Trigger.dev** — Background jobs تعتمد على خدمة خارجية (بديل: BullMQ اللي هم أيضاً يستخدمونه)
6. **Monorepo Complexity** — Bun + Turborepo setup يحتاج خبرة

### 🟢 مخاطر منخفضة
7. **UI Components** — Shadcn-based = نقدر نستخدم Shadcn مباشرة
8. **Supabase** — نفس البنية التحتية اللي عندنا
9. **TypeScript** — Type-safe = أقل bugs

---

## 11. Technology Stack Comparison

| Component | Midday | Pyra Workspace (الحالي) | Pyra Workspace (الهدف) |
|-----------|--------|------------------------|----------------------|
| Frontend | Next.js 16 + React 19 | Vanilla JS + PHP | Next.js 15+ |
| Styling | TailwindCSS + Shadcn | Custom CSS | TailwindCSS + Shadcn |
| Backend | Hono + tRPC | PHP | Next.js API + tRPC |
| Database | Supabase + Drizzle ORM | Supabase | Supabase + Drizzle |
| Auth | Supabase Auth | Custom | Supabase Auth |
| Storage | Supabase Storage | Supabase Storage | Supabase Storage |
| Email | React Email + Resend | - | React Email + Resend |
| AI | Vercel AI SDK + OpenAI | - | Vercel AI SDK |
| Background Jobs | Trigger.dev + BullMQ | - | BullMQ |
| Package Manager | Bun | npm | Bun/pnpm |

---

## 12. أهم الدروس المستفادة من Midday

1. **Monorepo Structure** — فصل الحزم (db, ui, email, invoice) = reusability ممتازة
2. **Type-Safety** — Drizzle ORM + tRPC + Zod = zero runtime type errors
3. **Multi-Agent AI** — فصل الـ AI agents حسب المجال (transactions, invoices, analytics)
4. **Invoice as Package** — نظام الفواتير كحزمة مستقلة = ممتاز
5. **Cached Queries** — `packages/supabase/src/queries/cached-queries.ts` = caching pattern ممتاز
6. **i18n** — `next-international` لدعم اللغات
7. **Server Actions** — `next-safe-action` لـ type-safe server actions
8. **Real-time** — Supabase Realtime للتحديثات المباشرة

---

## 13. الخلاصة النهائية

| القرار | التوصية |
|--------|---------|
| نسخ كود مباشر؟ | ❌ لا — بسبب AGPL |
| نستلهم الأفكار؟ | ✅ بالتأكيد |
| نستخدم نفس المكتبات؟ | ✅ نعم (MIT/Apache) |
| نبني نفس الهيكل؟ | ✅ Monorepo + packages pattern |
| أولوية النقل؟ | Auth → Teams → CRM → Invoice → Vault → AI |
| الوقت المتوقع؟ | 6-8 أسابيع للنسخة الأولى |

**Midday = مرجع ممتاز للتعلم، مش مصدر للنسخ.** نبني نظامنا مستلهمين من أفضل practices اللي شفناها.
