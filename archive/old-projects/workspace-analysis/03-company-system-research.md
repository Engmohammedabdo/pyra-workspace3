# 🏢 بحث: نظام إدارة شركة تسويق شامل — Pyramedia

> **تاريخ البحث:** 14 فبراير 2026  
> **الشركة:** Pyramedia — دبي، الإمارات  
> **المجال:** تسويق رقمي + حلول AI  
> **الهدف:** تحويل Pyra Workspace من نظام إدارة ملفات → نظام شامل لإدارة الشركة والعملاء

---

## 📋 الفهرس

1. [الوحدات المطلوبة (مرتبة بالأولوية)](#1-الوحدات-المطلوبة)
2. [مقارنة الأنظمة الموجودة](#2-مقارنة-الأنظمة)
3. [التوصية والخطة](#3-التوصية-والخطة)

---

## 1. الوحدات المطلوبة

مرتبة بالأولوية حسب تأثيرها على العمل اليومي وتحقيق الإيرادات:

### 🥇 الأولوية 1 — الأساس (MVP)

#### 1.1 CRM — إدارة العملاء والصفقات
| البند | التفاصيل |
|-------|----------|
| **الوصف** | نظام مركزي لإدارة العملاء المحتملين (Leads) والحاليين، وتتبع الصفقات من أول تواصل لحد الإغلاق |
| **الميزات الأساسية** | • Lead capture (نماذج، واتساب، إيميل)<br>• Contacts database مع تاريخ التواصل الكامل<br>• Deals pipeline (Kanban) بمراحل قابلة للتخصيص<br>• Lead scoring — تقييم تلقائي للعملاء المحتملين<br>• تصنيف حسب الخدمة (Ads, SEO, Video, AI)<br>• ربط مع WhatsApp (Evolution API)<br>• تقارير المبيعات والتحويل |
| **أمثلة من السوق** | HubSpot CRM, Pipedrive, Perfex CRM |
| **لماذا أولوية؟** | بدون CRM، العملاء يضيعون. هذا المحرك الأساسي للإيرادات |

#### 1.2 Project Management — إدارة المشاريع
| البند | التفاصيل |
|-------|----------|
| **الوصف** | تتبع كل مشروع من البداية للنهاية — المهام، المراحل، المسؤوليات |
| **الميزات الأساسية** | • إنشاء مشروع مرتبط بعميل وعقد<br>• Tasks مع assignees, due dates, priorities<br>• Kanban board + List view + Gantt chart<br>• Milestones — نقاط تسليم رئيسية<br>• Task dependencies — مهمة تعتمد على أخرى<br>• Time tracking — تسجيل وقت العمل<br>• Task templates حسب نوع الخدمة<br>• Comments و mentions على المهام |
| **أمثلة من السوق** | ClickUp, Monday.com, Asana, Perfex CRM |
| **لماذا أولوية؟** | الشركة تقدم خدمات متعددة لعملاء متعددين — لازم نتابع كل شي |

#### 1.3 Invoicing & Billing — الفواتير والمدفوعات
| البند | التفاصيل |
|-------|----------|
| **الوصف** | إنشاء فواتير احترافية، تتبع المدفوعات، وتقارير مالية |
| **الميزات الأساسية** | • إنشاء فواتير بالعربي والإنجليزي<br>• دعم AED + USD + عملات أخرى<br>• حالات الفاتورة (Draft, Sent, Paid, Overdue)<br>• Recurring invoices — فواتير شهرية تلقائية (retainers)<br>• Payment tracking — سجل المدفوعات<br>• ربط مع بوابات دفع (Stripe, PayPal)<br>• تقارير: Revenue, Outstanding, Overdue<br>• ضريبة القيمة المضافة VAT 5% (الإمارات)<br>• PDF export بتصميم احترافي |
| **أمثلة من السوق** | Perfex CRM, FreshBooks, QuickBooks, Dubsado |
| **لماذا أولوية؟** | الفلوس = شريان الحياة. لازم نعرف مين دافع ومين ما دفع |

---

### 🥈 الأولوية 2 — التوسع

#### 1.4 Client Portal — بوابة العميل
| البند | التفاصيل |
|-------|----------|
| **الوصف** | واجهة مخصصة لكل عميل يقدر يشوف فيها مشاريعه، ملفاته، فواتيره، وتقارير الأداء |
| **الميزات الأساسية** | • Dashboard خاص بالعميل<br>• عرض المشاريع النشطة وحالتها<br>• تحميل/رفع الملفات<br>• عرض الفواتير والدفع أونلاين<br>• عرض تقارير الحملات<br>• Approval workflow — موافقة على المحتوى/التصاميم<br>• رسائل مباشرة مع الفريق |
| **أمثلة من السوق** | Dubsado, SuiteDash, Perfex CRM, Monday.com (WorkForms) |
| **لماذا أولوية 2؟** | يرفع مستوى الاحترافية ويقلل الأسئلة المتكررة من العملاء |

#### 1.5 Campaign Tracker — تتبع الحملات الإعلانية
| البند | التفاصيل |
|-------|----------|
| **الوصف** | ربط مع Meta Ads و Google Ads لعرض أداء الحملات بشكل مركزي |
| **الميزات الأساسية** | • ربط API مع Meta Marketing API<br>• ربط API مع Google Ads API<br>• Dashboard لكل عميل: Spend, Impressions, Clicks, Conversions<br>• ROAS / CPA / CTR / CPM calculations<br>• مقارنة أداء الفترات (هالشهر vs الشهر اللي قبل)<br>• تقارير تلقائية أسبوعية/شهرية<br>• تنبيهات: budget exceeded, performance drop |
| **أمثلة من السوق** | AgencyAnalytics, Whatagraph, ReportGarden, Supermetrics |
| **لماذا مهم لـ Pyramedia؟** | الحملات الإعلانية هي الخدمة الأساسية — التقارير الحلوة = عملاء سعيدين |

#### 1.6 Contracts & Proposals — العقود وعروض الأسعار
| البند | التفاصيل |
|-------|----------|
| **الوصف** | إنشاء عروض أسعار وعقود احترافية وإرسالها للعملاء للتوقيع |
| **الميزات الأساسية** | • Templates جاهزة حسب الخدمة<br>• محرر drag & drop للعروض<br>• E-signature — توقيع إلكتروني<br>• تحويل تلقائي من Proposal → Contract → Invoice<br>• تتبع حالة العرض (Sent, Viewed, Accepted, Rejected)<br>• تذكيرات تلقائية<br>• Multi-language (عربي + إنجليزي) |
| **أمثلة من السوق** | Dubsado, PandaDoc, Proposify, Perfex CRM |

---

### 🥉 الأولوية 3 — التحسين

#### 1.7 File Management — إدارة الملفات ✅ (موجود)
| البند | التفاصيل |
|-------|----------|
| **الوصف** | تخزين وتنظيم ملفات المشاريع والعملاء |
| **الحالة الحالية** | ✅ موجود في Pyra Workspace عبر Supabase Storage |
| **تحسينات مطلوبة** | • ربط الملفات بالمشاريع والعملاء<br>• Version control<br>• Preview للصور والفيديو<br>• مشاركة مع العملاء عبر Client Portal<br>• تصنيف تلقائي حسب النوع |

#### 1.8 Team Management — إدارة الفريق
| البند | التفاصيل |
|-------|----------|
| **الوصف** | إدارة أعضاء الفريق، الأدوار، الصلاحيات، وتوزيع العمل |
| **الميزات الأساسية** | • User roles: Admin, Manager, Employee, Freelancer<br>• Permissions بمستويات (مشروع، عميل، مالية)<br>• Workload view — شوف مين مشغول ومين فاضي<br>• Performance tracking<br>• Timesheet — سجل ساعات العمل<br>• Department organization |
| **أمثلة من السوق** | Monday.com, ClickUp, Teamwork |

#### 1.9 Reports & Dashboard — التقارير ولوحة المعلومات
| البند | التفاصيل |
|-------|----------|
| **الوصف** | لوحة شاملة تعرض KPIs الشركة بنظرة واحدة |
| **الميزات الأساسية** | • Revenue dashboard — الإيرادات الشهرية/السنوية<br>• Client health score — صحة العلاقة مع كل عميل<br>• Project status overview<br>• Team utilization<br>• Pipeline value — قيمة الصفقات المتوقعة<br>• MRR (Monthly Recurring Revenue)<br>• Client retention rate<br>• تقارير قابلة للتصدير PDF |
| **أمثلة من السوق** | HubSpot, Databox, Google Looker Studio |

#### 1.10 Communication — التواصل الداخلي
| البند | التفاصيل |
|-------|----------|
| **الوصف** | نظام تواصل داخلي وتعليقات مرتبطة بالمشاريع والمهام |
| **الميزات الأساسية** | • تعليقات على المهام والمشاريع<br>• @mentions للفريق<br>• Notifications (in-app, email, push)<br>• Activity feed — سجل النشاطات<br>• ربط مع WhatsApp/Email للتواصل مع العملاء |
| **أمثلة من السوق** | Slack, ClickUp Chat, Monday.com Updates |

#### 1.11 Calendar & Scheduling — التقويم والمواعيد
| البند | التفاصيل |
|-------|----------|
| **الوصف** | تقويم مركزي للمواعيد، الاجتماعات، والمواعيد النهائية |
| **الميزات الأساسية** | • تقويم مشترك للفريق<br>• ربط مع Google Calendar<br>• Booking links — العميل يحجز موعد<br>• تذكيرات تلقائية<br>• عرض deadlines المشاريع |
| **أمثلة من السوق** | Calendly, Cal.com, HubSpot Meetings |

#### 1.12 Knowledge Base — قاعدة المعرفة
| البند | التفاصيل |
|-------|----------|
| **الوصف** | مكتبة داخلية للـ SOPs، القوالب، والأدلة التدريبية |
| **الميزات الأساسية** | • محرر نصوص غني (Rich Text Editor)<br>• تصنيف بالأقسام والتاجات<br>• بحث داخلي<br>• صلاحيات (داخلي فقط / مشترك مع العميل)<br>• Templates library — قوالب جاهزة |
| **أمثلة من السوق** | Notion, Confluence, Perfex CRM KB, GitBook |

---

## 2. مقارنة الأنظمة

### جدول المقارنة السريع

| المعيار | Monday.com | ClickUp | HubSpot CRM | Perfex CRM | Dubsado |
|---------|-----------|---------|-------------|------------|---------|
| **النوع** | SaaS | SaaS | SaaS | Self-hosted | SaaS |
| **التخصص** | Project Mgmt | All-in-one | CRM + Marketing | CRM + Billing | Agency/Freelancer |
| **السعر (سنوي/مستخدم/شهر)** | $12-19 | $7-12 | Free → $20+ | $99 مرة واحدة | $28-44/شهر (كل المستخدمين) |
| **CRM** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Project Mgmt** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐ |
| **Invoicing** | ⭐⭐ (add-on) | ⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ |
| **Client Portal** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **Campaign Tracking** | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐ | ⭐ |
| **Contracts** | ⭐⭐ | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| **API/تخصيص** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐ |

---

### 2.1 Monday.com

| البند | التفاصيل |
|-------|----------|
| **النوع** | SaaS — Cloud-based |
| **الأسعار (2026)** | • **Free:** مجاني لـ 2 مستخدمين، 3 boards<br>• **Standard:** $12/مستخدم/شهر (سنوي)<br>• **Pro:** $19/مستخدم/شهر (سنوي) — الأنسب<br>• **Enterprise:** تواصل معهم |
| **لـ 5 مستخدمين (Pro)** | ~$95/شهر = ~$1,140/سنة |
| **الميزات الرئيسية** | ✅ Project management ممتاز (Kanban, Gantt, Timeline)<br>✅ Automations قوية (25K action/شهر بـ Pro)<br>✅ Integrations كثيرة (Meta, Google, Slack)<br>✅ Dashboard تفاعلية<br>✅ AI Sidekick مدمج<br>✅ Guest access للعملاء<br>✅ Time tracking (Pro) |
| **الإيجابيات** | • واجهة بصرية سهلة وجميلة<br>• Marketplace ضخم (apps & integrations)<br>• Templates جاهزة لشركات التسويق<br>• Monday CRM منتج منفصل متكامل |
| **السلبيات** | • ❌ ما فيه فواتير مدمجة<br>• ❌ CRM محدود مقارنة بـ HubSpot<br>• ❌ السعر يرتفع بسرعة مع زيادة المستخدمين<br>• ❌ Client portal أساسي<br>• ❌ الحد الأدنى 3 مستخدمين للباقات المدفوعة |
| **هل يناسب Pyramedia؟** | **متوسط** — ممتاز لإدارة المشاريع لكن يحتاج أدوات إضافية للفواتير والـ CRM المتقدم |

---

### 2.2 ClickUp

| البند | التفاصيل |
|-------|----------|
| **النوع** | SaaS — Cloud-based |
| **الأسعار (2026)** | • **Free Forever:** مجاني، 60MB storage<br>• **Unlimited:** $7/مستخدم/شهر (سنوي)<br>• **Business:** $12/مستخدم/شهر (سنوي) — الأنسب<br>• **Enterprise:** تواصل معهم<br>• **Brain AI:** +$9/مستخدم/شهر<br>• **Everything AI:** +$28/مستخدم/شهر |
| **لـ 5 مستخدمين (Business)** | ~$60/شهر = ~$720/سنة |
| **الميزات الرئيسية** | ✅ Project management شامل (Tasks, Docs, Whiteboards)<br>✅ Goals & Portfolios<br>✅ Resource Management<br>✅ Native Time Tracking<br>✅ Gantt Charts + Mind Maps<br>✅ ClickUp AI (Brain) متطور<br>✅ Custom Fields غير محدودة<br>✅ Automations |
| **الإيجابيات** | • أرخص بكثير من المنافسين<br>• All-in-one — يغطي معظم الاحتياجات<br>• مرونة عالية في التخصيص<br>• Docs مدمجة (بديل Notion)<br>• AI متطور مع ClickUp Brain |
| **السلبيات** | • ❌ ما فيه فواتير مدمجة<br>• ❌ CRM أساسي (يحتاج setup يدوي)<br>• ❌ Client portal ضعيف<br>• ❌ واجهة معقدة أحياناً (learning curve)<br>• ❌ Campaign tracking يحتاج integrations خارجية |
| **هل يناسب Pyramedia؟** | **جيد للمشاريع** — سعر ممتاز وميزات كثيرة، لكن يحتاج أدوات مساعدة للفواتير وبوابة العميل |

---

### 2.3 HubSpot CRM

| البند | التفاصيل |
|-------|----------|
| **النوع** | SaaS — Cloud-based |
| **الأسعار (2026)** | • **Free:** مجاني تماماً — CRM أساسي<br>• **Starter:** ~$20/مستخدم/شهر<br>• **Professional Marketing Hub:** ~$890/شهر (3 مستخدمين)<br>• **Enterprise:** ~$3,600/شهر |
| **لـ 5 مستخدمين (Starter)** | ~$100/شهر = ~$1,200/سنة |
| **الميزات الرئيسية** | ✅ CRM الأقوى في السوق (Free!)<br>✅ Contact management مع timeline كامل<br>✅ Deals pipeline بصري<br>✅ Email marketing مدمج<br>✅ Landing pages<br>✅ Ads management (Meta + Google) مدمج<br>✅ Reporting dashboard متقدم<br>✅ API قوي ومفتوح<br>✅ Meetings scheduling |
| **الإيجابيات** | • CRM مجاني وقوي جداً<br>• Ads tracking مدمج (Meta + Google)<br>• بيئة متكاملة (Marketing + Sales + Service)<br>• API ممتاز للتكامل<br>• Analytics وتقارير متقدمة<br>• Marketplace ضخم |
| **السلبيات** | • ❌ غالي جداً لما تحتاج ميزات متقدمة<br>• ❌ Project management ضعيف جداً<br>• ❌ ما فيه فواتير حقيقية (Quotes فقط)<br>• ❌ Client portal محدود<br>• ❌ السعر يقفز بشكل كبير من Starter لـ Professional |
| **هل يناسب Pyramedia؟** | **ممتاز كـ CRM** — الخطة المجانية تكفي للبداية، لكن يحتاج أدوات ثانية لإدارة المشاريع والفواتير |

---

### 2.4 Perfex CRM (Self-hosted)

| البند | التفاصيل |
|-------|----------|
| **النوع** | Self-hosted — على سيرفرك |
| **الأسعار** | • **الترخيص:** $99 مرة واحدة (CodeCanyon)<br>• **تكلفة الاستضافة:** $5-20/شهر VPS<br>• **الصيانة:** مجهود داخلي |
| **لـ 5 مستخدمين** | ~$99 + ~$10/شهر hosting = ~$220/سنة أول |
| **الميزات الرئيسية** | ✅ CRM كامل (Leads, Contacts, Deals)<br>✅ Project Management مع Tasks<br>✅ Invoicing احترافي (Recurring, Multi-currency)<br>✅ Estimates & Proposals<br>✅ Contracts مع تواريخ انتهاء<br>✅ Support Tickets<br>✅ Knowledge Base<br>✅ Expenses tracking<br>✅ Client Portal كامل<br>✅ Calendar<br>✅ Goals tracking<br>✅ Custom fields<br>✅ Staff roles & permissions |
| **الإيجابيات** | • **أرخص حل شامل** — $99 مرة واحدة<br>• يغطي تقريباً كل الوحدات المطلوبة<br>• Self-hosted = تحكم كامل بالبيانات<br>• PHP + MySQL = سهل التخصيص<br>• Add-ons كثيرة في CodeCanyon<br>• Client Portal مدمج وقوي<br>• Invoicing ممتاز مع VAT support |
| **السلبيات** | • ❌ واجهة قديمة نسبياً (Bootstrap)<br>• ❌ يحتاج صيانة وتحديثات يدوية<br>• ❌ Campaign tracking غير موجود (يحتاج custom)<br>• ❌ ما فيه AI مدمج<br>• ❌ Mobile app ضعيف<br>• ❌ Automations محدودة<br>• ❌ يحتاج مطور PHP للتخصيص |
| **هل يناسب Pyramedia؟** | **خيار ممتاز للبناء عليه** — يوفر 70% من الاحتياجات بسعر رمزي، والباقي يُبنى custom أو يُربط مع APIs |

---

### 2.5 Dubsado

| البند | التفاصيل |
|-------|----------|
| **النوع** | SaaS — Cloud-based |
| **الأسعار (2026)** | • **Free Trial:** 21 يوم<br>• **Starter:** $335/سنة (~$28/شهر)<br>• **Premier:** $525/سنة (~$44/شهر)<br>• **إضافات:** مستخدمين إضافيين من $25-60/شهر<br>• **ملاحظة:** السعر للحساب كامل مو per-user |
| **لـ 5 مستخدمين (Premier)** | ~$44 + $25 = ~$69/شهر = ~$828/سنة |
| **الميزات الرئيسية** | ✅ Client Portal احترافي<br>✅ Invoicing & Payment Plans<br>✅ Contracts مع E-signature<br>✅ Proposals بتصميم جميل<br>✅ Automated Workflows قوية<br>✅ Scheduling مدمج<br>✅ Forms & Lead Capture<br>✅ Email Integration<br>✅ Bookkeeping Integration (QuickBooks, Xero) |
| **الإيجابيات** | • مصمم خصيصاً للوكالات والـ freelancers<br>• Client experience ممتازة<br>• Workflows أتمتة قوية (Lead → Contract → Invoice → Onboard)<br>• سعر ثابت (مو per-user)<br>• Contracts + E-signature مدمج<br>• Proposals تفاعلية |
| **السلبيات** | • ❌ Project management ضعيف جداً (ما فيه tasks/kanban)<br>• ❌ ما فيه Campaign tracking<br>• ❌ CRM أساسي<br>• ❌ Reporting محدود<br>• ❌ API ضعيف (Zapier فقط في Premier)<br>• ❌ ما فيه Team management متقدم<br>• ❌ ما يدعم عربي |
| **هل يناسب Pyramedia؟** | **جزئياً** — ممتاز للعقود والفواتير وبوابة العميل، لكن ضعيف في إدارة المشاريع والحملات |

---

## 3. التوصية والخطة

### 🎯 التوصية الرئيسية: **نبني نظام مخصص (Custom) على Supabase**

#### لماذا Custom وليس جاهز؟

| السبب | التفصيل |
|-------|---------|
| **1. ما فيه نظام واحد يغطي الكل** | كل نظام جاهز يحتاج أدوات مساعدة — يعني نفس التعقيد |
| **2. Pyramedia تقدم AI Solutions** | النظام نفسه يصير showcase للعملاء — "شوفوا نظامنا" |
| **3. عندنا البنية التحتية** | Supabase + n8n + Next.js = الأدوات موجودة |
| **4. التكلفة طويلة المدى** | $100/شهر SaaS × 3 سنوات = $3,600 بدون ملكية. Custom = استثمار |
| **5. التكامل مع Pyra AI** | نربط chatbots و voice agents مباشرة |
| **6. الخصوصية** | بيانات العملاء على سيرفراتنا في دبي |

#### لكن! مو كل شي نبنيه من الصفر

| نبنيه Custom ✅ | نستخدم جاهز/API 🔌 |
|----------------|---------------------|
| CRM (مخصص لخدماتنا) | Campaign Tracking → Meta/Google APIs مباشرة |
| Project Management | Calendar → Google Calendar API |
| Invoicing | Email → موجود (pyraai@pyramedia.info) |
| Client Portal | E-signature → DocuSign/SignWell API |
| Dashboard & Reports | Notifications → WhatsApp (Evolution API) |
| File Management (تطوير الموجود) | Payment Gateway → Stripe |
| Team Management | Accounting → QuickBooks/Xero API (لاحقاً) |

---

### 📅 الخطة المقترحة — 4 مراحل

#### Phase 1: MVP — الأساس (6-8 أسابيع)
> **الهدف:** نظام شغّال يغطي العمليات اليومية

| Module | الميزات | الأولوية |
|--------|---------|----------|
| **CRM** | Contacts, Leads, Deals Pipeline (Kanban), Lead sources, Basic search & filter | 🔴 حرجة |
| **Project Management** | Create project (linked to client), Tasks with assignees & due dates, Kanban board, Task comments | 🔴 حرجة |
| **Invoicing** | Create invoice, Mark as paid, PDF export, Invoice list with status filters, VAT 5% | 🔴 حرجة |
| **File Management** | ربط الملفات بالمشاريع والعملاء (تطوير الموجود) | 🟡 مهمة |
| **Auth & Roles** | Login, User roles (Admin, Manager, Employee), Basic permissions | 🔴 حرجة |

**التقنيات:**
- Frontend: Next.js + Tailwind + shadcn/ui
- Backend: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
- Hosting: Vercel أو VPS الحالي

**المخرج:** نظام داخلي يستخدمه الفريق يومياً

---

#### Phase 2: التوسع (4-6 أسابيع)
> **الهدف:** تجربة عميل احترافية + تقارير

| Module | الميزات | الأولوية |
|--------|---------|----------|
| **Client Portal** | Dashboard للعميل, عرض المشاريع والفواتير, رفع/تحميل ملفات, Approval workflow | 🟡 مهمة |
| **Campaign Tracker** | ربط Meta API + Google Ads API, Dashboard أداء لكل عميل, Auto-generate reports | 🟡 مهمة |
| **Contracts & Proposals** | Templates, إنشاء + إرسال عروض أسعار, تحويل Proposal → Project → Invoice | 🟡 مهمة |
| **Communication** | Comments على المهام, @mentions, Notifications (in-app + email) | 🟢 محسّنة |

**المخرج:** بوابة عميل احترافية + تقارير حملات أوتوماتيكية

---

#### Phase 3: الأتمتة والذكاء (4-6 أسابيع)
> **الهدف:** AI + أتمتة = كفاءة أعلى

| Module | الميزات | الأولوية |
|--------|---------|----------|
| **Dashboard & Reports** | Revenue dashboard, Client health scores, Team utilization, Pipeline analytics | 🟡 مهمة |
| **Team Management** | Workload view, Time tracking, Performance metrics | 🟢 محسّنة |
| **Calendar** | ربط Google Calendar, Booking links للعملاء, Deadline reminders | 🟢 محسّنة |
| **AI Features** | Smart lead scoring, Auto-assign tasks, AI report summaries, Chatbot integration | 🟢 محسّنة |
| **n8n Automations** | Welcome email workflow, Invoice reminder workflow, Campaign alert workflow | 🟢 محسّنة |

**المخرج:** نظام ذكي مع أتمتة كاملة

---

#### Phase 4: النضج (مستمر)
> **الهدف:** تطوير مستمر حسب الاحتياج

| Module | الميزات |
|--------|---------|
| **Knowledge Base** | SOPs, Templates, Client-facing guides |
| **Recurring Invoices** | Auto-generate monthly invoices for retainers |
| **Advanced Reporting** | Custom report builder, Export to PDF/CSV |
| **Mobile App** | PWA أو React Native |
| **White Label** | تقديم النظام كمنتج لعملاء Pyramedia |
| **Multi-brand** | إدارة أكثر من brand تحت حساب واحد |

---

### 💡 البديل السريع: Perfex CRM + Customization

إذا الوقت ضيق ونبي نظام شغّال بأسرع وقت:

| الخطوة | التفصيل |
|--------|---------|
| **1** | شراء Perfex CRM ($99) وتنصيبه على VPS |
| **2** | تخصيص الواجهة والألوان (Pyramedia branding) |
| **3** | إضافة Campaign Tracker كـ custom module |
| **4** | ربط مع n8n للأتمتة (WhatsApp, Email) |
| **5** | بناء Client Portal مخصص بـ Next.js يسحب بيانات من Perfex API |

**الوقت:** 2-3 أسابيع  
**التكلفة:** $99 + وقت المطور  
**الميزة:** سريع ويغطي 70% من الاحتياجات  
**العيب:** محدودية التخصيص مقارنة بـ Custom

---

### 📊 ملخص التكاليف المقارنة (سنوياً - 5 مستخدمين)

| الحل | التكلفة السنوية | يغطي من الوحدات |
|------|-----------------|-----------------|
| Monday.com (Pro) | ~$1,140 | 40% |
| ClickUp (Business) | ~$720 | 45% |
| HubSpot (Free + Starter) | ~$1,200 | 35% |
| Perfex CRM | ~$220 | 70% |
| Dubsado (Premier) | ~$828 | 50% |
| **Custom (Supabase)** | **~$300 (hosting)** | **100%** |
| **Perfex + Custom** | **~$320** | **85%** |

---

### ✅ التوصية النهائية

> **للبداية السريعة (خلال شهر):**
> 1. ابدأ بـ **Perfex CRM** كنظام تشغيلي ($99)
> 2. اربطه مع **n8n** للأتمتة (WhatsApp, reminders)
> 3. استخدم **Meta/Google APIs** للحملات
>
> **للمدى الطويل (3-6 أشهر):**
> 1. ابنِ **Pyra System** على **Supabase + Next.js**
> 2. انقل البيانات من Perfex
> 3. أضف **AI features** (Pyra AI integration)
> 4. قدمه كـ **منتج SaaS** لوكالات تسويق ثانية 💰

---

### 🏗️ الهيكل التقني المقترح (Custom Build)

```
┌─────────────────────────────────────────┐
│              Pyra System                │
├─────────────────────────────────────────┤
│  Frontend: Next.js + Tailwind + shadcn  │
│  ├── /dashboard    (لوحة التحكم)        │
│  ├── /crm          (العملاء والصفقات)   │
│  ├── /projects     (المشاريع والمهام)   │
│  ├── /invoices     (الفواتير)           │
│  ├── /campaigns    (الحملات)            │
│  ├── /portal       (بوابة العميل)       │
│  └── /settings     (الإعدادات)          │
├─────────────────────────────────────────┤
│  Backend: Supabase                      │
│  ├── PostgreSQL    (قاعدة البيانات)     │
│  ├── Auth          (المصادقة)           │
│  ├── Storage       (الملفات)            │
│  ├── Edge Functions (API endpoints)     │
│  └── Realtime      (تحديثات فورية)      │
├─────────────────────────────────────────┤
│  Integrations:                          │
│  ├── n8n           (الأتمتة)            │
│  ├── Meta API      (حملات فيسبوك)       │
│  ├── Google Ads    (حملات جوجل)         │
│  ├── WhatsApp      (Evolution API)      │
│  ├── Stripe        (المدفوعات)          │
│  ├── Google Calendar (المواعيد)         │
│  └── Pyra AI       (الذكاء الاصطناعي)   │
└─────────────────────────────────────────┘
```

---

> 📝 **ملاحظة:** هذا التقرير مبني على بحث فبراير 2026. الأسعار والميزات ممكن تتغير. يُنصح بمراجعة المواقع الرسمية قبل اتخاذ القرار النهائي.
