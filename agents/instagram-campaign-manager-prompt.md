# Claude Code Prompt — Instagram Campaign Manager

## المشروع
ابني نظام إدارة حملات Instagram بواجهة ويب بسيطة. النظام يتحكم في حملات الرد التلقائي على كومنتات Instagram (keywords → auto-reply + DM).

## التقنيات
- **Frontend:** HTML5 + CSS3 + JavaScript (Vanilla) + Bootstrap 5.3 (CDN)
- **Backend:** PHP 8+ (Native — بدون frameworks)
- **Database:** PostgreSQL (اتصال عبر `pg_connect`)
- **بدون نظام تسجيل دخول** — مستخدم واحد فقط

## هيكل الملفات
```
instagram-campaign-manager/
├── index.php                  # Dashboard رئيسي
├── campaigns.php              # صفحة إدارة الحملات (CRUD)
├── comments.php               # سجل الكومنتات والردود
├── analytics.php              # إحصائيات وتحليلات الحملات
├── config/
│   └── database.php           # إعدادات الاتصال بقاعدة البيانات
├── api/
│   ├── campaigns.php          # API endpoints للحملات (GET/POST/PUT/DELETE)
│   ├── comments.php           # API endpoint لجلب الكومنتات
│   └── analytics.php          # API endpoint للإحصائيات
├── includes/
│   ├── header.php             # Header + Navbar مشترك
│   ├── footer.php             # Footer مشترك
│   └── functions.php          # Helper functions
├── assets/
│   ├── css/
│   │   └── style.css          # Custom styles
│   └── js/
│       ├── campaigns.js       # Logic صفحة الحملات
│       ├── comments.js        # Logic صفحة الكومنتات
│       ├── analytics.js       # Logic صفحة التحليلات
│       └── app.js             # Common functions
└── README.md
```

## Database Schema (موجود — لا تنشئ جداول جديدة)

### جدول `instagram_campaigns`
```sql
CREATE TABLE instagram_campaigns (
    id SERIAL PRIMARY KEY,
    campaign_name VARCHAR(255) NOT NULL,
    keyword VARCHAR(255) NOT NULL,
    comment_reply TEXT NOT NULL,        -- رد الكومنت (يدعم {{username}} كـ placeholder)
    dm_message TEXT NOT NULL,           -- رسالة الـ DM (يدعم {{username}} كـ placeholder)
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP               -- NULL = لا تنتهي
);
```

### جدول `instagram_comment_replies`
```sql
CREATE TABLE instagram_comment_replies (
    id SERIAL PRIMARY KEY,
    comment_id NUMERIC NOT NULL,
    user_id NUMERIC NOT NULL,
    username VARCHAR(255),
    comment_text TEXT,
    media_id NUMERIC,
    replied_at TIMESTAMP DEFAULT NOW(),
    dm_sent BOOLEAN DEFAULT false,
    dm_sent_at TIMESTAMP
);
```

### جدول `campaign_responses`
```sql
CREATE TABLE campaign_responses (
    id SERIAL PRIMARY KEY,
    campaign_id INTEGER NOT NULL,
    campaign_name VARCHAR(255),
    comment_id NUMERIC NOT NULL,
    user_id NUMERIC NOT NULL,
    username VARCHAR(255),
    media_id NUMERIC,
    comment_text TEXT,
    reply_sent BOOLEAN DEFAULT false,
    dm_sent BOOLEAN DEFAULT false,
    rate_limited BOOLEAN DEFAULT false,
    matched_at TIMESTAMP DEFAULT NOW()
);
```

## الصفحات المطلوبة

### 1. Dashboard (`index.php`)
- **إحصائيات سريعة (Cards):**
  - عدد الحملات النشطة
  - إجمالي الكومنتات اليوم
  - إجمالي الـ DMs المرسلة اليوم
  - عدد الكومنتات اللي اتمنعت بسبب Rate Limit اليوم
- **آخر 10 كومنتات** (جدول مصغر)
- **Chart بسيط** لعدد الكومنتات آخر 7 أيام (استخدم Chart.js CDN)

### 2. إدارة الحملات (`campaigns.php`)
- **جدول الحملات:** id, اسم الحملة, الكلمة المفتاحية, الحالة (نشط/متوقف), تاريخ الإنشاء, تاريخ الانتهاء
- **زر إضافة حملة جديدة** → يفتح Modal فيه:
  - اسم الحملة (text)
  - الكلمة المفتاحية (text)
  - رد الكومنت (textarea) — مع ملاحظة: "استخدم `@{{username}}` لذكر اسم المستخدم"
  - رسالة الـ DM (textarea) — نفس الملاحظة
  - تاريخ الانتهاء (date, اختياري)
- **أزرار لكل حملة:**
  - تعديل (يفتح نفس الـ Modal مع البيانات)
  - تفعيل/إيقاف (toggle)
  - حذف (مع تأكيد)
- **بحث وفلترة** بالاسم أو الكلمة المفتاحية
- **عرض عدد الردود** لكل حملة (من `campaign_responses`)

### 3. سجل الكومنتات (`comments.php`)
- **جدول بكل الكومنتات** من `instagram_comment_replies`:
  - التاريخ, اسم المستخدم, نص الكومنت, هل اترد عليه, هل اترسل DM
- **فلاتر:**
  - بالتاريخ (من - إلى)
  - بالحالة (تم الرد / تم DM / rate limited)
  - بالـ username
- **Pagination** (20 لكل صفحة)
- **ربط مع `campaign_responses`** لعرض اسم الحملة اللي طابقت (LEFT JOIN on comment_id)

### 4. تحليلات (`analytics.php`)
- **أداء كل حملة:**
  - عدد الكومنتات اللي طابقت
  - عدد الردود المرسلة
  - عدد الـ DMs المرسلة
  - عدد اللي اتمنعوا بسبب Rate Limit
  - نسبة التحويل (كومنتات → DMs)
- **Charts:**
  - كومنتات لكل حملة (Bar chart)
  - الكومنتات عبر الزمن (Line chart, آخر 30 يوم)
  - نسبة Rate Limited vs Allowed (Pie chart)
- **Top المستخدمين** اللي تفاعلوا أكثر

## متطلبات تقنية

### Backend (PHP)
- استخدم `pg_connect()` للاتصال بـ PostgreSQL
- كل API endpoint يرجع JSON
- استخدم Prepared Statements لمنع SQL Injection
- HTTP Methods: GET (جلب), POST (إنشاء), PUT (تعديل), DELETE (حذف)
- Error handling موحد: `{"success": false, "error": "message"}`

### Frontend (JavaScript)
- استخدم `fetch()` للتواصل مع الـ API
- Bootstrap Modals للنماذج
- Bootstrap Tables مع pagination
- Loading states أثناء جلب البيانات
- Toast notifications للنجاح/الخطأ (Bootstrap Toasts)
- **RTL Support** — الواجهة بالعربي (اتجاه من اليمين لليسار)

### التصميم
- **اللغة:** عربي بالكامل
- **الاتجاه:** RTL
- **الثيم:** Dark mode (خلفية داكنة #1a1a2e, بطاقات #16213e, accent #0f3460, أزرار #e94560)
- **Navbar:** جانبي (Sidebar) مع أيقونات
- **Responsive:** يشتغل على موبايل وديسكتوب
- **Font:** استخدم Google Font "Tajawal" للعربي

### config/database.php
```php
<?php
// Database Configuration
define('DB_HOST', 'localhost');     // هيتغير حسب السيرفر
define('DB_PORT', '5432');
define('DB_NAME', 'n8n');          // اسم قاعدة البيانات
define('DB_USER', 'n8n');          // المستخدم
define('DB_PASS', '');             // الباسوورد — يتعبأ عند التثبيت

function getDB() {
    $conn = pg_connect(
        "host=" . DB_HOST . 
        " port=" . DB_PORT . 
        " dbname=" . DB_NAME . 
        " user=" . DB_USER . 
        " password=" . DB_PASS
    );
    if (!$conn) {
        die(json_encode(['success' => false, 'error' => 'Database connection failed']));
    }
    return $conn;
}
```

## ملاحظات مهمة
1. **لا تنشئ جداول جديدة** — الجداول الثلاثة موجودة بالفعل
2. **لا نظام تسجيل دخول** — المشروع للاستخدام الشخصي فقط
3. **اكتب كود نظيف** مع تعليقات واضحة
4. **كل ملف PHP** يعمل include لـ `config/database.php`
5. **الـ API** يستخدم `$_SERVER['REQUEST_METHOD']` للتعامل مع HTTP methods
6. **كل الـ queries** تستخدم `pg_query_params()` (prepared statements)
7. الـ `{{username}}` placeholder في رسائل الحملات يُعرض كما هو في الـ frontend — الاستبدال يتم في n8n workflow وليس هنا
8. **Chart.js v4** من CDN للرسوم البيانية
9. **Bootstrap 5.3** من CDN (مع ملف RTL)
10. **لا تستخدم أي PHP framework** — PHP خام فقط
