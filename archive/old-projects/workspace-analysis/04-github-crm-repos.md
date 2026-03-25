# 🔍 بحث GitHub: أفضل Open-Source CRM لـ Pyramedia

> **تاريخ البحث:** 2026-02-14
> **الهدف:** إيجاد أفضل repo مفتوح المصدر لبناء نظام إدارة شركة تسويق (Pyramedia)
> **المعايير:** Next.js/React + Supabase/PostgreSQL + CRM features حقيقية + رخصة مناسبة

---

## 📊 1. جدول شامل بكل الـ Repos (مرتبة بالتقييم)

| # | الاسم | ⭐ Stars | 📅 آخر تحديث | Stack | الرخصة | CRM Features | تقييم /10 |
|---|-------|---------|-------------|-------|--------|-------------|-----------|
| 1 | **[Atomic CRM](https://github.com/marmelab/atomic-crm)** | 781 | 2026-02-14 | React + Supabase + shadcn/ui | **MIT** ✅ | Contacts, Deals, Pipeline, Notes, API | **9.5** |
| 2 | **[Twenty CRM](https://github.com/twentyhq/twenty)** | 39,696 | 2026-02-14 | React + NestJS + PostgreSQL + Redis | **AGPL-3.0** ⚠️ | Full CRM, Custom Objects, Email, Calendar, API | **8.5** |
| 3 | **[Huly Platform](https://github.com/hcengineering/platform)** | 24,417 | 2026-02-14 | Svelte + TypeScript + MongoDB | EPL-2.0 ⚠️ | CRM + PM + HRM + Chat | **7.0** |
| 4 | **[Erxes XOS](https://github.com/erxes/erxes)** | 3,895 | 2026-02-14 | React + Node + GraphQL + MongoDB | Source Available ⚠️ | CRM + Marketing + Sales + Support | **6.5** |
| 5 | **[Next Admin](https://github.com/premieroctet/next-admin)** | 500 | 2026-01-02 | Next.js + Prisma + Tailwind | **MIT** ✅ | Admin CRUD (no CRM-specific) | **6.0** |
| 6 | **[TailAdmin Next.js](https://github.com/TailAdmin/free-nextjs-admin-dashboard)** | 2,278 | 2026-02-14 | Next.js + Tailwind + TypeScript | **MIT** ✅ | Dashboard Template فقط | **5.5** |
| 7 | **[SaaS UI](https://github.com/saas-js/saas-ui)** | 1,613 | 2026-01-25 | React + Chakra UI | **MIT** ✅ | Component Library فقط | **5.0** |
| 8 | **[Cal.com](https://github.com/calcom/cal.com)** | 40,190 | 2026-02-14 | Next.js + Prisma + PostgreSQL | AGPLv3 ⚠️ | Scheduling فقط (مكمل) | **4.5** |
| 9 | **[Plane](https://github.com/makeplane/plane)** | 45,620 | 2026-02-13 | Next.js + Django + PostgreSQL | AGPL-3.0 ⚠️ | Project Tracking (مش CRM) | **4.0** |
| 10 | **[Documenso](https://github.com/documenso/documenso)** | 12,396 | 2026-02-14 | Next.js + Prisma + PostgreSQL | AGPL-3.0 ⚠️ | Document Signing (مكمل) | **3.5** |
| 11 | **[SaaS Template (JSMastery)](https://github.com/adrianhajdin/saas-template)** | ~1,000 | 2025 | Next.js + Supabase + Clerk | Tutorial | Auth + Payments فقط | **3.0** |
| 12 | **[Peppermint](https://github.com/Peppermint-Lab/peppermint)** | 3,025 | 2025-09-21 | Next.js + Prisma | NOASSERTION | Help Desk (مش CRM) | **3.0** |

---

## 🏆 2. تحليل مفصل لأفضل 5

### 🥇 #1: Atomic CRM — التقييم: 9.5/10
> **الأنسب لـ Pyramedia بفارق كبير**

| | |
|---|---|
| **الرابط** | https://github.com/marmelab/atomic-crm |
| **Stars** | 781 ⭐ |
| **Stack** | React + Vite + **Supabase** + shadcn/ui + react-admin |
| **الرخصة** | **MIT** ✅ (حرية كاملة) |
| **حجم الكود** | **15,000 LOC فقط!** (خفيف جداً) |
| **آخر تحديث** | 2026-02-14 (نشط) |

**✅ لماذا الأول:**
- **Supabase native** — نفس الـ stack اللي نستخدمه!
- **MIT License** — نقدر نعدل ونبيع بدون قيود
- **15k LOC فقط** — سهل الفهم والتخصيص (مقارنة بـ Twenty اللي ملايين الأسطر)
- **shadcn/ui** — نفس الـ UI library اللي نبي نستخدمها
- **React-admin** — framework قوي للـ CRUD
- **ميزات CRM حقيقية:** Contacts, Companies, Deals Pipeline (Kanban), Notes, Tasks, Email Capture, Activity Logs
- **Supabase Auth** — Google, Azure, Keycloak, Auth0
- **API جاهز** — Supabase REST API
- **سهل النشر** — Docker + Supabase hosted

**⚠️ النواقص:**
- Community صغير (781 star)
- لا email/calendar sync مدمج
- يحتاج تطوير إضافي لميزات متقدمة
- مبني على React (مش Next.js) — لكن سهل التحويل

**🎯 مناسبته لـ Pyramedia:**
- الـ Stack متطابق 100% مع اللي نبيه (Supabase + React + shadcn)
- حجمه صغير يعني نقدر نفهمه ونعدله بسرعة
- الرخصة MIT تعطينا حرية كاملة
- نقدر نضيف Next.js wrapper بسهولة

---

### 🥈 #2: Twenty CRM — التقييم: 8.5/10
> **أقوى CRM مفتوح المصدر في العالم — لكن ضخم ومعقد**

| | |
|---|---|
| **الرابط** | https://github.com/twentyhq/twenty |
| **Stars** | 39,696 ⭐ |
| **Stack** | React + NestJS + PostgreSQL + Redis + TypeORM + Nx Monorepo |
| **الرخصة** | **AGPL-3.0** ⚠️ (contaminant — أي تعديل لازم ينشر) |
| **آخر تحديث** | 2026-02-14 (نشط جداً) |

**✅ نقاط القوة:**
- **بديل Salesforce حقيقي** — أقوى CRM مفتوح المصدر
- Custom Objects & Fields (من الـ GUI!)
- Email + Calendar sync (Google)
- GraphQL + REST API
- Webhooks + Zapier integrations
- Workflow automation (triggers + actions)
- Kanban + Table + Filter views
- Permission system with custom roles
- Community ضخم (40k stars!)

**⚠️ المشاكل لـ Pyramedia:**
- **AGPL License** — أي تعديل لازم ننشر الكود! مشكلة لو نبي نبيع
- **Codebase ضخم** — ملايين الأسطر، صعب الفهم
- **مش Supabase** — يستخدم PostgreSQL + Redis + NestJS (stack مختلف)
- **Complex setup** — يحتاج Redis + PostgreSQL + تكوين معقد
- Custom Design System (مش shadcn) — صعب التخصيص
- لا multi-tenancy

**🎯 مناسبته لـ Pyramedia:**
- ممتاز كـ reference لفهم CRM features
- يمكن نستخدمه as-is للداخلي (بدون تعديلات تجارية)
- لكن صعب نبني عليه لأن الـ stack مختلف والرخصة مقيدة

---

### 🥉 #3: Huly Platform — التقييم: 7.0/10
> **All-in-One: CRM + Project Management + HR + Chat**

| | |
|---|---|
| **الرابط** | https://github.com/hcengineering/platform |
| **Stars** | 24,417 ⭐ |
| **Stack** | Svelte + TypeScript + MongoDB + Nx |
| **الرخصة** | EPL-2.0 ⚠️ |
| **آخر تحديث** | 2026-02-14 |

**✅ نقاط القوة:**
- All-in-one platform (CRM + PM + HRM + ATS + Chat)
- API Client متاح
- Community كبير (24k stars)
- Self-hosted بسهولة (Docker)
- نشط جداً

**⚠️ المشاكل:**
- **Svelte مش React/Next.js** — stack مختلف تماماً
- **MongoDB مش PostgreSQL/Supabase**
- EPL-2.0 license (مش MIT)
- CRM module مش الـ focus الرئيسي
- Complex architecture

**🎯 مناسبته:** 7/10 — ممكن نستخدمه كـ internal tool لكن مش نبني عليه

---

### #4: Erxes XOS — التقييم: 6.5/10
> **Experience Management Platform — CRM + Marketing + Support**

| | |
|---|---|
| **الرابط** | https://github.com/erxes/erxes |
| **Stars** | 3,895 ⭐ |
| **Stack** | React + Node + GraphQL Federation + MongoDB + Nx Monorepo |
| **الرخصة** | Source Available (مش MIT/Apache) |
| **آخر تحديث** | 2026-02-14 |

**✅ نقاط القوة:**
- Plugin architecture قوي
- Marketing + Sales + Operations + Support
- Omnichannel (inbox, tickets, tasks)
- E-commerce + CMS مدمج
- Self-hosted

**⚠️ المشاكل:**
- **مش حقيقي open source** — "source available" فقط
- **MongoDB مش PostgreSQL**
- GraphQL Federation (معقد)
- Documentation ضعيف
- Plugin system معقد للمبتدئين

---

### #5: Next Admin + TailAdmin (Combo) — التقييم: 6.0/10
> **Building blocks مش CRM جاهز**

| Next Admin | TailAdmin |
|---|---|
| https://github.com/premieroctet/next-admin | https://github.com/TailAdmin/free-nextjs-admin-dashboard |
| 500 ⭐ | 2,278 ⭐ |
| Next.js + Prisma + Tailwind | Next.js + Tailwind |
| **MIT** ✅ | **MIT** ✅ |

**✅ نقاط القوة:**
- **Next.js native** ✅
- MIT License ✅
- Admin dashboard جاهز
- Prisma ORM (Next Admin)
- Beautiful UI (TailAdmin)

**⚠️ المشاكل:**
- **مش CRM** — مجرد admin template
- لازم نبني كل CRM features من الصفر
- لا contacts, لا deals, لا pipeline

**🎯 مناسبته:** مفيد كـ UI building blocks بس مش CRM أساس

---

## 🎯 3. التوصية النهائية

### التوصية الرئيسية: **Atomic CRM** 🏆

**لماذا Atomic CRM هو الخيار الأفضل لـ Pyramedia:**

| المعيار | Atomic CRM | Twenty CRM | الباقي |
|---------|-----------|------------|--------|
| Stack Match | ✅ Supabase + React + shadcn | ❌ NestJS + Redis | ❌ مختلف |
| الرخصة | ✅ MIT | ❌ AGPL | متفاوت |
| حجم الكود | ✅ 15k LOC | ❌ ضخم | متفاوت |
| سهولة التخصيص | ✅ ممتاز | ⚠️ صعب | ⚠️ |
| CRM Features | ✅ كاملة | ✅ أقوى | ❌ ناقصة |
| Time to Market | ✅ أسابيع | ❌ شهور | ❌ شهور |

### الاستراتيجية المقترحة:

```
🏗️ الأساس: Atomic CRM (fork + customize)
🎨 الـ UI: shadcn/ui + Tailwind (نفس Atomic)
🗄️ الـ DB: Supabase (نفس Atomic + نفس بنيتنا الحالية)
📊 Dashboard: TailAdmin components للـ dashboard
📅 Scheduling: Cal.com integration (لو احتجنا حجز مواعيد)
📝 Documents: Documenso integration (لو احتجنا توقيع عقود)
🔍 Reference: Twenty CRM للإلهام وفهم الـ features
```

---

## 🗺️ 4. خطة الدمج المقترحة

### Phase 1: Foundation (أسبوع 1-2)
```
1. Fork Atomic CRM
2. إعداد Supabase project جديد (أو استخدام الحالي)
3. تحويل من Vite إلى Next.js (App Router)
4. ربط مع Supabase الحالي (db.pyramedia.info)
5. إعداد Auth (Supabase Auth)
```

### Phase 2: Core CRM (أسبوع 3-4)
```
1. تخصيص Contacts model للتسويق (clients, leads, partners)
2. تخصيص Deals pipeline (proposals → contracts → active → completed)
3. إضافة Projects module (ربط clients بـ campaigns)
4. Dashboard بـ KPIs (revenue, active clients, pipeline value)
```

### Phase 3: Marketing Agency Features (أسبوع 5-6)
```
1. Campaign Management (ربط مع Meta/Google APIs)
2. Client Reporting dashboard
3. Invoice/Billing integration
4. Team assignments & workload
5. WhatsApp integration (Evolution API)
```

### Phase 4: Advanced (أسبوع 7-8)
```
1. n8n Workflow automations
2. AI features (lead scoring, content suggestions)
3. Client portal (read-only dashboard للعملاء)
4. Mobile responsive optimization
5. Arabic RTL support
```

---

## 📌 ملاحظات مهمة

### بخصوص الرخص:
| الرخصة | المعنى | مناسب لـ Pyramedia? |
|--------|--------|-------------------|
| **MIT** | حرية كاملة — عدل وبيع كيفما تشاء | ✅ الأفضل |
| **Apache 2.0** | مثل MIT + حماية براءات اختراع | ✅ ممتاز |
| **AGPL-3.0** | لازم تنشر كل التعديلات | ⚠️ مشكلة لو تبي تبيع |
| **EPL-2.0** | مشابه لـ AGPL بقيود | ⚠️ |
| **Source Available** | تشوف بس ما تستخدم تجارياً بسهولة | ❌ |

### خلاصة:
> **Atomic CRM = الخيار الذهبي** 🥇
> - نفس الـ stack (Supabase + React + shadcn)
> - MIT License (حرية كاملة)
> - كود صغير وسهل الفهم (15k LOC)
> - CRM features حقيقية جاهزة
> - نقدر نحوله لـ Next.js ونخصصه لـ Pyramedia في أسابيع مش شهور

---

*تم إعداد هذا التقرير بناءً على بحث شامل في GitHub + SerpAPI + مراجعات متعددة*
