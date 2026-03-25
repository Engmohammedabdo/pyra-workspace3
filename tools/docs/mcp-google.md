# MCP & Google Services — Full Reference

## MCP (Model Context Protocol)
- **Client:** `/home/node/openclaw/tools/mcp/mcp-client.mjs`
- **SDK:** `@modelcontextprotocol/sdk` v1.26.0
- **Config:** `/home/node/openclaw/tools/mcp/mcp-servers.json`
- **Auth Tool:** `/home/node/openclaw/tools/mcp/google-auth.mjs`

### Connected MCP Servers:
| Server | Status | Tools |
|--------|--------|-------|
| **google-calendar** | ✅ Connected | 12 tools (list/create/update/delete events, free/busy, search) |
| **filesystem** | ✅ Ready | 11 tools (read/write/search/move files) |

## Google OAuth Tokens
- **Account:** mohammed (eng.moabdo22@gmail.com)
- **Scopes:** Calendar ✅, Gmail ✅, Drive ✅
- **Credentials:** `/home/node/.openclaw/credentials/google-oauth-credentials.json`
- **Tokens:** `/home/node/.openclaw/google-calendar-mcp/tokens.json`
- **Calendars:** Primary, العائلة, أعياد مصر, أعياد الإمارات

### ⚠️ تنبيه مهم — حساب شخصي!
> **كل خدمات Google (Calendar, Gmail, Drive) مربوطة بحساب محمد الشخصي `eng.moabdo22@gmail.com` — مش حساب Pyramedia X!**
>
> **قواعد الاستخدام:**
> 1. 📧 **Gmail:** لا أرسل أي إيميل بدون موافقة محمد الصريحة
> 2. 📁 **Drive:** لا أعدّل/أحذف أي ملف بدون إذن — القراءة والبحث فقط بشكل تلقائي
> 3. 📅 **Calendar:** القراءة والتذكيرات تلقائية ✅ — إضافة/تعديل مواعيد بإذن فقط
> 4. 🚫 **ممنوع:** مشاركة أي محتوى شخصي من الحساب مع أطراف ثالثة
> 5. 🔒 **الخصوصية أولاً:** لا أعرض محتوى الإيميلات أو الملفات في جروبات أو محادثات مع غير محمد

### Usage Examples:
```bash
# List tools
node tools/mcp/mcp-client.mjs list-tools google-calendar

# List today's events
node tools/mcp/mcp-client.mjs call google-calendar list-events '{"calendarId":"primary","timeMin":"2026-02-22T00:00:00","timeMax":"2026-02-22T23:59:59","timeZone":"Asia/Dubai"}'

# Create event
node tools/mcp/mcp-client.mjs call google-calendar create-event '{"calendarId":"primary","summary":"Meeting","start":"2026-02-23T10:00:00","end":"2026-02-23T11:00:00","timeZone":"Asia/Dubai"}'

# Add new MCP server
node tools/mcp/mcp-client.mjs add-server <name> <command> [args...]
```
