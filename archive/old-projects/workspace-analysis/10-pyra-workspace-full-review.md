# Pyra Workspace — Full Technical Review

> **تاريخ الفحص:** 2026-02-14
> **المصدر:** https://github.com/Engmohammedabdo/pyra-workspace
> **Live:** http://workspeace.pyramedia.info/
> **الهدف:** فهم النظام 100% قبل إضافة بوابة العميل (Client Portal)

---

## 1. هيكل المجلدات — كل ملف وإيش يسوي

```
pyra-workspace/
├── index.php              # الواجهة الرئيسية: Login screen + App shell (HTML)
├── api.php                # REST API — 50+ endpoint، كل العمليات تمر من هنا
├── auth.php               # المصادقة + الأدوار + الفرق + الصلاحيات + الـ helpers
├── app.js                 # الـ Frontend controller — كائن App واحد ضخم (~4089 سطر)
├── style.css              # التصميم بالكامل — dark luxury theme (~4299 سطر)
├── schema.sql             # بنية قاعدة البيانات — 14 جدول + فهارس
├── config.php             # ⛔ gitignored — بيانات Supabase (URL, service key, bucket)
├── config.example.php     # قالب الإعدادات
├── setup.php              # معالج التثبيت — يُحذف بعد الاستخدام
├── ROADMAP.md             # خارطة الطريق (عربي) — المطلوب مستقبلاً
├── README.md              # التوثيق الشامل
└── .gitignore             # يتجاهل config.php, IDE files, OS files
```

**إجمالي الكود:** ~10,700+ سطر (بدون readme/roadmap)

| ملف | عدد الأسطر | الوظيفة |
|-----|-----------|---------|
| `api.php` | ~1,794 | Backend API |
| `auth.php` | ~827 | Authentication + Authorization |
| `app.js` | ~4,089 | Frontend (Single Page App) |
| `style.css` | ~4,299 | Styling |
| `index.php` | ~280 | HTML shell |
| `schema.sql` | ~250 | Database schema |
| `setup.php` | ~320 | Setup wizard |

---

## 2. الـ Stack بالتفصيل

### PHP (Backend)
- **Version:** PHP 8.0+
- **Features المستخدمة:**
  - `password_hash()` / `password_verify()` — bcrypt
  - `session_*()` — إدارة الجلسات
  - `random_bytes()` / `bin2hex()` — توليد tokens
  - `curl_*()` — كل الاتصالات مع Supabase
  - `json_encode()` / `json_decode()` — JSON handling
  - `finfo_*()` — MIME type detection
  - `file_get_contents()` — قراءة ملفات مرفوعة
  - Typed parameters (string, array, int, bool)
  - Null coalescing (`??`), spread operator
  - Match expressions (PHP 8.0)
- **لا يوجد Composer أو أي dependency خارجية** — PHP نقي 100%
- **الامتدادات المطلوبة:** `curl`, `json`, `session`, `finfo`

### JavaScript (Frontend)
- **نوع:** Vanilla JavaScript — **لا jQuery، لا React، لا أي framework**
- **بنية:** كائن واحد `const App = {...}` يحتوي كل الـ logic
- **External Libraries:**
  - **mammoth.js** v1.8.0 (CDN) — لتحويل DOCX إلى HTML
  - **لا شيء آخر** — لا مكتبات UI، لا bundler، لا build step
- **APIs المستخدمة:**
  - `fetch()` — كل الـ API calls
  - `FormData` — الرفع
  - `navigator.clipboard` — النسخ
  - `localStorage` — حفظ الثيم والعرض
  - `AbortController` — إلغاء البحث العميق
  - `DOMParser` — بعض عمليات الـ parsing
- **Patterns:**
  - Single Page Application (manual routing via state)
  - Debouncing (البحث)
  - Concurrent uploads (3 parallel)
  - Staggered animations

### CSS (Styling)
- **نوع:** CSS3 خام — **لا Tailwind، لا Bootstrap، لا أي framework**
- **Design System:**
  - CSS Custom Properties (Variables) — ~50+ متغير
  - Glass morphism (backdrop-filter: blur)
  - Grain texture overlay (SVG noise)
  - Custom scrollbar styling
  - RTL support built-in
- **Fonts (Google Fonts):**
  - Inter — UI الرئيسي
  - JetBrains Mono — الكود
  - Noto Sans Arabic — العربية

### Dependencies الخارجية
| Dependency | نوع | الاستخدام |
|-----------|------|----------|
| Supabase Self-Hosted | Storage + PostgreSQL | التخزين + قاعدة البيانات |
| mammoth.js | CDN JS | معاينة DOCX |
| Google Fonts | CDN CSS | خطوط |

**لا يوجد:** npm, composer, webpack, vite, أي build process

---

## 3. api.php — كل الـ Endpoints (50+ endpoint)

### المصادقة (3 endpoints)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `login` | POST (JSON) | تسجيل الدخول — يتحقق من القفل، bcrypt verify، يبدأ session |
| `logout` | POST | إنهاء الجلسة + حذف session record |
| `session` | GET | فحص حالة المصادقة — يرجع بيانات المستخدم لو مسجل |

### العمليات على الملفات (11 endpoint)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `list` | GET | عرض محتويات مجلد — يخفي `.trash`, يصفي حسب الصلاحيات |
| `upload` | POST (multipart) | رفع ملف/ملفات — auto-versioning، يحدّث الـ index، إشعارات |
| `download` | GET | تحميل ملف — Content-Disposition: attachment |
| `delete` | POST | حذف → نقل للمهملات (soft delete) |
| `deleteBatch` | POST | حذف مجموعة ملفات |
| `rename` | POST | إعادة تسمية/نقل — يحدّث الـ reviews والـ index |
| `content` | GET | جلب محتوى نصي (JSON response) |
| `save` | POST | حفظ محتوى نصي — يعمل version أولاً |
| `createFolder` | POST | إنشاء مجلد (يرفع `.keep` file) |
| `proxy` | GET | يمرر الملف binary (لمعاينة DOCX) |
| `publicUrl` | GET | يرجع الرابط العام |

### المراجعات (4 endpoints)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `getReviews` | GET | جلب مراجعات ملف |
| `addReview` | POST (JSON) | إضافة تعليق أو موافقة — يدعم parent_id (ردود) + إشعارات |
| `resolveReview` | POST (JSON) | تبديل حالة "محلول" — admin فقط |
| `deleteReview` | POST (JSON) | حذف مراجعة — admin فقط |

### المهملات (5 endpoints)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `listTrash` | GET | عرض المهملات — admin فقط |
| `restoreTrash` | POST (JSON) | استعادة ملف من المهملات |
| `permanentDelete` | POST (JSON) | حذف نهائي من المهملات |
| `emptyTrash` | POST | تفريغ كل المهملات |
| `purgeExpired` | POST | حذف المنتهية (30 يوم) |

### الإشعارات (4 endpoints)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `getNotifications` | GET | جلب إشعارات المستخدم |
| `getUnreadCount` | GET | عدد غير المقروءة |
| `markNotifRead` | POST (JSON) | قراءة إشعار |
| `markAllNotifsRead` | POST (JSON) | قراءة الكل |

### سجل النشاط (1 endpoint)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `getActivityLog` | GET | السجل مع فلاتر (user, action, date range) — admin فقط |

### البحث (1 endpoint)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `deepSearch` | GET | بحث عميق — يستخدم file index أو fallback recursive |

### روابط المشاركة (4 endpoints)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `createShareLink` | POST (JSON) | إنشاء رابط مؤقت (1-720 ساعة) |
| `getShareLinks` | GET | جلب روابط ملف |
| `deactivateShareLink` | POST (JSON) | تعطيل رابط |
| `shareAccess` | GET | وصول مشترك (بدون auth) — تحميل مباشر عبر token |

### إدارة المستخدمين (5 endpoints — admin فقط)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `getUsers` | GET | عرض كل المستخدمين (بدون password_hash) |
| `addUser` | POST (JSON) | إنشاء مستخدم |
| `updateUser` | POST (JSON) | تعديل (display_name, role, permissions) |
| `deleteUser` | POST (JSON) | حذف مستخدم (لا يمكن حذف نفسك) |
| `changePassword` | POST (JSON) | تغيير كلمة المرور |

### الفرق (6 endpoints — admin فقط)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `getTeams` | GET | عرض الفرق مع الأعضاء |
| `createTeam` | POST (JSON) | إنشاء فريق |
| `updateTeam` | POST (JSON) | تعديل فريق |
| `deleteTeam` | POST (JSON) | حذف فريق (cascade) |
| `addTeamMember` | POST (JSON) | إضافة عضو + إشعار |
| `removeTeamMember` | POST (JSON) | إزالة عضو |

### صلاحيات الملفات (4 endpoints — admin فقط)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `setFilePermission` | POST (JSON) | منح صلاحية لمستخدم أو فريق + إشعار |
| `getFilePermissions` | GET | جلب صلاحيات ملف |
| `removeFilePermission` | POST (JSON) | إزالة صلاحية |
| `cleanExpiredPermissions` | POST | تنظيف المنتهية |

### Dashboard (1 endpoint)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `getDashboard` | GET | بيانات لوحة التحكم حسب الدور (admin/employee/client) |

### إصدارات الملفات (3 endpoints)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `getFileVersions` | GET | جلب تاريخ الإصدارات |
| `restoreVersion` | POST (JSON) | استرجاع إصدار سابق (يحفظ الحالي أولاً) |
| `deleteVersion` | POST (JSON) | حذف إصدار — admin فقط |

### الإعدادات (3 endpoints)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `getSettings` | GET | جلب كل الإعدادات — admin فقط |
| `updateSettings` | POST (JSON) | تحديث إعدادات متعددة |
| `getPublicSettings` | GET | إعدادات عامة (app_name, logo, color) — بدون auth |

### إدارة الجلسات (3 endpoints)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `getSessions` | GET | جلب جلسات المستخدم |
| `terminateSession` | POST (JSON) | إنهاء جلسة محددة |
| `terminateAllSessions` | POST (JSON) | إنهاء كل الجلسات (عدا الحالية) |

### أخرى (2 endpoints)
| Action | Method | الوظيفة |
|--------|--------|---------|
| `getLoginHistory` | GET | سجل محاولات الدخول — admin فقط |
| `rebuildIndex` | POST | إعادة بناء فهرس البحث — admin فقط |

**الإجمالي: ~55 API endpoint**

### الأمان في API:
- **CSRF Protection:** كل POST request (عدا login) يتطلب `X-CSRF-Token` header
- **Session tracking:** كل request يحدّث `last_activity`
- **Path sanitization:** `sanitizePath()` يزيل `..`, `\0`, paths خبيثة
- **Permission checks:** كل عملية تفحص `canAccessPathEnhanced()` + `hasPathPermission()`
- **Rate limiting:** 200ms delay على login + account lockout بعد 5 محاولات فاشلة
- **Security headers:** `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`

---

## 4. app.js — الـ Functions الرئيسية + UI Features

### البنية العامة
```javascript
const App = {
    // State
    currentPath: '',       // المسار الحالي
    selectedFile: null,    // الملف المحدد
    files: [],             // قائمة الملفات
    folders: [],           // قائمة المجلدات
    editMode: false,       // وضع التحرير
    history: [],           // تاريخ التنقل
    user: null,            // بيانات المستخدم
    permissions: {},       // الصلاحيات
    _currentView: 'list',  // list أو grid
    _currentScreen: 'dashboard', // dashboard أو files

    // 80+ function داخل هذا الكائن
};
```

### الـ Functions الرئيسية (مقسمة حسب الوظيفة)

#### التهيئة والثيم
| Function | الوظيفة |
|----------|---------|
| `init()` | تهيئة التطبيق — ثيم، view، events، تحميل dashboard |
| `applyTheme()` | تطبيق الثيم المحفوظ في localStorage |
| `toggleTheme()` | تبديل بين بنفسجي وبرتقالي |
| `applyView()` | تطبيق وضع العرض (list/grid) |
| `setView(view)` | تبديل العرض وحفظه |

#### Dashboard
| Function | الوظيفة |
|----------|---------|
| `showDashboard()` | عرض لوحة التحكم — يجلب بيانات من API |
| `_renderDashboard(data)` | توزيع الرسم حسب الدور |
| `_renderAdminDashboard(data)` | لوحة المدير: إحصائيات، أزرار سريعة، نشاط |
| `_renderEmployeeDashboard(data)` | لوحة الموظف: مجلداتي، إشعارات، نشاط |
| `_renderClientDashboard(data)` | لوحة العميل: مشاريعي (folder stats)، مراجعاتي، نشاط |
| `showDashboardFiles(path)` | الانتقال من Dashboard لتصفح الملفات |

#### المصادقة
| Function | الوظيفة |
|----------|---------|
| `handleLogin(e)` | تسجيل الدخول — POST login → reload |
| `handleLogout()` | تسجيل الخروج |
| `canDo(permission)` | فحص صلاحية (admin دائماً true) |
| `isAdmin()` | هل المستخدم admin? |
| `apiFetch(url, options)` | fetch wrapper — يضيف CSRF token تلقائياً |

#### التنقل وعرض الملفات
| Function | الوظيفة |
|----------|---------|
| `navigateTo(path)` | تنقل مع history |
| `goBack()` | رجوع لمجلد الأب |
| `loadFiles(prefix)` | جلب قائمة الملفات من API |
| `renderBreadcrumb()` | رسم مسار التنقل |
| `renderInfoBar()` | عرض معلومات المجلد (عدد الملفات والحجم) |
| `renderFiles()` | رسم قائمة الملفات مع فلترة وترتيب |
| `renderFolderItem(f)` | رسم عنصر مجلد |
| `renderFileItem(f)` | رسم عنصر ملف |
| `toggleSort(column)` | تبديل الترتيب (name/size/date) |
| `getFileIcon(name, mimetype)` | أيقونة حسب نوع الملف |

#### المعاينة
| Function | الوظيفة |
|----------|---------|
| `previewFile(file)` | معاينة ملف — يحدد النوع ويرسم |
| `previewMarkdown(file, body, id)` | معاينة Markdown — يحمّل المحتوى ويحوّله HTML |
| `previewText(file, body, id)` | معاينة نصوص |
| `previewDocx(file, body, id)` | معاينة Word — mammoth.js |
| `editFile(file)` | وضع التحرير — textarea |
| `saveFile()` | حفظ الملف المحرر |
| `closePreview()` | إغلاق المعاينة |
| `hasArabic(text)` | كشف النص العربي (regex) |
| `wrapWithDir(html, text)` | RTL wrapper تلقائي |
| `renderMarkdown(text)` | تحويل Markdown→HTML (regex-based، بدون مكتبة!) |

#### عمليات الملفات
| Function | الوظيفة |
|----------|---------|
| `triggerUpload()` | فتح نافذة اختيار ملفات |
| `uploadFiles(fileList)` | رفع مع progress bar و concurrency=3 |
| `downloadFile(path)` | تحميل ملف |
| `deleteFile(path)` | حذف ملف (للمهملات) |
| `deleteFolder(path)` | حذف مجلد (recursive عبر API) |
| `showRenameModal(path, name)` | نافذة إعادة التسمية |
| `showNewFolderModal()` | نافذة مجلد جديد |
| `copyPublicUrl(path)` | نسخ الرابط العام |

#### المراجعات
| Function | الوظيفة |
|----------|---------|
| `loadFileReviews(path)` | جلب وعرض مراجعات الملف أسفل المعاينة |
| (inline handlers) | إضافة تعليق، موافقة، رد، حل، حذف |

#### إصدارات الملفات
| Function | الوظيفة |
|----------|---------|
| `loadFileVersions(path)` | عرض تاريخ الإصدارات أسفل المراجعات |
| (inline handlers) | استعادة إصدار، حذف إصدار |

#### إدارة المستخدمين
| Function | الوظيفة |
|----------|---------|
| `showUsersPanel()` | لوحة إدارة المستخدمين — CRUD كامل |
| (inline) | إضافة/تعديل/حذف/تغيير كلمة مرور |

#### إدارة الفرق
| Function | الوظيفة |
|----------|---------|
| `showTeamsPanel()` | لوحة إدارة الفرق |
| (inline) | إنشاء/تعديل/حذف فريق + إدارة الأعضاء |

#### الإشعارات
| Function | الوظيفة |
|----------|---------|
| `initNotifications()` | بدء polling كل 30 ثانية |
| `showNotificationsPanel()` | عرض لوحة الإشعارات |
| (polling) | `getUnreadCount` → تحديث الشارة |

#### القائمة السياقية (Context Menu)
| Function | الوظيفة |
|----------|---------|
| `showContextMenu(e, type, item)` | قائمة right-click — مختلفة لـ file و folder |
| (items) | تحميل، نسخ رابط، مشاركة، تعديل اسم، صلاحيات، حذف |

#### المشاركة
| Function | الوظيفة |
|----------|---------|
| `showShareModal(path, name)` | نافذة إنشاء رابط مشاركة |
| `generateShareLink(path, name)` | توليد الرابط |
| `loadFileShareLinks(path)` | عرض الروابط الموجودة |
| `deactivateShareLink(id, path)` | تعطيل رابط |
| `copyShareUrl(url)` | نسخ |

#### الإدارة
| Function | الوظيفة |
|----------|---------|
| `showTrashPanel()` | لوحة المهملات — استعادة/حذف نهائي/تفريغ |
| `showActivityPanel()` | سجل النشاط مع فلاتر |
| `showSettingsPanel()` | إعدادات النظام (admin) |
| `_saveSettings()` | حفظ الإعدادات |
| `_rebuildSearchIndex()` | إعادة بناء فهرس البحث |

#### البحث العميق
| Function | الوظيفة |
|----------|---------|
| `showDeepSearchModal()` | نافذة البحث (Ctrl+Shift+F) |
| `_navigateToSearchResult(file)` | التنقل لنتيجة البحث |

#### Utilities
| Function | الوظيفة |
|----------|---------|
| `formatSize(bytes)` | B → KB → MB → GB |
| `formatDate(dateStr)` | تاريخ نسبي (Just now, 5m ago, 2d ago...) |
| `escHtml(str)` | XSS protection |
| `escAttr(str)` | Attribute escaping |
| `sanitizeUrl(url)` | منع javascript: و data: URLs |
| `toast(msg, type)` | إشعارات عائمة |
| `showLoading(show)` | مؤشر التحميل |
| `_debounce(fn, ms)` | Debounce utility |

---

## 5. style.css — التفاصيل الكاملة

### الثيمات
| الثيم | اللون الأساسي | الوصف |
|-------|-------------|-------|
| **Purple** (default) | `#8b5cf6` | Dark luxury بنفسجي |
| **Pyramedia Orange** | `#F97316` | برتقالي لهوية Pyramedia |

**كيف يشتغل:** `data-theme="pyramedia"` على `<body>` — يعيد تعريف CSS variables فقط

### CSS Variables الرئيسية (~50+)
```css
--bg-primary: #0a0e14      /* خلفية أساسية */
--bg-secondary: #111620    /* خلفية ثانوية */
--bg-glass: rgba(17,22,32,0.85) /* glass effect */
--accent: #8b5cf6          /* اللون الرئيسي */
--text-primary: #edf0f7    /* نص أساسي */
--text-secondary: #8892a8  /* نص ثانوي */
--radius: 10px             /* border-radius */
--font-sans: 'Inter'       /* الخط */
--font-arabic: 'Noto Sans Arabic' /* خط عربي */
```

### Responsive Breakpoints
| Breakpoint | الأثر |
|-----------|-------|
| `max-width: 900px` | إخفاء عمود التاريخ، تصغير toolbar، تقليص breadcrumb |
| `max-width: 768px` | تعديلات Dashboard grid |
| `max-width: 600px` | تصميم جوال — إخفاء عناصر، تصغير أزرار، full-width panels |

### Design System Features
- **Glass Morphism:** `backdrop-filter: blur(12px)` على top-bar وmodals
- **Grain Texture:** SVG noise overlay بـ `opacity: 0.03`
- **RTL Support:** فئة `.rtl`, `[dir="rtl"]` selectors, `font-family: var(--font-arabic)`
- **Custom Scrollbar:** 6px width, transparent track, subtle thumb
- **Animations:**
  - `@keyframes fadeInUp` — دخول الملفات
  - `@keyframes slideIn` — انزلاق المعاينة
  - `@keyframes modalPop` — ظهور النوافذ
  - `@keyframes dropPulse` — نبضة السحب والإفلات
  - `@keyframes pulse` — نبضة شارة الإشعارات
  - `@keyframes float` — طفو أيقونة الرفع
  - `@keyframes particleFloat` — حركة جزيئات شاشة الدخول
- **أيقونات ملونة حسب النوع:**
  - `.folder` → amber `#f59e0b`
  - `.image` → pink `#ec4899`
  - `.video` → red `#ef4444`
  - `.audio` → purple `#8b5cf6`
  - `.pdf` → red `#dc2626`
  - `.code` → green `#10b981`
  - `.markdown` → cyan `#06b6d4`
  - `.document` → blue `#3b82f6`
  - `.archive` → orange `#f97316`

---

## 6. index.php — HTML Structure

### البنية:
```
<!DOCTYPE html>
├── <head>
│   ├── Meta tags (charset, viewport)
│   ├── Google Fonts (Inter, JetBrains Mono, Noto Sans Arabic)
│   ├── style.css
│   ├── Dynamic primary color from settings
│   └── mammoth.js (CDN, defer)
│
├── <body id="bodyEl">
│   ├── [IF !logged in] Login Screen
│   │   ├── .login-particles (8 animated spans)
│   │   └── .login-card
│   │       ├── .login-logo (SVG + app name)
│   │       └── <form> (username, password, remember me)
│   │
│   ├── .app-container [hidden if !logged in]
│   │   ├── .top-bar
│   │   │   ├── .logo
│   │   │   ├── .breadcrumb
│   │   │   └── .user-menu (notifications, theme toggle, role badge, avatar, logout)
│   │   │
│   │   ├── .toolbar
│   │   │   ├── Dashboard, Back buttons
│   │   │   ├── Upload, New Folder (conditional on permissions)
│   │   │   ├── Users, Teams, Trash, Activity, Settings (admin only)
│   │   │   ├── Refresh, View Toggle (list/grid)
│   │   │   ├── Deep Search button
│   │   │   └── .search-box (instant filter)
│   │   │
│   │   ├── .info-bar (path + file count)
│   │   │
│   │   └── .main-content
│   │       ├── .file-panel
│   │       │   ├── .file-list-header (sortable columns)
│   │       │   ├── .file-grid (dynamic content)
│   │       │   └── .loading-overlay
│   │       │
│   │       └── .preview-panel (slide-in side panel)
│   │           ├── .preview-header (title + action buttons)
│   │           ├── .preview-file-info (size, type, date)
│   │           └── .preview-body (content)
│   │
│   ├── .drop-zone (drag & drop overlay)
│   ├── .context-menu (right-click menu)
│   ├── .modal-overlay + .modal (generic modal)
│   ├── .upload-progress (progress bar)
│   ├── .toast-container (notifications)
│   │
│   └── <script>
│       ├── window.PYRA_CONFIG = { supabaseUrl, bucket, maxUploadSize, auth, user, csrf_token, settings }
│       └── <script src="app.js">
```

### ملاحظات مهمة:
- **PHP يقرر العرض:** الـ login screen والـ app تُعرض حسب `isLoggedIn()` في PHP
- **الأزرار conditional:** تظهر/تختفي حسب `$userData['permissions']` و `$userData['role']`
- **CSRF token:** يُمرر عبر `window.PYRA_CONFIG.csrf_token`
- **Server-side rendering أولي:** PHP يرسم HTML الأولي، ثم JS يتولى كل شيء

---

## 7. Authentication — كيف يشتغل

### Flow:
```
1. المستخدم يفتح index.php
2. PHP يفحص isLoggedIn() (session)
3. لو مو مسجل → يعرض Login Screen
4. المستخدم يدخل username + password
5. JS يرسل POST api.php?action=login (JSON body)
6. PHP: usleep(200ms) → isAccountLocked() → findUser() → password_verify()
7. لو نجح:
   - session_regenerate_id(true) — حماية من session fixation
   - $_SESSION[user, role, display_name, permissions, csrf_token]
   - recordLoginAttempt() + createSessionRecord()
   - يرجع { success: true, user: {...} }
8. JS: location.reload() → PHP يرسم الصفحة كاملة
```

### Session Security:
- `cookie_httponly = 1` — ما يقدر JS يقرأ الكوكي
- `cookie_samesite = Strict` — حماية من CSRF
- `cookie_secure` — SSL فقط لو HTTPS
- `use_strict_mode = 1` — لا يقبل session IDs غير معروفة
- `gc_maxlifetime = 28800` — 8 ساعات
- `session_regenerate_id(true)` — عند كل login

### Account Lockout:
- بعد 5 محاولات فاشلة → قفل 15 دقيقة
- الإعدادات قابلة للتغيير من `pyra_settings`

### Remember Me:
- الـ checkbox موجود في UI
- **لكن الكود ما يعالجه فعلياً** — فقط يُرسل `remember` flag بدون استخدام (فرصة تحسين)

### ملاحظة مهمة:
- **لا JWT** — sessions فقط
- **لا Supabase Auth** — auth مخصص بالكامل
- **لا cookies tokens** — PHP sessions على الخادم

---

## 8. Supabase Integration — كيف يتعامل

### الاتصال:
```php
// auth.php → dbRequest() — لقاعدة البيانات
SUPABASE_URL/rest/v1/{table}?{filters}  // PostgREST API

// api.php → supabaseRequest() — للتخزين
SUPABASE_URL/storage/v1/{endpoint}       // Storage API
```

### Database (PostgREST):
كل العمليات تمر عبر `dbRequest()`:
```php
function dbRequest(string $method, string $endpoint, $body = null): array {
    $url = SUPABASE_URL . '/rest/v1' . $endpoint;
    // Headers: Authorization: Bearer SERVICE_KEY, apikey: SERVICE_KEY
    // Returns: ['data' => decoded JSON, 'httpCode' => int]
}
```

#### أمثلة:
```php
// جلب مستخدم
dbRequest('GET', '/pyra_users?username=eq.admin&limit=1');

// إنشاء سجل
dbRequest('POST', '/pyra_reviews', $data, ['Prefer: return=representation']);

// تحديث
dbRequest('PATCH', '/pyra_users?username=eq.admin', ['role' => 'employee']);

// حذف
dbRequest('DELETE', '/pyra_trash?id=eq.t_123');
```

### Storage API:
```php
function supabaseRequest(string $method, string $endpoint, $body = null): array {
    $url = SUPABASE_URL . '/storage/v1' . $endpoint;
    // Header: Authorization: Bearer SERVICE_KEY
}
```

#### Endpoints المستخدمة:
| Endpoint | Method | الوظيفة |
|----------|--------|---------|
| `/object/list/{bucket}` | POST | عرض الملفات في مجلد |
| `/object/{bucket}/{path}` | POST | رفع ملف |
| `/object/{bucket}/{path}` | PUT | تحديث ملف |
| `/object/{bucket}/{path}` | GET | تحميل ملف |
| `/object/{bucket}/{path}` | DELETE | حذف ملف |
| `/object/move` | POST | نقل/إعادة تسمية |
| `/object/sign/{bucket}/{path}` | POST | رابط موقّع (signed URL) |
| `/object/public/{bucket}/{path}` | — | رابط عام (constructed, not API call) |

### Security:
- **Service Role Key فقط** — ما يستخدم anon key أبداً
- **الـ key ما ينكشف للعميل** — محفوظ في `config.php` فقط
- **RLS معطّل** — لأن التطبيق يستخدم service_role
- كل عملية تمر عبر PHP أولاً → PHP يفحص الصلاحيات → ثم يتواصل مع Supabase

---

## 9. User Roles/Permissions — النظام الكامل

### الأدوار الثلاثة:
| الدور | الوصف | الوصول |
|-------|-------|--------|
| `admin` | مدير النظام | كل شيء — ملفات، مستخدمين، فرق، إعدادات، مهملات، سجل |
| `employee` | موظف | المجلدات المخصصة + الصلاحيات المحددة |
| `client` | عميل | المجلدات المخصصة + عادةً read-only + تعليقات |

### بنية الصلاحيات (JSONB):
```json
{
    "allowed_paths": ["projects/client-x", "shared/reviews"],
    "can_upload": true,
    "can_edit": true,
    "can_delete": false,
    "can_download": true,
    "can_create_folder": true,
    "can_review": true,
    "per_folder_perms": {
        "projects/client-x/final": {
            "can_upload": false,
            "can_edit": false
        }
    }
}
```

### ثلاث طبقات من الصلاحيات:
```
1. صلاحيات المستخدم (pyra_users.permissions)
   ↓ لو ما وُجد
2. صلاحيات الفريق (pyra_teams.permissions عبر pyra_team_members)
   ↓ لو ما وُجد
3. صلاحيات الملف (pyra_file_permissions — مع expiry)
```

### Functions الرئيسية:
```php
canAccessPath($path)              // فحص وصول أساسي (user level)
canAccessPathEnhanced($path)      // فحص شامل (user + team + file-level)
hasPermission($perm)              // صلاحية عامة
hasPathPermission($perm, $path)   // صلاحية لمسار محدد (يفحص كل الطبقات)
getEffectivePermissions($path)    // صلاحيات فعّالة (مع per_folder_perms)
isPathDirectlyAllowed($path)      // وصول مباشر (بدون parent navigation)
```

### كيف `canAccessPath` يشتغل:
```php
// المستخدم عنده allowed_paths: ["projects/client-x"]
// المسار "projects" → مسموح (parent of allowed)
// المسار "projects/client-x" → مسموح (exact match)
// المسار "projects/client-x/images" → مسموح (child of allowed)
// المسار "projects/client-y" → ⛔ ممنوع
```

### Per-Folder Permissions:
- يمكن تحديد صلاحيات مختلفة لكل مجلد فرعي
- أطول prefix match يكسب (most specific folder wins)
- مفيد مثلاً: الموظف يقدر يعدل في `draft/` لكن ما يقدر يعدل في `final/`

### Team Permissions:
- الفريق له `allowed_paths` + `can_*` صلاحيات + `per_folder_perms`
- عضو الفريق يرث كل صلاحيات فرقه
- الفرق تتراكم (additive) — لو فريقين يعطوك وصول مختلف، تاخذ الأكثر

### File-Level Permissions:
- يمكن منح وصول لملف/مجلد محدد لمستخدم أو فريق
- يدعم **تاريخ انتهاء** (expires_at)
- التنظيف التلقائي: `cleanExpiredFilePermissions()`

---

## 10. File Management — كيف تشتغل

### Upload:
```
1. User drags files or clicks Upload
2. app.js: uploadFiles() → concurrency=3 parallel uploads
3. For each file:
   a. Check max size (500MB default)
   b. FormData: action=upload, prefix=currentPath, file=blob
   c. POST api.php
   d. api.php: permission check → auto-versioning → upload to Supabase Storage
   e. Update file index → Send notifications to users with folder access
   f. Progress bar updates
```

### Auto-Versioning on Upload:
```
If file already exists AND auto_version_on_upload=true:
1. Download current file from Supabase
2. Upload to .versions/{original_path}/{timestamp}_{filename}
3. Record in pyra_file_versions
4. If max versions exceeded → delete oldest
5. Then upload new file (overwrite)
```

### Download:
```
1. api.php?action=download&path=...
2. Permission check
3. Get file from Supabase Storage
4. Set Content-Disposition: attachment headers
5. Stream content
```

### Preview (أنواع الملفات المدعومة):
| النوع | الآلية |
|-------|--------|
| Images | `<img src="public_url">` مباشر |
| Video | `<video controls src="public_url">` |
| Audio | `<audio controls src="public_url">` |
| PDF | `<iframe src="public_url">` |
| DOCX | api.php?action=proxy → mammoth.js → HTML |
| Markdown | api.php?action=content → custom regex renderer → HTML |
| Code/Text | api.php?action=content → `<pre>` |

### Text Editing:
```
1. Click Edit → loads content via api.php?action=content
2. Shows <textarea> with current content
3. Ctrl+S or Save button → api.php?action=save
4. Before save: creates file version automatically
5. Detects Arabic text → switches to RTL
```

### Rename:
```
1. Modal → enter new name
2. POST api.php?action=rename (oldPath, newPath)
3. Supabase Storage /object/move
4. Update reviews paths → Update file index
```

### Delete (Soft Delete → Trash):
```
1. Confirm dialog
2. POST api.php?action=delete
3. Supabase Storage /object/move → .trash/{timestamp}_{random}_{filename}
4. Create record in pyra_trash (original_path, trash_path, file_name, size, mime)
5. Remove from file index
6. Auto-purge after 30 days
```

### Share Links:
```
1. Right-click → Share أو من Preview panel
2. Modal: expiry (1-720 hours), max downloads (0=unlimited)
3. Generates 64-char hex token
4. Stores in pyra_share_links
5. Public URL: api.php?action=shareAccess&token={token}
6. Token validation: active? expired? max access reached?
7. If valid → download file directly (no auth needed)
```

### Deep Search:
```
1. Ctrl+Shift+F → modal
2. Searches pyra_file_index table (ilike query)
3. Fallback: recursiveListFiles() if index empty
4. Results filtered by user's allowed_paths
5. Click result → navigate to folder + preview file
```

### Folder Creation:
```
1. Upload empty .keep file to {prefix}/{folderName}/.keep
2. Supabase treats any path with files as a "folder"
```

---

## 11. Review System — كيف يشتغل

### أنواع المراجعات:
| النوع | الوصف |
|-------|-------|
| `comment` | تعليق نصي على ملف |
| `approval` | موافقة على ملف (بدون نص أو مع نص) |

### Flow:
```
1. فتح ملف في Preview
2. أسفل المعاينة → قسم Reviews يتحمل تلقائياً
3. textarea + زر Comment + زر Approve
4. POST api.php?action=addReview (JSON: path, type, text, parent_id)
5. يُنشئ record في pyra_reviews
6. يُرسل إشعار لكل المستخدمين اللي عندهم وصول للمجلد
7. Review يظهر فوراً
```

### الردود المتسلسلة (Threaded Replies):
```
- parent_id في pyra_reviews يشير للتعليق الأب
- عند الرد: إشعار خاص لصاحب التعليق الأصلي
- واجهة عرض: الردود تظهر متداخلة (indented)
```

### حالة "محلول" (Resolved):
```
- Admin فقط يقدر يغير resolved=true/false
- Toggle: resolveReview → يقلب الحالة
- Reviews المحلولة تظهر بلون مختلف / strikethrough
```

### تتبع المراجعات عند النقل:
```
- عند rename/move ملف:
  updateReviewPaths(oldPath, newPath)
  → يحدّث كل reviews اللي file_path يبدأ بالمسار القديم
```

### Schema:
```sql
pyra_reviews (
    id VARCHAR(20) PRIMARY KEY,     -- مثل: r_1707926400_a3f2b
    file_path TEXT NOT NULL,         -- المسار الكامل للملف
    username VARCHAR(50),            -- من كتب
    display_name VARCHAR(100),       -- اسم العرض
    type VARCHAR(20),                -- comment أو approval
    text TEXT,                       -- نص التعليق
    resolved BOOLEAN DEFAULT FALSE,  -- هل تم الحل
    parent_id VARCHAR(20),           -- للردود المتسلسلة
    created_at TIMESTAMPTZ
)
```

---

## 12. ميزات إضافية

### Dashboard (لوحة التحكم)
- **Admin:** عدد المستخدمين، عدد الملفات المفهرسة، مراجعات معلقة، نشاط حديث، أزرار سريعة
- **Employee:** مجلداتي، إشعارات غير مقروءة، نشاط حديث
- **Client:** مشاريعي (folder stats: عدد الملفات، آخر تحديث)، مراجعاتي، نشاط

### Activity Log (سجل النشاط)
- يسجل: login, logout, upload, delete, rename, save_file, review_added, review_deleted, trash_restore, trash_purge, share_created, user_created, user_updated, user_deleted, password_changed, team_created, team_updated, team_deleted, team_member_added, team_member_removed, file_permission_set, file_permission_removed, settings_updated, index_rebuilt
- مع IP address
- فلاتر: username, action type, date range

### Notification System
- **Polling:** كل 30 ثانية `getUnreadCount`
- **أنواع:** upload, comment, approval, reply, team, permission
- **إشعارات ذكية:**
  - التعليقات تُشعر كل admins + المستخدمين اللي عندهم وصول
  - الردود تُشعر صاحب التعليق الأصلي
  - الضغط على الإشعار يفتح الملف مباشرة
- **شارة نابضة:** Badge أحمر متحرك

### File Versioning (إصدارات الملفات)
- **Auto-versioning:** عند الرفع أو الحفظ، النسخة القديمة تُحفظ تلقائياً
- **التخزين:** `.versions/{file_path}/{timestamp}_{filename}`
- **الحد الأقصى:** 10 إصدارات (قابل للتغيير من الإعدادات)
- **الاسترجاع:** يمكن استعادة أي إصدار سابق (الحالي يُحفظ أولاً)
- **الحذف:** admin فقط

### File Search Index
- جدول `pyra_file_index` لتسريع البحث
- يتحدث تلقائياً عند upload/rename/delete
- يمكن إعادة بناء الفهرس يدوياً من الإعدادات
- Fallback: recursive search لو الفهرس فارغ

### System Settings (pyra_settings)
| الإعداد | القيمة الافتراضية | الوصف |
|---------|-------------------|-------|
| `app_name` | Pyra Workspace | اسم التطبيق |
| `app_logo_url` | (فارغ) | رابط اللوجو |
| `primary_color` | #8b5cf6 | اللون الأساسي |
| `max_upload_size` | 524288000 | الحد الأقصى للرفع (500MB) |
| `allow_public_shares` | true | السماح بالمشاركة |
| `share_default_expiry_hours` | 24 | مدة المشاركة الافتراضية |
| `session_timeout_minutes` | 480 | انتهاء الجلسة (8 ساعات) |
| `max_failed_logins` | 5 | محاولات فاشلة قبل القفل |
| `lockout_duration_minutes` | 15 | مدة القفل |
| `auto_version_on_upload` | true | حفظ إصدارات تلقائياً |
| `max_versions_per_file` | 10 | حد الإصدارات |
| `trash_auto_purge_days` | 30 | حذف المهملات بعد |

### Session Management
- جدول `pyra_sessions` يتتبع الجلسات النشطة
- يمكن عرض جلسات المستخدم مع (IP, user-agent, last activity)
- يمكن إنهاء جلسة محددة أو كل الجلسات
- `trackSession()` يحدّث `last_activity` كل 5 دقائق

### Login History
- جدول `pyra_login_attempts` يسجل كل محاولة (ناجحة وفاشلة)
- مع username, IP, success, timestamp

### Keyboard Shortcuts
| Shortcut | Action |
|----------|--------|
| `Alt + Left` | رجوع |
| `Ctrl + S` | حفظ (في وضع التحرير) |
| `Ctrl + Shift + F` | بحث عميق |
| `Escape` | إغلاق المعاينة/النافذة |
| `Delete` | حذف الملف المحدد |

### Context Menu (قائمة Right-Click)
- **للملفات:** Download, Copy Link, Share, Edit name, View permissions, Delete
- **للمجلدات:** Open, Copy Path, Set Permissions, Delete
- الأزرار تظهر/تختفي حسب الصلاحيات
- Admin يشوف "Manage Permissions" إضافي

---

## 13. قاعدة البيانات — الجداول الكاملة (14 جدول)

| # | الجدول | الحقول الرئيسية | الوظيفة |
|---|--------|----------------|---------|
| 1 | `pyra_users` | id, username, password_hash, role, display_name, permissions(JSONB) | المستخدمين |
| 2 | `pyra_reviews` | id, file_path, username, type, text, resolved, parent_id | المراجعات |
| 3 | `pyra_trash` | id, original_path, trash_path, file_name, deleted_by, auto_purge_at | المهملات |
| 4 | `pyra_activity_log` | id, action_type, username, target_path, details(JSONB), ip_address | سجل النشاط |
| 5 | `pyra_notifications` | id, recipient_username, type, title, message, target_path, is_read | الإشعارات |
| 6 | `pyra_share_links` | id, token, file_path, expires_at, access_count, max_access, is_active | روابط المشاركة |
| 7 | `pyra_teams` | id, name, description, permissions(JSONB), created_by | الفرق |
| 8 | `pyra_team_members` | id, team_id(FK), username, added_by | عضوية الفرق |
| 9 | `pyra_file_permissions` | id, file_path, target_type, target_id, permissions(JSONB), expires_at | صلاحيات الملفات |
| 10 | `pyra_file_versions` | id, file_path, version_path, version_number, file_size, created_by | إصدارات الملفات |
| 11 | `pyra_file_index` | id, file_path, file_name, file_name_lower, folder_path, file_size | فهرس البحث |
| 12 | `pyra_settings` | key, value, updated_by, updated_at | إعدادات النظام |
| 13 | `pyra_sessions` | id, username, ip_address, user_agent, last_activity | الجلسات |
| 14 | `pyra_login_attempts` | id, username, ip_address, success, attempted_at | محاولات الدخول |

**فهارس:** 28 index معرّفة في schema.sql
**RLS:** معطّل على كل الجداول (التطبيق يستخدم service_role)

---

## 14. تحليل لبوابة العميل (Client Portal) — ما هو موجود وما ينقص

### ✅ ما هو موجود حالياً للعميل:
1. **دور `client`** معرّف بالفعل
2. **Dashboard عميل** مع: مشاريعي (folder stats) + مراجعاتي + نشاط حديث
3. **تصفح ملفات** مع قيود المسارات
4. **معاينة ملفات** (كل الأنواع)
5. **تحميل ملفات** (لو `can_download=true`)
6. **مراجعات/تعليقات** (لو `can_review=true`)
7. **إشعارات** بالتعليقات والتحديثات
8. **روابط مشاركة** للوصول الخارجي

### ❌ ما ينقص لبوابة عميل كاملة:
1. **نظام موافقة رسمي** — حالياً: approval هو مجرد review type، مافي workflow
2. **"طلب تعديلات"** — مافي زر reject أو request changes
3. **حالات المشروع** — مافي: draft → review → approved → final
4. **لوحة مشاريع بصرية** — Dashboard الحالي بسيط (folder stats فقط)
5. **Self-registration** — العميل لازم Admin يضيفه يدوياً
6. **Branded login** — مافي customization لكل عميل
7. **Deadline tracking** — مافي تواريخ استحقاق
8. **Email notifications** — إشعارات داخلية فقط
9. **Comments on specific areas** — التعليقات على مستوى الملف فقط
10. **Approval workflow** — مافي: "approve all" أو "batch review"

### 📐 Architecture ملائمة للتوسع:
- **API-first:** كل شيء عبر api.php — سهل إضافة endpoints جديدة
- **Permission system مرن:** JSONB + ثلاث طبقات — يقدر يتوسع
- **Single file pattern:** ما يحتاج routing — مجرد case جديد في switch
- **Dashboard per-role:** جاهز — مجرد إضافة widgets
- **Schema extensible:** PostgreSQL + JSONB — يقدر يتحمل أي بنية

### 🚀 الخطوات المقترحة لإضافة Client Portal:
1. **إضافة جدول `pyra_project_status`**: path, status (draft/review/approved/final), deadline
2. **إضافة `request_changes` review type**: مع auto-notification
3. **Client Dashboard محسّن**: timeline, status badges, progress bars
4. **Approval workflow**: required reviewers, all-approved gate
5. **Email integration**: PHPMailer for critical notifications
6. **Client onboarding**: invitation link → setup wizard
7. **Custom branding per-client**: logo, colors في pyra_settings مرتبطة بالـ path

---

## 15. الملخص التقني

| الجانب | التقييم |
|--------|---------|
| **Code Quality** | ممتاز — organized, consistent, well-commented |
| **Security** | جيد جداً — bcrypt, CSRF, path sanitization, session security, lockout |
| **Architecture** | بسيط ونظيف — 4 ملفات PHP + 1 JS + 1 CSS |
| **Scalability** | متوسط — single-file API قد يكون bottleneck مع 50+ endpoint |
| **Performance** | جيد — file index for search, concurrent uploads, lazy loading |
| **UX** | ممتاز — dark luxury theme, animations, keyboard shortcuts, responsive |
| **Extensibility** | ممتاز — API-first, JSONB permissions, switch-case pattern سهل الإضافة |
| **Documentation** | ممتاز — README شامل + ROADMAP مفصّل |
| **Dependencies** | الحد الأدنى — PHP نقي + mammoth.js فقط |
| **Test Coverage** | لا يوجد — لا اختبارات |

### الحجم:
- **Backend:** ~2,620 سطر PHP
- **Frontend:** ~4,089 سطر JS
- **Styling:** ~4,299 سطر CSS
- **Database:** ~250 سطر SQL (14 جدول + 28 index)
- **المجموع:** ~11,258 سطر
