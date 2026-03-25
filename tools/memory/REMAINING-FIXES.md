# خطة إصلاح النواقص الأربعة

## Fix 1: Auto-Ingest Cron Job
- **المشكلة:** Auto-ingest يدوي فقط
- **الحل:** cron job كل 6 ساعات يشغّل auto-ingest
- **الملفات:** openclaw.json (cron config)
- **الاختبار:** تشغيل يدوي + التأكد من ingest-state.json

## Fix 2: ربط مع OpenClaw memory_search
- **المشكلة:** memory_search بيروح للـ markdown مش SQLite
- **الحل:** hook script يربط بين OpenClaw tools والـ SQLite DB
- **الملفات:** tools/memory/openclaw-bridge.mjs
- **الاختبار:** memory_search يرجع نتائج من SQLite

## Fix 3: Confidence Tracking
- **المشكلة:** العمود موجود بس ما بيتحدث
- **الحل:** زيادة confidence عند التأكيد، نقصان عند التناقض
- **الملفات:** ingest.mjs (findDuplicate section)
- **الاختبار:** add same fact twice → confidence increases

## Fix 4: Auto-Ingest Cron Integration
- **المشكلة:** hygiene يشتغل عند init بس مش scheduled
- **الحل:** دمج hygiene + auto-ingest + snapshot في cron واحد
- **الملفات:** tools/memory/daily-maintenance.mjs
- **الاختبار:** single command يعمل الثلاثة
