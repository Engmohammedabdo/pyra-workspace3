# ITFlow — Client Portal Deep Analysis

**تاريخ التحليل:** 2026-02-14
**المصدر:** https://github.com/itflow-org/itflow
**التركيز:** Client Portal Module بالكامل

---

## 1. خريطة ملفات الـ Client Portal

```
/client/
├── includes/
│   ├── check_login.php      ← التحقق من جلسة العميل (Session Guard)
│   ├── inc_all.php           ← تحميل كل الملفات المشتركة
│   ├── header.php            ← HTML Header + Navbar
│   └── footer.php            ← HTML Footer + Scripts
├── custom/
│   └── readme.php            ← مجلد للتخصيصات
├── index.php                 ← Dashboard الرئيسي
├── post.php                  ← معالج كل الـ POST/GET requests (1242 سطر!)
├── functions.php             ← دوال خاصة بالبورتال
├── login_microsoft.php       ← تسجيل دخول عبر Microsoft/Azure
├── login_reset.php           ← إعادة تعيين كلمة المرور
├── profile.php               ← ملف تعريف العميل
├── tickets.php               ← قائمة التذاكر
├── ticket.php                ← عرض تذكرة واحدة + ردود
├── ticket_add.php            ← نموذج إضافة تذكرة جديدة
├── ticket_view_all.php       ← عرض كل التذاكر (primary/technical فقط)
├── invoices.php              ← قائمة الفواتير
├── unpaid_invoices.php        ← الفواتير غير المدفوعة
├── recurring_invoices.php     ← الفواتير المتكررة
├── saved_payment_methods.php  ← إدارة بطاقات الدفع (Stripe)
├── documents.php             ← قائمة المستندات + Upload/Create
├── document.php              ← عرض مستند واحد (مع preview)
├── contacts.php              ← إدارة جهات الاتصال
├── contact_add.php           ← إضافة جهة اتصال
├── contact_edit.php          ← تعديل جهة اتصال
├── assets.php                ← عرض الأصول (أجهزة وغيرها)
├── domains.php               ← عرض الدومينات
├── certificates.php          ← عرض الشهادات
└── quotes.php                ← عرض عروض الأسعار
```

**ملفات مساندة خارج /client/:**
- `/login.php` — صفحة تسجيل دخول موحدة (Agent + Client)
- `/guest/` — صفحات عامة بدون login (عرض فاتورة/تذكرة بـ URL key)
- `/functions.php` — دوال عامة مشتركة

---

## 2. Authentication — تسجيل دخول العميل

### A. آلية تسجيل الدخول

**صفحة واحدة موحدة:** `/login.php` (يخدم Agent + Client)

#### Flow:
1. **المستخدم يدخل email + password** في `/login.php`
2. **النظام يبحث في جدول `users`** عن الإيميل
3. **فحص `user_type`:**
   - `user_type = 1` → Agent (فريق العمل) → يروح لـ `/agent/`
   - `user_type = 2` → Client (عميل) → يروح لـ `/client/`
4. **إذا المستخدم عنده الصلاحيتين** → يظهر شاشة اختيار Role (Agent أو Client)
5. **بعد اختيار Client** → يعبي الـ Session variables

#### Session Variables للعميل:
```php
$_SESSION['client_logged_in'] = true;
$_SESSION['client_id'] = $client_id;
$_SESSION['contact_id'] = $contact_id;
$_SESSION['user_id'] = $user_id;
$_SESSION['login_method'] = 'local'; // أو 'azure'
```

### B. check_login.php — حارس الجلسة

**يُنفذ في كل صفحة** عبر `inc_all.php`:

```php
// التحقق من تسجيل الدخول
if (!isset($_SESSION['client_logged_in']) || !$_SESSION['client_logged_in']) {
    redirect("/login.php");
}

// التحقق من نوع المستخدم (يجب أن يكون 2 = Client)
if ($session_user_type !== 2) {
    session_unset(); session_destroy();
    redirect("/login.php");
}

// التحقق من حالة المستخدم (نشط)
if ($session_user_status !== 1) { /* logout */ }

// التحقق من عدم الأرشفة
if ($session_user_archived_at !== null) { /* logout */ }
```

**يحمّل أيضاً:**
- بيانات الشركة من `companies` (اسم، عملة، لوجو)
- بيانات جهة الاتصال من `contacts` (اسم، إيميل، صلاحيات)
- بيانات العميل من `clients`

### C. Security Measures

| الإجراء | التفاصيل |
|---------|----------|
| **Brute Force** | IP lockout بعد 15 محاولة فاشلة خلال 10 دقائق |
| **HTTPS** | إجباري (configurable) + cookie secure flag |
| **HTTP-Only Cookies** | `ini_set("session.cookie_httponly", true)` |
| **CSP** | `Content-Security-Policy: default-src 'self'` في كل صفحة |
| **X-Frame-Options** | `DENY` في الـ header |
| **XSS Prevention** | HTMLPurifier لتنظيف المحتوى |
| **SQL Injection** | `intval()` للأرقام + `sanitizeInput()` للنصوص |
| **TOTP/MFA** | مدعوم عبر `plugins/totp/totp.php` |
| **Azure SSO** | دعم تسجيل دخول عبر Microsoft Azure |
| **Input Sanitization** | `sanitizeInput()`, `nullable_htmlentities()` |
| **File Upload Validation** | `checkFileUpload()` مع allowed extensions |

### D. الفرق بين Agent Login و Client Login

| الخاصية | Agent | Client |
|---------|-------|--------|
| `user_type` | 1 | 2 |
| المسار | `/agent/` | `/client/` |
| الصلاحيات | كاملة (CRUD على كل شيء) | محدودة (قراءة + تذاكر) |
| check_login | `/agent/includes/check_login.php` | `/client/includes/check_login.php` |
| Session var | `$_SESSION['logged_in']` | `$_SESSION['client_logged_in']` |

---

## 3. Client Dashboard — index.php

### ما يراه العميل عند الدخول:

#### A. زر New Ticket (دائماً ظاهر)
```html
<a href="ticket_add.php" class="btn btn-primary btn-block mb-3">New ticket</a>
```

#### B. Billing Cards (Primary + Billing contacts فقط)

| Card | SQL Query | الجدول |
|------|-----------|--------|
| **Account Balance** | `SUM(invoice_amount)` - `SUM(payment_amount)` | `invoices`, `payments` |
| **Recurring Monthly** | `SUM(recurring_invoice_amount) WHERE frequency='month'` | `recurring_invoices` |

#### C. Technical Cards (Primary + Technical contacts فقط)

| Card | ما يعرض | الشرط |
|------|---------|-------|
| **Domains Expiring** | الدومينات اللي تنتهي خلال 45 يوم | `domain_expire > NOW AND < NOW + 45 DAY` |
| **Certificates Expiring** | الشهادات اللي تنتهي خلال 45 يوم | نفس الشرط |
| **Licenses Expiring** | التراخيص اللي تنتهي | من جدول `software` |
| **Asset Warranties Expiring** | ضمانات الأصول | `asset_warranty_expire` |
| **Assets Retiring** | أصول عمرها 7 سنوات | `asset_install_date + 7 YEAR` |
| **Domains Expired** | دومينات منتهية | `domain_expire < NOW` |
| **Certificates Expired** | شهادات منتهية | |
| **Licenses Expired** | تراخيص منتهية | |
| **Asset Warranties Expired** | ضمانات منتهية | |
| **Retired Assets** | أصول متقاعدة (+7 سنوات) | |

#### D. Everyone Cards (كل المستخدمين)

| Card | ما يعرض |
|------|---------|
| **Assigned Assets** | الأصول المخصصة لجهة الاتصال الحالية |

### SQL Queries في Dashboard:

```sql
-- Balance
SELECT SUM(invoice_amount) FROM invoices WHERE invoice_client_id = ? AND invoice_status NOT IN ('Draft','Cancelled','Non-Billable')
SELECT SUM(payment_amount) FROM payments, invoices WHERE payment_invoice_id = invoice_id AND invoice_client_id = ?

-- Monthly Recurring
SELECT SUM(recurring_invoice_amount) FROM recurring_invoices WHERE recurring_invoice_status = 1 AND recurring_invoice_frequency = 'month' AND recurring_invoice_client_id = ?

-- Yearly Recurring (÷12 for monthly view)
SELECT SUM(recurring_invoice_amount) FROM recurring_invoices WHERE recurring_invoice_status = 1 AND recurring_invoice_frequency = 'year' AND recurring_invoice_client_id = ?

-- Domains Expiring
SELECT * FROM domains WHERE domain_client_id = ? AND domain_expire > CURRENT_DATE AND domain_expire < CURRENT_DATE + INTERVAL 45 DAY AND domain_archived_at IS NULL

-- Certificates Expiring
SELECT * FROM certificates WHERE certificate_client_id = ? AND certificate_expire > CURRENT_DATE AND certificate_expire < CURRENT_DATE + INTERVAL 45 DAY

-- Assigned Assets
SELECT * FROM assets WHERE asset_contact_id = ? AND asset_archived_at IS NULL
```

---

## 4. Tickets/Support System

### A. قائمة التذاكر (tickets.php)

**الصلاحيات:**
- كل Contact يشوف تذاكره فقط (`ticket_contact_id = $session_contact_id`)
- Primary + Technical contacts يقدرون يشوفون كل التذاكر عبر "All Tickets" link

**الفلترة:**
- Open (default): `ticket_closed_at IS NULL`
- Closed: `ticket_closed_at IS NOT NULL`
- All: `ticket_status LIKE '%'`

**SQL:**
```sql
SELECT ticket_id, ticket_prefix, ticket_number, ticket_subject, ticket_status_name
FROM tickets
LEFT JOIN contacts ON ticket_contact_id = contact_id
LEFT JOIN ticket_statuses ON ticket_status = ticket_status_id
WHERE ticket_closed_at IS NULL AND ticket_contact_id = ? AND ticket_client_id = ?
ORDER BY ticket_id DESC
```

### B. إنشاء تذكرة (ticket_add.php + post.php)

**الحقول:**
- Subject (مطلوب)
- Priority: Low / Medium / High (مطلوب)
- Category: من جدول `categories WHERE category_type = 'Ticket'`
- Asset: من أصول العميل المخصصة
- Details: rich text (TinyMCE)

**عند الإنشاء (post.php):**
1. توليد `ticket_number` ذري (atomic increment)
2. توليد `url_key` عشوائي (32 حرف)
3. `INSERT INTO tickets` مع `ticket_source = 'Portal'`
4. إرسال إشعار بريد للفريق (إذا مفعّل)
5. `customAction('ticket_create', $ticket_id)` — webhook/action
6. `logAction()` — تسجيل في السجل

### C. عرض تذكرة (ticket.php)

**المحتويات:**
- Subject, Status, Priority, Category
- Assigned tech name
- Ticket details (HTML purified)
- Attachments (download + view links)
- Task approvals (approve/reject)
- Reply form (TinyMCE + file upload)
- Ticket lifecycle: Reply → Resolve → Reopen/Close → Feedback (Good/Bad)
- Reply history (مرتبة من الأحدث)

**Lifecycle States:**
```
Open → Resolved → Closed → Feedback (Good/Bad)
         ↓
       Reopen → Open
```

**Reply SQL:**
```sql
SELECT * FROM ticket_replies
LEFT JOIN users ON ticket_reply_by = user_id
LEFT JOIN contacts ON ticket_reply_by = contact_id
WHERE ticket_reply_ticket_id = ? AND ticket_reply_archived_at IS NULL AND ticket_reply_type != 'Internal'
ORDER BY ticket_reply_id DESC
```

### D. دوال التذاكر (functions.php)

```php
function verifyContactTicketAccess($ticket_id, $expected_ticket_state)
```
- يتحقق أن التذكرة تخص نفس الـ client
- يتحقق أن الـ contact هو صاحب التذكرة أو Primary أو Technical contact
- يتحقق من حالة التذكرة (Open/Closed)

### E. Post Actions للتذاكر

| Action | Method | ما يسوي |
|--------|--------|---------|
| `add_ticket` | POST | إنشاء تذكرة جديدة |
| `add_ticket_comment` | POST | رد على تذكرة + مرفقات |
| `resolve_ticket` | GET | تحديد التذكرة كمحلولة |
| `reopen_ticket` | GET | إعادة فتح التذكرة |
| `close_ticket` | GET | إغلاق التذكرة نهائياً |
| `add_ticket_feedback` | POST | تقييم (Good/Bad) |
| `approve_ticket_task` | GET | الموافقة على مهمة |

---

## 5. Invoicing — الفواتير

### A. قائمة الفواتير (invoices.php)

**الصلاحيات:** Primary + Billing contacts فقط

**SQL:**
```sql
SELECT * FROM invoices WHERE invoice_client_id = ? AND invoice_status != 'Draft' ORDER BY invoice_date DESC
```

**الأعمدة المعروضة:** #, Scope, Amount, Date, Due, Status

**Status Colors:**
- Sent → warning (أصفر)
- Viewed → info (أزرق)
- Partial → primary
- Paid → success (أخضر)
- Cancelled → danger (أحمر)
- Overdue → text-danger bold

**عرض الفاتورة:** يفتح في tab جديد عبر `guest_view_invoice.php?invoice_id=X&url_key=Y`

### B. الدفع

#### Stripe Integration (كامل!):
1. **إنشاء Stripe Customer** → `create_stripe_customer` في post.php
2. **حفظ بطاقة** → Stripe Checkout Embedded → `stripe_save_card`
3. **الدفع التلقائي** → `add_payment_by_provider` — PaymentIntent API
4. **حذف بطاقة** → `delete_saved_payment` — detach من Stripe
5. **Auto-Pay لفواتير متكررة** → `set_recurring_payment`

**Saved Payment Methods page (saved_payment_methods.php):**
- إنشاء Stripe Customer (يتطلب موافقة)
- إضافة بطاقة عبر Stripe Checkout
- عرض البطاقات المحفوظة مع brand icon
- حذف بطاقة
- ربط بطاقة بفاتورة متكررة

---

## 6. Documents — المستندات

### A. قائمة المستندات (documents.php)

**الصلاحيات:** Primary + Technical contacts فقط

**SQL:**
```sql
SELECT document_id, document_name, document_created_at, folder_name
FROM documents
LEFT JOIN folders ON document_folder_id = folder_id
WHERE document_client_visible = 1 AND document_client_id = ? AND document_archived_at IS NULL
ORDER BY folder_id, document_name DESC
```

### B. إنشاء مستند جديد (Modal)
- **Document Name** (مطلوب)
- **Description** (اختياري)
- **Content** (textarea — مطلوب)
- يُحفظ في جدول `documents` مع `document_client_visible = 1`

### C. رفع ملف (Upload Modal)
- **Document Name** (مطلوب)
- **Description** (اختياري)
- **File** (PDF, Word, Text — مطلوب)
- يُنشئ record في `documents` + `files` + `document_files` (ربط)

### D. عرض مستند (document.php)

**يدعم:**
- **PDF:** عرض مباشر عبر `<embed>` + download + open in new tab
- **Images:** عرض مباشر عبر `<img>` + download
- **Other files:** عرض icon + metadata + download
- **Text documents:** عرض HTML content مع HTMLPurifier

**SQL:**
```sql
-- المستند
SELECT document_id, document_name, document_content, document_description
FROM documents
WHERE document_id = ? AND document_client_visible = 1 AND document_client_id = ? AND document_archived_at IS NULL

-- الملفات المرتبطة
SELECT f.file_id, f.file_name, f.file_reference_name, f.file_ext, f.file_size, f.file_mime_type
FROM files f
INNER JOIN document_files df ON f.file_id = df.file_id
WHERE df.document_id = ? AND f.file_client_id = ?
```

---

## 7. Contact Management — إدارة جهات الاتصال

**الصلاحيات:** Primary + Technical contacts فقط

### A. قائمة (contacts.php)
```sql
SELECT contact_id, contact_name, contact_email, contact_primary, contact_technical, contact_billing
FROM contacts WHERE contact_client_id = ? AND contact_archived_at IS NULL
```

### B. إضافة جهة اتصال (contact_add.php + post.php)
- Name, Email, Technical flag, Billing flag, Auth method
- يُنشئ user account تلقائياً (random password)
- يتحقق من عدم تكرار الإيميل

### C. تعديل جهة اتصال (contact_edit.php + post.php)
- نفس الحقول
- لا يمكن تعديل Primary contact
- يحدّث الـ user record المربوط

---

## 8. Profile — الملف الشخصي

**profile.php** يعرض:
- Name, Email, PIN, Client name
- أدوار: Primary / Technical / Billing
- Login method, User ID
- **تغيير كلمة المرور** (للـ local auth فقط)

---

## 9. باقي الصفحات

| الصفحة | الوظيفة | الصلاحية |
|--------|---------|----------|
| `assets.php` | عرض الأصول المخصصة | الكل |
| `domains.php` | عرض الدومينات | Primary/Technical |
| `certificates.php` | عرض الشهادات | Primary/Technical |
| `quotes.php` | عرض عروض الأسعار | Primary/Billing |
| `recurring_invoices.php` | الفواتير المتكررة + Auto-Pay | Primary/Billing |
| `unpaid_invoices.php` | الفواتير غير المدفوعة | Primary/Billing |

---

## 10. Navigation Structure (header.php)

```
Navbar (dark):
├── Home (index.php)
├── Tickets (tickets.php)
├── Finance ▾ (Primary/Billing only, if accounting module enabled)
│   ├── Invoices
│   ├── Recurring Invoices
│   ├── Quotes
│   └── Saved Payments
├── Technical ▾ (Primary/Technical only, if ITDoc module enabled)
│   ├── Contacts
│   ├── Assets
│   ├── Documents
│   ├── Domains
│   ├── Certificates
│   └── All Tickets
├── Custom Links (from DB)
└── User Menu ▾
    ├── Account (profile.php)
    └── Sign Out
```

**UI Framework:** AdminLTE 3 (Bootstrap 4 based)
**Icons:** FontAwesome 5
**Rich Text:** TinyMCE

---

## 11. Database Schema — الجداول المتعلقة

### A. Core Tables

#### `clients`
| Column | Type | Description |
|--------|------|-------------|
| client_id | int PK AUTO | معرف العميل |
| client_lead | tinyint(1) | هل هو lead |
| client_name | varchar(200) | اسم العميل |
| client_type | varchar(200) | نوع العميل |
| client_website | varchar(200) | الموقع |
| client_referral | varchar(200) | مصدر الإحالة |
| client_rate | decimal(15,2) | سعر الساعة |
| client_currency_code | varchar(200) | العملة |
| client_net_terms | int(10) | شروط الدفع |
| client_tax_id_number | varchar(255) | الرقم الضريبي |
| client_abbreviation | varchar(10) | اختصار |
| client_notes | text | ملاحظات |
| client_favorite | tinyint(1) | مفضل |
| client_created_at | datetime | تاريخ الإنشاء |
| client_updated_at | datetime | تاريخ التحديث |
| client_archived_at | datetime | تاريخ الأرشفة |
| client_accessed_at | datetime | آخر وصول |

#### `contacts`
| Column | Type | Description |
|--------|------|-------------|
| contact_id | int PK AUTO | معرف جهة الاتصال |
| contact_name | varchar(200) | الاسم |
| contact_title | varchar(200) | المسمى الوظيفي |
| contact_email | varchar(200) | البريد |
| contact_phone | varchar(200) | الهاتف |
| contact_mobile | varchar(200) | الجوال |
| contact_photo | varchar(200) | الصورة |
| contact_pin | varchar(255) | رقم PIN |
| contact_primary | tinyint(1) | جهة اتصال رئيسية |
| contact_billing | tinyint(1) | مسؤول الفوترة |
| contact_technical | tinyint(1) | مسؤول تقني |
| contact_department | varchar(200) | القسم |
| contact_user_id | int | ربط بجدول users |
| contact_client_id | int | ربط بجدول clients |
| contact_archived_at | datetime | تاريخ الأرشفة |

#### `users`
| Column | Type | Description |
|--------|------|-------------|
| user_id | int PK AUTO | معرف المستخدم |
| user_name | varchar(200) | الاسم |
| user_email | varchar(200) | البريد |
| user_password | varchar(200) | كلمة المرور (hashed) |
| user_auth_method | varchar(200) | طريقة المصادقة (local/azure) |
| user_type | tinyint(1) | 1=Agent, 2=Client |
| user_status | tinyint(1) | 1=Active |
| user_avatar | varchar(200) | الصورة |
| user_archived_at | datetime | تاريخ الأرشفة |

### B. Ticket Tables

#### `tickets`
| Column | Type | Description |
|--------|------|-------------|
| ticket_id | int PK AUTO | معرف التذكرة |
| ticket_prefix | varchar(200) | بادئة |
| ticket_number | int | رقم التذكرة |
| ticket_source | varchar(255) | المصدر (Portal/Email/In-App) |
| ticket_subject | varchar(500) | الموضوع |
| ticket_details | longtext | التفاصيل |
| ticket_priority | varchar(200) | الأولوية |
| ticket_status | int | حالة (FK → ticket_statuses) |
| ticket_feedback | varchar(200) | تقييم (Good/Bad) |
| ticket_url_key | varchar(200) | مفتاح URL |
| ticket_created_at | datetime | تاريخ الإنشاء |
| ticket_resolved_at | datetime | تاريخ الحل |
| ticket_closed_at | datetime | تاريخ الإغلاق |
| ticket_created_by | int | منشئ (FK → users) |
| ticket_assigned_to | int | المسؤول (FK → users) |
| ticket_client_id | int | FK → clients |
| ticket_contact_id | int | FK → contacts |
| ticket_asset_id | int | FK → assets |

#### `ticket_replies`
| Column | Type |
|--------|------|
| ticket_reply_id | int PK AUTO |
| ticket_reply | longtext |
| ticket_reply_type | varchar(10) — 'Client' / 'Internal' / 'Public' |
| ticket_reply_time_worked | time |
| ticket_reply_by | int (FK → users/contacts) |
| ticket_reply_ticket_id | int (FK → tickets) |

#### `ticket_attachments`
| Column | Type |
|--------|------|
| ticket_attachment_id | int PK AUTO |
| ticket_attachment_name | varchar(255) |
| ticket_attachment_reference_name | varchar(255) |
| ticket_attachment_ticket_id | int |
| ticket_attachment_reply_id | int (nullable) |

#### `ticket_statuses`
| Column | Type |
|--------|------|
| ticket_status_id | int PK AUTO |
| ticket_status_name | varchar(200) |
| ticket_status_color | varchar(200) |

### C. Invoice/Payment Tables

#### `invoices`
| Column | Type |
|--------|------|
| invoice_id | int PK AUTO |
| invoice_prefix | varchar(200) |
| invoice_number | int |
| invoice_scope | varchar(255) |
| invoice_status | varchar(200) — Draft/Sent/Viewed/Partial/Paid/Cancelled |
| invoice_date | date |
| invoice_due | date |
| invoice_amount | decimal(15,2) |
| invoice_currency_code | varchar(200) |
| invoice_url_key | varchar(200) |
| invoice_client_id | int FK |

#### `payments`
| Column | Type |
|--------|------|
| payment_id | int PK AUTO |
| payment_date | date |
| payment_amount | decimal(15,2) |
| payment_currency_code | varchar(10) |
| payment_method | varchar(200) |
| payment_reference | varchar(200) |
| payment_account_id | int |
| payment_invoice_id | int FK |

#### `client_payment_provider`
| Column | Type |
|--------|------|
| client_id | int PK FK |
| payment_provider_id | int PK FK |
| payment_provider_client | varchar(200) — Stripe Customer ID |

#### `client_saved_payment_methods`
| Column | Type |
|--------|------|
| saved_payment_id | int PK AUTO |
| saved_payment_provider_method | varchar(200) — Stripe PM ID |
| saved_payment_description | varchar(200) |
| saved_payment_client_id | int FK |
| saved_payment_provider_id | int FK |

### D. Document Tables

#### `documents`
| Column | Type |
|--------|------|
| document_id | int PK AUTO |
| document_name | varchar(200) |
| document_description | text |
| document_content | longtext (HTML) |
| document_content_raw | longtext (fulltext indexed) |
| document_client_visible | int (1=visible to client) |
| document_folder_id | int FK |
| document_created_by | int FK |
| document_client_id | int FK |

#### `files`
| Column | Type |
|--------|------|
| file_id | int PK AUTO |
| file_reference_name | varchar(200) — hashed name |
| file_name | varchar(200) — original name |
| file_ext | varchar(10) |
| file_size | bigint |
| file_mime_type | varchar(100) |
| file_client_id | int FK |

#### `document_files` (junction table)
| Column | Type |
|--------|------|
| document_id | int PK FK |
| file_id | int PK FK |

#### `folders`
| Column | Type |
|--------|------|
| folder_id | int PK AUTO |
| folder_name | varchar(200) |
| parent_folder | int |
| folder_client_id | int FK |

### E. Entity Relationships

```
clients (1) ──── (N) contacts
contacts (1) ──── (1) users
clients (1) ──── (N) tickets
contacts (1) ──── (N) tickets
tickets (1) ──── (N) ticket_replies
tickets (1) ──── (N) ticket_attachments
ticket_replies (1) ── (N) ticket_attachments
clients (1) ──── (N) invoices
invoices (1) ──── (N) payments
clients (1) ──── (N) documents
documents (N) ──── (N) files [via document_files]
clients (1) ──── (N) client_saved_payment_methods
clients (N) ──── (N) payment_providers [via client_payment_provider]
```

---

## 12. UI Components Summary

| Component | Technology |
|-----------|-----------|
| **CSS Framework** | AdminLTE 3 (Bootstrap 4) |
| **Icons** | FontAwesome 5 Free |
| **Rich Text Editor** | TinyMCE |
| **JS Libraries** | jQuery, Bootstrap 4 JS |
| **Layout** | Navbar (dark) + Container (no sidebar) |
| **Cards** | Bootstrap cards مع card-header/card-body |
| **Tables** | Bootstrap tables مع thead-dark |
| **Forms** | Bootstrap input-groups مع icons |
| **Modals** | Bootstrap modals (dark header) |
| **Alerts** | Session-based flash alerts |
| **Breadcrumbs** | Bootstrap breadcrumbs |
| **Responsive** | ✅ viewport meta + Bootstrap grid |

---

## 13. تقييم التوافق مع Pyra Workspace

### بيئتنا: PHP خام + Vanilla JS + CSS + Supabase (PostgREST)

### ✅ يتوافق مباشرة (ننقله مع تعديلات بسيطة)

| الميزة | التوافق | ملاحظات |
|--------|---------|---------|
| **هيكل الصفحات** | ✅ عالي | PHP خام → نقل مباشر |
| **UI/HTML Structure** | ✅ عالي | Bootstrap cards/tables/forms → متوافق 100% |
| **Role-based Access** | ✅ عالي | Primary/Technical/Billing → نفس المفهوم |
| **Ticket Lifecycle** | ✅ عالي | Open→Resolved→Closed→Feedback |
| **Document Upload/View** | ✅ عالي | PDF preview, image display |
| **Contact Management** | ✅ عالي | CRUD بسيط |
| **Profile Page** | ✅ عالي | عرض + تغيير كلمة مرور |

### ⚠️ يحتاج تعديل

| الميزة | التعديل المطلوب |
|--------|----------------|
| **Authentication** | ITFlow: MySQL sessions → Pyra: Supabase Auth (JWT tokens) |
| **Database Queries** | ITFlow: MySQLi مباشر → Pyra: Supabase PostgREST API أو fetch() |
| **SQL Schema** | MySQL → PostgreSQL (تحويل الأنواع: int→integer, longtext→text, tinyint→boolean) |
| **File Storage** | ITFlow: filesystem (`uploads/`) → Pyra: Supabase Storage buckets |
| **Session Management** | ITFlow: PHP `$_SESSION` → Pyra: Supabase JWT + localStorage |
| **CSRF Protection** | ITFlow: ما عنده! → لازم نضيفه |
| **CSS Framework** | ITFlow: AdminLTE → Pyra: ممكن نستخدم نفسه أو نستبدل بـ Tailwind |
| **Payment (Stripe)** | ITFlow: server-side PHP Stripe SDK → Pyra: Supabase Edge Functions أو PHP endpoint |
| **Email Notifications** | ITFlow: PHP SMTP → Pyra: Supabase Edge Functions أو n8n webhook |

### ❌ ما ينفع ننقله مباشرة

| الميزة | السبب |
|--------|-------|
| **MySQLi Code** | لازم يتحول كامل لـ Supabase client |
| **PHP Session System** | Supabase Auth مختلف تماماً |
| **config.php** | Supabase عنده env variables |
| **Stripe PHP SDK** | لازم يكون server-side (Edge Function أو PHP backend) |
| **File Upload Path** | filesystem → Supabase Storage API |

---

## 14. قائمة: إيش ناخذ وكيف نعدله

### Priority 1: الأساسيات (Must Have)

| # | ناخذ من ITFlow | نعدله لـ Pyra | الملفات |
|---|---------------|--------------|---------|
| 1 | **Login System** | Supabase Auth (`signInWithPassword`) بدل PHP sessions | `login.php`, `check_login.php` |
| 2 | **Dashboard Layout** | نفس الـ cards لكن data من Supabase RPC | `index.php` |
| 3 | **Ticket System** | كامل: List + Create + View + Reply + Resolve/Close/Feedback | `tickets.php`, `ticket.php`, `ticket_add.php` |
| 4 | **Invoice List** | عرض فقط (الدفع في المرحلة الثانية) | `invoices.php` |
| 5 | **Navigation** | نفس الهيكل مع تعديل CSS | `header.php` |

### Priority 2: مهم (Should Have)

| # | ناخذ من ITFlow | نعدله لـ Pyra | الملفات |
|---|---------------|--------------|---------|
| 6 | **Document System** | Create + Upload + View + Preview | `documents.php`, `document.php` |
| 7 | **Contact Management** | CRUD مع صلاحيات | `contacts.php`, `contact_add/edit.php` |
| 8 | **Profile** | عرض + تغيير كلمة مرور | `profile.php` |
| 9 | **Role Permissions** | Primary/Technical/Billing system | `check_login.php` → Supabase RLS |

### Priority 3: إضافي (Nice to Have)

| # | ناخذ من ITFlow | نعدله لـ Pyra |
|---|---------------|--------------|
| 10 | **Stripe Payments** | Edge Function + Checkout |
| 11 | **Auto-Pay** | Recurring payment setup |
| 12 | **Assets/Domains/Certs** | عرض فقط |
| 13 | **Task Approvals** | Approve من البورتال |

### خطة التحويل التقنية:

```
1. إنشاء جداول PostgreSQL في Supabase:
   - workspace_clients → clients
   - workspace_contacts → contacts
   - workspace_tickets → tickets
   - workspace_ticket_replies → ticket_replies
   - workspace_documents → documents
   - workspace_files → files (+ Supabase Storage)
   - workspace_invoices → invoices

2. إعداد RLS (Row Level Security):
   - كل contact يشوف فقط بيانات الـ client حقه
   - Primary/Technical/Billing permissions عبر RLS policies

3. Authentication:
   - Supabase Auth signup/login
   - JWT token في localStorage
   - supabase.auth.getUser() بدل $_SESSION

4. File Storage:
   - Bucket: workspace-files
   - Upload via Supabase Storage API
   - Download via signed URLs

5. Frontend:
   - PHP → Static HTML + Vanilla JS
   - fetch() لـ Supabase API بدل MySQLi
   - نفس Bootstrap UI components
```

---

## 15. ملخص تنفيذي

ITFlow Client Portal هو **نظام متكامل وناضج** للعملاء يشمل:
- ✅ تسجيل دخول آمن مع MFA
- ✅ Dashboard ذكي يتكيف مع صلاحيات المستخدم
- ✅ نظام تذاكر كامل مع replies + attachments + feedback
- ✅ عرض فواتير + دفع عبر Stripe
- ✅ إدارة مستندات مع upload + preview
- ✅ إدارة جهات اتصال
- ✅ Role-based access (Primary/Technical/Billing)

**الكود نظيف وقابل للنقل** — حوالي 4,000 سطر PHP في مجلد `/client/` + 1,200 سطر في `post.php`. البنية بسيطة: كل صفحة = ملف PHP واحد. النقل لـ Pyra Workspace ممكن جداً مع تحويل الـ backend من MySQL إلى Supabase.

**التقدير الزمني:** 3-5 أيام عمل للأساسيات (Auth + Dashboard + Tickets + Invoices), +2-3 أيام للمستندات والـ Stripe.
