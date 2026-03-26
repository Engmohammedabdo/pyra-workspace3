# Pyra Workspace 3.0 — System Structure (ERP + CRM)

> مرجع شامل لهيكل النظام — للتطوير المستمر
> آخر تحديث: 2026-03-16

---

## نظرة عامة

Pyra Workspace هو نظام **ERP + CRM** متكامل مبني على Next.js 15 (App Router) مع Supabase كقاعدة بيانات.

```
┌────────────────────────────────────────────────────────────────┐
│                    Pyra Workspace 3.0                          │
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐ │
│  │ لوحة الإدارة  │  │ بورتال العميل │  │  API خارجي (n8n/Bot) │ │
│  │ /dashboard   │  │ /portal      │  │  /api/external       │ │
│  │ 94 صفحة      │  │ 21 صفحة      │  │  10 endpoints        │ │
│  └──────┬───────┘  └──────┬───────┘  └──────────┬───────────┘ │
│         │                  │                      │             │
│  ┌──────▼──────────────────▼──────────────────────▼───────────┐│
│  │              290+ API Route (Next.js)                       ││
│  │  Auth: Supabase JWT (Admin) | Cookie Session (Portal)      ││
│  │  RBAC: 79 صلاحية عبر 34 وحدة                               ││
│  └──────────────────────────┬─────────────────────────────────┘│
│                              │                                  │
│  ┌──────────────────────────▼─────────────────────────────────┐│
│  │            Supabase (Self-Hosted PostgreSQL)                ││
│  │  100 جدول | Storage (S3) | Auth | Realtime                 ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐  │
│  │  Stripe  │ │  SMTP    │ │ Webhooks │ │ Automation Engine│  │
│  │ المدفوعات │ │ الإيميلات │ │  الصادرة  │ │     الأتمتة      │  │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## الجزء الأول: لوحة الإدارة (Admin Dashboard)

### 1. الرئيسية والشخصي

| الشاشة | المسار | المميزات | الجداول |
|--------|--------|----------|---------|
| **لوحة التحكم** | `/dashboard` | 5 بطاقات KPI (إيرادات، مشاريع، عملاء، ملفات، مستخدمين) • رسم بياني للإيرادات الشهرية • توزيع المشاريع • عبء عمل الفريق • آخر النشاطات • عرض الموظف (مهامي، ساعات، إجازات) | `pyra_invoices`, `pyra_projects`, `pyra_clients`, `pyra_file_index`, `pyra_users`, `pyra_activity_log` |
| **الإشعارات** | `/dashboard/notifications` | قائمة الإشعارات • تعليم كمقروء • تعليم الكل كمقروء • فلتر بالنوع | `pyra_notifications` |
| **ملفي الشخصي** | `/dashboard/profile` | تعديل الاسم والبيانات • رفع صورة شخصية • تغيير كلمة المرور • عرض آخر النشاطات | `pyra_users`, `pyra_activity_log` |
| **مهامي** | `/dashboard/my-tasks` | كل المهام المسندة للمستخدم • تجميع: متأخرة/اليوم/هذا الأسبوع/قادمة/مكتملة • بحث وفلتر • بطاقات إحصائية | `pyra_tasks`, `pyra_task_assignees`, `pyra_boards` |
| **دليل الاستخدام** | `/dashboard/guide` | دليل تفاعلي لكل وحدات النظام • بحث • 6 أقسام • نصائح وشروحات | لا يوجد (بيانات ثابتة) |

---

### 2. الأعمال (Business)

| الشاشة | المسار | المميزات | الجداول |
|--------|--------|----------|---------|
| **المشاريع** | `/dashboard/projects` | CRUD كامل • حالات (نشط/مكتمل/معلق) • ربط بعميل وفريق • ميزانية • ساعات مقدرة • مسار التخزين | `pyra_projects`, `pyra_clients`, `pyra_teams` |
| **تفاصيل المشروع** | `/dashboard/projects/[id]` | نظرة عامة • ملفات المشروع • التعليقات • الفواتير • العقد • الميزانية vs الفعلي | `pyra_projects`, `pyra_project_files`, `pyra_client_comments`, `pyra_invoices`, `pyra_contracts` |
| **العملاء** | `/dashboard/clients` | CRUD كامل • 7 تبويبات (نظرة عامة، مشاريع، فواتير، عروض أسعار، ملاحظات، نشاط، برندنج) • وسوم • حالة نشط/غير نشط | `pyra_clients`, `pyra_client_notes`, `pyra_client_tags`, `pyra_client_branding` |
| **عروض الأسعار** | `/dashboard/quotes` | CRUD + PDF عربي • إرسال بالإيميل • توقيع رقمي • تحويل لفاتورة • بنود مخصصة • خصومات | `pyra_quotes`, `pyra_quote_items` |
| **الفواتير** | `/dashboard/invoices` | CRUD + PDF • Stripe رابط دفع • تسجيل مدفوعات يدوية • حالات (مسودة/مرسلة/مدفوعة جزئياً/مدفوعة/متأخرة) • خصم مبكر • ربط بمشروع وعقد | `pyra_invoices`, `pyra_invoice_items`, `pyra_payments`, `pyra_stripe_payments` |
| **لوحات العمل** | `/dashboard/boards` | إنشاء من 6 قوالب • 4 أوضاع عرض (Kanban/List/Calendar/Pipeline) • task numbering • board starring • task duplication • cross-board move • board members (viewer/editor/admin) • markdown description • due date color badges • sort (أحدث/أقدم/أولوية/تاريخ/اسم) • Trello-style task sheet (assignees, labels, checklists, comments, attachments, activity log) | `pyra_boards`, `pyra_board_columns`, `pyra_board_labels`, `pyra_tasks`, `pyra_board_stars`, `pyra_board_members` |
| **تفاصيل اللوحة** | `/dashboard/boards/[id]` | سحب وإفلات المهام • بطاقة مهمة مفصلة (عنوان، أولوية، تاريخ، مسندة لـ، قوائم مرجعية، تعليقات، مرفقات) | `pyra_tasks`, `pyra_task_assignees`, `pyra_task_labels`, `pyra_task_checklist`, `pyra_task_comments` |

#### ← روابط التكامل:
- **عرض أسعار → فاتورة**: تحويل تلقائي (ينسخ البنود)
- **فاتورة → Stripe**: رابط دفع → webhook → تسجيل تلقائي
- **فاتورة → عقد**: تحديث `amount_billed` و `amount_collected`
- **مشروع → لوحة عمل**: إنشاء تلقائي عند إنشاء المشروع
- **عميل → مشاريع → فواتير → مدفوعات**: سلسلة كاملة

---

### 3. المحتوى والملفات

| الشاشة | المسار | المميزات | الجداول |
|--------|--------|----------|---------|
| **مراجعات السكريبتات** | `/dashboard/script-reviews` | مراجعة ملفات النصوص • ردود متسلسلة • حالة (بانتظار/معتمد/مرفوض) | `pyra_script_reviews`, `pyra_script_review_replies` |
| **خط الإنتاج** | `/dashboard/content-pipeline` | إدارة إنتاج المحتوى • أنواع (فيديو/ريلز/بودكاست/مقال/سوشال) • مراحل (سكريبت→تصوير→مونتاج→مراجعة→تسليم) | `pyra_content_pipeline`, `pyra_pipeline_stages` |
| **الملفات** | `/dashboard/files` | مستكشف ملفات كامل • رفع/تنزيل • معاينة • سحب وإفلات • إنشاء مجلدات • بحث نصي كامل | `pyra_file_index`, `pyra_file_versions` |
| **المفضلة** | `/dashboard/favorites` | الملفات المثبتة • إضافة/إزالة | `pyra_favorites` |
| **المراجعات** | `/dashboard/reviews` | تعليقات وملاحظات على الملفات • ردود متسلسلة | `pyra_reviews` |
| **المحذوفات** | `/dashboard/trash` | سلة المحذوفات • استعادة • حذف نهائي • تنظيف تلقائي بعد 30 يوم | `pyra_trash` |
| **التخزين** | `/dashboard/storage` | عرض استهلاك التخزين • توزيع حسب النوع والمشروع | `pyra_file_index` |

#### ← روابط التكامل:
- **ملف → مشروع**: كل ملف مرتبط بمشروع عبر `pyra_project_files`
- **ملف → عميل**: العميل يرى ملفات مشروعه عبر البورتال (`client_visible = true`)
- **ملف → موافقة**: سير عمل موافقة العميل (`pyra_file_approvals`)
- **ملف → إصدارات**: تاريخ كامل للتعديلات (`pyra_file_versions`)
- **ملف → مشاركة**: روابط خارجية محمية بكلمة مرور (`pyra_share_links`)

---

### 4. المبيعات (Sales CRM)

| الشاشة | المسار | المميزات | الجداول |
|--------|--------|----------|---------|
| **نظرة عامة** | `/dashboard/sales` | إحصائيات المبيعات • مراحل Pipeline • رسوم بيانية • أداء الفريق | `pyra_sales_leads`, `pyra_sales_pipeline_stages` |
| **العملاء المحتملين** | `/dashboard/sales/leads` | CRUD • مصادر (واتساب/موقع/إحالة/إعلان) • نقاط تقييم • أولوية • تحويل لعميل | `pyra_sales_leads`, `pyra_lead_activities` |
| **محادثات واتساب** | `/dashboard/sales/chat` | WhatsApp Web replacement • رسائل واردة/صادرة (نص/صوت/صور/فيديو/مستندات) • agent scoping • conversation assignments • contact sidebar (lead + quotes) • quick actions bar (إرسال عرض/فاتورة، إنشاء lead، ملاحظات، متابعة) • voice recording • drag-drop files • clipboard paste | `pyra_whatsapp_messages`, `pyra_whatsapp_instances`, `pyra_whatsapp_conversations`, `pyra_whatsapp_assignments` |
| **موافقات العروض** | `/dashboard/sales/approvals` | سير عمل اعتماد عروض الأسعار • موافقة/رفض • تعليقات | `pyra_quote_approvals`, `pyra_quotes` |
| **المتابعات** | `/dashboard/sales/follow-ups` | تذكيرات متابعة • حالة (بانتظار/مكتمل/ملغى) • ربط بعميل محتمل | `pyra_sales_follow_ups` |
| **تقارير المبيعات** | `/dashboard/sales/reports` | معدل التحويل • أداء المندوبين • مصادر العملاء • تحليلات | `pyra_sales_leads`, `pyra_lead_activities` |
| **إعدادات المبيعات** | `/dashboard/sales/settings` | مراحل Pipeline • تسميات • إعدادات واتساب | `pyra_sales_pipeline_stages`, `pyra_sales_labels` |

#### ← روابط التكامل:
- **عميل محتمل → عميل**: تحويل تلقائي (ينشئ `pyra_clients` ويربط `client_id`)
- **عميل محتمل → عرض أسعار**: إنشاء عرض من بيانات العميل المحتمل
- **موافقة عرض → إشعار**: إيميل تلقائي للمندوب عند الموافقة/الرفض
- **واتساب → عميل محتمل**: ربط رسائل بسجل العميل المحتمل

---

### 5. الموارد البشرية (HR)

| الشاشة | المسار | المميزات | الجداول |
|--------|--------|----------|---------|
| **ساعات العمل** | `/dashboard/timesheet` | تسجيل ساعات عمل • ربط بمشروع ومهمة • أوفرتايم • قابل للفوترة • فترات (أسبوعي/شهري) | `pyra_timesheets`, `pyra_timesheet_periods` |
| **الحضور** | `/dashboard/attendance` | تسجيل دخول/خروج • موقع جغرافي + IP • تقويم شهري • إحصائيات | `pyra_attendance` |
| **الإجازات** | `/dashboard/leave` | طلب إجازة • أرصدة (سنوية/مرضية/شخصية) • سير عمل موافقة • أنواع ديناميكية | `pyra_leave_requests`, `pyra_leave_balances_v2`, `pyra_leave_types` |
| **إعدادات الإجازات** | `/dashboard/leave/settings` | إدارة أنواع الإجازات • أيام افتراضية • ترحيل • مرفقات مطلوبة • مدفوعة/غير مدفوعة | `pyra_leave_types` |
| **كشف راتبي** | `/dashboard/my-payslips` | عرض كشوف الرواتب الشخصية • تفاصيل (أساسي + إضافي - خصومات = صافي) | `pyra_payroll_items`, `pyra_payroll_runs` |
| **دليل الفريق** | `/dashboard/directory` | بطاقات الموظفين • بحث وفلتر • معلومات الاتصال • الحالة | `pyra_users`, `pyra_roles` |
| **الإعلانات** | `/dashboard/announcements` | إعلانات الشركة • أولويات (عادي/مهم/عاجل) • استهداف حسب الدور • تتبع القراءة | `pyra_announcements`, `pyra_announcement_reads` |
| **الهيكل التنظيمي** | `/dashboard/org-chart` | شجرة تنظيمية تفاعلية • تبعيات الإدارة | `pyra_users`, `pyra_teams` |
| **تقييم الأداء** | `/dashboard/evaluations` | تقييمات (مدير/ذاتي/أقران) • معايير مرجحة • فترات تقييم • نتائج ومراجعة | `pyra_evaluations`, `pyra_evaluation_scores`, `pyra_evaluation_criteria` |
| **إعدادات التقييم** | `/dashboard/evaluations/settings` | فترات التقييم • معايير التقييم • أوزان | `pyra_evaluation_periods`, `pyra_evaluation_criteria` |

#### ← روابط التكامل:
- **ساعات عمل → مشروع**: حساب تكلفة العمالة لربحية المشروع
- **إجازة غير مدفوعة → رواتب**: خصم تلقائي (`daily_rate = salary / 22`)
- **رواتب → مصاريف**: عند اعتماد الرواتب تُنشأ مصاريف بتصنيف `ec_salaries`
- **تقييم → مكافأة**: اقتراح مكافأة تلقائي (rating ≥ 4.0 → 10%, ≥ 4.5 → 15%)
- **حضور → تقارير**: إحصائيات شهرية (حاضر/غائب/متأخر)

---

### 6. المالية (Finance)

| الشاشة | المسار | المميزات | الجداول |
|--------|--------|----------|---------|
| **الإدارة المالية** | `/dashboard/finance` | نظرة عامة مالية • 5 تنبيهات ذكية • إيرادات vs مصاريف • توزيع المصاريف | `pyra_invoices`, `pyra_expenses`, `pyra_subscriptions` |
| **المصاريف** | `/dashboard/finance/expenses` | CRUD • تصنيفات • ضريبة VAT • ربط بمورد ومشروع • سير عمل اعتماد • فلتر متقدم | `pyra_expenses`, `pyra_expense_categories`, `pyra_suppliers` |
| **الاشتراكات** | `/dashboard/finance/subscriptions` | SaaS/خدمات • تجديد تلقائي → مصروف • ربط ببطاقة • تنبيه تجديد قريب | `pyra_subscriptions`, `pyra_cards` |
| **البطاقات** | `/dashboard/finance/cards` | بطاقات الدفع • آخر 4 أرقام • تاريخ انتهاء • البنك | `pyra_cards` |
| **العقود** | `/dashboard/finance/contracts` | CRUD • مراحل (milestones) • هيكل فوترة • retainer • تتبع المفوتر والمحصّل | `pyra_contracts`, `pyra_contract_milestones` |
| **الفواتير المتكررة** | `/dashboard/finance/recurring` | قوالب فوترة دورية • دورة (شهري/ربعي/سنوي) • إنشاء تلقائي | `pyra_recurring_invoices` |
| **إشعارات دائنة** | `/dashboard/finance/credit-notes` | CRUD • ربط بفاتورة • تطبيق على رصيد العميل | `pyra_credit_notes`, `pyra_credit_note_items` |
| **الموردين** | `/dashboard/finance/suppliers` | سجل الموردين • بيانات بنكية • شروط دفع • تاريخ المشتريات | `pyra_suppliers` |
| **أوامر الشراء** | `/dashboard/finance/purchase-orders` | PO كامل • بنود • حالات (مسودة→مرسل→مستلم→مفوتر) • تحويل لمصروف عند الاستلام | `pyra_purchase_orders`, `pyra_purchase_order_items` |
| **التقارير المالية** | `/dashboard/finance/reports` | P&L (ربح وخسارة) • VAT • Aging • Cashflow • ربحية العملاء • ربحية المشاريع | `pyra_invoices`, `pyra_expenses`, `pyra_payments` |
| **أهداف الإيرادات** | `/dashboard/finance/targets` | أهداف شهرية/ربعية/سنوية • مقارنة بالفعلي • نسبة الإنجاز | `pyra_revenue_targets` |
| **الرواتب** | `/dashboard/payroll` | دورات رواتب شهرية • حساب تلقائي (أساسي + أوفرتايم + مكافآت + عمولات - خصومات) • اعتماد → صرف • تاب المدفوعات (إضافة عمولة/مهمة/مكافأة/خصم مباشرة) | `pyra_payroll_runs`, `pyra_payroll_items`, `pyra_employee_payments` |

#### ← روابط التكامل:
- **رواتب معتمدة → مصاريف**: إنشاء تلقائي بتصنيف `ec_salaries`
- **أمر شراء مستلم → مصروف**: إنشاء تلقائي من بيانات PO
- **اشتراك متجدد → مصروف**: إنشاء تلقائي بتصنيف `ec_subscriptions`
- **فاتورة → عمولة**: عند الدفع (يدوي أو Stripe) → حساب عمولة للموظفين
- **عقد → فاتورة**: تتبع `amount_billed` عند إنشاء فاتورة مرتبطة
- **دفعة → عقد**: تحديث `amount_collected` تلقائياً
- **P&L**: تقسيم المصاريف (رواتب / تشغيلية / اشتراكات) عبر `category_id`
- **ربحية المشروع**: إيرادات - مصاريف مباشرة - تكلفة عمالة (من timesheets)
- **سعر الصرف**: USD=3.76, EUR=4.12, SAR=1.0027, GBP=4.75 (ثابت)

---

### 7. إدارة الفريق

| الشاشة | المسار | المميزات | الجداول |
|--------|--------|----------|---------|
| **المستخدمون** | `/dashboard/users` | CRUD • أدوار • راتب • نوع دفع (ثابت/ساعة/عمولة) • حالة نشط/غير نشط | `pyra_users`, `pyra_roles`, `pyra_auth_mapping` |
| **تفاصيل الموظف** | `/dashboard/users/[username]` | كشف الحساب (جميع المدفوعات/العمولات) • المشاريع المرتبطة • بيانات التوظيف والتعويضات والبنك • إحصائيات (مدفوع/معلق/عدد) | `pyra_employee_payments`, `pyra_users`, `pyra_projects` |
| **الفرق** | `/dashboard/teams` | CRUD • أعضاء • صلاحيات المجلدات | `pyra_teams`, `pyra_team_members` |
| **الأدوار** | `/dashboard/roles` | CRUD • صلاحيات مخصصة • ألوان وأيقونات | `pyra_roles` |
| **الصلاحيات** | `/dashboard/permissions` | عرض مصفوفة الصلاحيات • Legacy (مؤرشف) | `pyra_roles` |

---

### 8. الأدوات

| الشاشة | المسار | المميزات | الجداول |
|--------|--------|----------|---------|
| **الإعدادات** | `/dashboard/settings` | 10 مجموعات إعدادات • شريط جانبي • بحث • إرشادات سياقية • مؤشرات إكمال | `pyra_settings` |
| **التقارير** | `/dashboard/reports` | تقارير شاملة للنظام | متعددة |
| **الأتمتة** | `/dashboard/automations` | قواعد أتمتة • 3 قوالب جاهزة • شروط + إجراءات • سجل تنفيذ | `pyra_automation_rules`, `pyra_automation_log` |
| **قاعدة المعرفة** | `/dashboard/knowledge-base` | مقالات مساعدة • تصنيفات • بحث • متاح للعملاء عبر البورتال | `pyra_kb_articles`, `pyra_kb_categories` |
| **التكاملات** | `/dashboard/integrations` | Webhooks صادرة • مفاتيح API • اختبار وإعادة إرسال | `pyra_webhooks`, `pyra_webhook_deliveries`, `pyra_api_keys` |

---

### 9. الأمان والمراقبة

| الشاشة | المسار | المميزات | الجداول |
|--------|--------|----------|---------|
| **سجل النشاط** | `/dashboard/activity` | كل عمليات النظام • فلتر بالنوع والمستخدم والتاريخ • تصدير CSV | `pyra_activity_log` |
| **سجل الدخول** | `/dashboard/login-history` | محاولات الدخول (ناجح/فاشل) • IP • المتصفح • المصدر (إدارة/بورتال) | `pyra_login_attempts` |
| **الجلسات** | `/dashboard/sessions` | الجلسات النشطة • إنهاء جلسة • إنهاء الكل | `pyra_sessions` |

---

## الجزء الثاني: بورتال العميل (Client Portal)

### المصادقة
- نظام مصادقة **منفصل تماماً** عن لوحة الإدارة
- **Cookie-based sessions** (ليس JWT)
- دعم مزدوج: Supabase Auth (جديد) أو bcrypt (legacy)
- Rate limiting: 5 محاولات / 15 دقيقة لكل IP
- Token SHA-256 مخزن في `pyra_sessions`

### الصفحات

| الشاشة | المسار | المميزات |
|--------|--------|----------|
| **تسجيل الدخول** | `/portal/login` | إيميل + كلمة مرور • rate limiting |
| **نسيت كلمة المرور** | `/portal/forgot-password` | إرسال رابط إعادة تعيين |
| **إعادة تعيين كلمة المرور** | `/portal/reset-password` | تعيين كلمة مرور جديدة |
| **لوحة التحكم** | `/portal/` | إحصائيات • ملخص مالي • رسم بياني أسبوعي • تقدم المشاريع |
| **المشاريع** | `/portal/projects` | مشاريع العميل • حالات • تقدم |
| **تفاصيل المشروع** | `/portal/projects/[id]` | ملفات • تعليقات (@mentions) • أعضاء الفريق |
| **الملفات** | `/portal/files` | كل الملفات المشتركة • تنزيل • معاينة • موافقة/طلب تعديل |
| **الفواتير** | `/portal/invoices` | قائمة الفواتير • حالات |
| **تفاصيل الفاتورة** | `/portal/invoices/[id]` | تفاصيل + دفع عبر Stripe |
| **عروض الأسعار** | `/portal/quotes` | عرض + توقيع رقمي (مع IP) |
| **العقود** | `/portal/contracts` | عقود العميل • مراحل • حالات |
| **تفاصيل العقد** | `/portal/contracts/[id]` | بنود + مراحل + فواتير مرتبطة |
| **الفواتير المتكررة** | `/portal/recurring` | قوالب الفوترة الدورية |
| **كشف الحساب** | `/portal/statement` | تاريخ الفواتير + المدفوعات + الرصيد المتبقي |
| **السكريبتات** | `/portal/scripts` | نظام مراجعة النصوص (مقيّد لعملاء محددين) |
| **الإشعارات** | `/portal/notifications` | إشعارات العميل |
| **المساعدة** | `/portal/help` | قاعدة المعرفة |
| **الملف الشخصي** | `/portal/profile` | تعديل البيانات وكلمة المرور |

### برندنج مخصص لكل عميل
```
pyra_client_branding:
  - primary_color (افتراضي: #f97316)
  - secondary_color
  - logo_url
  - favicon_url
  - company_name_display
  - login_background_url
```

#### ← روابط التكامل مع لوحة الإدارة:
- **الملفات**: العميل يرى ملفات مشروعه فقط (`client_visible = true`)
- **الموافقة**: العميل يوافق/يطلب تعديل → إشعار للإدارة
- **التعليقات**: ثنائية الاتجاه (عميل ↔ فريق) مع @mentions
- **التوقيع**: العميل يوقع عرض الأسعار → تحديث حالة العرض + تسجيل IP
- **الدفع**: Stripe Checkout → webhook → تسجيل دفعة → تحديث فاتورة → عمولة
- **الإشعارات**: تُرسل من الإدارة/Stripe/الأتمتة → تظهر في بورتال العميل

---

## الجزء الثالث: التكاملات الخارجية

### 1. API الخارجي (n8n / Telegram Bot)

```
المصادقة: X-Api-Key header → SHA-256 hash → pyra_api_keys
```

| Endpoint | الطريقة | الصلاحية | الوصف |
|----------|---------|---------|-------|
| `/api/external/status` | GET | أي مفتاح | التحقق من المفتاح |
| `/api/external/invoices` | GET | `invoices:read` | قائمة الفواتير |
| `/api/external/invoices` | POST | `invoices:create` | إنشاء فاتورة |
| `/api/external/invoices/[id]/send` | POST | `invoices:send` | إرسال فاتورة |
| `/api/external/expenses` | GET | `expenses:read` | قائمة المصاريف |
| `/api/external/expenses` | POST | `expenses:create` | إنشاء مصروف (مطابقة تلقائية للمورد بالاسم) |
| `/api/external/expenses/categories` | GET | `expenses:read` | تصنيفات المصاريف |
| `/api/external/subscriptions` | GET | `subscriptions:read` | قائمة الاشتراكات |
| `/api/external/subscriptions` | POST | `subscriptions:create` | إنشاء اشتراك |
| `/api/external/alerts` | GET | `alerts:read` | التنبيهات المالية الذكية |

### 2. Stripe

```
الأحداث المعالجة في Webhook:
```

| الحدث | الإجراء |
|-------|---------|
| `checkout.session.completed` | تسجيل دفعة → تحديث فاتورة → إشعار عميل → تحديث عقد → حساب عمولة |
| `checkout.session.expired` | تحديث حالة → cancelled |
| `charge.refunded` | دفعة سلبية → إعادة حساب فاتورة → إشعار عميل |
| `charge.dispute.created` | إشعار عاجل للإدارة |
| `charge.dispute.closed` | لو خسرنا: دفعة سلبية + إعادة حساب |
| `payment_intent.payment_failed` | إشعار للعميل والإدارة |

### 3. نظام الأتمتة

```
المحرك: processEvent(event) → تقييم الشروط → تنفيذ الإجراءات
```

| نوع الإجراء | الوصف |
|-------------|-------|
| `create_notification` | إنشاء إشعار داخلي |
| `change_project_status` | تغيير حالة مشروع |
| `log_activity` | تسجيل في سجل النشاط |
| `send_email` | إرسال إيميل |
| `fire_webhook` | إطلاق webhook صادر |

**القوالب الجاهزة:**
1. إشعار عند رفع ملف
2. تذكير فاتورة متأخرة
3. إشعار عند توقيع عرض أسعار

### 4. Webhooks الصادرة

```
التوقيع: HMAC-SHA256
إعادة المحاولة: 1 دقيقة → 5 دقائق → 15 دقيقة (3 محاولات)
```

### 5. نظام الإيميل (SMTP)

| القالب | المستلم | المناسبة |
|--------|---------|---------|
| `fileUploaded` | العميل | رفع ملف لمشروعه |
| `approvalUpdate` | الإدارة | العميل راجع ملف |
| `newComment` | الإدارة | العميل علّق |
| `welcomeUser` | مستخدم جديد | إنشاء حساب |
| `projectStatusChanged` | العميل | تغيير حالة مشروع |
| `quoteApproved` | المندوب | موافقة على عرض |
| `quoteRejected` | المندوب | رفض عرض |
| `leadAssigned` | المندوب | تحويل عميل محتمل |
| `invoiceReminder` | العميل | تذكير فاتورة |

---

## الجزء الرابع: خريطة تدفق البيانات

### سلسلة المبيعات الكاملة
```
عميل محتمل (Lead)
    │
    ▼ تحويل
عميل (Client)
    │
    ├──→ عرض أسعار (Quote) ──→ موافقة (Approval) ──→ توقيع رقمي
    │                                                      │
    │                                                      ▼
    ├──→ مشروع (Project) ◄──────────────────────── عقد (Contract)
    │       │                                          │
    │       ├──→ لوحة عمل (Board) ──→ مهام (Tasks)    ├──→ مراحل (Milestones)
    │       ├──→ ملفات (Files) ──→ موافقة عميل        │
    │       ├──→ تعليقات (Comments)                    │
    │       └──→ ساعات عمل (Timesheets)               │
    │                                                  │
    ▼                                                  ▼
فاتورة (Invoice) ◄──────────────────── فاتورة متكررة (Recurring)
    │
    ├──→ دفع يدوي (Payment)
    ├──→ Stripe Checkout ──→ Webhook ──→ دفعة تلقائية
    │                                        │
    │                                        ├──→ تحديث عقد (amount_collected)
    │                                        └──→ عمولة (Commission)
    │
    └──→ إشعار دائن (Credit Note)
```

### سلسلة الموارد البشرية
```
موظف (User)
    │
    ├──→ حضور (Attendance) ──→ تقارير شهرية
    ├──→ إجازات (Leave) ──→ خصم من الراتب (لو غير مدفوعة)
    ├──→ ساعات عمل (Timesheet) ──→ تكلفة عمالة → ربحية المشروع
    ├──→ تقييم أداء (Evaluation) ──→ مكافأة مقترحة
    │
    ▼
دورة رواتب (Payroll Run)
    │
    ├──→ حساب تلقائي (أساسي + أوفرتايم + مكافآت - خصومات)
    ├──→ اعتماد ──→ مصاريف (category: ec_salaries)
    └──→ صرف ──→ كشف راتب للموظف
```

### سلسلة المشتريات
```
مورد (Supplier)
    │
    ▼
أمر شراء (PO)
    │
    ├──→ مرسل ──→ مستلم ──→ مصروف تلقائي
    └──→ بنود ──→ ضريبة VAT
```

---

## الجزء الخامس: قاعدة البيانات (100 جدول)

### تجميع حسب المجال

| المجال | عدد الجداول | الجداول الرئيسية |
|--------|------------|-----------------|
| الهوية والمصادقة | 7 | `pyra_users`, `pyra_roles`, `pyra_clients`, `pyra_sessions`, `pyra_auth_mapping` |
| الملفات | 7 | `pyra_file_index`, `pyra_file_versions`, `pyra_favorites`, `pyra_share_links`, `pyra_reviews`, `pyra_trash` |
| المشاريع والتعاون | 10+ | `pyra_projects`, `pyra_project_files`, `pyra_boards`, `pyra_tasks`, `pyra_client_comments` |
| المالية | 15+ | `pyra_invoices`, `pyra_payments`, `pyra_expenses`, `pyra_contracts`, `pyra_quotes`, `pyra_subscriptions` |
| الموارد البشرية | 15+ | `pyra_attendance`, `pyra_leave_requests`, `pyra_timesheets`, `pyra_payroll_runs`, `pyra_evaluations` |
| المبيعات CRM | 8+ | `pyra_sales_leads`, `pyra_whatsapp_messages`, `pyra_quote_approvals`, `pyra_sales_follow_ups` |
| النظام والبنية | 10+ | `pyra_activity_log`, `pyra_notifications`, `pyra_settings`, `pyra_automation_rules`, `pyra_webhooks` |

### العلاقات الرئيسية (Foreign Keys)

```
pyra_clients.id
  ← pyra_projects.client_id
  ← pyra_invoices.client_id
  ← pyra_quotes.client_id
  ← pyra_contracts.client_id
  ← pyra_client_branding.client_id
  ← pyra_sales_leads.client_id (بعد التحويل)

pyra_projects.id
  ← pyra_project_files.project_id
  ← pyra_boards.project_id (CASCADE)
  ← pyra_timesheets.project_id
  ← pyra_expenses.project_id
  ← pyra_invoices.project_id
  ← pyra_contracts.project_id
  ← pyra_purchase_orders.project_id

pyra_invoices.id
  ← pyra_payments.invoice_id
  ← pyra_stripe_payments.invoice_id
  ← pyra_credit_notes.invoice_id

pyra_contracts.id
  ← pyra_contract_milestones.contract_id
  ← pyra_recurring_invoices.contract_id

pyra_suppliers.id
  ← pyra_expenses.supplier_id
  ← pyra_purchase_orders.supplier_id

pyra_payroll_runs.id
  ← pyra_payroll_items.payroll_id
  ← pyra_expenses.payroll_run_id
```

---

## الجزء السادس: نظام الصلاحيات (RBAC)

### 79 صلاحية عبر 34 وحدة

| الوحدة | الصلاحيات |
|--------|----------|
| `dashboard` | `.view` |
| `files` | `.view`, `.upload`, `.edit`, `.delete`, `.share` |
| `projects` | `.view`, `.create`, `.edit`, `.delete` |
| `clients` | `.view`, `.create`, `.edit`, `.delete` |
| `quotes` | `.view`, `.create`, `.edit`, `.delete` |
| `invoices` | `.view`, `.create`, `.edit`, `.delete` |
| `finance` | `.view`, `.manage` |
| `users` | `.view`, `.manage` |
| `roles` | `.view`, `.manage` |
| `teams` | `.view`, `.manage` |
| `settings` | `.view`, `.manage` |
| `reports` | `.view` |
| `automations` | `.view`, `.manage` |
| `knowledge_base` | `.view`, `.manage` |
| `integrations` | `.view`, `.manage` |
| `activity` | `.view` |
| `trash` | `.view`, `.restore`, `.purge` |
| `sessions` | `.view`, `.manage` |
| `reviews` | `.view`, `.manage` |
| `notifications` | `.view` |
| `favorites` | `.view`, `.manage` |
| `script_reviews` | `.view`, `.manage` |
| `boards` | `.view`, `.manage` |
| `tasks` | `.view`, `.create`, `.manage` |
| `directory` | `.view` |
| `timesheet` | `.view`, `.manage`, `.approve` |
| `announcements` | `.view`, `.manage` |
| `leave` | `.view`, `.manage`, `.approve` |
| `attendance` | `.view`, `.manage` |
| `payroll` | `.view`, `.manage` |
| `evaluations` | `.view`, `.manage` |
| `overtime` | `.view`, `.manage` |
| `work_schedules` | `.view`, `.manage` |
| `leave_types` | `.view`, `.manage` |
| `employee_payments` | `.view`, `.manage` |
| `content_pipeline` | `.view`, `.manage` |
| `sales` | `.view`, `.manage` |
| `sales_leads` | `.view`, `.create`, `.manage` |
| `sales_whatsapp` | `.view`, `.send` |
| `sales_pipeline` | `.manage` |
| `quote_approvals` | `.view`, `.manage` |

### الأدوار الافتراضية

| الدور | الصلاحيات |
|-------|----------|
| `admin` | `['*']` — كل شيء |
| `employee` | dashboard, notifications, directory, timesheet, announcements, leave, attendance, payroll.view, evaluations.view, overtime.view |
| `sales_agent` | dashboard, notifications, sales CRM, quotes (view+create), clients.view |

---

## الجزء السابع: التنبيهات المالية الذكية

| النوع | المستوى | الشرط |
|-------|---------|-------|
| `subscription_renewal` | تحذير | اشتراك يتجدد خلال 7 أيام |
| `overdue_invoices` | حرج | فواتير متأخرة |
| `expiring_contract` | حرج/تحذير | عقد ينتهي خلال 7/30 يوم |
| `budget_overrun` | حرج/تحذير | مشروع تجاوز الميزانية (≥100%/≥80%) |
| `recurring_due` | معلومة | فاتورة متكررة مستحقة الإنشاء |

---

## الجزء الثامن: ملفات المشروع الرئيسية

### للتطوير المستمر — ابدأ من هنا:

| الملف | الغرض |
|-------|-------|
| `CLAUDE.md` | دليل التطوير + القواعد الإلزامية |
| `DATABASE-SCHEMA.md` | توثيق كامل لـ 100 جدول |
| `docs/SYSTEM-STRUCTURE.md` | **هذا الملف** — الهيكل الكامل |
| `lib/auth/rbac.ts` | كل الصلاحيات + `hasPermission()` |
| `lib/supabase/fields.ts` | حقول SELECT المركزية |
| `lib/config/module-guide.ts` | أدلة 50 وحدة |
| `lib/utils/currency.ts` | أسعار صرف العملات |
| `lib/finance/alerts.ts` | 5 أنواع تنبيهات مالية |
| `lib/automation/engine.ts` | محرك الأتمتة |
| `lib/email/notify.ts` | 8 إشعارات إيميل |
| `types/database.ts` | TypeScript interfaces لكل الجداول |
| `components/layout/sidebar.tsx` | القائمة الجانبية (9 مجموعات) |
| `components/layout/mobile-nav.tsx` | القائمة المتنقلة |

---

> **ملاحظة للمطور**: هذا الملف هو مرجع حي — يجب تحديثه عند إضافة أي وحدة أو شاشة أو تكامل جديد.
