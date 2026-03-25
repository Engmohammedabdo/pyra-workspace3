#!/usr/bin/env node
/**
 * Leila WhatsApp Monitor 🌸
 * 
 * Polls Evolution API every 20s for new messages from Layla
 * Sends instant Telegram notification to Mohammed
 * 
 * Usage: node tools/leila-monitor.mjs
 */

const EVO_URL = 'https://evo.pyramedia.info';
const EVO_KEY = '5002E96781AE-4AB5-AD97-A5F6234570EC';
const INSTANCE = 'pyraai';

const LEILA_IDENTIFIERS = [
  '146943732908059@lid',
  '971545586754@s.whatsapp.net'
];

const TELEGRAM_BOT_TOKEN = '***REMOVED***';
const TELEGRAM_CHAT_ID = '7990837012';

const POLL_INTERVAL = 20_000; // 20 seconds

let lastSeenTimestamp = Math.floor(Date.now() / 1000);
let running = true;

// ─── Telegram ─────────────────────────────────────────────
async function sendTelegram(text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' })
    });
    const data = await res.json();
    if (!data.ok) console.error('[TG]', data.description);
    return data.ok;
  } catch (err) {
    console.error('[TG Error]', err.message);
    return false;
  }
}

// ─── Extract message text ─────────────────────────────────
function extractText(msg) {
  if (!msg) return '[رسالة]';
  return msg.conversation
    || msg.extendedTextMessage?.text
    || (msg.imageMessage ? `📷 صورة${msg.imageMessage.caption ? ': ' + msg.imageMessage.caption : ''}` : null)
    || (msg.videoMessage ? `🎥 فيديو${msg.videoMessage.caption ? ': ' + msg.videoMessage.caption : ''}` : null)
    || (msg.audioMessage ? '🎤 رسالة صوتية' : null)
    || (msg.documentMessage ? `📄 ${msg.documentMessage.fileName || 'ملف'}` : null)
    || (msg.stickerMessage ? '🏷️ ستيكر' : null)
    || (msg.reactionMessage ? `${msg.reactionMessage.text || '👍'}` : null)
    || (msg.locationMessage ? '📍 موقع' : null)
    || (msg.contactMessage ? '👤 جهة اتصال' : null)
    || '[رسالة]';
}

// ─── Fetch messages from Layla ────────────────────────────
async function checkLeila() {
  for (const jid of LEILA_IDENTIFIERS) {
    try {
      const res = await fetch(`${EVO_URL}/chat/findMessages/${INSTANCE}`, {
        method: 'POST',
        headers: {
          'apikey': EVO_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          where: { key: { remoteJid: jid, fromMe: false } },
          limit: 5
        })
      });

      const data = await res.json();
      const records = data?.messages?.records || [];

      for (const m of records) {
        const ts = parseInt(m.messageTimestamp || '0');
        if (ts <= lastSeenTimestamp) continue;

        // New message from Layla!
        const text = extractText(m.message);
        const pushName = m.pushName || 'Layla';
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-GB', {
          hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dubai'
        });

        const alert = `🌸 <b>رسالة من ليلى!</b> (${timeStr} دبي)\n\n${text}`;
        console.log(`[${now.toISOString()}] New from Layla: ${text.substring(0, 80)}`);
        await sendTelegram(alert);

        // Update last seen
        if (ts > lastSeenTimestamp) lastSeenTimestamp = ts;
      }
    } catch (err) {
      console.error(`[Poll Error] ${jid}:`, err.message);
    }
  }
}

// ─── Main Loop ────────────────────────────────────────────
async function main() {
  console.log('🌸 Leila Monitor started (polling mode)');
  console.log(`   Interval: ${POLL_INTERVAL / 1000}s`);
  console.log(`   Watching: ${LEILA_IDENTIFIERS.join(', ')}`);
  console.log(`   Alerts → Telegram ${TELEGRAM_CHAT_ID}`);
  console.log(`   Since: ${new Date(lastSeenTimestamp * 1000).toISOString()}`);

  while (running) {
    await checkLeila();
    await new Promise(r => setTimeout(r, POLL_INTERVAL));
  }
}

process.on('SIGINT', () => { running = false; });
process.on('SIGTERM', () => { running = false; });

main().catch(err => {
  console.error('[Fatal]', err);
  process.exit(1);
});
