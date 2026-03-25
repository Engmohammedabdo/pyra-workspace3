# RECOVERY.md — بعد التحديث

## ⚠️ خطوة 0: تحقق من Chrome/Chromium
```bash
export LD_LIBRARY_PATH="/home/node/.local/lib/chromium-deps"
/home/node/.cache/puppeteer/chrome/linux-*/chrome-linux64/chrome --version
```
لو مش شغّال → المكتبات اتمسحت → شغّلي سكريبت الاستعادة:
```bash
node /home/node/openclaw/tools/restore-chromium-deps.mjs
```

## خطوة 1: إعادة تثبيت npm packages
```bash
cd /home/node/openclaw && npm install
```

## خطوة 2: التحقق من MCP
```bash
node tools/mcp/mcp-client.mjs list-servers
node tools/mcp/mcp-client.mjs call google-calendar list-calendars '{}'
```

## خطوة 3: التحقق من الذاكرة
```bash
node tools/memory/cli.mjs stats
```

## خطوة 4: التحقق من WhatsApp
```bash
node tools/whatsapp/evolution-client.mjs verify 971567249440
```

## خطوة 5: أدوات إضافية
```bash
# Crawl4AI
pip install crawl4ai

# yt-dlp
pip install yt-dlp
```
