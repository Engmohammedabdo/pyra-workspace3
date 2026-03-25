# TOOLS.md — Quick Index 🦊

> التفاصيل الكاملة في `tools/docs/` — اقرأي الملف المحدد بس لما تحتاجيه.

## 🎬 Media
- **yt-dlp:** `/home/node/.local/bin/yt-dlp` | YouTube ✅ | TikTok ❌ | Instagram ❌
- **ffmpeg:** `/home/node/.local/bin/ffmpeg` (v7.0.2-static)
- **Deno:** `/home/node/.local/bin/deno`
- 📄 Details → `tools/docs/media-tools.md`

## 🔑 APIs
- Anthropic ✅ | OpenAI ✅ | OpenRouter ✅ | Google ✅ | ElevenLabs ✅ | Kie.ai ✅
- **Kie.ai:** Image (Flux Kontext, 4o) | Video (Veo 3.1, Kling 3.0) | Music (Suno V4.5)
- **Freepik:** Video gen (⚠️ trial exhausted)
- **SerpAPI:** Google search (free 250/mo)
- 📄 Details → `tools/docs/apis-and-services.md`

## 📱 WhatsApp
- **Evolution API:** `evo.pyramedia.info` | Instance: `pyraai` | Number: 971565799505
- **n8n Node:** `n8n-nodes-evolution-api-english` v1.1.2
- **⚠️ LID Migration:** بحث الرسائل بالـ LID مش بالرقم!
- 📄 Details → `tools/docs/whatsapp-evolution.md`

## 📅 MCP & Google
- **MCP Client:** `tools/mcp/mcp-client.mjs`
- **Google Account:** eng.moabdo22@gmail.com (شخصي!)
- **Scopes:** Calendar ✅ | Gmail ✅ | Drive ✅
- **⚠️ لا إرسال إيميل/تعديل ملفات بدون إذن محمد!**
- 📄 Details → `tools/docs/mcp-google.md`

## 🎙️ Voice & TTS
- **Gemini TTS:** `tools/gemini-tts.mjs` | Default: Leda | flash-tts
- **ElevenLabs:** Farah (أردنية) — fallback
- 📄 Details → `tools/docs/voice-tts.md`

## 🕸️ Crawl4AI — أداة البحث الأساسية!
- **Helper:** `tools/crawl4ai_helper.py`
- **Quick:** `python3 tools/crawl4ai_helper.py "URL"` (needs `LD_LIBRARY_PATH`)
- **Deep:** `--deep 10 -o ./crawled/`
- **Rule:** بحث عميق = Crawl4AI. `web_search` للأسئلة السريعة فقط!
- 📄 Details → `tools/docs/crawl4ai-guide.md`

## 🤖 Agents
- **Caption Agent** → social media captions من فيديو/صورة
- **n8n Agent** → إدارة workflows عبر API (n8n.pyramedia.info)
- **Media Buyer** → Meta/Google Ads 🇦🇪 (act_2635756323489697)
- **Supabase** → EliteLife Clinic DB (elitelifedb.pyramedia.cloud)
- **Skills Library:** 629 skill في `antigravity-awesome-skills/skills/` (⚠️ مرجع فقط — الـ skills المثبتة في `~/.openclaw/skills/`)
- 📄 Details → `tools/docs/agents-guide.md`

## 💾 Storage & Git
- **Workspace Supabase:** `pyraworkspacedb.pyramedia.cloud` (⚠️ use JS client, not curl!)
- **Google Drive:** [Shared Folder](https://drive.google.com/drive/folders/1sk7AAMcln-KoHdV5xplNE6NJS-2xjia1)
- **GitHub:** Engmohammedabdo | Git User: PyraAI 🦊
- **Email:** pyraai@pyramedia.info (SMTP/IMAP: mail.pyramedia.info)

## 📝 Lessons
- **PostgreSQL Views:** Always `DROP VIEW CASCADE` then `CREATE VIEW` (can't replace with different columns)
- **Sub-agent API Keys:** لا تحطي keys ثابتة في المهمة — استخدمي `$ENV_VAR` دايماً (الـ sub-agent يشوف نفس الـ env vars)
- **n8n API Key:** الشغال = `$N8N_API_KEY` (env var) — **لا تستخدمي اللي في TOOLS.md القديم!**

<!-- antfarm:workflows -->
# Antfarm Workflows

Antfarm CLI (always use full path to avoid PATH issues):
`node ~/.openclaw/workspace/antfarm/dist/cli/cli.js`

Commands:
- Install: `node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow install <name>`
- Run: `node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow run <workflow-id> "<task>"`
- Status: `node ~/.openclaw/workspace/antfarm/dist/cli/cli.js workflow status "<task title>"`
- Logs: `node ~/.openclaw/workspace/antfarm/dist/cli/cli.js logs`

Workflows are self-advancing via per-agent cron jobs. No manual orchestration needed.
<!-- /antfarm:workflows -->

