#!/usr/bin/env node
/**
 * Gemini TTS Tool — Bayra's Voice 🦊
 * 
 * Usage: node gemini-tts.mjs "النص" [voice] [model] [output]
 * 
 * Voices: Leda (default), Kore, Aoede, Zephyr, Charon, Fenrir, Orus, Puck
 * Models: flash-tts (default, fast), pro-tts (higher quality), native-audio (smartest)
 */

import { writeFileSync } from "fs";
import { execSync } from "child_process";

const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
const text = process.argv[2];
const voice = process.argv[3] || "Leda";
const modelChoice = process.argv[4] || "flash-tts";
const output = process.argv[5] || "/tmp/bayra-voice.opus";

if (!text) {
  console.error("Usage: node gemini-tts.mjs \"text\" [voice] [model] [output]");
  process.exit(1);
}

const MODELS = {
  "flash-tts": "gemini-2.5-flash-preview-tts",
  "pro-tts": "gemini-2.5-pro-preview-tts",
  "native-audio": "gemini-2.5-flash-native-audio-preview-12-2025"
};

const model = MODELS[modelChoice] || modelChoice;

async function generateTTS() {
  if (modelChoice === "native-audio") {
    // Native Audio uses Live API (WebSocket)
    const { GoogleGenAI, Modality } = await import("@google/genai");
    const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY });
    
    const audioChunks = [];
    let resolver;
    
    const session = await ai.live.connect({
      model,
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice }
          }
        }
      },
      callbacks: {
        onmessage(msg) {
          const sc = msg?.serverContent;
          if (sc?.modelTurn?.parts) {
            for (const part of sc.modelTurn.parts) {
              if (part.inlineData?.data) {
                audioChunks.push(Buffer.from(part.inlineData.data, "base64"));
              }
            }
          }
          if (sc?.turnComplete && resolver) resolver();
        }
      }
    });
    
    const done = new Promise((r) => { resolver = r; setTimeout(r, 30000); });
    
    await session.sendClientContent({
      turns: { role: "user", parts: [{ text }] },
      turnComplete: true
    });
    
    await done;
    session.close();
    
    const pcm = Buffer.concat(audioChunks);
    const pcmPath = output.replace(/\.[^.]+$/, ".pcm");
    writeFileSync(pcmPath, pcm);
    
    // Convert PCM to opus
    execSync(`/home/node/.local/bin/ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" -c:a libopus -b:a 64k "${output}" 2>/dev/null`);
    console.log(JSON.stringify({ ok: true, bytes: pcm.length, output, voice, model: modelChoice }));
    
  } else {
    // TTS models use generateContent (REST API — simpler & faster)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${GOOGLE_API_KEY}`;
    
    const body = {
      contents: [{ role: "user", parts: [{ text: `Read aloud: ${text}` }] }],
      generationConfig: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voice }
          }
        }
      }
    };
    
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    const data = await res.json();
    
    if (data.error) {
      console.error(JSON.stringify({ ok: false, error: data.error.message }));
      process.exit(1);
    }
    
    const parts = data.candidates?.[0]?.content?.parts || [];
    for (const p of parts) {
      if (p.inlineData?.data) {
        const audio = Buffer.from(p.inlineData.data, "base64");
        const pcmPath = output.replace(/\.[^.]+$/, ".pcm");
        writeFileSync(pcmPath, audio);
        
        // Convert PCM to opus
        execSync(`/home/node/.local/bin/ffmpeg -y -f s16le -ar 24000 -ac 1 -i "${pcmPath}" -c:a libopus -b:a 64k "${output}" 2>/dev/null`);
        console.log(JSON.stringify({ ok: true, bytes: audio.length, output, voice, model: modelChoice }));
      }
    }
  }
}

generateTTS().then(() => process.exit(0)).catch(e => {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(1);
});
