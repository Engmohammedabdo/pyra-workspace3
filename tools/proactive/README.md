# Proactive Event System

Real-time email monitoring + event priority engine for PyraAI.

## Components

### 1. Email Watcher (`email-watcher.mjs`)
IMAP IDLE-based email watcher with priority classification.

```bash
# One-shot check (connect, fetch recent emails, queue events, disconnect)
node tools/proactive/email-watcher.mjs check

# Persistent IDLE watcher (foreground, real-time notifications)
node tools/proactive/email-watcher.mjs start

# Show watcher status
node tools/proactive/email-watcher.mjs status
```

**Priority Classification:**
| Priority | Criteria | Routing |
|----------|----------|---------|
| 🔴 CRITICAL | Known clients/partners, Mohammed | Telegram alert immediately |
| 🟠 HIGH | Business keywords (invoice, meeting, etc.) | Next heartbeat |
| 🟡 MEDIUM | Regular emails | Daily summary |
| ⚪ LOW | Newsletters, spam, promo | Ignored |

### 2. Event Engine (`event-engine.mjs`)
Central event processing and routing.

```bash
# Process all pending events (routes by priority)
node tools/proactive/event-engine.mjs process

# Show queue statistics
node tools/proactive/event-engine.mjs stats

# Add event manually
node tools/proactive/event-engine.mjs add "source" "message" --priority high

# List unprocessed HIGH events (for heartbeat integration)
node tools/proactive/event-engine.mjs high

# Today's MEDIUM events summary
node tools/proactive/event-engine.mjs summary
```

## Event Schema
```json
{
  "id": "uuid",
  "source": "email|monitor|calendar|system",
  "type": "new-email|manual|alert|...",
  "message": "Human-readable description",
  "priority": "critical|high|medium|low",
  "urgency": "immediate|soon|whenever",
  "timestamp": "ISO 8601",
  "processed": false,
  "processedAt": null
}
```

## Files
- `event-queue.json` — Event queue (all events, pending + processed)
- `watcher-status.json` — Email watcher state
- `engine-stats.json` — Processing statistics

## Heartbeat Integration
In `HEARTBEAT.md`, add:
```
- Check email events: `node tools/proactive/event-engine.mjs high`
```

## Credentials
Loaded from `/home/node/.openclaw/credentials/pyra-voice.env`:
- `BAYRA_EMAIL_USER`, `BAYRA_EMAIL_PASS`, `BAYRA_EMAIL_HOST`, `BAYRA_IMAP_PORT`
- `PYRASTORE_BOT_TOKEN` (for Telegram alerts)
