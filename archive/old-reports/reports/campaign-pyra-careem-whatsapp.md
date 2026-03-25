# تقرير حملة Pyra AI x Careem — WhatsApp Leads

**التاريخ:** 2026-02-13 22:23 UTC  
**الحالة:** ⚠️ مكتملة جزئياً — تحتاج تدخل يدوي

---

## 📊 ملخص سريع

| العنصر | الحالة | ID |
|--------|--------|-----|
| Campaign | ✅ تم إنشاؤها | `120241759764280454` |
| Ad Set | ✅ تم إنشاؤه | `120241759817430454` |
| Video | ✅ تم رفعه | `1262449622520927` |
| Ad Creative | ✅ تم إنشاؤه | `1653185059375217` |
| Ad | ❌ فشل — يحتاج مصادقة الحساب | - |
| Custom Audience | ❌ فشل — صلاحيات API | - |

---

## 🔗 المعرفات والبيانات

```
Business ID:       414913082857474 (PyramediaX)
Ad Account:        act_2635756323489697 (New PyramediaX)
Page ID:           131736580824607 (Pyramedia Marketing & AI Automation)
IG Account ID:     17841444106711140 (@pyramedia.dxb)
IG User ID:        44089126223
Campaign ID:       120241759764280454
Ad Set ID:         120241759817430454
Video ID:          1262449622520927 (39.2 ثانية — ready)
Creative ID:       1653185059375217 (IN_PROCESS)
Dubai City Key:    368
Abu Dhabi City Key: 95
```

---

## ✅ الخطوات المكتملة

### الخطوة 1: جمع المعلومات ✅
- ✅ Business ID + Page ID + IG Account ID
- ✅ City Keys (Dubai=368, Abu Dhabi=95)
- ⚠️ IG Media ID: لم أقدر أجيبه من API (صلاحية `instagram_basic` مفقودة) — تم رفع الفيديو يدوياً بدلاً من استخدام existing post

### الخطوة 2: Custom Audience ❌
- **السبب:** خطأ `#2654 Invalid Event Name` — API v21.0 غيّر format الـ engagement rules
- **الحل:** الحملة تعمل بـ broad targeting (بدون custom audience)
- **التوصية:** أنشئ الـ Custom Audience يدوياً من Ads Manager → Audiences → Create → Custom Audience → Instagram Account → All engagers 90 days

### الخطوة 3: Campaign ✅
```
Name:      Pyra AI x Careem — WhatsApp Leads
Objective: OUTCOME_ENGAGEMENT
Status:    PAUSED ✅
```

### الخطوة 4: Ad Set ✅
```
Name:             Dubai+AbuDhabi | IG Only | Broad | IG Direct Messages
Daily Budget:     10,000 fils (100 AED)
Billing:          IMPRESSIONS
Optimization:     CONVERSATIONS
Destination:      INSTAGRAM_DIRECT ⚠️ (ليس WhatsApp — شوف التفاصيل تحت)
Bid Strategy:     LOWEST_COST_WITHOUT_CAP
Age:              25-55
Cities:           Dubai + Abu Dhabi
Languages:        Arabic (6) + English (24)
Platforms:        Instagram only
Positions:        Feed, Reels, Stories, Explore, Explore Home
Advantage Audience: OFF
```

### الخطوة 5A: Video Upload ✅
- تم تحميل الريل من Instagram (`DUaJjYDkgkh`)
- تم رفعه لحساب الإعلانات
- الحالة: `ready` ✅

### الخطوة 5B: Ad Creative ✅
- تم إنشاؤه بنجاح مع الفيديو + thumbnail
- CTA: `INSTAGRAM_MESSAGE`
- الحالة: `IN_PROCESS` (يعالج)

### الخطوة 5C: Ad ❌
- **السبب:** حساب الإعلانات يطلب مصادقة (authentication)
- **الخطأ:** `"Please authenticate your account" (code 31, subcode 3858385)`
- **الحل:** محمد لازم يفتح Ads Manager ويعمل authenticate

---

## ⚠️ مشاكل رئيسية تحتاج حل

### 1. 🔐 مصادقة حساب الإعلانات (CRITICAL)
Meta علّقت إنشاء إعلانات جديدة لحين المصادقة.

**الخطوات:**
1. ادخل [Ads Manager](https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=2635756323489697)
2. راح يظهر لك banner أو popup يطلب verify/authenticate
3. أكمل خطوات التحقق
4. بعدها أنشئ الـ Ad يدوياً أو أعد تشغيل هذا الـ agent

### 2. 📱 WhatsApp Business Account غير متصل (CRITICAL)
الرقم `+971565799505` المربوط بالصفحة هو **واتساب شخصي** وليس واتساب بزنس.

**الخطأ:** `"The WhatsApp number linked to your Page is a personal account"`

**الحلول:**
- **الخيار 1:** حوّل الرقم إلى [WhatsApp Business App](https://business.whatsapp.com/)
- **الخيار 2:** ربط رقم واتساب بزنس من [Meta Business Suite](https://business.facebook.com/settings/whatsapp-accounts/)
- **الخيار 3 (المؤقت):** ✅ تم استخدام `INSTAGRAM_DIRECT` بدل `WHATSAPP` — الناس يراسلون على IG DM بدل واتساب

### 3. 🔑 صلاحيات Token محدودة
Token الحالي عنده فقط: `ads_management`, `ads_read`, `business_management`, `public_profile`

**ينقصه:**
- `instagram_basic` — قراءة بوستات IG
- `instagram_content_publish` — نشر محتوى
- `pages_read_engagement` — قراءة بيانات الصفحة
- `pages_manage_posts` — إدارة بوستات الصفحة

---

## 📋 الخطوات المطلوبة من محمد

### فوري (لتشغيل الحملة):
1. ☐ **ادخل Ads Manager وأكمل المصادقة** (الأهم!)
2. ☐ **أنشئ الـ Ad يدوياً:**
   - ادخل Ad Set `120241759817430454`
   - Create Ad → Use existing creative `1653185059375217`
   - أو أنشئ Ad جديد بالفيديو المرفوع `1262449622520927`
3. ☐ **راجع الحملة** قبل التشغيل (كل شي PAUSED)

### لتفعيل WhatsApp (اختياري لكن موصى):
4. ☐ حوّل `+971565799505` إلى WhatsApp Business
5. ☐ اربطه بالصفحة من Business Suite
6. ☐ غيّر destination_type الـ Ad Set من `INSTAGRAM_DIRECT` إلى `WHATSAPP`

### لتحسين الـ Targeting:
7. ☐ أنشئ Custom Audience من Ads Manager (IG Engagers 90 يوم)
8. ☐ ضيفه على الـ Ad Set

---

## 💡 التوصيات

1. **Instagram Direct كبديل ممتاز:** IG DM يشتغل بشكل جيد للـ lead gen في الإمارات — conversion rate عادة أعلى من WhatsApp لأن الناس ما يحتاجون يتركون التطبيق

2. **Budget:** 100 AED/day مناسب كـ test budget لدبي + أبوظبي. بعد 3-5 أيام راجع الـ CPM والـ cost per conversation

3. **Targeting:** Broad targeting بدون Custom Audience ممكن يشتغل أحسن في البداية — Meta's algorithm أذكى مع Advantage+ optimization

4. **Creative:** الريل (39 ثانية) طول مناسب. بس ممكن تجرب نسخة أقصر (15 ثانية) كـ A/B test

5. **Welcome Message:** لو فعّلت WhatsApp لاحقاً، ضيف الـ welcome message:
   > "أهلاً! 👋 شفت إعلانكم وأبي أعرف أكتر عن حلول الذكاء الاصطناعي"

---

## 🔗 روابط مفيدة

- [Ads Manager - Campaign](https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=2635756323489697&selected_campaign_ids=120241759764280454)
- [Ads Manager - Ad Set](https://adsmanager.facebook.com/adsmanager/manage/adsets?act=2635756323489697&selected_adset_ids=120241759817430454)
- [Business Suite](https://business.facebook.com/latest/settings?business_id=414913082857474)
- [WhatsApp Business Setup](https://business.facebook.com/settings/whatsapp-accounts/)

---

*تم إنشاء هذا التقرير بواسطة Media Buyer Agent — 2026-02-13 22:35 UTC*
