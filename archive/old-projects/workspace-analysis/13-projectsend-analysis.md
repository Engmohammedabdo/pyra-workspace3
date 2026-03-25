# ProjectSend — Deep Analysis: File Sharing, Clients, Groups, Notifications

**Repo:** https://github.com/projectsend/projectsend  
**Stack:** PHP (Raw, no framework) + MySQL/MariaDB + PDO + PHPMailer + Bootstrap  
**Template Engine:** Pure PHP includes (no Twig/Blade)  
**Date:** 2026-02-14

---

## 1. خريطة الملفات المهمة

### Core Classes (`includes/Classes/`)
| File | الوظيفة |
|------|---------|
| `Users.php` | إدارة العملاء والمستخدمين (CRUD + Auth + Groups) |
| `Files.php` | إدارة الملفات (Upload, Assign, Categories, Expiry, Download limits) |
| `Groups.php` | إنشاء وإدارة المجموعات + الأعضاء |
| `GroupsMemberships.php` | طلبات الانضمام للمجموعات + الموافقة/الرفض |
| `EmailNotifications.php` | نظام الإشعارات (queue + batch send via cron) |
| `Emails.php` | إعداد وإرسال الإيميلات (PHPMailer + Templates) |
| `Download.php` | تحميل الملفات (PHP stream / Nginx X-Accel / Apache X-Sendfile) |
| `Roles.php` | نظام الأدوار والصلاحيات (DB-based RBAC) |
| `Permissions.php` | تعريف الصلاحيات الأساسية |
| `Auth.php` | Authentication (Login + 2FA + LDAP + Social) |
| `Categories.php` | تصنيف الملفات |
| `Folders.php` | تنظيم الملفات في مجلدات |
| `Encryption.php` | تشفير الملفات (AES-256-GCM) |
| `Integrations.php` | External Storage (S3, GCS, Azure) |

### Root-level Pages
| File | الوظيفة |
|------|---------|
| `clients.php` | قائمة العملاء (Admin view) |
| `clients-add.php` | إضافة عميل جديد |
| `clients-edit.php` | تعديل عميل |
| `clients-requests.php` | طلبات تسجيل العملاء |
| `clients-membership-requests.php` | طلبات الانضمام للمجموعات |
| `groups.php` / `groups-add.php` / `groups-edit.php` | إدارة المجموعات |
| `register.php` | Self-registration للعملاء |
| `upload.php` | صفحة رفع الملفات |
| `manage-files.php` | إدارة الملفات (Admin) |
| `files-edit.php` | تعديل ملف (assignments, categories, expiry) |
| `download.php` | نقطة التحميل |
| `my_files/index.php` | صفحة العميل (ملفاته) |
| `public.php` | صفحة الملفات العامة |
| `email-templates.php` | إدارة قوالب الإيميل |

### Templates (`templates/`)
8 قوالب: `default`, `business`, `dark-cards`, `drive`, `gallery`, `modern`, `pinboxes`, `retro90s`  
كل قالب يحتوي: `template.php`, `public.php`, `public-download.php`, CSS, JS

---

## 2. نظام العملاء (Client System)

### A. Client Authentication

**التسجيل — طريقتين:**
1. **Admin Creates:** عبر `clients-add.php` — الأدمن يدخل البيانات ويختار إرسال إيميل بالبيانات
2. **Self-Registration:** عبر `register.php` — يتفعل بخيار `clients_can_register = 1`
   - العميل يسجل بنفسه
   - ممكن يطلب الانضمام لمجموعات عامة
   - حسب الإعدادات: `clients_auto_approve` = 0 يحتاج موافقة أدمن، = 1 يتفعل تلقائي
   - `clients_auto_group` — ممكن يضاف تلقائي لمجموعة معينة

**صفحة Login — موحّدة:**
- `index.php` هي صفحة اللوقن لكل الأنواع (Client + User + Admin)
- بعد اللوقن، العميل يروح لـ `my_files/index.php`
- الأدمن يروح لـ `dashboard.php`

**Roles والصلاحيات — Dynamic RBAC:**
```
System Roles (DB-based):
├── System Administrator — كل الصلاحيات
├── Account Manager — إدارة العملاء + الملفات
├── Uploader — رفع ملفات فقط (محدود لعملاء معينين)
└── Client — يشوف ملفاته + يرفع (حسب الإعدادات)
```

**صلاحيات العميل (Client Permissions):**
| Permission | الوصف |
|-----------|-------|
| `upload` | يقدر يرفع ملفات |
| `delete_files` | يحذف ملفاته |
| `edit_files` | يعدل ملفاته |
| `set_file_categories` | يصنف ملفاته |
| `set_file_expiration_date` | يحدد تاريخ انتهاء |
| `upload_public` | يرفع ملفات عامة |

### B. File Sharing System — التفاصيل الكاملة

**كيف الأدمن يشارك ملف مع عميل؟**

1. الأدمن يرفع ملف عبر `upload.php`
2. في `files-edit.php` أو أثناء الرفع يختار:
   - **Assign to Clients:** يحدد عملاء معينين
   - **Assign to Groups:** يحدد مجموعات (كل أعضاء المجموعة يشوفون الملف)
3. خيارات إضافية:
   - **Hidden:** الملف مخفي عن العميل (hidden=1 في files_relations)
   - **Public:** أي شخص عنده الرابط يقدر يحمل
   - **Expiry Date:** ينتهي في تاريخ معين

**File Visibility Rules (قواعد الرؤية):**
```php
// في templates/common.php — اللوجك الكامل:

1. الملفات اللي رفعها العميل نفسه (user_id = client_id)
2. الملفات المعينة مباشرة للعميل (files_relations.client_id = client_id AND hidden = 0)
3. الملفات المعينة لمجموعاته (files_relations.group_id IN client_groups AND hidden = 0)
4. الملفات العامة (اختياري — clients_files_list_include_public option)
5. ملفات منتهية الصلاحية تختفي (expired_files_hide option)
```

**Group-based Sharing:**
- الأدمن ينشئ مجموعة (Group)
- يضيف عملاء كأعضاء
- يعين ملف للمجموعة → كل الأعضاء يشوفونه
- ممكن يخفي الملف عن كل المجموعة أو يظهره

**Hidden/Show System (نظام الإخفاء):**
```php
// Files.php methods:
$file->hide('client', $client_id);     // إخفاء عن عميل
$file->show('client', $client_id);     // إظهار لعميل
$file->hide('group', $group_id);       // إخفاء عن مجموعة
$file->show('group', $group_id);       // إظهار لمجموعة
$file->hideFromEveryone();             // إخفاء عن الكل
$file->showToEveryone();              // إظهار للكل
```

### C. Upload/Download

**العميل يقدر يرفع ملفات؟**
- نعم! حسب خيار `clients_can_upload`
- محدود بـ `max_file_size` و `max_disk_quota` لكل عميل
- أنواع الملفات المسموحة: `allowed_file_types` (admin configurable)
- عند رفع العميل ملف → إشعار للأدمن

**Download Permissions:**
```php
function user_can_download_file($user_id, $file_id)
// يتحقق:
// 1. هل الملف معين للعميل أو مجموعته؟
// 2. هل الملف مخفي (hidden)?
// 3. هل الملف منتهي الصلاحية (expired)?
// 4. هل في حد تحميل (download limits)?
```

**Download Methods:**
- PHP streaming (default)
- Apache X-Sendfile
- Nginx X-Accel-Redirect

**File Expiry:**
- `expires` (0/1) + `expiry_date` (TIMESTAMP)
- خيار عام: `files_default_expire` + `files_default_expire_days_after`
- الملفات المنتهية ممكن تختفي أو تظهر بحالة "Expired"

**Download Limits (جديد):**
- `download_limit_enabled` (0/1)
- `download_limit_type` ('per_user' أو 'total')
- `download_limit_count` (العدد الأقصى)

### D. نظام الإشعارات (Notifications)

**الأنواع:**

| النوع | المرسل | المستقبل | متى؟ |
|-------|--------|---------|------|
| `new_files_by_user` | Email | العميل | أدمن رفع/عيّن ملف للعميل |
| `new_files_by_client` | Email | الأدمن/مدير الحساب | عميل رفع ملف جديد |
| `new_client` | Email | العميل الجديد | الأدمن أنشأ حسابه |
| `new_client_self` | Email | الأدمن | عميل سجل بنفسه |
| `account_approve` | Email | العميل | حسابه اتوافق عليه |
| `account_deny` | Email | العميل | حسابه اترفض |
| `password_reset` | Email | المستخدم | طلب إعادة كلمة المرور |
| `client_edited` | Email | الأدمن | عميل غيّر طلبات المجموعات |
| `2fa_code` | Email | المستخدم | كود التحقق عند اللوقن |

**آلية العمل:**
```
1. عند assign ملف لعميل → يُنشأ record في TABLE_NOTIFICATIONS
   (file_id, client_id, upload_type, sent_status=0, times_failed=0)

2. Cron job (cron.php) يشتغل دوري:
   - يجيب كل الإشعارات pending (sent_status=0)
   - يجمعها بحسب العميل
   - يرسل إيميل واحد لكل عميل فيه كل ملفاته الجديدة
   - يحدّث الحالة (sent_status=1 نجح / times_failed++ فشل)

3. خيارات التحكم:
   - notifications_max_tries: عدد المحاولات (default: 2)
   - notifications_max_days: أقصى عمر للإشعار (default: 15 يوم)
   - notifications_max_emails_at_once: عدد الإيميلات في الدفعة
   - mail_copy_user_upload: BCC عند رفع الأدمن
   - mail_copy_client_upload: BCC عند رفع العميل
```

**In-app Notifications:** ❌ لا يوجد! كل الإشعارات Email فقط.

**Email Templates:**
- قوالب HTML في `/emails/` (header.html, footer.html, + قالب لكل نوع)
- قابلة للتخصيص من الـ Admin Panel
- Placeholders: `%FILES%`, `%USERNAME%`, `%PASSWORD%`, `%URI%`, `%CODE%`
- Email themes (بتصاميم مختلفة)

### E. Client Groups — النظام الكامل

**إنشاء المجموعات:**
- الأدمن ينشئ مجموعة في `groups-add.php`
- الحقول: name, description, public (yes/no), members
- `public` = المجموعة ظاهرة في صفحة التسجيل

**إضافة أعضاء:**
1. **Admin adds:** عند إنشاء/تعديل المجموعة
2. **Auto-add:** خيار `clients_auto_group` — كل عميل جديد ينضم تلقائي
3. **Client requests:** العميل يطلب الانضمام لمجموعات عامة عند التسجيل
   - الطلب يروح لـ `TABLE_MEMBERS_REQUESTS`
   - الأدمن يوافق/يرفض من `clients-membership-requests.php`

**كل مجموعة تشوف ملفات مختلفة:**
- نعم! الملف يُعيّن لمجموعة عبر `TABLE_FILES_RELATIONS (group_id)`
- كل أعضاء المجموعة يشوفون الملف (إلا إذا hidden=1)
- الملف ممكن يكون معيّن لأكثر من مجموعة + عملاء مباشرة

### F. UI/Templates

**صفحات العميل:**
- `my_files/index.php` → يحمّل القالب المختار
- القالب يعرض: File list + Search + Categories filter + Folders + Bulk download (ZIP)
- 8 قوالب مدمجة: default, business, dark-cards, drive, gallery, modern, pinboxes, retro90s

**Template Engine:**
- **Pure PHP includes** — لا يوجد template engine
- `templates/common.php` — الكود المشترك (file queries, visibility logic)
- كل قالب: `template.php` (main), `public.php` (public files), `public-download.php`
- CSS + JS خاص بكل قالب

**Branding/Customization:**
- Logo upload
- Custom CSS/JS (custom-assets)
- Email header/footer customization
- Footer custom content
- Title customization
- Theme settings page

### G. Database Schema — التفصيل الكامل

```sql
-- ========================================
-- 1. TABLE_USERS (tbl_users)
-- ========================================
CREATE TABLE tbl_users (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    user            VARCHAR(60) NOT NULL,          -- username
    password        VARCHAR(60) NOT NULL,          -- bcrypt hash
    name            TEXT NOT NULL,                  -- full name
    email           VARCHAR(60) NOT NULL,
    level           TINYINT(1) DEFAULT 0,          -- deprecated (replaced by role_id)
    role_id         INT(11),                       -- FK to tbl_roles
    address         TEXT NULL,                     -- client only
    phone           VARCHAR(32) NULL,              -- client only
    notify          TINYINT(1) DEFAULT 0,          -- email on new files?
    contact         TEXT NULL,                     -- client contact info
    created_by      VARCHAR(60) NULL,              -- username of creator
    active          TINYINT(1) DEFAULT 1,
    account_requested TINYINT(1) DEFAULT 0,        -- self-registration pending
    account_denied  TINYINT(1) DEFAULT 0,
    max_file_size   INT(20) DEFAULT 0,             -- 0 = unlimited
    max_disk_quota  INT(20) DEFAULT 0,             -- 0 = unlimited
    can_upload_public INT(20) DEFAULT 0,           -- can make files public?
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 2. TABLE_FILES (tbl_files)
-- ========================================
CREATE TABLE tbl_files (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    user_id         INT(11),                       -- FK to tbl_users (uploader)
    url             TEXT NOT NULL,                  -- safe filename on disk
    original_url    TEXT NOT NULL,                  -- original filename
    filename        TEXT NOT NULL,                  -- display title
    description     TEXT NULL,
    size            BIGINT DEFAULT 0,
    uploader        VARCHAR(60) NOT NULL,           -- username
    expires         INT(1) DEFAULT 0,
    expiry_date     TIMESTAMP,
    public_allow    INT(1) DEFAULT 0,              -- public download?
    public_token    VARCHAR(32) NULL,              -- unique token for public URL
    folder_id       INT(11) NULL,                  -- FK to tbl_folders
    disk_folder_year INT(4) NULL,
    disk_folder_month INT(2) NULL,
    -- External Storage
    storage_type    VARCHAR(20) DEFAULT 'local',   -- local/s3/gcs/azure
    external_path   TEXT NULL,
    bucket_name     VARCHAR(255) NULL,
    integration_id  INT(11) NULL,                  -- FK to tbl_integrations
    -- Encryption
    encrypted       TINYINT(1) DEFAULT 0,
    encryption_key_encrypted TEXT NULL,
    encryption_iv   TEXT NULL,
    encryption_algorithm VARCHAR(50) DEFAULT 'aes-256-gcm',
    encryption_file_iv TEXT NULL,
    -- Download Limits
    download_limit_enabled TINYINT(1) DEFAULT 0,
    download_limit_type VARCHAR(20) DEFAULT 'total',
    download_limit_count INT(11) DEFAULT 0,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES tbl_users(id) ON DELETE CASCADE
);

-- ========================================
-- 3. TABLE_FILES_RELATIONS (tbl_files_relations) ⭐ KEY TABLE
-- ========================================
CREATE TABLE tbl_files_relations (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    file_id         INT(11) NOT NULL,              -- FK to tbl_files
    client_id       INT(11) NULL,                  -- FK to tbl_users (client)
    group_id        INT(11) NULL,                  -- FK to tbl_groups
    folder_id       INT(11) NULL,                  -- FK to tbl_folders
    hidden          INT(1) NOT NULL DEFAULT 0,     -- 0=visible, 1=hidden
    download_count  INT(16) DEFAULT 0,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES tbl_files(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES tbl_users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES tbl_groups(id) ON DELETE CASCADE
);

-- ========================================
-- 4. TABLE_GROUPS (tbl_groups)
-- ========================================
CREATE TABLE tbl_groups (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(32) NOT NULL,
    description     TEXT NULL,
    public          TINYINT(1) DEFAULT 0,          -- visible for self-reg?
    public_token    VARCHAR(32) NULL,
    created_by      VARCHAR(32) NOT NULL,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 5. TABLE_MEMBERS (tbl_members)
-- ========================================
CREATE TABLE tbl_members (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    added_by        VARCHAR(32) NULL,
    client_id       INT(11) NOT NULL,              -- FK to tbl_users
    group_id        INT(11) NOT NULL,              -- FK to tbl_groups
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES tbl_users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES tbl_groups(id) ON DELETE CASCADE
);

-- ========================================
-- 6. TABLE_MEMBERS_REQUESTS (tbl_members_requests)
-- ========================================
CREATE TABLE tbl_members_requests (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    requested_by    VARCHAR(32) NOT NULL,
    client_id       INT(11) NOT NULL,
    group_id        INT(11) NOT NULL,
    denied          INT(1) DEFAULT 0,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (client_id) REFERENCES tbl_users(id) ON DELETE CASCADE,
    FOREIGN KEY (group_id) REFERENCES tbl_groups(id) ON DELETE CASCADE
);

-- ========================================
-- 7. TABLE_NOTIFICATIONS (tbl_notifications)
-- ========================================
CREATE TABLE tbl_notifications (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    file_id         INT(11) NOT NULL,
    client_id       INT(11) NOT NULL,
    upload_type     INT(11) NOT NULL,              -- 0=by client, 1=by user
    sent_status     INT(2) NOT NULL,               -- 0=pending, 1=sent, 3=inactive
    times_failed    INT(11) NOT NULL DEFAULT 0,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES tbl_files(id) ON DELETE CASCADE,
    FOREIGN KEY (client_id) REFERENCES tbl_users(id) ON DELETE CASCADE
);

-- ========================================
-- 8. TABLE_DOWNLOADS (tbl_downloads)
-- ========================================
CREATE TABLE tbl_downloads (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    user_id         INT(11) NULL,
    file_id         INT(11) NOT NULL,
    remote_ip       VARCHAR(45) NULL,
    remote_host     TEXT NULL,
    anonymous       TINYINT(1) DEFAULT 0,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES tbl_users(id) ON DELETE CASCADE,
    FOREIGN KEY (file_id) REFERENCES tbl_files(id) ON DELETE CASCADE
);

-- ========================================
-- 9. TABLE_CATEGORIES (tbl_categories)
-- ========================================
CREATE TABLE tbl_categories (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(32) NOT NULL,
    parent          INT(11) NULL,                  -- FK self (tree)
    description     TEXT NULL,
    created_by      VARCHAR(60) NULL,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 10. TABLE_CATEGORIES_RELATIONS (tbl_categories_relations)
-- ========================================
CREATE TABLE tbl_categories_relations (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    file_id         INT(11) NOT NULL,
    cat_id          INT(11) NOT NULL,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (file_id) REFERENCES tbl_files(id) ON DELETE CASCADE,
    FOREIGN KEY (cat_id) REFERENCES tbl_categories(id) ON DELETE CASCADE
);

-- ========================================
-- 11. TABLE_FOLDERS (tbl_folders)
-- ========================================
CREATE TABLE tbl_folders (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    parent          INT(11) NULL,                  -- FK self (tree)
    name            VARCHAR(32) NOT NULL,
    client_id       INT(11) NULL,
    group_id        INT(11) NULL,
    timestamp       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 12. TABLE_ROLES (tbl_roles)
-- ========================================
CREATE TABLE tbl_roles (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    name            VARCHAR(100) NOT NULL,
    description     TEXT NULL,
    is_system_role  TINYINT(1) DEFAULT 0,
    permissions_editable TINYINT(1) DEFAULT 1,
    active          TINYINT(1) DEFAULT 1,
    created_date    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ========================================
-- 13. TABLE_ROLE_PERMISSIONS (tbl_role_permissions)
-- ========================================
CREATE TABLE tbl_role_permissions (
    id              INT(11) AUTO_INCREMENT PRIMARY KEY,
    role_id         INT(11) NOT NULL,
    permission      VARCHAR(100) NOT NULL,
    granted         TINYINT(1) DEFAULT 0
);

-- ========================================
-- 14. Supporting Tables
-- ========================================
-- tbl_options (key-value settings)
-- tbl_user_meta (user metadata key-value)
-- tbl_actions_log (audit trail)
-- tbl_password_reset (reset tokens)
-- tbl_logins_failed (brute force protection)
-- tbl_cron_log
-- tbl_custom_assets (custom CSS/JS)
-- tbl_custom_downloads (custom download links)
-- tbl_user_limit_upload_to (uploader restrictions)
-- tbl_authentication_codes (2FA codes)
-- tbl_remember_tokens (remember me)
-- tbl_integrations (external storage configs)
-- tbl_custom_fields + tbl_custom_field_values
-- tbl_theme_settings
```

### العلاقات الرئيسية (ERD):
```
users ──1:N──→ files (uploader)
users ──M:N──→ files (via files_relations — assignments)
users ──M:N──→ groups (via members)
groups ──M:N──→ files (via files_relations)
files ──M:N──→ categories (via categories_relations)
files ──1:N──→ notifications
files ──1:N──→ downloads (tracking)
users ──1:N──→ roles (via role_id)
roles ──M:N──→ permissions (via role_permissions)
```

---

## 3. تقييم التوافق مع Pyra Workspace

**موقعنا:** PHP خام + Vanilla JS + CSS + Supabase (PostgREST)

### ✅ ناخذه مباشرة (Copy/Adapt)

| الميزة | الملف المصدر | ملاحظات |
|--------|-------------|---------|
| **File Visibility Logic** | `templates/common.php` | اللوجك الأساسي: ملفات العميل + مجموعاته + عامة. ننقله لـ Supabase RLS أو RPC |
| **Hidden/Show System** | `Files.php::hide/show` | بسيط — عمود `hidden` في `files_relations` |
| **File Expiry** | `Files.php` | عمود `expires` + `expiry_date` — سهل بـ Supabase |
| **Download Limits** | `Files.php` | 3 أعمدة: enabled, type, count — مباشر |
| **Groups Concept** | `Groups.php` | المفهوم كامل: groups → members → file assignments |
| **Membership Requests** | `GroupsMemberships.php` | نظام الطلب والموافقة — ننسخ المنطق |
| **Role-based Permissions** | `Roles.php` + `Permissions.php` | نظام RBAC — ننقله لـ Supabase |
| **Email Templates** | `/emails/*.html` | قوالب HTML جاهزة — ننسخها مع تعديل |
| **Notification Queue** | `EmailNotifications.php` | مفهوم الـ queue مع retry — ننفذه بـ Supabase + Edge Function |
| **Categories** | `Categories.php` | شجرة تصنيفات — سهل |
| **Folders** | `Folders.php` | مجلدات متداخلة — self-referential FK |
| **Auto-approve/Auto-group** | `Users.php` | خيارات إعدادات بسيطة |
| **Client Template UI** | `templates/default/template.php` | جدول الملفات + التحميل + البحث — ننسخ الـ HTML/CSS |

### ⚠️ نحتاج نعدّله (Adapt Required)

| الميزة | التعديل المطلوب |
|--------|----------------|
| **MySQL → Supabase** | كل الـ queries تتحول لـ PostgREST API أو RPC functions |
| **PDO → supabase-js** | استبدال PDO بـ `@supabase/supabase-js` |
| **PHP Sessions → Supabase Auth** | نستخدم JWT tokens بدل PHP sessions |
| **PHPMailer → Edge Function** | الإيميلات تتحول لـ Supabase Edge Function أو n8n workflow |
| **File Storage → Supabase Storage** | بدل local filesystem، نستخدم Supabase Storage buckets |
| **Cron → Supabase pg_cron أو n8n** | الإشعارات الدورية تتحول لـ scheduled function |
| **FIND_IN_SET → PostgreSQL array** | MySQL function → `= ANY(array)` أو `@>` في PostgreSQL |
| **AUTO_INCREMENT → SERIAL/UUID** | PostgreSQL syntax |
| **`password_hash()` → Supabase Auth** | Supabase يدير الـ auth كامل |
| **Table Prefix → Schema** | بدل `tbl_` prefix نستخدم Supabase schema |

### ❌ ما ينفع / ما نحتاجه

| الميزة | السبب |
|--------|-------|
| **LDAP Integration** | ما نحتاجه — نستخدم Supabase Auth |
| **Social Login (HybridAuth)** | Supabase عنده OAuth providers مدمج |
| **Apache/Nginx download methods** | Supabase Storage يوفر signed URLs |
| **File Encryption (AES-256)** | Supabase Storage عنده encryption at rest |
| **S3/External Storage** | Supabase Storage يغطي الحاجة |
| **PHP Composer dependencies** | ما نحتاجها — Vanilla JS stack |
| **Database migrations system** | Supabase migrations مختلفة |
| **Gettext i18n** | نستخدم حل أبسط (JSON files) |

### 📋 خطة التنفيذ المقترحة (Priority Order)

```
Phase 1 — Core (Database + Auth):
├── Supabase tables: users, files, files_relations, groups, members
├── RLS policies for file visibility
├── Supabase Auth for client login/registration

Phase 2 — File Management:
├── Upload to Supabase Storage
├── File assignments (client + group)
├── Hidden/Show toggle
├── File expiry + download limits
├── Categories + Folders

Phase 3 — Client Portal:
├── my_files page (file list + search + filter)
├── Download with permission check (signed URLs)
├── Client upload capability

Phase 4 — Notifications:
├── Notification queue table
├── Edge Function for email sending
├── Email templates (HTML)

Phase 5 — Admin Features:
├── Groups management + membership requests
├── Roles/Permissions UI
├── Action log / audit trail
```

### 🔑 Key Supabase RPC Functions Needed

```sql
-- 1. Get client's visible files
CREATE FUNCTION get_client_files(p_client_id INT)
-- Returns: files assigned to client directly + via groups + own uploads + public
-- Respects: hidden flag, expiry, folder hierarchy

-- 2. Assign file to client/group
CREATE FUNCTION assign_file(p_file_id INT, p_client_id INT, p_group_id INT, p_hidden BOOL)

-- 3. Process notification queue
CREATE FUNCTION process_notifications()
-- Batch send pending email notifications

-- 4. Check download permission
CREATE FUNCTION can_download_file(p_user_id INT, p_file_id INT) RETURNS BOOL
```

---

## الخلاصة

ProjectSend هو **أفضل مرجع** لنظام مشاركة ملفات مع عملاء:
- **النظام ناضج** (10+ سنوات تطوير)
- **PHP خام** = سهل نفهم اللوجك ونحوله
- **الـ file visibility logic** في `common.php` هو الجوهر — ~200 سطر يحلون كل شي
- **الـ notification queue** ذكي — batch + retry + max tries
- **نظام الـ Groups** قوي ومرن

**أهم شي ناخذه:**
1. `files_relations` table design (file ↔ client/group + hidden)
2. File visibility query logic
3. Notification queue pattern
4. Group membership request workflow
5. Email template system
