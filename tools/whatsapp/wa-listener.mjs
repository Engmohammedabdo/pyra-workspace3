#!/usr/bin/env node
/**
 * WhatsApp Message Listener for PyraAI
 * Uses smart polling of Evolution API v2.3.7
 * 
 * Usage:
 *   node wa-listener.mjs start              — Start polling (foreground)
 *   node wa-listener.mjs check              — One-shot check for new messages
 *   node wa-listener.mjs history <jid> [n]  — Show recent messages for a chat
 *   node wa-listener.mjs chats              — List all active chats
 */

import { EventEmitter } from 'events';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────
const CONFIG = {
  baseUrl: 'https://evo.pyramedia.info',
  apiKey: '5002E96781AE-4AB5-AD97-A5F6234570EC',
  instance: 'pyraai',
  pollIntervalMs: 15_000,
  fetchLimit: 50,       // messages per poll
  stateFile: join(__dirname, 'listener-state.json'),
};

// ─── State Management ─────────────────────────────────────────────────────────
function loadState() {
  try {
    if (existsSync(CONFIG.stateFile)) {
      return JSON.parse(readFileSync(CONFIG.stateFile, 'utf-8'));
    }
  } catch (e) {
    console.error('[state] Failed to load state:', e.message);
  }
  return {
    lastSeenIds: {},        // messageId -> true (dedup set, pruned periodically)
    lastTimestamp: 0,       // global last seen timestamp
    lastPollTime: 0,
    chatTimestamps: {},     // remoteJid -> last message timestamp
  };
}

function saveState(state) {
  try {
    // Prune lastSeenIds to keep only last 500 entries
    const ids = Object.keys(state.lastSeenIds);
    if (ids.length > 500) {
      const toRemove = ids.slice(0, ids.length - 500);
      for (const id of toRemove) delete state.lastSeenIds[id];
    }
    writeFileSync(CONFIG.stateFile, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('[state] Failed to save state:', e.message);
  }
}

// ─── Evolution API Client ─────────────────────────────────────────────────────
async function apiFetch(path, body = null) {
  const url = `${CONFIG.baseUrl}${path}`;
  const opts = {
    method: body ? 'POST' : 'GET',
    headers: {
      'apikey': CONFIG.apiKey,
      'Content-Type': 'application/json',
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function fetchMessages(limit = CONFIG.fetchLimit) {
  const data = await apiFetch(`/chat/findMessages/${CONFIG.instance}`, {
    where: {},
    limit,
  });
  return data?.messages?.records || [];
}

async function fetchMessagesForChat(remoteJid, limit = 20) {
  const data = await apiFetch(`/chat/findMessages/${CONFIG.instance}`, {
    where: { key: { remoteJid } },
    limit,
  });
  return data?.messages?.records || [];
}

async function fetchChats() {
  return apiFetch(`/chat/findChats/${CONFIG.instance}`, {});
}

// ─── Message Processing ──────────────────────────────────────────────────────
function extractMessageText(msg) {
  const m = msg.message || {};
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return `[📷 Image] ${m.imageMessage.caption}`;
  if (m.imageMessage) return '[📷 Image]';
  if (m.videoMessage?.caption) return `[🎥 Video] ${m.videoMessage.caption}`;
  if (m.videoMessage) return '[🎥 Video]';
  if (m.audioMessage) return m.audioMessage.ptt ? '[🎤 Voice]' : '[🔊 Audio]';
  if (m.documentMessage) return `[📄 ${m.documentMessage.fileName || 'Document'}]`;
  if (m.stickerMessage) return '[🎨 Sticker]';
  if (m.contactMessage) return `[👤 Contact: ${m.contactMessage.displayName || ''}]`;
  if (m.locationMessage) return '[📍 Location]';
  if (m.reactionMessage) return `[React: ${m.reactionMessage.text}]`;
  if (m.pollCreationMessage) return `[📊 Poll: ${m.pollCreationMessage.name}]`;
  return `[${msg.messageType || 'unknown'}]`;
}

function formatMessage(msg) {
  const key = msg.key || {};
  const jid = key.remoteJid || key.remoteJidAlt || '';
  const phone = jid.replace(/@.*/, '');
  return {
    id: key.id,
    fromMe: !!key.fromMe,
    remoteJid: jid,
    phone,
    pushName: msg.pushName || '',
    messageType: msg.messageType || 'unknown',
    text: extractMessageText(msg),
    timestamp: msg.messageTimestamp,
    date: new Date(msg.messageTimestamp * 1000).toISOString(),
    raw: msg,
  };
}

// ─── Listener (EventEmitter) ─────────────────────────────────────────────────
class WhatsAppListener extends EventEmitter {
  constructor() {
    super();
    this.state = loadState();
    this.running = false;
    this.pollTimer = null;
  }

  async poll() {
    try {
      const messages = await fetchMessages(CONFIG.fetchLimit);
      const now = Math.floor(Date.now() / 1000);
      this.state.lastPollTime = now;

      // Messages come sorted by timestamp desc — reverse for chronological processing
      const sorted = [...messages].reverse();
      const newMessages = [];

      for (const msg of sorted) {
        const msgId = msg.key?.id;
        if (!msgId) continue;

        // Skip already-seen messages
        if (this.state.lastSeenIds[msgId]) continue;

        // Mark as seen
        this.state.lastSeenIds[msgId] = true;

        const formatted = formatMessage(msg);

        // Update chat timestamp
        const jid = formatted.remoteJid;
        if (jid) {
          this.state.chatTimestamps[jid] = Math.max(
            this.state.chatTimestamps[jid] || 0,
            formatted.timestamp
          );
        }

        // Update global timestamp
        if (formatted.timestamp > this.state.lastTimestamp) {
          this.state.lastTimestamp = formatted.timestamp;
        }

        // Only emit incoming (non-fromMe) messages
        if (!formatted.fromMe) {
          newMessages.push(formatted);
          this.emit('message', formatted);
        }
      }

      saveState(this.state);

      if (newMessages.length > 0) {
        this.emit('batch', newMessages);
      }

      return newMessages;
    } catch (err) {
      console.error(`[poll] Error: ${err.message}`);
      this.emit('error', err);
      return [];
    }
  }

  async start() {
    if (this.running) return;
    this.running = true;

    console.log('[listener] Starting WhatsApp message listener...');
    console.log(`[listener] Polling every ${CONFIG.pollIntervalMs / 1000}s`);
    console.log(`[listener] State file: ${CONFIG.stateFile}`);

    // If first run (no state), do initial poll to seed seen IDs without emitting
    if (this.state.lastTimestamp === 0) {
      console.log('[listener] First run — seeding message history (no events emitted)...');
      const messages = await fetchMessages(CONFIG.fetchLimit);
      for (const msg of messages) {
        if (msg.key?.id) this.state.lastSeenIds[msg.key.id] = true;
        if (msg.messageTimestamp > this.state.lastTimestamp) {
          this.state.lastTimestamp = msg.messageTimestamp;
        }
      }
      saveState(this.state);
      console.log(`[listener] Seeded ${messages.length} messages. Now listening for NEW messages.`);
    }

    // Start polling
    const doPoll = async () => {
      if (!this.running) return;
      const msgs = await this.poll();
      if (msgs.length > 0) {
        console.log(`[listener] ${msgs.length} new incoming message(s)`);
      }
      if (this.running) {
        this.pollTimer = setTimeout(doPoll, CONFIG.pollIntervalMs);
      }
    };
    doPoll();
  }

  stop() {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    saveState(this.state);
    console.log('[listener] Stopped.');
  }
}

// ─── CLI Commands ─────────────────────────────────────────────────────────────
async function cmdStart() {
  const listener = new WhatsAppListener();

  // Log incoming messages
  listener.on('message', (msg) => {
    const ts = new Date(msg.timestamp * 1000).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' });
    console.log(`\n📩 [${ts}] ${msg.pushName || msg.phone} (${msg.phone})`);
    console.log(`   ${msg.text}`);
    console.log(`   JID: ${msg.remoteJid} | Type: ${msg.messageType}`);
  });

  listener.on('error', (err) => {
    console.error(`[error] ${err.message}`);
  });

  // Graceful shutdown
  const shutdown = () => {
    console.log('\n[listener] Shutting down...');
    listener.stop();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await listener.start();
}

async function cmdCheck() {
  console.log('[check] Checking for new messages...');
  const listener = new WhatsAppListener();
  const newMsgs = await listener.poll();

  if (newMsgs.length === 0) {
    console.log('[check] No new incoming messages.');
  } else {
    console.log(`[check] ${newMsgs.length} new incoming message(s):\n`);
    for (const msg of newMsgs) {
      const ts = new Date(msg.timestamp * 1000).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' });
      console.log(`  📩 [${ts}] ${msg.pushName || msg.phone} (${msg.phone})`);
      console.log(`     ${msg.text}`);
      console.log(`     JID: ${msg.remoteJid} | Type: ${msg.messageType}`);
      console.log();
    }
  }
}

async function cmdHistory(jidOrPhone, limit = 20) {
  // If user passed a phone number, try both JID formats
  let jid = jidOrPhone;
  if (!jid.includes('@')) {
    jid = jid.replace(/^\+/, '') + '@s.whatsapp.net';
  }

  console.log(`[history] Fetching last ${limit} messages for ${jid}...\n`);
  
  const messages = await fetchMessagesForChat(jid, parseInt(limit));
  
  if (messages.length === 0) {
    // Try @lid format
    console.log(`[history] No messages found. Note: this chat may use @lid JID format.`);
    console.log(`[history] Run 'node wa-listener.mjs chats' to see available JIDs.`);
    return;
  }

  // Reverse for chronological order
  const sorted = [...messages].reverse();
  for (const msg of sorted) {
    const formatted = formatMessage(msg);
    const ts = new Date(formatted.timestamp * 1000).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' });
    const dir = formatted.fromMe ? '→ SENT' : '← RECV';
    const name = formatted.fromMe ? 'PyraAI' : (formatted.pushName || formatted.phone);
    console.log(`  ${dir} [${ts}] ${name}: ${formatted.text}`);
  }
}

async function cmdChats() {
  console.log('[chats] Fetching active chats...\n');
  const chats = await fetchChats();
  
  if (!Array.isArray(chats) || chats.length === 0) {
    console.log('[chats] No chats found.');
    return;
  }

  // Sort by last message timestamp desc
  chats.sort((a, b) => {
    const tsA = a.lastMessage?.messageTimestamp || 0;
    const tsB = b.lastMessage?.messageTimestamp || 0;
    return tsB - tsA;
  });

  for (const chat of chats) {
    const jid = chat.remoteJid || '';
    const ts = chat.lastMessage?.messageTimestamp;
    const date = ts ? new Date(ts * 1000).toLocaleString('en-GB', { timeZone: 'Asia/Dubai' }) : 'N/A';
    const lastMsg = chat.lastMessage?.message;
    const preview = lastMsg?.conversation?.slice(0, 60) || 
                    (lastMsg ? Object.keys(lastMsg)[0] : 'N/A');
    const fromMe = chat.lastMessage?.key?.fromMe ? '→' : '←';
    const push = chat.lastMessage?.pushName || '';
    
    console.log(`  ${fromMe} ${jid}`);
    console.log(`    Name: ${push || 'N/A'} | Last: ${date}`);
    console.log(`    ${preview}`);
    console.log();
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'start':
    cmdStart();
    break;
  case 'check':
    cmdCheck();
    break;
  case 'history':
    if (!args[0]) {
      console.error('Usage: node wa-listener.mjs history <jid-or-phone> [limit]');
      process.exit(1);
    }
    cmdHistory(args[0], args[1] || 20);
    break;
  case 'chats':
    cmdChats();
    break;
  default:
    console.log(`WhatsApp Listener for PyraAI
    
Usage:
  node wa-listener.mjs start              Start polling (foreground)
  node wa-listener.mjs check              One-shot check for new messages
  node wa-listener.mjs history <jid> [n]  Show recent messages for a chat
  node wa-listener.mjs chats              List all active chats
`);
}

// Export for programmatic use
export { WhatsAppListener, CONFIG, fetchMessages, fetchMessagesForChat, fetchChats };
