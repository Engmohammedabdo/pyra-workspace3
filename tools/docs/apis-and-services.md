# APIs & External Services — Full Reference

## API Keys Configured
- ✅ Anthropic (Claude)
- ✅ OpenAI (GPT + Whisper)
- ✅ OpenRouter (Multi-model)
- ✅ Google (Gemini 3)
- ✅ ElevenLabs (TTS Voice)
- ✅ Kie.ai (Image/Video/Music Generation)

## Kie.ai Capabilities
- **Image:** Flux Kontext, 4o Image, Nano Banana
- **Video:** Veo 3.1, Runway Aleph
- **Music:** Suno API (V4, V4.5)
- **Docs:** https://docs.kie.ai
- **Video Model Names:** `kling-3.0/video` (NOT `kling-3.0`!)
- **resultJson format:** `{"resultUrls": ["url"]}`

## Freepik API (Video Generation)
- **API Key:** in `/home/node/.openclaw/credentials/pyra-voice.env` as `FREEPIK_API_KEY`
- **Base:** `https://api.freepik.com/v1/ai/video/`
- **Auth:** Header `x-freepik-api-key: KEY`
- **Kling 3 Omni Std:** `POST /v1/ai/video/kling-v3-omni-std`
- **Kling 3 Omni Pro:** `POST /v1/ai/video/kling-v3-omni-pro`
- **Status:** `GET /v1/ai/video/kling-v3-omni/{task-id}`
- **⚠️ Duration must be STRING** ("5" not 5)
- **⚠️ Free trial exhausted** — needs billing upgrade

## SerpAPI (Google Search) 🔍
- **API Key:** in `/home/node/.openclaw/credentials/pyra-voice.env` as `SERPAPI_KEY`
- **Plan:** Free (250 searches/month)
- **Usage:** `curl "https://serpapi.com/search.json?q=QUERY&api_key=$SERPAPI_KEY&engine=google"`
- **Engines:** google, google_news, google_scholar, youtube, bing
- **Use when:** Crawl4AI مش شغالة أو محتاج نتيجة سريعة

## PyraAI Email 📧
- **Email:** `pyraai@pyramedia.info`
- **SMTP:** `mail.pyramedia.info:465` (SSL) — إرسال
- **IMAP:** `mail.pyramedia.info:993` (SSL) — استقبال
- **POP3:** `mail.pyramedia.info:995` (SSL) — استقبال
- **Credentials:** في `/home/node/.openclaw/credentials/pyra-voice.env`
- **الاستخدام:** nodemailer (إرسال) + node-imap أو imapflow (استقبال)

## PyraAI Workspace (Supabase Storage)
- **Supabase:** `pyraworkspacedb.pyramedia.cloud` (NOT db.pyramedia.info!)
- **Bucket:** `pyraai-workspace`
- **Public URL:** `https://pyraworkspacedb.pyramedia.cloud/storage/v1/object/public/pyraai-workspace/`
- **Max file:** 500MB
- **Folders:** projects/, content/, shared/, temp/
- **Client Folders:** shared/clients/injazat/ (إتمام + إنجازات)
- **Credentials:** WORKSPACE_DB_* in pyra-voice.env
- **⚠️ استخدمي ALWAYS @supabase/supabase-js — مش curl! (curl بيفشل مع Kong)**
- **JS Client:** `cd /tmp && node -e "const {createClient}=require('@supabase/supabase-js'); ..."`

## Google Drive (Shared Folder)
- **URL:** https://drive.google.com/drive/folders/1sk7AAMcln-KoHdV5xplNE6NJS-2xjia1
- **Purpose:** مشاركة ملفات بين محمد و PyraAI
- **Access:** ✅ شغال

## GitHub
- **Account:** Engmohammedabdo
- **PAT:** في `/home/node/.openclaw/credentials/pyra-voice.env` as `GITHUB_PAT`
- **Credentials:** `/home/node/.git-credentials` (auto-configured)
- **Git User:** PyraAI 🦊 (pyraai@pyramedia.info)

## PostgreSQL Lessons Learned
- **Views:** Cannot use `CREATE OR REPLACE VIEW` to change column order/names
- **Solution:** Always `DROP VIEW IF EXISTS ... CASCADE` then `CREATE VIEW`
- **Reason:** PostgreSQL enforces strict column structure in views
