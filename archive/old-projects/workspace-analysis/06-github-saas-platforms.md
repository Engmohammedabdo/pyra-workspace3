# 🔍 GitHub Research: SaaS Boilerplates + All-in-One Business Platforms

> **تاريخ البحث:** 2026-02-14
> **الهدف:** إيجاد أفضل أساس لبناء نظام إدارة Pyramedia الشامل
> **المعايير:** ⭐>1000 | نشط آخر 6 شهور | PostgreSQL/Supabase | قابل للتخصيص | MIT/Apache مفضل

---

## 📊 ملخص سريع

| الفئة | الأفضل | النجوم | التوصية |
|--------|---------|--------|---------|
| SaaS Boilerplate | ixartz/SaaS-Boilerplate | 6.8K | ⭐⭐⭐⭐⭐ |
| SaaS Starter (Official) | nextjs/saas-starter | 15.4K | ⭐⭐⭐⭐ |
| Enterprise SaaS Kit | boxyhq/saas-starter-kit | 4.7K | ⭐⭐⭐⭐⭐ |
| All-in-One CRM | twentyhq/twenty | 39.7K | ⭐⭐⭐⭐⭐ |
| All-in-One XOS | erxes/erxes | 3.9K | ⭐⭐⭐⭐ |
| Low-Code Platform | appsmithorg/appsmith | 39.1K | ⭐⭐⭐⭐ |
| Client Portal Builder | Budibase/budibase | 27.6K | ⭐⭐⭐⭐ |

---

## 1️⃣ SaaS Boilerplates — أفضل 5

### 🥇 1. ixartz/SaaS-Boilerplate
- **الرابط:** https://github.com/ixartz/SaaS-Boilerplate
- **النجوم:** ⭐ 6,817 | **Forks:** 1,237
- **آخر تحديث:** 2026-02-09 | **الرخصة:** MIT ✅
- **الـ Stack:** Next.js + Tailwind CSS + Shadcn UI + TypeScript + Drizzle ORM + Clerk Auth
- **الميزات:**
  - Auth ✅ (Clerk - SSO, OAuth, MFA)
  - Dashboard ✅ (User dashboard كامل)
  - Multi-tenant ✅ (Team support + Organizations)
  - API ✅ (Server Actions + API routes)
  - Billing ✅ (Stripe integration)
  - i18n ✅ (مدعوم بالكامل)
  - Landing Page ✅ + SEO ✅ + Testing ✅ + Error Reporting (Sentry) ✅
  - Role & Permissions ✅
  - User Impersonation ✅
- **تقييم: 9.5/10** 🏆
- **لماذا الأفضل:** الأكمل ميزاتياً — فيه كل شي تحتاجه SaaS من أول يوم. Multi-tenant + i18n + Roles = مثالي لـ Pyramedia. MIT license يعني حرية كاملة.
- **السلبيات:** يستخدم Clerk (مش Supabase Auth)، بس ممكن نبدله.

---

### 🥈 2. nextjs/saas-starter (Official Next.js)
- **الرابط:** https://github.com/nextjs/saas-starter
- **النجوم:** ⭐ 15,384 | **Forks:** 2,553
- **آخر تحديث:** 2025-12-11 | **الرخصة:** MIT ✅
- **الـ Stack:** Next.js + Postgres + Drizzle ORM + Stripe + shadcn/ui
- **الميزات:**
  - Auth ✅ (Email/password + JWT cookies)
  - Dashboard ✅ (CRUD operations)
  - Multi-tenant ✅ (Basic - Owner/Member roles)
  - API ✅ (Server Actions)
  - Billing ✅ (Stripe Checkout + Customer Portal)
  - i18n ❌
  - Activity Logging ✅ + RBAC ✅ + Middleware ✅
- **تقييم: 8/10**
- **لماذا جيد:** Official من فريق Next.js (كان leerob/next-saas-starter). بسيط ونظيف وسهل الفهم. ممتاز كنقطة بداية.
- **السلبيات:** أبسط من ixartz — ما فيه i18n ولا multi-tenant متقدم. آخر تحديث ديسمبر 2025.

---

### 🥉 3. boxyhq/saas-starter-kit
- **الرابط:** https://github.com/boxyhq/saas-starter-kit
- **النجوم:** ⭐ 4,701 | **Forks:** 1,178
- **آخر تحديث:** 2025-12-17 | **الرخصة:** Apache-2.0 ✅
- **الـ Stack:** Next.js + Tailwind CSS + Postgres + Prisma + TypeScript
- **الميزات:**
  - Auth ✅ (NextAuth.js + SSO/SAML via BoxyHQ)
  - Dashboard ✅
  - Multi-tenant ✅ (Team management كامل)
  - API ✅
  - Billing ✅ (Stripe)
  - i18n ❌
  - Enterprise SSO ✅ + Directory Sync (SCIM) ✅ + Audit Logs ✅
  - Webhooks ✅ + Invitations ✅
- **تقييم: 8.5/10**
- **لماذا جيد:** Enterprise-grade — SSO/SAML مدمج. مثالي لو عندك عملاء enterprise. Apache license ممتاز.
- **السلبيات:** أثقل في الـ setup. ما فيه i18n.

---

### 4. apptension/saas-boilerplate
- **الرابط:** https://github.com/apptension/saas-boilerplate
- **النجوم:** ⭐ 2,815 | **Forks:** 391
- **آخر تحديث:** 2026-02-14 (نشط جداً!) | **الرخصة:** MIT ✅
- **الـ Stack:** React + Django + AWS + TypeScript + GraphQL
- **الميزات:**
  - Auth ✅ (OAuth + Email)
  - Dashboard ✅ (Admin panel)
  - Multi-tenant ✅
  - API ✅ (GraphQL)
  - Billing ✅ (Stripe)
  - i18n ✅
  - CI/CD ✅ + Workers ✅ + Emails ✅
- **تقييم: 7/10**
- **لماذا جيد:** Full-stack production-ready مع Django backend. CI/CD مدمج مع AWS.
- **السلبيات:** ⚠️ Django backend مش Next.js — stack مختلف عن اللي نبيه. AWS-focused.

---

### 5. mickasmt/next-saas-stripe-starter
- **الرابط:** https://github.com/mickasmt/next-saas-stripe-starter
- **النجوم:** ⭐ 2,950 | **Forks:** 616
- **آخر تحديث:** 2024-08-16 ⚠️ | **الرخصة:** MIT ✅
- **الـ Stack:** Next.js 14 + Prisma + Neon + Auth.js v5 + Stripe + Resend + Shadcn/ui
- **الميزات:**
  - Auth ✅ (Auth.js v5 - Google, GitHub, etc.)
  - Dashboard ✅ (Admin Panel + User roles)
  - Multi-tenant ❌
  - API ✅ (Server Actions)
  - Billing ✅ (Stripe)
  - i18n ❌
- **تقييم: 6.5/10**
- **لماذا جيد:** UI جميل وسهل التخصيص. Auth.js v5 حديث.
- **السلبيات:** ⚠️ آخر تحديث أغسطس 2024 — غير نشط. ما فيه multi-tenant ولا i18n.

---

### Honorable Mention: saas-js/saas-ui
- **الرابط:** https://github.com/saas-js/saas-ui
- **النجوم:** ⭐ 1,613 | **الرخصة:** MIT
- **ملاحظة:** مكتبة UI components مش boilerplate كامل. مبنية على Chakra UI. النسخة Pro مدفوعة. مفيدة كـ UI layer بس مش starter kit.

---

## 2️⃣ All-in-One Business Platforms — أفضل 5

### 🥇 1. twentyhq/twenty — Open Source CRM
- **الرابط:** https://github.com/twentyhq/twenty
- **النجوم:** ⭐ 39,696 | **Forks:** 5,169
- **آخر تحديث:** 2026-02-14 (نشط كل يوم!) | **الرخصة:** AGPL-3.0 ⚠️
- **الـ Stack:** React + TypeScript + NestJS + PostgreSQL + GraphQL
- **الميزات:**
  - Auth ✅ | Dashboard ✅ | Multi-tenant ❌ (single workspace) | API ✅ (GraphQL + REST)
  - Billing ❌ | i18n ❌
  - **CRM Features:** Contacts, Companies, Deals, Pipelines ✅
  - Custom Objects & Fields ✅
  - Workflow Automation ✅ (Triggers + Actions)
  - Email Integration ✅ + Calendar ✅
  - Kanban + Table + Filters + Group By ✅
  - Roles & Permissions ✅
  - Self-hosted ✅
- **تقييم: 9/10** 🏆
- **لماذا الأفضل:** بديل Salesforce مفتوح المصدر. CRM ممتاز مع automation. الأكثر نشاطاً (39K+ stars!). UI حديث وجميل.
- **السلبيات:** AGPL license (يحتاج حذر). ما فيه multi-tenant أو billing. CRM فقط — مش project management أو invoicing.

---

### 🥈 2. erxes/erxes — Experience Operating System (XOS)
- **الرابط:** https://github.com/erxes/erxes
- **النجوم:** ⭐ 3,895 | **Forks:** 1,229
- **آخر تحديث:** 2026-02-14 | **الرخصة:** Source-available (Custom) ⚠️
- **الـ Stack:** TypeScript + React + Node.js + GraphQL Federation + MongoDB + Nx Monorepo
- **الميزات:**
  - Auth ✅ | Dashboard ✅ | Multi-tenant ❌ | API ✅ (GraphQL Federation)
  - Billing ❌ | i18n ✅ (Transifex)
  - **XOS Features:**
    - CRM ✅ (Contacts, Companies, Deals)
    - Marketing Automation ✅ (Campaigns, Segments)
    - Help Desk / Ticketing ✅
    - Task Management ✅
    - Forms & Surveys ✅
    - Website Builder ✅ (like Wix replacement)
    - Plugin Architecture ✅ (unlimited customization)
    - Self-hosted ✅
- **تقييم: 8.5/10**
- **لماذا جيد:** 🏆 **الأقرب لاحتياجات Pyramedia!** يجمع CRM + Marketing + Help Desk + Tasks في platform واحد. Plugin architecture يسمح بإضافة ميزات.
- **السلبيات:** MongoDB (مش PostgreSQL). License مش MIT. الـ stack أعقد (GraphQL Federation + Microservices). 3.9K stars أقل من المنافسين.
- **⚡ ملاحظة مهمة:** erxes يبدل HubSpot + Zendesk + Linear + Wix — هذا exactly ما Pyramedia تحتاجه!

---

### 🥉 3. appsmithorg/appsmith — Low-Code Platform
- **الرابط:** https://github.com/appsmithorg/appsmith
- **النجوم:** ⭐ 39,089 | **Forks:** 4,456
- **آخر تحديث:** 2026-02-13 | **الرخصة:** Apache-2.0 ✅
- **الـ Stack:** Java (Spring) + React + TypeScript + MongoDB/PostgreSQL
- **الميزات:**
  - Auth ✅ | Dashboard ✅ (Visual Builder) | Multi-tenant ✅ | API ✅
  - Billing ❌ | i18n ❌
  - 25+ Database Integrations ✅
  - Drag & Drop UI Builder ✅
  - JavaScript Everywhere ✅
  - Git-based Version Control ✅
  - RBAC ✅ + SSO ✅
- **تقييم: 8/10**
- **لماذا جيد:** تقدر تبني أي internal tool بسرعة. 25+ database connectors. Apache license ممتاز.
- **السلبيات:** Low-code platform — مش SaaS boilerplate. محتاج تبني كل شي من الصفر. Java backend.

---

### 4. ToolJet/ToolJet — Low-Code Internal Tools
- **الرابط:** https://github.com/ToolJet/ToolJet
- **النجوم:** ⭐ 37,424 | **Forks:** 4,942
- **آخر تحديث:** 2026-02-14 | **الرخصة:** AGPL-3.0 ⚠️
- **الـ Stack:** Node.js (NestJS) + React + PostgreSQL
- **الميزات:**
  - Auth ✅ | Dashboard ✅ | Multi-tenant ✅ | API ✅
  - Billing ❌ | i18n ❌
  - 60+ UI Components ✅ (Tables, Charts, Forms, etc.)
  - Workflow Automation ✅
  - AI-powered Features ✅ (ToolJet AI)
  - Database Connectors ✅ + REST/GraphQL APIs ✅
- **تقييم: 7.5/10**
- **لماذا جيد:** ممتاز لبناء admin panels و internal dashboards بسرعة. PostgreSQL native.
- **السلبيات:** AGPL license. Low-code = limited flexibility للـ custom UX.

---

### 5. directus/directus — Headless CMS + Backend
- **الرابط:** https://github.com/directus/directus
- **النجوم:** ⭐ 34,218 | **Forks:** 4,563
- **آخر تحديث:** 2026-02-13 | **الرخصة:** BSL-1.1 ⚠️ (Business Source License)
- **الـ Stack:** Node.js + Vue.js + TypeScript + PostgreSQL/MySQL/SQLite
- **الميزات:**
  - Auth ✅ (SSO, OAuth, 2FA) | Dashboard ✅ (No-code admin) | Multi-tenant ❌
  - API ✅ (REST + GraphQL auto-generated) | Billing ❌ | i18n ✅
  - Works with ANY SQL Database ✅
  - No Migration Required ✅ (wraps existing DB)
  - White-label ✅ + Extensible ✅
  - Flows (Automation) ✅
  - File Storage ✅ + Roles & Permissions ✅
- **تقييم: 8/10**
- **لماذا جيد:** يحول أي PostgreSQL database لـ API + Admin Panel فوراً. مثالي كـ backend layer.
- **السلبيات:** BSL license (مش open source حقيقي). Vue.js admin (مش React). Headless CMS أكثر من business platform.

---

### Honorable Mentions:

| Platform | Stars | وصف | ليش ما فوق |
|----------|-------|------|------------|
| **Budibase/budibase** | 27.6K | Low-code apps + automation | GPL v3 + limited customization |
| **calcom/cal.com** | 40.2K | Scheduling infrastructure | تخصص واحد (booking) — مش all-in-one |
| **dubinc/dub** | 23K | Link attribution platform | نيش واحد (links) — بس reference ممتاز لـ Next.js SaaS |
| **invoiceninja/invoiceninja** | 9.5K | Invoicing + Payments | PHP/Laravel stack — مش Next.js |

---

## 3️⃣ Client Portals — أفضل 3

### 🥇 1. Budibase/budibase — Client Portal Builder
- **الرابط:** https://github.com/Budibase/budibase
- **النجوم:** ⭐ 27,632 | **Forks:** 2,067
- **آخر تحديث:** 2026-02-14 | **الرخصة:** GPL v3 ⚠️
- **الـ Stack:** Node.js + Svelte + CouchDB/PostgreSQL
- **الميزات:**
  - Drag & Drop App Builder ✅
  - Forms + Portals + Approval Workflows ✅
  - PostgreSQL Support ✅
  - RBAC ✅ + SSO ✅
  - Automations ✅
  - Responsive Design ✅
- **تقييم: 7.5/10**
- **Use Case:** نبني client portal بسرعة — كل عميل يشوف projects + invoices + reports تبعه.
- **السلبيات:** GPL license. Svelte (مش React). UI محدود مقارنة بـ custom Next.js.

---

### 🥈 2. Directus — White-Label Client Dashboard
- **الرابط:** https://github.com/directus/directus
- **النجوم:** ⭐ 34,218
- **Use Case:** نستخدم Directus كـ backend + auto-generated API، ونبني client portal بـ Next.js فوقه.
- **تقييم: 7/10**
- **لماذا:** White-label ready + يشتغل مع PostgreSQL/Supabase + REST/GraphQL APIs.

---

### 🥉 3. Custom Next.js Portal (Based on SaaS Boilerplate)
- **Use Case:** نبني client portal مخصص 100% باستخدام ixartz/SaaS-Boilerplate أو boxyhq/saas-starter-kit.
- **تقييم: 8.5/10**
- **لماذا:** Full control على UX + branding + features. Multi-tenant مدمج.
- **السلبيات:** يحتاج وقت تطوير أكثر.

---

## 4️⃣ التوصية النهائية لـ Pyramedia

### المسارات الثلاثة:

---

### المسار (أ): SaaS Boilerplate + نبني الميزات فوقه ⭐ **الموصى به**

**الخطة:** نبدأ بـ **ixartz/SaaS-Boilerplate** أو **boxyhq/saas-starter-kit** ونضيف:
- CRM module (مستوحى من Twenty)
- Project Management module
- Invoicing module
- Client Portal

| ✅ إيجابيات | ❌ سلبيات |
|-------------|----------|
| Full control على كل شي | يحتاج وقت تطوير أطول (3-6 شهور) |
| Next.js + Supabase = الـ stack المطلوب | لازم نبني CRM/PM/Invoice من الصفر |
| Multi-tenant + Auth + Billing جاهزين | محتاج فريق تطوير أو وقت كبير |
| MIT license = حرية كاملة | Risk أكبر (bugs, maintenance) |
| قابل للتوسع بلا حدود | |
| Arabic/i18n مدعوم (ixartz) | |

**الوقت المتوقع:** 3-6 شهور للـ MVP
**التكلفة:** منخفضة (open source + Supabase free tier)

---

### المسار (ب): نجمع أفضل repos في واحد

**الخطة:** نجمع:
- **Twenty** (CRM) + **Tegon/Plane** (PM) + **Invoice Ninja** (Invoicing) + **Formbricks** (Surveys)
- نربطهم بـ API gateway أو n8n workflows

| ✅ إيجابيات | ❌ سلبيات |
|-------------|----------|
| كل جزء battle-tested | Stacks مختلفة (React/PHP/TypeScript) |
| ميزات متقدمة في كل جزء | Integration nightmare 😱 |
| مجتمعات كبيرة لكل repo | UX غير موحد |
| | Maintenance لـ 4-5 repos |
| | Licenses مختلفة (AGPL + MIT + Custom) |
| | User management مكرر |

**الوقت المتوقع:** 2-4 شهور للـ integration
**التكلفة:** متوسطة (infrastructure لكل service)

---

### المسار (ج): All-in-One Platform جاهز ونخصصه

**الخطة:** نستخدم **erxes** كـ base platform ونخصصه لـ Pyramedia

| ✅ إيجابيات | ❌ سلبيات |
|-------------|----------|
| CRM + Marketing + Help Desk + Tasks جاهز | MongoDB (مش PostgreSQL/Supabase) |
| Plugin architecture للتوسع | Stack معقد (GraphQL Federation + Microservices) |
| أسرع وقت للسوق (1-2 شهر) | Learning curve عالي |
| Self-hosted + customizable | License غير واضحة (مش MIT) |
| يبدل HubSpot + Zendesk + Linear | Community أصغر (3.9K stars) |
| | ما فيه invoicing مدمج |

**الوقت المتوقع:** 1-3 شهور للتخصيص
**التكلفة:** متوسطة-عالية (infrastructure أثقل)

---

## 🎯 التوصية النهائية

### **المسار (أ) هو الأفضل لـ Pyramedia** ✅

**السبب:**
1. **Full control** — نحن نبني بالضبط اللي نحتاجه
2. **الـ Stack المطلوب** — Next.js + Supabase + Tailwind = الـ stack اللي قررنا عليه
3. **MIT license** — حرية كاملة للاستخدام التجاري
4. **Multi-tenant ready** — كل عميل في environment منعزل
5. **i18n** — Arabic + English من البداية
6. **Scalable** — نبدأ بسيط ونكبر

### 📋 الخطة المقترحة:

```
الأسبوع 1-2: Setup ixartz/SaaS-Boilerplate + Supabase integration
الأسبوع 3-4: CRM Module (Contacts, Companies, Deals) — مستوحى من Twenty
الأسبوع 5-6: Project Management Module (Tasks, Kanban, Timeline)
الأسبوع 7-8: Client Portal (Dashboard لكل عميل)
الأسبوع 9-10: Invoicing Module (Quotes, Invoices, Payments)
الأسبوع 11-12: Reports + Analytics + Polish
```

### البديل المختلط (Hybrid):
لو الوقت ضيق، ممكن **المسار (أ) + (ج)**:
- نبدأ بـ SaaS boilerplate
- نستخدم **Twenty** كـ CRM module (embedded أو API integration)
- نبني PM + Invoicing + Client Portal فوق الـ boilerplate

---

## 📌 Quick Reference Table

| Repo | Stars | License | Stack | Updated | Best For |
|------|-------|---------|-------|---------|----------|
| ixartz/SaaS-Boilerplate | 6.8K | MIT ✅ | Next.js+Drizzle+Clerk | Feb 2026 | SaaS foundation |
| nextjs/saas-starter | 15.4K | MIT ✅ | Next.js+Drizzle+Stripe | Dec 2025 | Simple starter |
| boxyhq/saas-starter-kit | 4.7K | Apache ✅ | Next.js+Prisma+BoxyHQ | Dec 2025 | Enterprise SaaS |
| twentyhq/twenty | 39.7K | AGPL ⚠️ | React+NestJS+PostgreSQL | Feb 2026 | CRM |
| erxes/erxes | 3.9K | Custom ⚠️ | React+Node+MongoDB | Feb 2026 | All-in-One XOS |
| appsmithorg/appsmith | 39.1K | Apache ✅ | Java+React+PostgreSQL | Feb 2026 | Low-code tools |
| ToolJet/ToolJet | 37.4K | AGPL ⚠️ | NestJS+React+PostgreSQL | Feb 2026 | Internal tools |
| directus/directus | 34.2K | BSL ⚠️ | Node+Vue+PostgreSQL | Feb 2026 | Headless CMS |
| Budibase/budibase | 27.6K | GPL ⚠️ | Node+Svelte+PostgreSQL | Feb 2026 | Portal builder |
| documenso/documenso | 12.4K | AGPL ⚠️ | Next.js+Prisma+PostgreSQL | Feb 2026 | E-signatures |
| formbricks/formbricks | 11.8K | Custom | Next.js+Prisma+PostgreSQL | Feb 2026 | Surveys |
| calcom/cal.com | 40.2K | Custom | Next.js+Prisma+PostgreSQL | Feb 2026 | Scheduling |
| dubinc/dub | 23K | Custom | Next.js+Prisma+Stripe | Feb 2026 | Link management |

---

*تم إعداد هذا التقرير بواسطة PyraAI — Sub-agent: github-saas-platforms-search*
