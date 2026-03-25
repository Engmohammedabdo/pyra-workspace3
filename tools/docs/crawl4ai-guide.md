# Crawl4AI — Full Reference

> **قاعدة ذهبية:** كل بحث عميق أو sub-agent بحثي → Crawl4AI مش web_search!
> `web_search` للأسئلة السريعة فقط. Crawl4AI لكل شي تاني.

- **Version:** 0.8.0
- **Python:** `/home/node/.local/bin/python3` (needs `LD_LIBRARY_PATH`)
- **Helper:** `/home/node/openclaw/tools/crawl4ai_helper.py`
- **Alias:** `/home/node/.local/bin/crawl`
- **Chromium Deps:** `/home/node/.local/lib/chromium-deps/` (manually extracted)

### Usage:
```bash
export LD_LIBRARY_PATH="/home/node/.local/lib/chromium-deps"

# Single page → stdout
python3 /home/node/openclaw/tools/crawl4ai_helper.py "https://example.com"

# Single page → file
python3 /home/node/openclaw/tools/crawl4ai_helper.py "https://example.com" -o output.md

# Deep crawl → directory
python3 /home/node/openclaw/tools/crawl4ai_helper.py "https://docs.site.com" --deep 10 -o ./crawled/

# Raw markdown (no fit filter)
python3 /home/node/openclaw/tools/crawl4ai_helper.py "https://example.com" --raw
```

### Features:
- ✅ Full browser rendering (JavaScript support)
- ✅ Clean LLM-friendly Markdown output
- ✅ Deep crawl with internal link following
- ✅ Headless Chromium (no display needed)
- ✅ Anti-bot detection (stealth mode available)

### When to use Crawl4AI vs web_fetch:
| Scenario | Tool |
|----------|------|
| Simple page, no JS | `web_fetch` (faster) |
| JS-heavy SPA | **Crawl4AI** |
| Need screenshots | `browser` tool |
| Bulk scraping | **Crawl4AI** |
| Deep site crawl | **Crawl4AI --deep** |
