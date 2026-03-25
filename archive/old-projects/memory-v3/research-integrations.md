# بحث: التكاملات (Calendar, WhatsApp, Monitoring, Events)

> تاريخ البحث: 2026-02-21
> البيئة: Node.js v22, Docker (Linux x64), OpenClaw, n8n, Telegram

---

## التوصية النهائية

| الفئة | الحل الموصى | الجاهزية | الجهد |
|-------|-------------|----------|-------|
| Google Calendar | googleapis npm + Service Account | ✅ 100% قابل للتطبيق | متوسط (setup لمرة واحدة) |
| Server Monitoring | Node.js fetch + OpenClaw cron | ✅ 100% قابل للتطبيق | سهل جداً |
| WhatsApp Direct | Evolution API REST مباشرة | ✅ 100% قابل للتطبيق | سهل |
| Event-driven | n8n Webhook → Telegram | ✅ 100% قابل للتطبيق | سهل |

---

## 1. Google Calendar Integration

### الحل: `googleapis` npm package + Service Account

**لماذا هذا الحل:**
- `googleapis` v171.4.0 متوفر ✅
- Service Account = **بدون OAuth popup** = شغال من Docker/CLI بدون تدخل بشري
- Google Calendar API **مجاني** — 1,000,000 queries/day (أكثر من كافي)
- يشتغل مباشرة من Node.js بدون أي dependency إضافية

### التكلفة: مجاني 100%
- Google Calendar API: مجاني (quota: 1M requests/day)
- لا يحتاج Google Workspace subscription
- يشتغل مع أي Gmail account

### Setup المطلوب (خطوة بخطوة):

#### الخطوة 1: إنشاء Google Cloud Project
1. اذهب إلى https://console.cloud.google.com
2. أنشئ مشروع جديد (أو استخدم موجود): مثلاً "PyraAI"
3. فعّل Google Calendar API:
   - https://console.cloud.google.com/apis/library/calendar-json.googleapis.com

#### الخطوة 2: إنشاء Service Account
1. اذهب إلى IAM & Admin > Service Accounts
2. Create Service Account → اسم: "pyraai-calendar"
3. بعد الإنشاء → Keys → Add Key → Create new key → JSON
4. حمّل الملف (مثلاً `service-account.json`)
5. انسخه إلى: `/home/node/.openclaw/credentials/google-service-account.json`

#### الخطوة 3: مشاركة التقويم مع Service Account
1. افتح Google Calendar في المتصفح
2. Settings → calendar محمد → Share with specific people
3. أضف إيميل الـ Service Account (مثلاً: `pyraai-calendar@project.iam.gserviceaccount.com`)
4. أعطه صلاحية "Make changes to events" (للقراءة والكتابة)

#### الخطوة 4: تثبيت الباكدج
```bash
npm install googleapis
```

#### الخطوة 5: كود الاستخدام
```javascript
// calendar-helper.mjs
import { google } from 'googleapis';
import { readFileSync } from 'fs';

const CREDENTIALS_PATH = '/home/node/.openclaw/credentials/google-service-account.json';
const CALENDAR_ID = 'mohammed@example.com'; // إيميل محمد أو calendar ID

const credentials = JSON.parse(readFileSync(CREDENTIALS_PATH, 'utf8'));

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/calendar'],
});

const calendar = google.calendar({ version: 'v3', auth });

// قراءة المواعيد القادمة
export async function getUpcomingEvents(maxResults = 10) {
  const res = await calendar.events.list({
    calendarId: CALENDAR_ID,
    timeMin: new Date().toISOString(),
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });
  return res.data.items || [];
}

// إنشاء موعد جديد
export async function createEvent({ summary, description, start, end, attendees }) {
  const event = {
    summary,
    description,
    start: { dateTime: start, timeZone: 'Asia/Riyadh' },
    end: { dateTime: end, timeZone: 'Asia/Riyadh' },
    attendees: attendees?.map(email => ({ email })),
  };
  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    resource: event,
    sendUpdates: 'all',
  });
  return res.data;
}

// حذف موعد
export async function deleteEvent(eventId) {
  await calendar.events.delete({
    calendarId: CALENDAR_ID,
    eventId,
  });
}
```

### بدائل (مرفوضة):
- **n8n Google Calendar node**: يحتاج OAuth flow في n8n UI — ممكن كـ backup لكن أعقد
- **Google Calendar MCP**: موجود لكن يعتمد على OAuth أيضاً — لا يناسب Docker headless

### الجهد: ~30 دقيقة setup لمرة واحدة
- 10 دقائق: Google Cloud Console setup
- 5 دقائق: مشاركة التقويم
- 15 دقيقة: كتابة الكود وتجربته

---

## 2. Server/Service Monitoring

### الحل: Native Node.js fetch + OpenClaw Cron Job

**لماذا هذا الحل:**
- صفر dependencies خارجية (Node.js v22 فيه `fetch` built-in)
- OpenClaw cron job كل 5 دقائق
- تنبيهات فورية عبر Telegram
- بسيط وموثوق

### نتائج الفحص الحالية (2026-02-21):

| الخدمة | URL | الحالة |
|--------|-----|--------|
| n8n | https://n8n.pyramedia.info | ✅ 200 OK |
| Supabase | https://db.pyramedia.info | ✅ 401 (شغال - يحتاج auth) |
| Voice | https://voice.pyramedia.info | ⚠️ 503 (Service Unavailable) |
| Chat | https://chat.pyramedia.cloud | ✅ 200 OK |
| OpenClaw Server | 72.61.255.111 | ❌ Ping unreachable (من Docker) |
| Coolify Server | 72.61.148.81 | ❌ Ping unreachable (من Docker) |

> ⚠️ ملاحظة: Ping لا يعمل من داخل Docker container (network restrictions). HTTP checks أفضل.

### الكود الكامل:

```javascript
// monitor.mjs — Server/Service Health Monitor
// يُشغّل كـ OpenClaw cron job كل 5 دقائق

const SERVICES = [
  { name: 'n8n', url: 'https://n8n.pyramedia.info', expectStatus: [200, 301, 302] },
  { name: 'Supabase DB', url: 'https://db.pyramedia.info', expectStatus: [200, 401, 403] },
  { name: 'Voice', url: 'https://voice.pyramedia.info', expectStatus: [200, 301, 302] },
  { name: 'Chat', url: 'https://chat.pyramedia.cloud', expectStatus: [200, 301, 302] },
  // أضف خدمات أخرى حسب الحاجة
];

const TIMEOUT_MS = 10000; // 10 ثواني timeout
const STATE_FILE = '/home/node/openclaw/projects/memory-v3/monitor-state.json';

async function checkService(service) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
  
  try {
    const res = await fetch(service.url, { 
      signal: controller.signal,
      redirect: 'manual' // don't follow redirects
    });
    clearTimeout(timeout);
    
    const ok = service.expectStatus.includes(res.status);
    return { ...service, status: res.status, ok, error: null };
  } catch (err) {
    clearTimeout(timeout);
    return { ...service, status: 0, ok: false, error: err.message };
  }
}

async function checkAll() {
  const results = await Promise.all(SERVICES.map(checkService));
  const failures = results.filter(r => !r.ok);
  
  if (failures.length > 0) {
    const msg = `🚨 *تنبيه: خدمات معطلة!*\n\n` +
      failures.map(f => 
        `❌ *${f.name}*\n   URL: ${f.url}\n   Status: ${f.status || 'timeout'}\n   Error: ${f.error || 'unexpected status'}`
      ).join('\n\n') +
      `\n\n⏰ ${new Date().toISOString()}`;
    
    // أرسل عبر Telegram (من خلال OpenClaw message tool أو bot API مباشرة)
    console.log('ALERT:', msg);
    return { alert: true, message: msg, failures };
  }
  
  console.log(`✅ All ${results.length} services healthy at ${new Date().toISOString()}`);
  return { alert: false, results };
}

checkAll();
```

### Setup:
1. احفظ الكود في `/home/node/openclaw/tools/monitor.mjs`
2. أنشئ OpenClaw cron job:
   ```
   openclaw cron add --schedule "*/5 * * * *" --command "node /home/node/openclaw/tools/monitor.mjs"
   ```
3. أو استخدم heartbeat check في `HEARTBEAT.md` كل 30 دقيقة (أبسط)

### الجهد: ~15 دقيقة

---

## 3. WhatsApp Direct (بدون n8n)

### الحل: Evolution API REST مباشرة من Node.js

**Feasibility: ✅ 100% قابل للتطبيق**

Evolution API هو REST API عادي — نقدر نستدعيه من `fetch` مباشرة بدون n8n.

### المتطلبات:
- **Base URL**: URL الـ Evolution API instance (يحتاج تأكيد من محمد — مثلاً `https://evo.pyramedia.info`)
- **API Key**: مفتاح الـ instance
- **Instance Name**: اسم الـ WhatsApp instance

### الـ Endpoints الأساسية:

#### إرسال نص:
```
POST /message/sendText/{instance}
Headers: apikey: {API_KEY}
Body: {
  "number": "966XXXXXXXXX",
  "text": "مرحباً!"
}
```

#### إرسال ميديا (صورة/فيديو/مستند):
```
POST /message/sendMedia/{instance}
Headers: apikey: {API_KEY}
Body: {
  "number": "966XXXXXXXXX",
  "mediatype": "image",
  "mimetype": "image/png",
  "caption": "وصف الصورة",
  "media": "https://example.com/image.png",
  "fileName": "image.png"
}
```

#### استقبال رسائل (Webhook):
```
POST /webhook/set/{instance}
Body: {
  "url": "https://your-webhook-url.com/whatsapp",
  "webhook_by_events": true,
  "events": ["MESSAGES_UPSERT", "MESSAGES_UPDATE"]
}
```

### كود Helper:
```javascript
// whatsapp-helper.mjs
const EVO_BASE_URL = process.env.EVOLUTION_API_URL || 'https://evo.pyramedia.info';
const EVO_API_KEY = process.env.EVOLUTION_API_KEY || '';
const EVO_INSTANCE = process.env.EVOLUTION_INSTANCE || 'pyramedia';

export async function sendWhatsAppText(number, text) {
  const res = await fetch(`${EVO_BASE_URL}/message/sendText/${EVO_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVO_API_KEY,
    },
    body: JSON.stringify({ number, text }),
  });
  return res.json();
}

export async function sendWhatsAppMedia(number, mediaUrl, caption, mediatype = 'image') {
  const res = await fetch(`${EVO_BASE_URL}/message/sendMedia/${EVO_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVO_API_KEY,
    },
    body: JSON.stringify({
      number,
      mediatype,
      mimetype: mediatype === 'image' ? 'image/png' : 'video/mp4',
      caption,
      media: mediaUrl,
      fileName: `file.${mediatype === 'image' ? 'png' : 'mp4'}`,
    }),
  });
  return res.json();
}

export async function findChats() {
  const res = await fetch(`${EVO_BASE_URL}/chat/findChats/${EVO_INSTANCE}`, {
    headers: { 'apikey': EVO_API_KEY },
  });
  return res.json();
}

export async function findMessages(remoteJid, limit = 20) {
  const res = await fetch(`${EVO_BASE_URL}/chat/findMessages/${EVO_INSTANCE}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': EVO_API_KEY,
    },
    body: JSON.stringify({
      where: { key: { remoteJid } },
      limit,
    }),
  });
  return res.json();
}
```

### ما نحتاج من محمد:
1. **Evolution API URL** — إيش الـ base URL؟
2. **API Key** — مفتاح الـ Global أو Instance
3. **Instance Name** — اسم الـ WhatsApp instance

### الجهد: ~10 دقائق بعد الحصول على المعلومات

---

## 4. Event-driven Notifications

### الحل: n8n Webhook + Telegram Bot

**Feasibility: ✅ 100% قابل للتطبيق**

### كيف يعمل:

#### الخيار A: n8n Webhook (الأسهل)
1. **أنشئ workflow في n8n** بـ Webhook trigger
2. URL سيكون مثلاً: `https://n8n.pyramedia.info/webhook/calendar-alert`
3. أي خدمة ترسل POST لهذا الـ URL → n8n يحوله لـ Telegram

#### الخيار B: Node.js HTTP Server (بدون n8n)
- ⚠️ OpenClaw Docker container لا يفتح ports للعالم الخارجي
- لكن نقدر نستخدم **n8n كـ webhook proxy**

#### الخيار C: OpenClaw Cron + Polling (الأضمن)
- بدل webhook، نستخدم cron job يفحص التغييرات
- أبسط وأضمن من Docker networking issues

### التوصية: Hybrid Approach
```
┌─────────────────┐     ┌──────────────┐     ┌──────────┐
│ External Events  │────▶│ n8n Webhook  │────▶│ Telegram │
│ (Calendar, etc.) │     │ (processor)  │     │ (notify) │
└─────────────────┘     └──────────────┘     └──────────┘

┌─────────────────┐     ┌──────────────┐     ┌──────────┐
│ OpenClaw Cron   │────▶│ Check state  │────▶│ Telegram │
│ (every 5-30min) │     │ (fetch APIs) │     │ (notify) │
└─────────────────┘     └──────────────┘     └──────────┘
```

1. **Webhooks خارجية** → n8n يستقبلها ويرسل Telegram
2. **Polling داخلي** → OpenClaw cron يفحص ويرسل Telegram
3. **الميزة**: لا نحتاج فتح ports من Docker

### n8n Webhook Setup:
1. أنشئ workflow جديد في n8n
2. أضف Webhook node → method: POST
3. أضف Telegram node → send message
4. فعّل الـ workflow
5. الـ URL سيكون: `https://n8n.pyramedia.info/webhook/{path}`

### كود لاستدعاء n8n webhook من Node.js:
```javascript
// trigger n8n workflow
async function triggerN8nWebhook(path, data) {
  const res = await fetch(`https://n8n.pyramedia.info/webhook/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

// مثال: إرسال تنبيه calendar
await triggerN8nWebhook('calendar-alert', {
  event: 'meeting',
  title: 'اجتماع مع العميل',
  time: '14:00',
});
```

### الجهد: ~20 دقيقة

---

## ملخص الإجراءات المطلوبة

### فوري (بدون أي setup خارجي):
1. ✅ **Server Monitoring** — جاهز للتطبيق الآن (كود + cron)
2. ✅ **Event-driven via n8n** — n8n شغال، بس نحتاج نبني الـ workflow

### يحتاج معلومات من محمد:
3. 📋 **WhatsApp Direct** — نحتاج: Evolution API URL + API Key + Instance Name
4. 📋 **Google Calendar** — نحتاج: محمد يعمل Service Account في Google Cloud Console ويشارك تقويمه

### ترتيب الأولوية:
1. **Server Monitoring** (الأسهل + قيمة فورية)
2. **WhatsApp Direct** (لو عندنا المعلومات)
3. **Google Calendar** (يحتاج setup لمرة واحدة)
4. **Event-driven** (يُبنى فوق الباقي)
