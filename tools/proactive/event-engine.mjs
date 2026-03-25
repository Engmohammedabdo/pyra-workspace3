#!/usr/bin/env node
// Event Priority Engine — ESM
// Central event processing: classify, route, and act on queued events.

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import https from 'https';

const __dirname = dirname(fileURLToPath(import.meta.url));
const QUEUE_PATH = join(__dirname, 'event-queue.json');
const STATS_PATH = join(__dirname, 'engine-stats.json');

// ── Load env ──
function loadEnv() {
  const envPath = '/home/node/.openclaw/credentials/pyra-voice.env';
  const lines = readFileSync(envPath, 'utf-8').split('\n');
  const env = {};
  for (const m of lines.map(l => l.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)).filter(Boolean)) {
    env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

const ENV = loadEnv();
const TELEGRAM_TOKEN = ENV.PYRASTORE_BOT_TOKEN;
const TELEGRAM_CHAT = '7990837012';

// ── Queue I/O ──
function readQueue() {
  if (!existsSync(QUEUE_PATH)) return [];
  try { return JSON.parse(readFileSync(QUEUE_PATH, 'utf-8')); }
  catch { return []; }
}

function writeQueue(q) {
  writeFileSync(QUEUE_PATH, JSON.stringify(q, null, 2));
}

// ── Telegram sender ──
function sendTelegram(text) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      chat_id: TELEGRAM_CHAT,
      text,
      parse_mode: 'HTML',
    });
    const req = https.request({
      hostname: 'api.telegram.org',
      path: `/bot${TELEGRAM_TOKEN}/sendMessage`,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        if (res.statusCode === 200) resolve(JSON.parse(body));
        else reject(new Error(`Telegram ${res.statusCode}: ${body}`));
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// ── Process events ──
async function processEvents() {
  const queue = readQueue();
  const pending = queue.filter(e => !e.processed);

  if (pending.length === 0) {
    console.log('✅ No pending events.');
    return;
  }

  console.log(`⚡ Processing ${pending.length} pending event(s)...\n`);

  let stats = { critical: 0, high: 0, medium: 0, low: 0, telegramSent: 0 };

  for (const event of pending) {
    const icon = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' }[event.priority] || '⚪';
    console.log(`${icon} [${event.priority.toUpperCase()}] ${event.source}: ${event.message.split('\n')[0]}`);

    stats[event.priority] = (stats[event.priority] || 0) + 1;

    // Routing
    switch (event.priority) {
      case 'critical': {
        // Send Telegram alert immediately
        const alertText = `🔴 <b>CRITICAL EVENT</b>\n\n` +
          `📌 Source: ${event.source}\n` +
          `💬 ${event.message}\n` +
          `🕐 ${event.timestamp}`;
        try {
          await sendTelegram(alertText);
          console.log('  → 📱 Telegram alert sent!');
          stats.telegramSent++;
        } catch (err) {
          console.error(`  → ❌ Telegram failed: ${err.message}`);
        }
        break;
      }
      case 'high':
        console.log('  → 📋 Queued for next heartbeat');
        break;
      case 'medium':
        console.log('  → 📊 Queued for daily summary');
        break;
      case 'low':
        console.log('  → 🗑️ Ignored (low priority)');
        break;
    }

    // Mark processed
    event.processed = true;
    event.processedAt = new Date().toISOString();
  }

  writeQueue(queue);

  // Update stats
  const existingStats = existsSync(STATS_PATH)
    ? JSON.parse(readFileSync(STATS_PATH, 'utf-8'))
    : { totalProcessed: 0, lastRun: null, history: [] };

  existingStats.totalProcessed += pending.length;
  existingStats.lastRun = new Date().toISOString();
  existingStats.history.push({
    timestamp: new Date().toISOString(),
    processed: pending.length,
    ...stats,
  });
  // Keep only last 100 history entries
  if (existingStats.history.length > 100) {
    existingStats.history = existingStats.history.slice(-100);
  }
  writeFileSync(STATS_PATH, JSON.stringify(existingStats, null, 2));

  console.log(`\n✅ Processed ${pending.length} events. Telegram alerts: ${stats.telegramSent}`);
}

// ── Add event manually ──
function addEvent(source, message, opts = {}) {
  const priority = opts.priority || 'medium';
  const urgency = opts.urgency || (
    priority === 'critical' ? 'immediate' :
    priority === 'high' ? 'soon' : 'whenever'
  );

  const event = {
    id: randomUUID(),
    source,
    type: opts.type || 'manual',
    message,
    priority,
    urgency,
    timestamp: new Date().toISOString(),
    processed: false,
    processedAt: null,
  };

  const queue = readQueue();
  queue.push(event);
  writeQueue(queue);

  const icon = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' }[priority];
  console.log(`${icon} Event added: [${priority.toUpperCase()}] ${source}: ${message}`);
  console.log(`  ID: ${event.id}`);
  return event;
}

// ── Show stats ──
function showStats() {
  const queue = readQueue();
  const pending = queue.filter(e => !e.processed);
  const processed = queue.filter(e => e.processed);

  console.log('📊 Event Engine Stats\n');
  console.log(`Total events: ${queue.length}`);
  console.log(`Pending: ${pending.length}`);
  console.log(`Processed: ${processed.length}`);

  // By priority
  console.log('\nPending by priority:');
  for (const p of ['critical', 'high', 'medium', 'low']) {
    const count = pending.filter(e => e.priority === p).length;
    if (count > 0) {
      const icon = { critical: '🔴', high: '🟠', medium: '🟡', low: '⚪' }[p];
      console.log(`  ${icon} ${p}: ${count}`);
    }
  }

  // By source
  console.log('\nPending by source:');
  const sources = {};
  for (const e of pending) sources[e.source] = (sources[e.source] || 0) + 1;
  for (const [s, c] of Object.entries(sources)) console.log(`  📌 ${s}: ${c}`);

  // Engine stats
  if (existsSync(STATS_PATH)) {
    const s = JSON.parse(readFileSync(STATS_PATH, 'utf-8'));
    console.log(`\nTotal ever processed: ${s.totalProcessed}`);
    console.log(`Last run: ${s.lastRun || 'never'}`);
  }
}

// ── Get unprocessed HIGH events (for heartbeat integration) ──
function getHighEvents() {
  const queue = readQueue();
  return queue.filter(e => !e.processed && e.priority === 'high');
}

// ── Daily summary of MEDIUM events ──
function getDailySummary() {
  const queue = readQueue();
  const today = new Date().toISOString().slice(0, 10);
  return queue.filter(e =>
    e.priority === 'medium' &&
    e.timestamp.startsWith(today)
  );
}

// ── CLI ──
const args = process.argv.slice(2);
const cmd = args[0];

switch (cmd) {
  case 'process':
    processEvents();
    break;

  case 'stats':
    showStats();
    break;

  case 'add': {
    const source = args[1];
    const message = args[2];
    if (!source || !message) {
      console.log('Usage: node event-engine.mjs add <source> <message> [--priority critical|high|medium|low] [--urgency immediate|soon|whenever]');
      process.exit(1);
    }
    const opts = {};
    for (let i = 3; i < args.length; i += 2) {
      if (args[i] === '--priority') opts.priority = args[i + 1];
      if (args[i] === '--urgency') opts.urgency = args[i + 1];
      if (args[i] === '--type') opts.type = args[i + 1];
    }
    addEvent(source, message, opts);
    break;
  }

  case 'high':
    // Print high-priority unprocessed events (for heartbeat)
    const high = getHighEvents();
    if (high.length === 0) console.log('No pending high-priority events.');
    else {
      console.log(`🟠 ${high.length} HIGH priority event(s):`);
      for (const e of high) console.log(`  - [${e.source}] ${e.message.split('\n')[0]}`);
    }
    break;

  case 'summary':
    const summary = getDailySummary();
    if (summary.length === 0) console.log('No medium events today.');
    else {
      console.log(`🟡 ${summary.length} MEDIUM event(s) today:`);
      for (const e of summary) console.log(`  - [${e.source}] ${e.message.split('\n')[0]}`);
    }
    break;

  default:
    console.log(`Usage: node event-engine.mjs <command>

Commands:
  process              Process all pending events (route by priority)
  stats                Show event queue statistics
  add <src> <msg>      Add event manually (--priority, --urgency, --type)
  high                 List unprocessed HIGH priority events
  summary              Today's MEDIUM events summary

Options for 'add':
  --priority critical|high|medium|low
  --urgency  immediate|soon|whenever
  --type     event type label`);
}

export { addEvent, processEvents, getHighEvents, getDailySummary, readQueue };
