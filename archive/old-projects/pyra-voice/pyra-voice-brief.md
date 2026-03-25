# Pyra Voice — Project Brief for Claude Code

## 🎯 What Is This?

A **live voice AI demo website** for Pyramedia (Dubai marketing & AI company). Visitors open the site, click a button, and have a **real-time voice conversation** with "Pyra" — an AI assistant powered by Google Gemini Live API, with an animated avatar (Simli).

**Live URL:** https://voice.pyramedia.info
**Repo:** https://github.com/Engmohammedabdo/pyra-voice (private)
**Hosting:** Coolify on VPS `72.61.148.81`

## 🎯 Goal

Impress potential clients. They visit, talk to the AI, see an animated avatar respond in real-time. It demonstrates Pyramedia's AI capabilities. Also captures leads (name, email, phone, business type).

## 🏗️ Architecture

```
Browser (mic) → WebSocket → Node.js Backend → Gemini Live API (wss)
                                              ↓
Browser (speaker) ← WebSocket ← Audio response ←
                                              ↓
                                         Supabase (save transcripts/leads)
```

### Stack:
- **Frontend:** Next.js 14 (React, TypeScript, Tailwind)
- **Backend:** Node.js + Express + ws (WebSocket)
- **AI Voice:** Google Gemini Live API (`gemini-2.5-flash-native-audio-latest`)
- **Avatar:** Simli.ai (animated face that lip-syncs — NOT YET INTEGRATED in frontend)
- **Database:** Supabase (PostgreSQL) at `https://db.pyramedia.info`
- **Hosting:** Coolify (Docker) behind Traefik reverse proxy

### How It Works:
1. User clicks "Start" button
2. Frontend opens WebSocket to `wss://voice.pyramedia.info/ws`
3. Backend creates session, connects to Gemini Live API via WebSocket
4. User speaks → mic audio captured as PCM 16-bit/16kHz → sent as base64 over WS
5. Backend forwards audio to Gemini → Gemini responds with audio (PCM 24kHz)
6. Backend sends audio back to frontend → played through speakers
7. Transcripts saved to Supabase

### Combined Server (server.js):
The app runs as a **single container** with a custom Node.js server that:
- Starts the backend (Express + WS) on port 3001
- Starts Next.js frontend on port 3000
- Uses `http-proxy` to proxy `/ws` and `/api/*` from 3000 → 3001
- Handles WebSocket upgrade manually

## ❌ Current Problem

**WebSocket connection fails in the browser:**
```
WebSocket connection to 'wss://voice.pyramedia.info/ws' failed: 
WebSocket is closed before the connection is established.
```

**What works:**
- ✅ The website loads (Next.js frontend)
- ✅ Backend starts correctly (port 3001)
- ✅ Gemini Live API connects and returns "ready"
- ✅ Raw WebSocket test from server works (got session → sent start → got ready)
- ✅ Server logs show connections and Gemini setup complete

**What doesn't work:**
- ❌ Browser WebSocket closes immediately after upgrade
- ❌ User never gets to "listening" state

**Suspected cause:**
- Traefik reverse proxy may be interfering with WebSocket frames
- The `http-proxy` module in server.js may have issues with WebSocket under Traefik
- Possible double-proxy issue: Traefik → server.js (port 3000) → http-proxy → backend (port 3001)

**Things already tried:**
- Added dedicated WebSocket router in Traefik labels
- Removed gzip middleware from Traefik
- Verified Gemini API key works
- Verified backend receives connections and Gemini responds

## 📁 Key Files

| File | Purpose |
|------|---------|
| `server.js` | Combined server (Next.js + WS proxy) |
| `server/index.js` | Express backend + WebSocket server |
| `server/websocket/handler.js` | WS session management |
| `server/websocket/gemini.js` | Gemini Live API client |
| `server/simli/client.js` | Simli avatar session tokens |
| `server/memory/supabase.js` | Save conversations to DB |
| `app/page.tsx` | Main frontend page |
| `hooks/useVoiceSession.ts` | Frontend WebSocket + audio logic |
| `hooks/useAudioCapture.ts` | Mic capture (PCM 16-bit, 16kHz) |
| `hooks/useAudioPlayback.ts` | Audio playback (PCM 24kHz) |
| `lib/constants.ts` | WS_URL, API_URL, types |
| `components/Avatar.tsx` | Avatar display (static, Simli not integrated) |
| `components/VoiceButton.tsx` | Start/stop button |
| `components/WaveForm.tsx` | Audio visualizer |
| `components/Transcript.tsx` | Live transcript display |
| `pyra-voice-prompt.md` | System prompt for Gemini |
| `Dockerfile` | Docker build (node:22-alpine) |

## 🔧 Environment Variables (set in Coolify)

```
GOOGLE_API_KEY=AIzaSyB-kG...
SIMLI_API_KEY=4mhe7frjc5...
SIMLI_FACE_ID=0c2b8b04-5274-41f1-a21c-d5c98322efa9
SUPABASE_URL=https://db.pyramedia.info
SUPABASE_ANON_KEY=eyJ0eXAi...
SUPABASE_SERVICE_KEY=eyJ0eXAi...
PORT=3001
CORS_ORIGIN=*
```

## 🔧 Hosting Details

- **Coolify App UUID:** `ugwcsk08ockgogooooo8wcgg`
- **Coolify API:** `http://72.61.148.81:8000/api/v1/`
- **Coolify Token:** `3|Egow6IV4M01R5kx4Id6tq0rQOvH3f9J4KVMC4Uymb049b100`
- **Traefik:** v3.1.7 (auto-configured by Coolify)
- **Domain:** `voice.pyramedia.info` → `72.61.148.81` (via Traefik HTTPS)
- **Container port:** 3000 (exposed to Traefik)
- **Internal backend:** 3001 (proxied by server.js)

## 📊 Supabase Tables

### pyra_voice_conversations
- id (uuid), session_id (text), started_at, ended_at, audio_chunks_received (int), audio_chunks_sent (int), duration_seconds (int), metadata (jsonb), created_at

### pyra_voice_transcripts
- id (uuid), session_id (text), role (text), text (text), created_at

### pyra_voice_leads
- id (uuid), session_id (text), name, email, phone, business_type, interest, created_at

## ✅ What Needs to Be Done

1. **Fix WebSocket connection** — Make browser WS work through Traefik + combined server
2. **Full voice conversation** — User speaks, Gemini responds with voice
3. **Avatar integration** — Simli animated avatar (optional, can be phase 2)
4. **Lead capture** — Extract user info from conversation
5. **Arabic + English support** — Already in Gemini prompt
6. **Mobile responsive** — Already in CSS

## 💡 Possible Solutions for WS Issue

1. **Skip http-proxy** — Have Traefik route `/ws` directly to port 3001 (expose both ports)
2. **Use Socket.IO** — More robust than raw WS through proxies
3. **Use Next.js API route for WS** — Handle upgrade in Next.js custom server differently
4. **Split into 2 containers** — Frontend (Next.js) + Backend (WS) with separate Traefik routes

## 📝 Audio Specs

| Direction | Format | Sample Rate | Channels | Encoding |
|-----------|--------|-------------|----------|----------|
| Mic → Backend | PCM | 16,000 Hz | Mono | 16-bit LE |
| Backend → Speaker | PCM | 24,000 Hz | Mono | 16-bit LE |
| Transport | Base64 JSON over WebSocket | - | - | - |

## 🔗 Gemini Live API

- **Endpoint:** `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent?key={API_KEY}`
- **Model:** `models/gemini-2.5-flash-native-audio-latest`
- **Protocol:** Send setup message → get setupComplete → send audio chunks → receive audio + transcript
