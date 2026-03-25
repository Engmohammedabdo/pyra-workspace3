#!/usr/bin/env node
// IMAP IDLE Email Watcher — ESM
// Connects to IMAP, watches for new emails, classifies priority, queues events.

import { ImapFlow } from 'imapflow';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = join(__dirname, 'event-queue.json');
const STATUS_PATH = join(__dirname, 'watcher-status.json');

// ── Load env from file ──
function loadEnv() {
  const envPath = '/home/node/.openclaw/credentials/pyra-voice.env';
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  const env = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const ENV = loadEnv();

// ── Priority classification ──
const CRITICAL_SENDERS = [
  'mohammed', 'admin@pyramedia', 'ceo@', 'client',
  'support@pyramedia', 'billing', 'urgent'
];
const HIGH_KEYWORDS = [
  'invoice', 'payment', 'deadline', 'meeting', 'contract',
  'proposal', 'order', 'confirmation', 'account', 'important',
  'asap', 'action required', 'follow up', 'request'
];
const LOW_KEYWORDS = [
  'unsubscribe', 'newsletter', 'promo', 'marketing', 'sale',
  'discount', 'offer', 'deal', 'click here', 'limited time',
  'no-reply', 'noreply', 'donotreply', 'bulk'
];

function classifyEmail(from, subject) {
  const f = (from || '').toLowerCase();
  const s = (subject || '').toLowerCase();

  // CRITICAL: known senders
  if (CRITICAL_SENDERS.some(k => f.includes(k))) {
    return { priority: 'critical', urgency: 'immediate' };
  }
  // LOW: spam/promo
  if (LOW_KEYWORDS.some(k => f.includes(k) || s.includes(k))) {
    return { priority: 'low', urgency: 'whenever' };
  }
  // HIGH: business keywords
  if (HIGH_KEYWORDS.some(k => s.includes(k))) {
    return { priority: 'high', urgency: 'soon' };
  }
  // MEDIUM: everything else
  return { priority: 'medium', urgency: 'whenever' };
}

// ── Queue helpers ──
function readQueue() {
  if (!existsSync(QUEUE_PATH)) return [];
  try { return JSON.parse(readFileSync(QUEUE_PATH, 'utf-8')); }
  catch { return []; }
}

function writeQueue(q) {
  writeFileSync(QUEUE_PATH, JSON.stringify(q, null, 2));
}

function addEvent(event) {
  const q = readQueue();
  q.push(event);
  writeQueue(q);
}

function updateStatus(data) {
  const status = existsSync(STATUS_PATH)
    ? JSON.parse(readFileSync(STATUS_PATH, 'utf-8'))
    : {};
  Object.assign(status, data, { updatedAt: new Date().toISOString() });
  writeFileSync(STATUS_PATH, JSON.stringify(status, null, 2));
}

// ── IMAP client factory ──
function createClient() {
  return new ImapFlow({
    host: ENV.BAYRA_EMAIL_HOST,
    port: parseInt(ENV.BAYRA_IMAP_PORT || '993'),
    secure: true,
    auth: {
      user: ENV.BAYRA_EMAIL_USER,
      pass: ENV.BAYRA_EMAIL_PASS,
    },
    logger: false,
  });
}

// ── Parse address ──
function addrStr(addr) {
  if (!addr) return '';
  if (addr.address) return `${addr.name || ''} <${addr.address}>`.trim();
  if (Array.isArray(addr)) return addr.map(addrStr).join(', ');
  if (addr.value) return addr.value.map(addrStr).join(', ');
  return String(addr);
}

// ── One-shot check: fetch recent unseen emails ──
async function checkEmails() {
  const client = createClient();
  try {
    await client.connect();
    console.log('✅ Connected to IMAP');

    const lock = await client.getMailboxLock('INBOX');
    try {
      const status = await client.status('INBOX', { messages: true, unseen: true });
      console.log(`📬 INBOX: ${status.messages} total, ${status.unseen} unseen`);

      // Fetch last 10 messages
      const msgs = [];
      for await (const msg of client.fetch('1:*', {
        envelope: true, uid: true,
      }, { changedSince: 0 })) {
        msgs.push(msg);
      }

      const recent = msgs.slice(-10);
      console.log(`\n📧 Last ${recent.length} emails:`);
      let newEvents = 0;

      for (const msg of recent) {
        const env = msg.envelope;
        const from = addrStr(env.from);
        const subject = env.subject || '(no subject)';
        const date = env.date ? new Date(env.date).toISOString() : 'unknown';
        const { priority, urgency } = classifyEmail(from, subject);

        const icon = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' }[priority];
        console.log(`  ${icon} [${priority.toUpperCase()}] ${subject}`);
        console.log(`     From: ${from} | Date: ${date}`);

        // Only queue unseen as events
        if (msg.flags && !msg.flags.has('\\Seen')) {
          addEvent({
            id: randomUUID(),
            source: 'email',
            type: 'new-email',
            message: `From: ${from}\nSubject: ${subject}`,
            priority,
            urgency,
            timestamp: new Date().toISOString(),
            processed: false,
            processedAt: null,
            meta: { uid: msg.uid, from, subject, date },
          });
          newEvents++;
        }
      }

      console.log(`\n✅ Queued ${newEvents} new events`);
      updateStatus({ lastCheck: new Date().toISOString(), newEvents });
    } finally {
      lock.release();
    }
    await client.logout();
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

// ── IDLE watcher: persistent connection ──
async function startWatcher() {
  console.log('🚀 Starting IMAP IDLE watcher...');
  updateStatus({ state: 'starting', pid: process.pid });

  let reconnectDelay = 5000;

  async function watch() {
    const client = createClient();
    try {
      await client.connect();
      console.log('✅ Connected to IMAP');
      updateStatus({ state: 'connected', lastConnect: new Date().toISOString() });
      reconnectDelay = 5000; // reset on success

      const lock = await client.getMailboxLock('INBOX');

      // Listen for new messages
      client.on('exists', async (data) => {
        console.log(`📨 New message(s) detected! (count: ${data.count || data})`);
        try {
          // Fetch the latest message
          for await (const msg of client.fetch(`${data.count || '*'}:*`, {
            envelope: true, uid: true, flags: true,
          })) {
            const env = msg.envelope;
            const from = addrStr(env.from);
            const subject = env.subject || '(no subject)';
            const { priority, urgency } = classifyEmail(from, subject);

            console.log(`  📧 [${priority.toUpperCase()}] ${subject} — from ${from}`);

            addEvent({
              id: randomUUID(),
              source: 'email',
              type: 'new-email',
              message: `From: ${from}\nSubject: ${subject}`,
              priority,
              urgency,
              timestamp: new Date().toISOString(),
              processed: false,
              processedAt: null,
              meta: { uid: msg.uid, from, subject },
            });
          }
        } catch (e) {
          console.error('Error fetching new message:', e.message);
        }
      });

      client.on('close', () => {
        console.log('⚠️ Connection closed, will reconnect...');
        lock.release();
        scheduleReconnect();
      });

      client.on('error', (err) => {
        console.error('⚠️ IMAP error:', err.message);
      });

      // Enter IDLE — this keeps the connection alive
      console.log('👂 Listening for new emails (IDLE)...');
      updateStatus({ state: 'idle', lastIdle: new Date().toISOString() });

      // Keep alive by re-entering IDLE every 25 minutes
      while (true) {
        try {
          await client.idle({ timeout: 25 * 60 * 1000 });
        } catch (e) {
          if (e.message?.includes('closed')) break;
          console.error('IDLE error:', e.message);
        }
      }
    } catch (err) {
      console.error('❌ Connection error:', err.message);
      scheduleReconnect();
    }
  }

  function scheduleReconnect() {
    console.log(`🔄 Reconnecting in ${reconnectDelay / 1000}s...`);
    updateStatus({ state: 'reconnecting', nextReconnect: new Date(Date.now() + reconnectDelay).toISOString() });
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 300000); // max 5 min
      watch();
    }, reconnectDelay);
  }

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down...');
    updateStatus({ state: 'stopped', stoppedAt: new Date().toISOString() });
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    updateStatus({ state: 'stopped', stoppedAt: new Date().toISOString() });
    process.exit(0);
  });

  watch();
}

// ── Status ──
function showStatus() {
  if (!existsSync(STATUS_PATH)) {
    console.log('⚪ No watcher status found. Run "start" or "check" first.');
    return;
  }
  const s = JSON.parse(readFileSync(STATUS_PATH, 'utf-8'));
  console.log('📊 Email Watcher Status:');
  for (const [k, v] of Object.entries(s)) {
    console.log(`  ${k}: ${v}`);
  }
  const q = readQueue();
  const pending = q.filter(e => !e.processed && e.source === 'email');
  console.log(`  pendingEmailEvents: ${pending.length}`);
}

// ── CLI ──
const cmd = process.argv[2];
switch (cmd) {
  case 'start':
    startWatcher();
    break;
  case 'check':
    checkEmails();
    break;
  case 'status':
    showStatus();
    break;
  default:
    console.log(`Usage: node email-watcher.mjs <command>

Commands:
  start   Start persistent IDLE watcher (foreground)
  check   One-shot: check recent emails and queue events
  status  Show watcher status`);
}
