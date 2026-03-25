# 🖥️ Server Monitor

Dynamic health checker with Telegram alerts for Pyramedia infrastructure.

## Features

- **Dynamic config** — add/remove services via CLI or edit `services.json`
- **Health checks** — GET/HEAD with configurable expected status codes
- **State tracking** — detects up↔down transitions, stores history
- **Telegram alerts** — sends notification only on state changes (not every check)
- **Alert cooldown** — configurable cooldown to prevent spam
- **Response time tracking** — stores last 100 response times per service
- **Uptime reports** — 24h/7d stats with avg/min/max response times

## Usage

```bash
cd /home/node/openclaw/tools/monitor

# Run health check (sends Telegram alerts on state changes)
node server-monitor.mjs check

# Show current status of all services
node server-monitor.mjs status

# Add a new service
node server-monitor.mjs add "Service Name" "https://url.com"

# Add with custom expected status codes
node server-monitor.mjs add "API" "https://api.example.com" "GET" "[200,201]"

# Remove a service
node server-monitor.mjs remove "Service Name"

# Uptime report (24h/7d stats)
node server-monitor.mjs report

# Test Telegram notification
node server-monitor.mjs test-alert
```

## Configuration

Edit `services.json` to configure services and settings:

```json
{
  "services": [
    {"name": "n8n", "url": "https://n8n.pyramedia.info", "method": "GET", "expectedStatus": [200, 301, 302]}
  ],
  "settings": {
    "timeoutMs": 10000,
    "telegramChatId": "7990837012",
    "alertCooldownMinutes": 30,
    "historyFile": "/home/node/openclaw/tools/monitor/history.json"
  }
}
```

## Automation

Run checks periodically via cron:

```bash
# Every 5 minutes
*/5 * * * * cd /home/node/openclaw/tools/monitor && node server-monitor.mjs check >> /tmp/monitor.log 2>&1
```

## Files

| File | Purpose |
|------|---------|
| `services.json` | Service definitions & settings |
| `history.json` | State history & response times (auto-generated) |
| `server-monitor.mjs` | Main monitor script |

## Telegram Token

Uses `PYRASTORE_BOT_TOKEN` from `/home/node/.openclaw/credentials/pyra-voice.env`. Falls back to console output if no token found.
