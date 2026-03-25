# 🔍 تحليل أفضل مشاريع Open-Source لـ Pyramedia
## Project Management + Dashboard + Invoicing

> **تاريخ البحث:** 2026-02-14
> **الهدف:** إيجاد أفضل repos مفتوحة المصدر لبناء نظام إدارة شركة تسويق (Pyramedia — دبي)

---

## 📋 1. Project Management — أفضل 5

### 🥇 1. Plane (makeplane/plane)
- **الرابط:** https://github.com/makeplane/plane
- **⭐ النجوم:** 45,620
- **آخر تحديث:** 2026-02-13 (نشط جداً)
- **الرخصة:** AGPL-3.0
- **الـ Stack:** Next.js + Django (Python backend) + PostgreSQL + Redis
- **الميزات الرئيسية:**
  - Work Items (إدارة مهام متقدمة)
  - Cycles (سبرينتات مع burn-down charts)
  - Modules (تقسيم المشاريع الكبيرة)
  - Views + Filters (عرض مخصص)
  - Pages (wiki/docs مدمج)
  - Analytics Dashboard
  - Self-hosting سهل (Docker/K8s)
  - God Mode للأدمن
- **سهولة التخصيص:** متوسطة — الباكند Python/Django مش Next.js كامل، بس الفرونت Next.js
- **تقييم لـ Pyramedia: 8/10** ✅
  - ✅ أقوى بديل لـ Jira/Linear مفتوح المصدر
  - ✅ Kanban + Sprint + Roadmap
  - ⚠️ Backend Django مش Node.js (stack مختلف عن باقي المشروع)
  - ⚠️ AGPL license (يجب فتح الكود إذا عدّلت)

---

### 🥈 2. Huly Platform (hcengineering/platform)
- **الرابط:** https://github.com/hcengineering/platform
- **⭐ النجوم:** 24,417
- **آخر تحديث:** 2026-02-14 (نشط جداً — اليوم!)
- **الرخصة:** EPL-2.0 (Eclipse Public License)
- **الـ Stack:** Svelte + TypeScript + MongoDB + MinIO
- **الميزات الرئيسية:**
  - All-in-One: PM + Chat + CRM + HRM + ATS
  - بديل لـ Linear + Slack + Notion + Motion
  - نظام plugins/extensions
  - Self-hosting عبر Docker
  - API Client متاح
- **سهولة التخصيص:** صعبة — Svelte مش React/Next.js، ومعمارية معقدة
- **تقييم لـ Pyramedia: 6/10**
  - ✅ All-in-one فعلاً (PM + Chat + CRM)
  - ✅ نشط جداً
  - ❌ Svelte مش Next.js — stack مختلف تماماً
  - ❌ EPL license أقل مرونة
  - ❌ MongoDB مش PostgreSQL/Supabase

---

### 🥉 3. Twenty CRM (twentyhq/twenty)
- **الرابط:** https://github.com/twentyhq/twenty
- **⭐ النجوم:** 39,696
- **آخر تحديث:** 2026-02-14 (نشط جداً)
- **الرخصة:** AGPL-3.0
- **الـ Stack:** React + TypeScript + NestJS + PostgreSQL + GraphQL
- **الميزات الرئيسية:**
  - بديل مفتوح لـ Salesforce
  - Kanban + Table + Filter views
  - Custom Objects & Fields (مرونة عالية)
  - Workflow Automation (triggers + actions)
  - Email + Calendar integration
  - Roles & Permissions
  - Self-hosting (Docker)
- **سهولة التخصيص:** جيدة — React + PostgreSQL + modular
- **تقييم لـ Pyramedia: 8.5/10** ⭐
  - ✅ CRM + PM مدمج — مثالي لشركة تسويق!
  - ✅ Custom objects = يمكن إضافة clients, campaigns, etc.
  - ✅ PostgreSQL + GraphQL
  - ✅ Automation مدمج
  - ⚠️ مش Next.js (React + NestJS)
  - ⚠️ AGPL license

---

### 4. Tegon (RedPlanetHQ/tegon)
- **الرابط:** https://github.com/RedPlanetHQ/tegon
- **⭐ النجوم:** 1,883
- **آخر تحديث:** 2025-03-30 (⚠️ غير نشط — 11 شهر!)
- **الرخصة:** AGPL-3.0
- **الـ Stack:** Next.js + TypeScript + Prisma + PostgreSQL
- **الميزات الرئيسية:**
  - بديل لـ Jira/Linear للمطورين
  - AI-powered (auto labels, sub-issues)
  - Slack integration
  - Actions framework (أتمتة)
- **سهولة التخصيص:** جيدة نظرياً — Next.js + Prisma
- **تقييم لـ Pyramedia: 5/10**
  - ✅ Stack مثالي (Next.js + Prisma + PostgreSQL)
  - ❌ غير نشط! آخر commit 11 شهر
  - ❌ 1.8k نجمة فقط
  - ❌ موجه للمطورين أكثر من التسويق

---

### 5. Ever Gauzy (ever-co/ever-gauzy)
- **الرابط:** https://github.com/ever-co/ever-gauzy
- **⭐ النجوم:** 3,472
- **آخر تحديث:** 2026-02-14 (نشط جداً)
- **الرخصة:** AGPL-3.0
- **الـ Stack:** Angular + NestJS + TypeORM + PostgreSQL
- **الميزات الرئيسية:**
  - ERP/CRM/HRM/ATS/PM — كل شيء!
  - Time tracking + Activity monitoring
  - Invoicing + Financial management
  - Employees management
  - Projects/Tasks
  - يوجد **Ever Teams** (Next.js frontend) — `ever-co/ever-teams`
- **سهولة التخصيص:** معقدة — monolith كبير
- **تقييم لـ Pyramedia: 6.5/10**
  - ✅ شامل جداً: ERP + CRM + PM + Invoicing
  - ✅ Ever Teams = Next.js frontend
  - ⚠️ Angular backend (معقد)
  - ⚠️ AGPL license
  - ⚠️ 3.4k نجمة فقط

---

## 📊 2. Dashboard / Admin Panel — أفضل 5

### 🥇 1. Midday (midday-ai/midday)
- **الرابط:** https://github.com/midday-ai/midday
- **⭐ النجوم:** 13,750
- **آخر تحديث:** 2026-02-14 (نشط جداً)
- **الرخصة:** AGPL-3.0
- **الـ Stack:** Next.js + Supabase + shadcn/ui + Tailwind + TypeScript + Bun
- **الميزات الرئيسية:**
  - 📊 Financial Overview Dashboard
  - ⏱️ Time Tracking
  - 🧾 Invoicing
  - 📥 Magic Inbox (مطابقة فواتير تلقائية)
  - 🗄️ Vault (تخزين ملفات آمن)
  - 📤 CSV Export
  - 🤖 AI Assistant
  - Monorepo (Turborepo)
- **سهولة التخصيص:** ممتازة! — **نفس الـ stack بالضبط**: Next.js + Supabase + shadcn
- **تقييم لـ Pyramedia: 9.5/10** 🏆
  - ✅ **PERFECT STACK**: Next.js + Supabase + shadcn + Tailwind
  - ✅ Dashboard + Invoicing + Time Tracking
  - ✅ Production-ready و جميل
  - ✅ AI Assistant مدمج
  - ✅ Monorepo architecture
  - ⚠️ AGPL (يجب فتح الكود)
  - ⚠️ موجه للفريلانسرز — يحتاج تعديل لشركة

---

### 🥈 2. OpenPanel (Openpanel-dev/openpanel)
- **الرابط:** https://github.com/Openpanel-dev/openpanel
- **⭐ النجوم:** 5,322
- **آخر تحديث:** 2026-02-13 (نشط)
- **الرخصة:** AGPL-3.0
- **الـ Stack:** Next.js + Tailwind + shadcn + Prisma + PostgreSQL + Clickhouse + Redis
- **الميزات الرئيسية:**
  - بديل مفتوح لـ Mixpanel
  - Real-time dashboards
  - Funnels + Cohorts + User profiles
  - A/B Testing
  - Custom dashboards
  - SDKs (Web, iOS, Android, React Native)
  - GDPR compliant
- **سهولة التخصيص:** جيدة — Next.js + shadcn
- **تقييم لـ Pyramedia: 7.5/10**
  - ✅ Analytics dashboard ممتاز لتتبع حملات التسويق
  - ✅ Next.js + shadcn stack
  - ✅ Real-time + Funnels
  - ⚠️ Analytics فقط، مش admin panel شامل
  - ⚠️ يحتاج Clickhouse إضافي

---

### 🥉 3. shadcn/ui Taxonomy (shadcn-ui/taxonomy)
- **الرابط:** https://github.com/shadcn-ui/taxonomy
- **⭐ النجوم:** 19,154
- **آخر تحديث:** 2024-08-14 (⚠️ قديم نسبياً)
- **الرخصة:** MIT ✅
- **الـ Stack:** Next.js + Prisma + Tailwind + shadcn/ui + NextAuth
- **الميزات الرئيسية:**
  - App Router + Server Components
  - Authentication (NextAuth)
  - Prisma ORM + PlanetScale
  - Stripe Subscriptions
  - MDX Documentation/Blog
  - Dashboard Layout
- **سهولة التخصيص:** ممتازة — boilerplate نظيف جداً
- **تقييم لـ Pyramedia: 7/10**
  - ✅ MIT License! أحسن رخصة
  - ✅ Next.js + shadcn foundation
  - ✅ Auth + Payments + Dashboard
  - ⚠️ Template/boilerplate — مش منتج جاهز
  - ⚠️ غير نشط (2024)

---

### 4. Next.js Enterprise Boilerplate (Blazity/next-enterprise)
- **الرابط:** https://github.com/Blazity/next-enterprise
- **⭐ النجوم:** 7,335
- **آخر تحديث:** 2026-02-12 (نشط)
- **الرخصة:** MIT ✅
- **الـ Stack:** Next.js 15 + Tailwind v4 + TypeScript + pnpm
- **الميزات الرئيسية:**
  - Enterprise boilerplate
  - ESLint 9 + Prettier
  - Testing (Vitest, Playwright)
  - GitHub Actions CI/CD
  - Bundle analysis
  - Storybook
- **سهولة التخصيص:** ممتازة — boilerplate نظيف
- **تقييم لـ Pyramedia: 6.5/10**
  - ✅ MIT License
  - ✅ Next.js 15 أحدث إصدار
  - ✅ Enterprise-grade infrastructure
  - ⚠️ Boilerplate فارغ — لا يحتوي على منطق أعمال

---

### 5. Tremor (tremorlabs/tremor)
- **الرابط:** https://github.com/tremorlabs/tremor
- **⭐ النجوم:** 3,244
- **آخر تحديث:** 2025-10-10 (نشط نسبياً)
- **الرخصة:** Apache-2.0 ✅
- **الـ Stack:** React + Tailwind CSS
- **الميزات الرئيسية:**
  - Dashboard UI components (charts, KPIs, tables)
  - Copy & paste components
  - Built on Tailwind + Radix
  - يعمل مع أي React framework
- **سهولة التخصيص:** ممتازة — مكتبة components فقط
- **تقييم لـ Pyramedia: 7/10** (كمكتبة مساعدة)
  - ✅ Apache License
  - ✅ مثالي لبناء dashboards
  - ✅ يتكامل مع shadcn
  - ⚠️ مكتبة components فقط — مش تطبيق

---

## 🧾 3. Invoicing — أفضل 3

### 🥇 1. Midday (midday-ai/midday) — يتكرر هنا!
- **الرابط:** https://github.com/midday-ai/midday
- **⭐ النجوم:** 13,750
- **الـ Stack:** Next.js + Supabase + shadcn
- **Invoicing features:**
  - إنشاء فواتير ويب
  - تعاون في الوقت الحقيقي
  - ربط بالمشاريع
  - Magic Inbox (مطابقة تلقائية)
  - CSV Export
- **تقييم لـ Pyramedia: 9/10** 🏆
  - ✅ Stack مثالي + Invoicing مدمج
  - ✅ Dashboard + Time Tracking + Invoicing = 3 في 1!

---

### 🥈 2. Invoice Ninja (invoiceninja/invoiceninja)
- **الرابط:** https://github.com/invoiceninja/invoiceninja
- **⭐ النجوم:** 9,537
- **آخر تحديث:** 2026-02-13 (نشط)
- **الرخصة:** Source-available (Elastic License)
- **الـ Stack:** Laravel (PHP) + Flutter (mobile) + React (admin)
- **الميزات الرئيسية:**
  - Invoicing + Quotes + Proposals
  - Time tracking
  - Expenses management
  - Multiple payment gateways
  - Mobile apps (iOS/Android)
  - Multi-language + Multi-currency
  - Client portal
  - API كامل
- **سهولة التخصيص:** متوسطة — Laravel/PHP stack مختلف
- **تقييم لـ Pyramedia: 6/10**
  - ✅ أنضج نظام invoicing مفتوح المصدر
  - ✅ API يمكن الربط به
  - ❌ Laravel/PHP — stack مختلف تماماً
  - ❌ ليس source-available بالكامل

---

### 🥉 3. Crater (crater-invoice-inc/crater)
- **الرابط:** https://github.com/crater-invoice-inc/crater
- **⭐ النجوم:** 8,258
- **آخر تحديث:** 2024-08-10 (⚠️ غير نشط — 18 شهر!)
- **الرخصة:** AGPL-3.0
- **الـ Stack:** Laravel + Vue.js + Tailwind
- **الميزات الرئيسية:**
  - Invoices + Estimates + Payments
  - Expenses tracking
  - Tax management
  - Reports
  - Multi-currency
- **سهولة التخصيص:** متوسطة
- **تقييم لـ Pyramedia: 4/10**
  - ❌ غير نشط! آخر تحديث 18 شهر
  - ❌ Laravel/PHP + Vue stack
  - ❌ مشروع يبدو مهجور

---

## 🎯 4. أدوات مساعدة مهمة

| الأداة | الرابط | النجوم | الوصف | التقييم |
|--------|--------|--------|-------|---------|
| **shadcn/ui** | github.com/shadcn-ui/ui | 106,611 ⭐ | UI Components (React + Tailwind + Radix) | **10/10** — أساسي! |
| **Cal.com** | github.com/calcom/cal.com | 40,190 ⭐ | Scheduling infrastructure | **8/10** — لجدولة المواعيد |
| **Dub.co** | github.com/dubinc/dub | 23,052 ⭐ | Link attribution platform | **7/10** — لتتبع الروابط |
| **Documenso** | github.com/documenso/documenso | 12,396 ⭐ | DocuSign alternative | **7/10** — لتوقيع العقود |
| **Formbricks** | github.com/formbricks/formbricks | 11,834 ⭐ | Survey platform | **7/10** — لاستبيانات العملاء |
| **Shelf.nu** | github.com/Shelf-nu/shelf.nu | 2,416 ⭐ | Asset management | **5/10** — لإدارة الأصول |

---

## 🏆 5. التوصيات النهائية

### لكل فئة:

| الفئة | التوصية #1 | لماذا؟ |
|--------|-----------|--------|
| **Project Management** | **Twenty CRM** | CRM + PM + Automation — مثالي لشركة تسويق |
| **Dashboard + Admin** | **Midday** | Same stack (Next.js + Supabase + shadcn) — أسهل دمج |
| **Invoicing** | **Midday** | Invoicing مدمج + Time Tracking + Dashboard |
| **UI Components** | **shadcn/ui + Tremor** | Foundation لكل شيء |
| **Scheduling** | **Cal.com** | إذا احتجنا جدولة مواعيد العملاء |

### 🌟 التوصية الذهبية:

> **Midday** هو الأقرب لاحتياجات Pyramedia — يجمع Dashboard + Invoicing + Time Tracking بنفس الـ stack المطلوب (Next.js + Supabase + shadcn).
>
> **Twenty** هو الأفضل لـ CRM + Project Management مع مرونة عالية في التخصيص.

---

## 🔧 6. خطة الدمج: Pyramedia Management System

### Architecture المقترحة:

```
pyramedia-platform/
├── apps/
│   ├── web/              # Next.js 15 — Main App
│   │   ├── dashboard/    # مستوحى من Midday
│   │   ├── projects/     # مستوحى من Plane/Twenty
│   │   ├── clients/      # CRM مستوحى من Twenty
│   │   ├── invoicing/    # مستوحى من Midday
│   │   ├── campaigns/    # Custom — إدارة حملات التسويق
│   │   └── reports/      # Analytics مستوحى من OpenPanel
│   └── api/              # Next.js API Routes / tRPC
├── packages/
│   ├── ui/               # shadcn/ui + Tremor components
│   ├── db/               # Prisma / Supabase client
│   ├── auth/             # NextAuth / Supabase Auth
│   └── shared/           # Types, utils, config
├── supabase/             # Database, Auth, Storage, Edge Functions
└── turbo.json            # Turborepo config
```

### خطوات التنفيذ:

#### Phase 1: Foundation (أسبوع 1-2)
1. **Fork Midday** كقاعدة — أقرب stack
2. إزالة الأجزاء غير المطلوبة (bank connections, etc.)
3. تعديل الـ branding + Arabic/RTL support
4. إعداد Supabase instance

#### Phase 2: CRM + Clients (أسبوع 3-4)
1. بناء Client Management (مستوحى من Twenty)
2. إضافة Custom Objects: Clients, Brands, Campaigns
3. Kanban views للمشاريع
4. Contact management

#### Phase 3: Project Management (أسبوع 5-6)
1. إضافة Task/Project management (مستوحى من Plane)
2. Kanban board + Sprint cycles
3. Team assignment + deadlines
4. File attachments (Supabase Storage)

#### Phase 4: Marketing Features (أسبوع 7-8)
1. Campaign tracking dashboard
2. Social media calendar
3. Content approval workflow
4. Performance reports (مستوحى من OpenPanel)

#### Phase 5: Invoicing + Finance (أسبوع 9-10)
1. تعديل Midday invoicing module
2. إضافة Quotations + Proposals
3. Payment tracking
4. Financial reports

#### Phase 6: Integrations (أسبوع 11-12)
1. WhatsApp (Evolution API عبر n8n)
2. Cal.com للجدولة
3. Email integration
4. Notifications

### ⚠️ ملاحظات مهمة:

1. **الرخصة:** معظم المشاريع القوية AGPL — يعني إذا عدلنا ونشرنا كـ SaaS لازم نفتح الكود. الحل:
   - نستخدمه داخلياً فقط (Internal tool) = ما نحتاج نفتح الكود
   - أو نبني من الصفر مستوحاة من هالمشاريع

2. **Stack الموحد:** Next.js + Supabase + shadcn/ui + Tailwind + TypeScript

3. **قاعدة البيانات:** Supabase (PostgreSQL) — كل شيء في مكان واحد

---

## 📊 ملخص سريع — Top Repos

| # | المشروع | النجوم | Stack | التقييم | الفائدة |
|---|---------|--------|-------|---------|---------|
| 1 | **Midday** | 13.7k | Next.js+Supabase+shadcn | 9.5/10 | Dashboard+Invoice+Time |
| 2 | **Twenty** | 39.7k | React+NestJS+PostgreSQL | 8.5/10 | CRM+PM+Automation |
| 3 | **Plane** | 45.6k | Next.js+Django+PostgreSQL | 8/10 | PM+Kanban+Sprints |
| 4 | **Cal.com** | 40.2k | Next.js+Prisma+PostgreSQL | 8/10 | Scheduling |
| 5 | **shadcn/ui** | 106.6k | React+Tailwind+Radix | 10/10 | UI Components |
| 6 | **OpenPanel** | 5.3k | Next.js+shadcn+Clickhouse | 7.5/10 | Analytics Dashboard |
| 7 | **Dub.co** | 23k | Next.js+Prisma+PlanetScale | 7/10 | Link Management |
| 8 | **Huly** | 24.4k | Svelte+MongoDB | 6/10 | All-in-one PM |
| 9 | **Invoice Ninja** | 9.5k | Laravel+Flutter | 6/10 | Invoicing (API) |
| 10 | **Blazity** | 7.3k | Next.js 15+Tailwind v4 | 6.5/10 | Enterprise Boilerplate |
