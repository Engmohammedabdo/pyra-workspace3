# PyraStore Bot — Telegram Customer Service Demo 🛒

> ديمو بوت خدمة عملاء على تيليجرام لمتجر PyraStore UAE
> **الهدف:** نعرضه على عملاء Pyramedia بتوع المتاجر الإلكترونية كـ proof of concept

---

## 🔗 Quick Links

| Resource | Link |
|----------|------|
| **Bot** | [@pyrastore1_bot](https://t.me/pyrastore1_bot) |
| **n8n Workflow** | https://n8n.pyramedia.info/workflow/vcO2gtud9oEXGf9C |
| **Store** | https://events.pyramedia.info/ |
| **Store Repo** | github.com/Engmohammedabdo/amazon |
| **Orders Table** | `pyrastore_orders` on `db.pyramedia.info` |

---

## 🏗️ Architecture

```
Telegram (@pyrastore1_bot)
       ↓ webhook
n8n Workflow (vcO2gtud9oEXGf9C)
       ↓
┌─────────────────────────────┐
│  Telegram Trigger           │ ← receives messages
│       ↓                     │
│  AI Agent (GPT-4.1)        │ ← understands intent
│    ├─ Chat Memory (20 msg) │ ← remembers conversation
│    ├─ Tool: Search Products │ ← searches store API
│    ├─ Tool: Send Image      │ ← sends product photos
│    ├─ Tool: Save Order      │ ← saves to Supabase
│    └─ Think                 │ ← internal reasoning
│       ↓                     │
│  Send Reply (Telegram)      │ ← sends text response
└─────────────────────────────┘
```

---

## 🔑 Credentials

| What | Value | Location |
|------|-------|----------|
| Bot Token | `***REMOVED***` | pyra-voice.env (`PYRASTORE_BOT_TOKEN`) |
| n8n Credential ID | `GuTBWkUJ9qMyL8KA` | n8n (type: `telegramApi`) |
| n8n Workflow ID | `vcO2gtud9oEXGf9C` | n8n |
| Store API | `https://events.pyramedia.info/api/products.php` | Public |
| Search API | `https://events.pyramedia.info/api/search_suggestions.php?q=QUERY` | Public |
| Supabase URL | `https://db.pyramedia.info` | pyra-voice.env |
| Supabase Service Key | (in pyra-voice.env as `SUPABASE_SERVICE_KEY`) | pyra-voice.env |

---

## 🛒 Store Data

- **50 منتج** across 5 categories
- **Categories:** electronics, beauty, fashion, toys, home (+ some uncategorized)
- **Currency:** AED
- **Affiliate links:** Amazon UAE (`amazon.ae/dp/...?tag=pyrastore-21`)

### Products API Response:
```json
{
  "success": true,
  "products": [
    {
      "id": 146,
      "title": "Product Name",
      "description": "<html>",
      "image_url": "https://m.media-amazon.com/images/...",
      "price": "89.99",
      "original_price": "0.00",
      "category": "electronics",
      "affiliate_link": "https://www.amazon.ae/dp/...",
      "is_active": 1
    }
  ]
}
```

---

## 🤖 Bot Capabilities

### 1. Product Search (Arabic + English)
- يفهم فئات بالعربي: "الكترونيات" → electronics
- يبحث في أسماء المنتجات بالإنجليزي
- لو ما لقى نتائج يعرض أحدث المنتجات
- **Arabic category map:** الكترونيات، جمال، أزياء/ملابس/شنط، ألعاب، منزل/بيت/مطبخ

### 2. Product Display
- يعرض: اسم + سعر + رابط شراء
- يبعت صورة المنتج مباشرة في الشات

### 3. Order Collection (Step by Step)
1. تأكيد المنتج والسعر
2. الاسم الكامل
3. رقم الجوال
4. عنوان التوصيل
5. طريقة الدفع (كاش عند الاستلام / تحويل بنكي)
6. ملخص الأوردر + تأكيد
7. حفظ في Supabase

### 4. Order Storage (Supabase)
- Table: `pyrastore_orders`
- يحفظ: chat_id, username, name, phone, address, payment, products (JSONB), total, status, notes

---

## 🗃️ Database Schema

```sql
CREATE TABLE pyrastore_orders (
  id SERIAL PRIMARY KEY,
  telegram_chat_id TEXT,
  telegram_username TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  customer_address TEXT,
  payment_method TEXT,
  products JSONB,          -- [{"name": "...", "price": 259, "quantity": 1}]
  total_amount DECIMAL(10,2),
  status TEXT DEFAULT 'pending',  -- pending, confirmed, shipped, delivered
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## ⚙️ n8n Workflow Nodes

| # | Node | Type | Version | Purpose |
|---|------|------|---------|---------|
| 1 | Telegram Trigger | `n8n-nodes-base.telegramTrigger` | 1.1 | Receives messages from bot |
| 2 | AI Agent | `@n8n/n8n-nodes-langchain.agent` | 3 | Processes messages with AI |
| 3 | OpenRouter Chat Model | `@n8n/n8n-nodes-langchain.lmChatOpenRouter` | 1 | GPT-4.1 via OpenRouter |
| 4 | Chat Memory | `@n8n/n8n-nodes-langchain.memoryBufferWindow` | 1.3 | 20-message window per chat |
| 5 | Tool: Search Products | `@n8n/n8n-nodes-langchain.toolCode` | 1.2 | Searches store API |
| 6 | Tool: Send Image | `@n8n/n8n-nodes-langchain.toolCode` | 1.2 | Sends product images |
| 7 | Tool: Save Order | `@n8n/n8n-nodes-langchain.toolCode` | 1.2 | Saves orders to Supabase |
| 8 | Think | `@n8n/n8n-nodes-langchain.toolThink` | 1.1 | Internal reasoning |
| 9 | Send Reply | `n8n-nodes-base.telegram` | 1.2 | Sends text reply |

### ⚠️ Critical n8n Notes:
- **`fetch()` is NOT available** in toolCode — use `this.helpers.httpRequest()` instead
- **`PUT` for workflow updates** — `PATCH` not supported by n8n API
- **Activate/Deactivate:** `POST .../activate` and `POST .../deactivate`
- **Node type versions matter** — always check existing instance before building

---

## 🐛 Bugs Fixed (History)

### v1 → v2: fetch not defined
- **Problem:** toolCode used `fetch()` which doesn't exist in n8n sandbox
- **Fix:** Replaced all `fetch()` with `this.helpers.httpRequest()`

### v2 → v3: Arabic search + duplicate responses
- **Problem:** Search only worked with English; bot replied 3 times to "مرحبا"
- **Fix:** Added Arabic→English category map; clean webhook re-registration

### v3 → v4: Order data not saved + payment question repeated
- **Problem:** AI collected data but sent empty fields to Save Order tool; asked payment 3x
- **Fix:** Explicit JSON format in system prompt; "one question per message, never repeat" rule

---

## 📋 TODO / Future Improvements

- [ ] Inline keyboard buttons for categories (الكترونيات / جمال / أزياء...)
- [ ] Welcome message with /start command
- [ ] Profile picture for the bot
- [ ] Order notification to admin (Telegram message to Mohammed)
- [ ] Order status tracking ("وين أوردري؟")
- [ ] Payment confirmation (photo upload for bank transfer)
- [ ] Multi-language support (English + Arabic)
- [ ] Product recommendations based on history
- [ ] Rate limiting / spam protection
- [ ] Analytics dashboard for orders

---

## 🔄 How to Update

### Update workflow via API:
```bash
# 1. Get current workflow
curl -s "https://n8n.pyramedia.info/api/v1/workflows/vcO2gtud9oEXGf9C" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" > workflow.json

# 2. Edit workflow.json

# 3. Deactivate → Update → Activate
curl -s -X POST ".../workflows/vcO2gtud9oEXGf9C/deactivate" -H "X-N8N-API-KEY: ..."
curl -s -X PUT ".../workflows/vcO2gtud9oEXGf9C" -H "X-N8N-API-KEY: ..." -d @workflow.json
curl -s -X POST ".../workflows/vcO2gtud9oEXGf9C/activate" -H "X-N8N-API-KEY: ..."
```

### Check orders:
```bash
curl -s "https://db.pyramedia.info/rest/v1/pyrastore_orders?select=*&order=created_at.desc" \
  -H "apikey: SERVICE_KEY" -H "Authorization: Bearer SERVICE_KEY"
```

---

*Created: 2026-02-11 | By: بايرا 🦊 | For: Pyramedia*
