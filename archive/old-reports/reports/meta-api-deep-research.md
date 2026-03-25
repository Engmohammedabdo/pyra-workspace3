# Meta Marketing API — Deep Research Report
**Date:** 2026-02-13
**Source:** Perplexity AI (sonar-pro) — 8 research queries
**Purpose:** Reference for Media Buyer Agent v2

---

## 1. Campaign Creation Workflow (v21.0)

### Step 1: Campaign
- **Endpoint:** `POST /act_{AD_ACCOUNT_ID}/campaigns`
- **Required fields:** name, objective (ODAX only), status, buying_type
- **ODAX objectives (v21.0):** CONVERSIONS, LINK_CLICKS, APP_PROMOTION, AWARENESS, TRAFFIC, LEAD_GENERATION, MESSAGES
- **special_ad_categories:** NONE, HOUSING, EMPLOYMENT, CREDIT
- **CBO:** `is_using_cbo: true` at campaign level

### Step 2: Ad Set
- **Endpoint:** `POST /act_{AD_ACCOUNT_ID}/adsets`
- **Required:** name, campaign_id, daily_budget/lifetime_budget, billing_event, optimization_goal, bid_strategy, targeting, status
- **billing_event:** IMPRESSIONS, CLICKS, APP_PROMOTION, EXTERNAL_EVENT
- **destination_type:** WEBSITE, WHATSAPP, MESSENGER, INSTAGRAM_DIRECT
- **WHATSAPP requires WABA** — personal WhatsApp will fail with Error 100

### Step 3: Ad Creative
- **Endpoint:** `POST /act_{AD_ACCOUNT_ID}/adcreatives`
- **Required:** name, object_story_spec (page_id, link_data)
- **Image upload:** `POST /act_{AD_ACCOUNT_ID}/adimages` → returns image_hash

### Step 4: Ad
- **Endpoint:** `POST /act_{AD_ACCOUNT_ID}/ads`
- **Required:** name, adset_id, creative (creative_id), status

---

## 2. UAE/GCC Targeting

### Arabic Locale Codes
| Locale | ID | Notes |
|--------|----|-------|
| Arabic (ar_AR) | **28** | Primary — use for all Arabic content |
| Arabic (Egypt) | ~43 | Egyptian dialect |
| Arabic (Levant) | ~56 | Lebanon/Syria/Jordan |
| English (US) | 6 | For English content |
| English (UK) | 24 | Alternative English |

### UAE City Geo Keys
| City | Key |
|------|-----|
| Dubai | **3861** |
| Abu Dhabi | **3995** |
| Sharjah | **4000** |
| Ajman | **3998** |
| Ras Al Khaimah | **3999** |
| Fujairah | **3997** |
| Umm Al Quwain | **3996** |

**Note:** Previously documented keys (Dubai=368, Abu Dhabi=95) may be region-level keys vs city keys. Verify via Targeting Search API.

### Interest Targeting IDs
| Industry | Interest | ID |
|----------|----------|----|
| Real Estate | Real estate | 6003104883150 |
| F&B | Restaurant | 6002921753078 |
| F&B | Food & beverage | 6015518786211 |
| Healthcare | Health & wellness | 6002724438782 |
| Healthcare | Medical clinics | 6012844193898 |
| Cosmetics | Beauty | 6003086965899 |
| Cosmetics | Cosmetics | 6015515115148 |

### Age/Gender Best Practices (UAE)
| Industry | Age | Gender |
|----------|-----|--------|
| Real Estate | 25-54 | All |
| F&B | 18-44 | Female skew |
| Healthcare | 35-64 | Male (general), Female (wellness) |
| Cosmetics | 18-44 | 90% Female |

---

## 3. Error Codes & Troubleshooting

### Error 31: User Request Limit
- **Cause:** Too many API calls
- **Fix:** Wait 1-15 min, implement exponential backoff, batch requests
- **Diagnostic:** `GET /me/adaccounts?fields=rate_limit_info`

### Error 100: Invalid Parameter
- **Cause:** Malformed params, deprecated fields, wrong currency/dates
- **Fix:** Check `blame_field_specs` in response, validate via Targeting Search API
- **Diagnostic:** Test minimal payload in Graph API Explorer

### Error 190: Invalid/Expired Token
- **Cause:** Token expired (short-lived: 1-2h, long-lived: 60d)
- **Fix:** Debug via Access Token Debugger, regenerate via OAuth
- **Diagnostic:** `GET /debug_token?input_token=TOKEN`

### Error 368: Temporarily Blocked
- **Cause:** Suspicious activity, rate limits, policy flags
- **Fix:** Wait 30-60 min, verify system user permissions
- **Diagnostic:** `GET /act_ID?fields=status,disable_reason`

### Error 10: Permissions Error
- **Cause:** Missing scopes (ads_management), insufficient roles
- **Fix:** Verify via `GET /me/permissions`, update app scopes
- **Required scopes:** ads_management, ads_read, pages_show_list, business_management

### Error 2635: Ad Account Disabled
- **Cause:** Policy violations, payment issues
- **Fix:** `GET /act_ID?fields=status,disable_reason`, appeal via Business Support

### Error 1487851: Ad Review Rejection
- **Cause:** Policy violation, landing page issues
- **Fix:** Edit creative, resubmit, check Account Quality

---

## 4. Custom & Lookalike Audiences

### Custom Audience Types
| Type | Subtype | Key Parameter |
|------|---------|---------------|
| Customer List | CUSTOM | customer_file_source (hashed) |
| Website | WEBSITE | event_sources (Pixel ID) + rule |
| App Activity | APP | event_sources (App ID) + rule |
| Page Engagement | ENGAGEMENT | event_sources (Page ID) |
| Video Viewers | VIDEO | event_sources + rule (% viewed) |
| Lead Form | LEAD_GENERATION | event_sources (Form ID) |
| Instagram | ENGAGEMENT | event_sources (IG ID) |

### Lookalike Audiences
- **Endpoint:** `POST /act_ID/lookalike_audiences`
- **Source:** Custom audience with ≥100 matches
- **Percentage:** 1-10% (UAE: use 1-2% for small market)
- **Region:** "AE" for UAE
- **Value-based:** Include VALUE column in customer file

### UAE Best Practices
- Start with 1-2% lookalikes (UAE pop ~10M = small market)
- Broad custom sources (all visitors 180d) for sufficient seed
- Retention: 30d retargeting, 90-180d lookalike source

---

## 5. Budget & Bidding

### Bid Strategies
| Strategy | API Value | Use Case |
|----------|-----------|----------|
| Lowest Cost | LOWEST_COST_WITHOUT_CAP | Scaling, awareness |
| Bid Cap | LOWEST_COST_WITH_BID_CAP | Cost control |
| Cost Cap | COST_CAP | Conversions |
| ROAS | MINIMUM_ROAS | Revenue focus |

### UAE Budget Recommendations
| Objective | Min Daily (AED) |
|-----------|----------------|
| Awareness (REACH) | 50-100 |
| Traffic (LINK_CLICKS) | 100-200 |
| Conversions/Leads | 200+ |
| Messaging | 100-150 |

### Learning Phase
- Needs ~50 conversions/week to exit
- Don't change budget >20% during learning
- Don't change targeting during learning

---

## 6. Creative Specs

### Image Specs
- Dimensions: 1080x1080 (square), 1200x628 (landscape)
- Aspect: 1:1, 1.91:1
- File size: up to 30MB
- Formats: JPG, PNG

### Video Specs
- Aspect: 1:1, 4:5, 9:16, 1.91:1
- Duration: 1-240 seconds
- File size: up to 4GB
- Formats: MP4, MOV
- Resolution: min 1080x1080

### Text Limits
- Primary text: 125 chars recommended, ~1000 max
- Headline: 40 chars
- Description: 30 chars

### CTA Types (partial)
LEARN_MORE, SHOP_NOW, SIGN_UP, CONTACT_US, SEND_WHATSAPP_MESSAGE, GET_QUOTE, BOOK_NOW, CALL_NOW, DOWNLOAD, WATCH_MORE, OPEN_LINK, BOOK_TRAVEL, WHATSAPP_MESSAGE, MESSENGER_MESSAGE

---

## 7. WhatsApp Business Integration

### WABA vs Personal WhatsApp
| Feature | WABA | Personal |
|---------|------|----------|
| Meta Ads | ✅ | ❌ |
| Click-to-WhatsApp | ✅ | ❌ |
| API Access | ✅ | ❌ |
| Templates | ✅ | ❌ |
| Business Verification | ✅ | ❌ |

### Check WhatsApp Connection via API
```
GET /{PAGE_ID}/whatsapp_accounts?fields=id,phone_number,verified_name,account_status
```
- Returns array of connected WABAs
- Empty = not connected

### Alternative Check
```
GET /{PAGE_ID}?fields=connected_whatsapp_business_accounts
```

### ⚠️ CRITICAL for Pyramedia
- WhatsApp +971565799505 is **PERSONAL** — NOT WhatsApp Business
- Cannot use destination_type: WHATSAPP without WABA
- Alternatives: MESSENGER, INSTAGRAM_DIRECT, or WEBSITE with wa.me link in CTA
- To enable: Need to migrate to WhatsApp Business Platform (Cloud API)

---

## Research Methodology
- **Tool:** Perplexity AI (sonar-pro model)
- **Queries:** 8 separate research queries
- **Date:** February 13, 2026
- **Limitation:** Some IDs (geo keys, locale codes) need verification via Meta's Targeting Search API
