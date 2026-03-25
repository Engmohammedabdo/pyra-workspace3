# Pyra WhatsApp Workflow — Documentation

**Last Updated:** 2026-02-06
**Workflow ID:** XswCOuU2T3gaExUk
**Name:** PyraWhatsapp_Agent
**Status:** Active ✅

---

## Overview

```
Webhook → Filter → Media Processing → AI Agent → Send Reply → Log
```

---

## Nodes Architecture

### 1. Entry Point
| Node | Type | Purpose |
|------|------|---------|
| **Webhook** | POST /pyraai | Receives messages from Evolution API |
| **If** | Filter | Checks `fromMe: false` (ignore own messages) |
| **If row does not exist** | DataTable | Blocklist check (WAblockNumber) |
| **If1** | Filter | Checks if headers exist |

### 1.5 Human-to-AI Handoff (Smart Design!)
```
When Mohammed chats with customer directly:
→ Conversation is stored in Postgres memory
→ When removed from blocklist, AI continues with FULL context
→ Seamless handoff - Agent knows everything that happened
```
This ensures AI never starts from zero when taking over a conversation.

### 2. Message Type Router (Switch)
Routes to 5 branches based on message type:
- **Text** → Edit Fields6 → AI Agent
- **Audio** → Voice processing pipeline
- **Image** → Image processing pipeline
- **PDF** → Document processing pipeline
- **Video** → Video processing pipeline

### 3. Media Processing Pipelines

#### Voice Pipeline
```
Get voice → Convert to File (audio/ogg) → Transcribe (OpenAI Whisper) → Edit Fields4 → AI Agent
```

#### Image Pipeline
```
Get Images → Convert to File1 → Upload to Drive + Analyze (Gemini 3 Pro) → Edit Fields5 → Limit2 → AI Agent
```
- Uploads to Google Drive folder: `1-xjfWa8dl6oJog3sHqJS31FpAt5mcJu8`
- Analyzes with Gemini 3 Pro Preview
- Captures image caption if present

#### PDF Pipeline
```
Get PDF → Convert to File2 → Upload pdf → Download file → Analyze document (Gemini) → Edit Fields → Limit1 → AI Agent
```

#### Video Pipeline
```
Get Video → Convert to File3 → Upload video → Download video → Analyze video (Gemini) → Edit video Fields → Limit → AI Agent
```

### 4. AI Agent Configuration

#### Models
| Role | Model | Provider |
|------|-------|----------|
| **Primary** | GPT-5 | OpenAI |
| **Fallback** | Gemini 3 Pro Preview | Google |

#### Memory
- **Type:** Postgres Chat Memory
- **Table:** `n8n_chat_histories_pyra`
- **Session Key:** `remoteJid` (phone number)
- **Context Window:** 500 messages

#### Tools
| Tool | Purpose |
|------|---------|
| **Calculator1** | Math calculations (rarely used) |
| **Think** | Internal reasoning before responding |
| **Date & Time** | Get current date/time (Dubai timezone) |
| **add lead** | Save lead to Google Sheets |
| **send lead** | Email summary to sales team |
| **Create an event1** | Book consultation in Google Calendar |

#### Web Search
- Enabled with medium context
- Restricted to: `pyramedia.ai`

### 5. Output
| Node | Purpose |
|------|---------|
| **Send text1** | Send reply via Evolution API (15s delay) |
| **Append row in sheet** | Log conversation to Google Sheets |

---

## Database Schema

### Chat History Table: `n8n_chat_histories_pyra`
```sql
- session_id: VARCHAR (remoteJid)
- message: JSONB {type, content, tool_calls, additional_kwargs, response_metadata}
```

### Leads Sheet Columns
```
Timestamp, jid, Full Name, Email, Phone, WhatsApp, Country Code,
Business Type, Challenge, Appointment Date, Appointment Time,
Source, Page URL, UTM Source, UTM Medium, UTM Campaign
```

### Conversation Log Sheet
```
timestamp, jid, conversation (AI response), client sayes (user message)
```

---

## Integrations

| Service | Purpose | Account |
|---------|---------|---------|
| **Evolution API** | WhatsApp (pyraai instance) | PyraAi Whatsapp |
| **OpenAI** | GPT-5 + Whisper | OpenAi account |
| **Google Gemini** | Fallback + Media Analysis | eng.moabdo |
| **Google Drive** | Media storage | eng.moabdo22 |
| **Google Sheets** | Leads + Logs | eng.moabdo |
| **Google Calendar** | Appointments | eng.moabdo |
| **Gmail** | Lead notifications | eng.moabdo |
| **Postgres** | Chat history | Postgres account |

---

## Error Handling

- **Error Workflow ID:** `D6NzE2IefUG7Ydel`
- Configured in workflow settings ✅

---

## System Prompt

Full prompt stored in: `/home/node/openclaw/pyramedia-whatsapp-prompt-final.md`

**Key Features:**
- Priority: Ramadan > Special Cases > Show Mode > Standard
- Show Mode: Live demo when asked about Pyra AI
- Objection Handling: 7 common objections
- Human Handoff triggers defined
- Voice message handling
- After-hours response

---

## Configuration Details

```yaml
Webhook Path: /pyraai
Message Delay: 15000ms (15 seconds) — INTENTIONAL for natural feel
Available Hours: 11 AM - 7 PM (Sunday OFF)
Timezone: Asia/Dubai
Blocklist Table: WAblockNumber
Human Handoff: Via Email (send lead tool)
```

---

## Version History

| Date | Changes |
|------|---------|
| 2026-02-06 | Updated System Prompt v3.0 |
| 2026-01-28 | Initial documentation |

---

*This file is auto-updated when workflow changes.*
