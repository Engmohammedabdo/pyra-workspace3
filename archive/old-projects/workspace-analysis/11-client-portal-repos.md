# 🔍 Client Portal Repos — بحث التوافق مع Pyra Workspace

**تاريخ البحث:** 2026-02-14  
**الهدف:** إيجاد repos نقدر نسحب منها ميزات Client Portal وندمجها في Pyra Workspace

---

## 📊 السياق — Pyra Workspace Stack الحالي

| العنصر | التقنية |
|--------|---------|
| Backend | PHP خام (بدون framework) |
| Frontend | Vanilla JS + CSS3 (بدون React/Vue) |
| Database | Supabase PostgreSQL (PostgREST API) |
| Auth | PHP Sessions + bcrypt + CSRF |
| Roles | admin, editor, viewer |
| Files | Upload/Download/Preview/Share/Versioning |
| Review | Comments + Approvals + Threaded replies |
| Dependencies | لا composer، لا npm — كل شي vanilla |

---

## 📋 جدول كل الـ Repos المكتشفة

| # | الاسم | النجوم | Stack | التوافق (1-10) | الرخصة |
|---|-------|--------|-------|----------------|--------|
| 1 | **ProjectSend** | ~1.4k ⭐ | PHP + jQuery + MySQL | **8/10** | GPL v2 |
| 2 | **ITFlow** | ~700 ⭐ | PHP خام + MySQL + jQuery/Bootstrap | **9/10** | GPL |
| 3 | **Client-Portal (HenryCooper)** | ~5 ⭐ | PHP خام + TailwindCSS + Alpine.js + MySQL | **9/10** | غير محدد |
| 4 | **EspoCRM** | ~8k ⭐ | PHP + Backbone.js (SPA) + MySQL | **5/10** | AGPL v3 |
| 5 | **AgencyOS (Directus)** | ~1.2k ⭐ | Nuxt 3 + Directus + Vue | **3/10** | MIT |
| 6 | **Invoice Ninja** | ~8.5k ⭐ | Laravel + Flutter/React | **2/10** | Elastic License |
| 7 | **KodBox** | ~3.1k ⭐ | PHP + jQuery + MySQL | **6/10** | GPL v3 |
| 8 | **Design Approval System** | ~100 ⭐ | WordPress Plugin (PHP) | **5/10** | GPL v2 |
| 9 | **click2approve** | ~50 ⭐ | ASP.NET + React + MySQL | **1/10** | MIT |
| 10 | **Perfex CRM (modules)** | N/A (commercial) | CodeIgniter (PHP) | **6/10** | Commercial |

### ميزات كل Repo:

| # | Repo | Client Login | File Viewing | Approval | Project Track | Comments | Notifications | Invoicing | Branding |
|---|------|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| 1 | ProjectSend | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ | ✅ |
| 2 | ITFlow | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 3 | Client-Portal (HC) | ✅ | ✅ | ❌ | ✅ | ❌ | ✅ | ❌ | ✅ |
| 4 | EspoCRM | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 5 | AgencyOS | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 6 | Invoice Ninja | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | ✅ | ✅ |
| 7 | KodBox | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ | ✅ |
| 8 | Design Approval | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| 9 | click2approve | ✅ | ✅ | ✅ | ❌ | ❌ | ✅ | ❌ | ❌ |
| 10 | Perfex CRM | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## 🏆 أفضل 5 Repos — تحليل مفصل

---

### 1. 🥇 ITFlow — الأقرب لـ Pyra Workspace (التوافق: 9/10)

**الرابط:** https://github.com/itflow-org/itflow  
**النجوم:** ~700 ⭐  
**الرخصة:** GPL  

#### Stack:
- ✅ **PHP خام** — بدون framework!
- ✅ **jQuery + Bootstrap** — vanilla-friendly
- ✅ **MySQL** (نقدر نحوله لـ Supabase PostgreSQL)
- ✅ **لا composer ولا npm ثقيل**

#### الميزات المتوفرة:
- ✅ Client Portal مدمج — login مستقل للعملاء
- ✅ Dashboard للعميل — يشوف التذاكر والفواتير والملفات
- ✅ File management — رفع وتحميل ملفات
- ✅ Ticketing system — تواصل العميل مع الفريق
- ✅ Invoicing + Quotes — فوترة كاملة
- ✅ Notifications — إشعارات بريدية
- ✅ Multi-user roles — صلاحيات متعددة
- ✅ Custom branding — تخصيص الألوان والشعار

#### إيش نقدر ناخذ:
1. **نظام Client Portal Login** — كود PHP خام، نسخه مباشرة
2. **Client Dashboard layout** — HTML/CSS/jQuery، نقدر نحوله لـ vanilla JS بسهولة
3. **Ticket/messaging system** — كـ base لنظام التعليقات والتواصل
4. **Invoice display** — عرض الفواتير للعميل
5. **Notification system** — Email notifications logic

#### كيف ندمجه:
```
1. ندرس ملفات portal/ في الـ repo
2. نسحب الـ PHP logic لـ client auth (منفصل عن staff auth)
3. نحول الـ MySQL queries لـ Supabase PostgREST calls
4. ناخذ الـ UI templates ونعدلها بألوان Pyramedia
5. ندمج file viewing مع نظام الملفات الموجود عندنا
```

---

### 2. 🥈 ProjectSend — الأشهر لمشاركة الملفات مع العملاء (التوافق: 8/10)

**الرابط:** https://github.com/projectsend/projectsend  
**النجوم:** ~1,400 ⭐  
**الرخصة:** GPL v2  

#### Stack:
- ✅ **PHP** — أساسي
- ✅ **jQuery** — للتفاعل
- ⚠️ يستخدم **composer** لبعض الـ dependencies
- ✅ **MySQL** (نحوله لـ Supabase)

#### الميزات المتوفرة:
- ✅ Client login منفصل — username + password
- ✅ File sharing مع العملاء — الـ core feature
- ✅ Client groups — مجموعات عملاء
- ✅ Email notifications — عند رفع ملف جديد
- ✅ Upload expiration — صلاحية الملفات
- ✅ Multi-language support
- ✅ Themes + branding
- ✅ Detailed activity logs
- ❌ لا يوجد approval system
- ❌ لا يوجد project tracking
- ❌ لا يوجد comments/messaging

#### إيش نقدر ناخذ:
1. **نظام مشاركة الملفات مع العملاء** — الـ core: كيف ترفع ملف وتربطه بعميل
2. **Client groups logic** — تنظيم العملاء في مجموعات
3. **Email notification templates** — قوالب الإشعارات
4. **File expiration logic** — صلاحية الملفات
5. **Download tracking** — تتبع من حمّل إيش

#### كيف ندمجه:
```
1. ندرس includes/Classes/ — خاصة Users, Groups, Files
2. نسحب logic مشاركة الملفات مع العملاء
3. نضيف طبقة client_files في Supabase
4. نربط كل ملف بـ client_id + project_id
5. نستخدم Supabase Storage بدل نظام الملفات المحلي
```

---

### 3. 🥉 Client-Portal (HenryCooper) — أبسط وأقرب للـ stack (التوافق: 9/10)

**الرابط:** https://github.com/HenryCooperBBS/Client-Portal  
**النجوم:** ~5 ⭐ (مشروع صغير لكن مفيد)  
**الرخصة:** غير محدد  

#### Stack:
- ✅ **PHP خام** — بدون أي framework!
- ✅ **TailwindCSS** — نقدر نحوله لـ CSS3
- ✅ **Alpine.js** — خفيف جداً، قريب من vanilla JS
- ✅ **MySQL (PDO)**

#### الميزات المتوفرة:
- ✅ User authentication — login/logout
- ✅ Project uploads — name, comment, image, links
- ✅ Group-based visibility — Client, Internal, Public
- ✅ Like system (AJAX)
- ✅ In-app notifications
- ✅ Admin panel — users, groups, projects
- ✅ Image previews
- ✅ Responsive design

#### إيش نقدر ناخذ:
1. **Group-based visibility system** — ممتاز! نفس اللي نبيه
2. **Project upload structure** — name + comment + image + links
3. **Admin panel for user/group management**
4. **AJAX like system** — نحوله لـ approval system

#### كيف ندمجه:
```
1. الـ repo صغير — نقدر نقرأ كل الكود بساعة
2. نسحب visibility logic ونطبقه على ملفاتنا
3. نحول Alpine.js snippets لـ vanilla JS
4. نحول TailwindCSS لـ CSS classes العادية
5. نغير MySQL لـ Supabase PostgREST
```

---

### 4. Design Approval System (WordPress Plugin) — مرجع للـ Approval Logic (التوافق: 5/10)

**الرابط:** https://github.com/wp-plugins/design-approval-system  
**الرخصة:** GPL v2  

#### Stack:
- ⚠️ **WordPress plugin** — PHP لكن مربوط بـ WP
- ✅ الـ logic نفسه PHP خام

#### الميزات المتوفرة:
- ✅ Client login — يشوف تصاميمه
- ✅ Design review pages — عرض التصميم كامل
- ✅ **Approval system** — يوافق ✅ أو يرفض ❌
- ✅ **Digital signature** — توقيع رقمي عند الموافقة!
- ✅ Project board — كل المشاريع في صفحة واحدة
- ✅ Version history — إصدارات سابقة
- ✅ Email notifications — تلقائية
- ✅ Designer + Client notes — ملاحظات من الطرفين
- ✅ Star indicator — نجمة على التصاميم المعتمدة

#### إيش نقدر ناخذ:
1. **Approval workflow logic** — الأهم! كيف يوافق العميل أو يرفض
2. **Digital signature concept** — ميزة مبتكرة
3. **Version comparison UI** — عرض الإصدارات السابقة
4. **Project board layout** — تنظيم المشاريع
5. **Email templates** — رسائل الموافقة/الرفض

#### كيف ندمجه:
```
1. نقرأ الـ PHP logic ونفصله عن WordPress hooks
2. ناخذ approval_status + digital_signature concept
3. نبني نظام approval في Supabase: 
   - جدول file_approvals (file_id, client_id, status, signature, comment, timestamp)
4. نصمم UI مشابه — عرض الملف + زرين (Approve / Request Changes) + comment box
```

---

### 5. KodBox — مرجع لـ File Management UI (التوافق: 6/10)

**الرابط:** https://github.com/kalcaddle/kodbox  
**النجوم:** ~3,100 ⭐  
**الرخصة:** GPL v3  

#### Stack:
- ✅ **PHP** — backend كامل
- ✅ **jQuery** — frontend
- ✅ يشتغل بـ PHP 5+ (خفيف)

#### الميزات المتوفرة:
- ✅ File manager بواجهة مثل Windows
- ✅ Multi-user + permissions
- ✅ File preview — صور، فيديو، PDF، Office docs
- ✅ File sharing — روابط مشاركة
- ✅ Online code editor
- ✅ Plugin system
- ✅ Multi-cloud storage support
- ❌ لا يوجد approval system
- ❌ لا يوجد project tracking

#### إيش نقدر ناخذ:
1. **File preview components** — عرض أنواع ملفات متعددة
2. **File sharing UI** — واجهة المشاركة
3. **Permission system** — صلاحيات الملفات

#### كيف ندمجه:
```
1. ناخذ file preview logic (خاصة لـ PDF, images, video)
2. نستخدم plugins/ كمرجع لتوسيع نظامنا
3. ناخذ أفكار الـ UI لعرض الملفات
```

---

## 🎯 التوصية النهائية — أفضل مسار لإضافة Client Portal

### المسار المُوصى: **بناء مخصص مستوحى من ITFlow + ProjectSend + Design Approval System**

**لماذا؟**
- Pyra Workspace عنده **أساس قوي جداً** — File Management + Review System + Auth كلها شغالة
- ما نحتاج نستبدل شي — نحتاج **نضيف طبقة Client Portal فوق النظام الحالي**
- الـ repos اللي لقيناها ما فيها واحد مثالي 100%، لكن كل واحد عنده قطعة ممتازة

### الاستراتيجية: Cherry-Pick من كل repo

| المصدر | إيش ناخذ منه |
|--------|-------------|
| **ITFlow** | Client Portal login + dashboard + notification system |
| **ProjectSend** | File sharing logic + client groups + download tracking |
| **Design Approval** | Approval workflow + digital signature + version history |
| **Client-Portal (HC)** | Group visibility + simple admin management |
| **KodBox** | File preview components (PDF, video, images) |

---

## 📋 خطة الدمج — خطوات عملية

### المرحلة 1: Database Schema (يوم 1-2)
```sql
-- 1. جدول العملاء
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    last_login TIMESTAMPTZ
);

-- 2. ربط العميل بالمشاريع
CREATE TABLE client_projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    project_id UUID REFERENCES projects(id),
    access_level TEXT DEFAULT 'viewer', -- viewer, commenter, approver
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. مشاركة الملفات مع العملاء
CREATE TABLE client_file_shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES files(id),
    client_id UUID REFERENCES clients(id),
    shared_by UUID REFERENCES users(id),
    expires_at TIMESTAMPTZ,
    download_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 4. نظام الموافقة
CREATE TABLE file_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    file_id UUID REFERENCES files(id),
    client_id UUID REFERENCES clients(id),
    status TEXT DEFAULT 'pending', -- pending, approved, changes_requested
    comment TEXT,
    digital_signature TEXT, -- اسم العميل كتوقيع
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. إشعارات العميل
CREATE TABLE client_notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    type TEXT NOT NULL, -- new_file, approval_needed, comment_reply
    title TEXT NOT NULL,
    message TEXT,
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. تقارير العميل
CREATE TABLE client_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    client_id UUID REFERENCES clients(id),
    project_id UUID REFERENCES projects(id),
    title TEXT NOT NULL,
    period TEXT, -- 'Jan 2026', 'Q1 2026'
    content JSONB, -- campaigns, results, metrics
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### المرحلة 2: Client Authentication (يوم 3-4)
**مستوحى من:** ITFlow + Client-Portal (HC)

```
ملفات جديدة:
├── client/
│   ├── login.php          — صفحة login العميل (مختلفة عن الفريق)
│   ├── logout.php         — تسجيل خروج
│   ├── auth.php           — PHP session management للعملاء
│   ├── dashboard.php      — داشبورد العميل الرئيسي
│   ├── middleware.php      — التحقق من صلاحيات العميل
│   └── assets/
│       ├── client.css     — تصميم خاص بالعملاء (ألوان Pyramedia)
│       └── client.js      — vanilla JS للتفاعل
```

### المرحلة 3: Client Dashboard (يوم 5-7)
**مستوحى من:** ITFlow dashboard + AgencyOS client portal

```
الداشبورد يعرض:
1. Welcome message + اسم العميل
2. مشاريعي — قائمة المشاريع مع الحالة (نشط/مكتمل/معلق)
3. ملفات جديدة — آخر الملفات المرفوعة اللي تخصه
4. بانتظار الموافقة — ملفات تحتاج موافقته
5. التعليقات — آخر التعليقات والردود
6. إشعارات — bell icon مع عداد
```

### المرحلة 4: File Viewing + Approval (يوم 8-12)
**مستوحى من:** Design Approval System + KodBox

```
صفحة عرض الملف للعميل:
1. Preview كبير (صورة/فيديو/PDF)
2. معلومات الملف (اسم، تاريخ، حجم، الإصدار)
3. زرين: ✅ Approve | ❌ Request Changes
4. Comment box — يكتب ملاحظاته
5. History — كل الإصدارات السابقة
6. Digital signature (اختياري) — اسم العميل كتأكيد
```

### المرحلة 5: Notifications + Messaging (يوم 13-15)
**مستوحى من:** ProjectSend + ITFlow

```
1. Email notifications — عند رفع ملف جديد، رد على تعليق
2. In-app notifications — bell icon مع dropdown
3. File comments — العميل يعلق على أي ملف
4. Thread replies — ردود متسلسلة (موجود أساساً في Pyra!)
```

### المرحلة 6: Reports + Branding (يوم 16-18)
```
1. Monthly reports page — الفريق يرفع تقرير، العميل يشوفه
2. Branding — 
   - شعار Pyramedia في كل صفحة
   - ألوان العلامة التجارية
   - Footer مخصص
   - Custom CSS variables للتخصيص السريع
```

---

## 📊 ملخص الجهد المتوقع

| المرحلة | المدة | التعقيد |
|---------|-------|---------|
| Database Schema | 2 أيام | 🟢 سهل |
| Client Auth | 2 أيام | 🟢 سهل (عندنا auth أساساً) |
| Client Dashboard | 3 أيام | 🟡 متوسط |
| File Viewing + Approval | 5 أيام | 🟡 متوسط |
| Notifications + Messaging | 3 أيام | 🟢 سهل (عندنا comments أساساً) |
| Reports + Branding | 3 أيام | 🟢 سهل |
| **المجموع** | **~18 يوم عمل** | |

---

## 💡 نقاط مهمة

### ليش ما نستخدم repo كامل؟
1. **Pyra Workspace عنده أساس أفضل** — File Management + Review System شغال ومتكامل مع Supabase
2. **كل الـ repos تستخدم MySQL** — نحتاج نحول لـ Supabase PostgreSQL
3. **معظمها تستخدم npm/composer** — إحنا vanilla
4. **AgencyOS الأكمل ميزات** لكن Stack مختلف تماماً (Nuxt + Directus)
5. **الأسرع والأنظف:** نبني Client Portal كـ layer فوق النظام الحالي

### الميزة الأكبر:
- **عندنا 80% من البنية التحتية جاهزة!**
- Auth ✅ | Files ✅ | Comments ✅ | Approvals ✅ | Roles ✅
- كل اللي نحتاجه: **طبقة عرض جديدة للعملاء + جدول clients + ربط**

### أولوية التنفيذ:
1. 🔴 **Client Login + Dashboard** — الأهم
2. 🔴 **File Viewing + Approval** — القيمة الأساسية
3. 🟡 **Notifications** — مهم لكن مو عاجل
4. 🟡 **Reports** — يجي بعدين
5. 🟢 **Branding** — CSS فقط، ممكن بأي وقت
