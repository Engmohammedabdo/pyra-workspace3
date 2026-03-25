# HEARTBEAT.md

## Always First
1. `bash /home/node/openclaw/tools/post-update-repair.sh` → alert if REPAIR_WARN
2. `bash /home/node/openclaw/tools/stale-lock-cleaner.sh` → alert if WARN
3. `node /home/node/openclaw/tools/memory/realtime-bridge.mjs` → run silently (memory sync)
4. `node /home/node/openclaw/tools/ontology-sync.mjs` → run silently (auto-extract entities from daily memory)

## Rotating Checks (pick 2-3, rotate)
- **WhatsApp:** `curl -s "https://evo.pyramedia.info/instance/connectionState/pyraai" -H "apikey: 5002E96781AE-4AB5-AD97-A5F6234570EC"` → alert if NOT "open"
- **Calendar:** MCP google-calendar list-events (morning 8-10 Dubai = daily briefing)
- **Email:** `node tools/proactive/email-watcher.mjs check` → alert if urgent
- **Server:** `node tools/monitor/server-monitor.mjs check` → alert if down
- **Tasks:** `node tools/memory/cli.mjs task list --status pending` → alert if overdue

## Rules
- Morning (8-10 Dubai): calendar briefing + email
- Before known meeting: prepare brief
- Sunday: memory consolidation
- Birthday today: remind Mohammed 🎂
- State: `tools/proactive/heartbeat-state.json`
