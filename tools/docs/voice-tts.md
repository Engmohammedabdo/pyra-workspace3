# Voice & TTS — Full Reference

## PyraAI Voice — Gemini TTS 🎙️

**Default Voice:** Leda (أنثى، ناعمة وواضحة)
**Default Model:** `gemini-2.5-flash-preview-tts` (سريع)
**Script:** `/home/node/openclaw/tools/gemini-tts.mjs`
**Requires:** `GOOGLE_API_KEY=REDACTED_GOOGLE_API_KEY_2`

### Usage:
```bash
export GOOGLE_API_KEY="REDACTED_GOOGLE_API_KEY_2"
cd /tmp && node /home/node/openclaw/tools/gemini-tts.mjs "النص" [voice] [model] [output]
```

### Available Voices:
| Voice | Type | Best For |
|-------|------|----------|
| **Leda** ⭐ | أنثى | Default — ناعمة وواضحة |
| Kore | أنثى | هادية ومهنية |
| Aoede | أنثى | موسيقية ودافية |
| Puck | ذكر خفيف | نشيط وحيوي |
| Zephyr | ذكر | هادي |
| Charon | ذكر | عميق |
| Fenrir | ذكر | قوي |
| Orus | ذكر | واثق |

### Models:
| Model | Speed | Quality | API |
|-------|-------|---------|-----|
| `flash-tts` ⭐ | ~3s | ممتاز | REST |
| `pro-tts` | ~6s | أعلى | REST |
| `native-audio` | ~8s | الأذكى | WebSocket |

### Workflow:
1. Generate: `node gemini-tts.mjs "text" Leda flash-tts /tmp/voice.opus`
2. Send: `message tool → filePath + asVoice=true`

### Fallback: ElevenLabs
- Voice: Farah (أردنية) — `4wf10lgibMnboGJGCLrP`
- Full control: stability, style, speed, similarity
