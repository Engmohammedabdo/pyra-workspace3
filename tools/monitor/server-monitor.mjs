#!/usr/bin/env node
// Server Monitor — Dynamic health checker with Telegram alerts
// ESM module, Node 22+ (native fetch)

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = join(__dirname, 'services.json');

// ─── Helpers ───────────────────────────────────────────────

function loadConfig() {
  if (!existsSync(CONFIG_PATH)) {
    console.error('❌ services.json not found. Run from the monitor directory.');
    process.exit(1);
  }
  return JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
}

function saveConfig(config) {
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2) + '\n');
}

function loadHistory(path) {
  if (!existsSync(path)) return { services: {}, checks: [] };
  try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return { services: {}, checks: [] }; }
}

function saveHistory(path, history) {
  writeFileSync(path, JSON.stringify(history, null, 2) + '\n');
}

function getTelegramToken() {
  const envPath = '/home/node/.openclaw/credentials/pyra-voice.env';
  if (!existsSync(envPath)) return null;
  const content = readFileSync(envPath, 'utf8');
  // Try TELEGRAM_BOT_TOKEN first, then PYRASTORE_BOT_TOKEN
  for (const key of ['TELEGRAM_BOT_TOKEN', 'PYRASTORE_BOT_TOKEN']) {
    const match = content.match(new RegExp(`^${key}=(.+)$`, 'm'));
    if (match) return match[1].trim();
  }
  return null;
}

async function sendTelegram(chatId, text) {
  const token = getTelegramToken();
  if (!token) {
    console.log('⚠️  No Telegram token found — printing to console only');
    console.log(text);
    return false;
  }
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    const data = await res.json();
    if (!data.ok) {
      console.error('❌ Telegram error:', data.description);
      return false;
    }
    return true;
  } catch (err) {
    console.error('❌ Telegram send failed:', err.message);
    return false;
  }
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

// ─── Core: Health Check ────────────────────────────────────

async function checkService(service, timeoutMs) {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(service.url, {
      method: service.method || 'GET',
      signal: controller.signal,
      redirect: 'manual', // Don't follow redirects — check status directly
      headers: { 'User-Agent': 'PyraMonitor/1.0' },
    });
    clearTimeout(timer);
    const responseTime = Date.now() - start;
    const expected = service.expectedStatus || [200];
    const up = expected.includes(res.status);
    return { name: service.name, url: service.url, up, status: res.status, responseTime, error: null, timestamp: Date.now() };
  } catch (err) {
    return { name: service.name, url: service.url, up: false, status: 0, responseTime: Date.now() - start, error: err.name === 'AbortError' ? 'Timeout' : err.message, timestamp: Date.now() };
  }
}

async function runChecks() {
  const config = loadConfig();
  const { settings } = config;
  const history = loadHistory(settings.historyFile);

  console.log(`\n🔍 Checking ${config.services.length} services...\n`);

  const results = await Promise.all(config.services.map(s => checkService(s, settings.timeoutMs)));
  const alerts = [];

  for (const result of results) {
    const icon = result.up ? '✅' : '❌';
    const statusText = result.error || `HTTP ${result.status}`;
    console.log(`${icon} ${result.name.padEnd(20)} ${statusText.padEnd(15)} ${formatDuration(result.responseTime)}`);

    // State tracking
    const prev = history.services[result.name];
    const wasUp = prev ? prev.up : true; // Assume was up if first check

    if (prev && wasUp !== result.up) {
      // State changed!
      const lastAlertTime = prev.lastAlertTime || 0;
      const cooldown = settings.alertCooldownMinutes * 60 * 1000;
      if (Date.now() - lastAlertTime > cooldown) {
        alerts.push(result);
        history.services[result.name] = { ...history.services[result.name], lastAlertTime: Date.now() };
      }
    }

    // Update history
    if (!history.services[result.name]) {
      history.services[result.name] = { responseTimes: [], transitions: [] };
    }
    const svc = history.services[result.name];
    svc.up = result.up;
    svc.lastCheck = result.timestamp;
    svc.lastStatus = result.status;
    svc.lastError = result.error;
    svc.lastResponseTime = result.responseTime;

    // Store response times (keep last 100)
    svc.responseTimes = svc.responseTimes || [];
    svc.responseTimes.push({ time: result.timestamp, ms: result.responseTime });
    if (svc.responseTimes.length > 100) svc.responseTimes = svc.responseTimes.slice(-100);

    // Track transitions
    if (prev && wasUp !== result.up) {
      svc.transitions = svc.transitions || [];
      svc.transitions.push({ from: wasUp ? 'up' : 'down', to: result.up ? 'up' : 'down', time: result.timestamp });
      if (svc.transitions.length > 200) svc.transitions = svc.transitions.slice(-200);
    }
  }

  // Log check
  history.checks = history.checks || [];
  history.checks.push({ time: Date.now(), results: results.map(r => ({ name: r.name, up: r.up, status: r.status, ms: r.responseTime })) });
  if (history.checks.length > 1000) history.checks = history.checks.slice(-1000);

  saveHistory(settings.historyFile, history);

  // Send alerts
  if (alerts.length > 0) {
    for (const alert of alerts) {
      const emoji = alert.up ? '✅' : '🚨';
      const state = alert.up ? 'UP' : 'DOWN';
      const detail = alert.error ? `Error: ${alert.error}` : `HTTP ${alert.status}`;
      const msg = `${emoji} <b>Service ${state}</b>\n\n<b>${alert.name}</b>\n${alert.url}\n${detail}\nResponse: ${formatDuration(alert.responseTime)}\n\n🕐 ${new Date().toISOString()}`;
      const sent = await sendTelegram(settings.telegramChatId, msg);
      console.log(sent ? `📤 Alert sent for ${alert.name}` : `⚠️  Alert not sent for ${alert.name}`);
    }
  }

  const upCount = results.filter(r => r.up).length;
  console.log(`\n📊 ${upCount}/${results.length} services up`);
  if (alerts.length) console.log(`📤 ${alerts.length} alert(s) sent`);
}

// ─── CLI: Status ───────────────────────────────────────────

function showStatus() {
  const config = loadConfig();
  const history = loadHistory(config.settings.historyFile);

  console.log('\n📊 Service Status\n');
  console.log('Service'.padEnd(22) + 'Status'.padEnd(10) + 'Last Check'.padEnd(15) + 'Response'.padEnd(12) + 'Avg (ms)');
  console.log('─'.repeat(70));

  for (const svc of config.services) {
    const h = history.services[svc.name];
    if (!h) {
      console.log(`${svc.name.padEnd(22)} ⚪ Unknown      never checked`);
      continue;
    }
    const icon = h.up ? '✅ Up' : '❌ Down';
    const last = h.lastCheck ? timeAgo(h.lastCheck) : 'never';
    const rt = h.lastResponseTime ? formatDuration(h.lastResponseTime) : '-';
    const avg = h.responseTimes?.length
      ? Math.round(h.responseTimes.reduce((a, b) => a + b.ms, 0) / h.responseTimes.length)
      : '-';
    console.log(`${svc.name.padEnd(22)} ${icon.padEnd(10)} ${last.padEnd(15)} ${rt.padEnd(12)} ${avg}`);
  }
  console.log();
}

// ─── CLI: Add / Remove ─────────────────────────────────────

function addService(name, url, method = 'GET', expectedStatus = [200]) {
  const config = loadConfig();
  if (config.services.find(s => s.name.toLowerCase() === name.toLowerCase())) {
    console.log(`⚠️  Service "${name}" already exists`);
    return;
  }
  config.services.push({ name, url, method, expectedStatus });
  saveConfig(config);
  console.log(`✅ Added "${name}" → ${url}`);
}

function removeService(name) {
  const config = loadConfig();
  const idx = config.services.findIndex(s => s.name.toLowerCase() === name.toLowerCase());
  if (idx === -1) {
    console.log(`⚠️  Service "${name}" not found`);
    return;
  }
  config.services.splice(idx, 1);
  saveConfig(config);
  console.log(`🗑️  Removed "${name}"`);
}

// ─── CLI: Report ───────────────────────────────────────────

function showReport() {
  const config = loadConfig();
  const history = loadHistory(config.settings.historyFile);

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  console.log('\n📈 Uptime Report\n');

  for (const svc of config.services) {
    const h = history.services[svc.name];
    console.log(`── ${svc.name} ──`);
    if (!h || !h.responseTimes?.length) {
      console.log('  No data yet\n');
      continue;
    }

    // Response time stats
    const times = h.responseTimes;
    const last24h = times.filter(t => now - t.time < day);
    const last7d = times.filter(t => now - t.time < 7 * day);

    const avg = arr => arr.length ? Math.round(arr.reduce((a, b) => a + b.ms, 0) / arr.length) : 0;
    const max = arr => arr.length ? Math.max(...arr.map(t => t.ms)) : 0;
    const min = arr => arr.length ? Math.min(...arr.map(t => t.ms)) : 0;

    console.log(`  Current: ${h.up ? '✅ Up' : '❌ Down'}`);
    if (last24h.length) {
      console.log(`  24h — avg: ${avg(last24h)}ms, min: ${min(last24h)}ms, max: ${max(last24h)}ms (${last24h.length} checks)`);
    }
    if (last7d.length) {
      console.log(`  7d  — avg: ${avg(last7d)}ms, min: ${min(last7d)}ms, max: ${max(last7d)}ms (${last7d.length} checks)`);
    }

    // Transitions
    const transitions = (h.transitions || []).filter(t => now - t.time < 7 * day);
    if (transitions.length) {
      console.log(`  State changes (7d): ${transitions.length}`);
      for (const t of transitions.slice(-5)) {
        console.log(`    ${new Date(t.time).toISOString()} — ${t.from} → ${t.to}`);
      }
    } else {
      console.log(`  State changes (7d): 0 (stable)`);
    }

    // Uptime estimate from checks
    const recentChecks = (history.checks || []).filter(c => now - c.time < 7 * day);
    let upChecks = 0, totalChecks = 0;
    for (const check of recentChecks) {
      const r = check.results.find(r => r.name === svc.name);
      if (r) { totalChecks++; if (r.up) upChecks++; }
    }
    if (totalChecks > 0) {
      console.log(`  Uptime (7d): ${((upChecks / totalChecks) * 100).toFixed(1)}% (${upChecks}/${totalChecks} checks)`);
    }
    console.log();
  }
}

// ─── CLI: Test Alert ───────────────────────────────────────

async function testAlert() {
  const config = loadConfig();
  const token = getTelegramToken();
  console.log(`🔑 Token: ${token ? token.slice(0, 10) + '...' : 'NOT FOUND'}`);
  console.log(`📱 Chat ID: ${config.settings.telegramChatId}`);

  const msg = `🧪 <b>Test Alert</b>\n\nServer Monitor is working!\n${config.services.length} services configured.\n\n🕐 ${new Date().toISOString()}`;
  const sent = await sendTelegram(config.settings.telegramChatId, msg);
  console.log(sent ? '✅ Test alert sent!' : '❌ Test alert failed');
}

// ─── Main ──────────────────────────────────────────────────

const [cmd, ...args] = process.argv.slice(2);

switch (cmd) {
  case 'check':
    await runChecks();
    break;
  case 'status':
    showStatus();
    break;
  case 'add':
    if (args.length < 2) { console.log('Usage: node server-monitor.mjs add "Name" "https://url"'); break; }
    addService(args[0], args[1], args[2] || 'GET', args[3] ? JSON.parse(args[3]) : [200]);
    break;
  case 'remove':
    if (!args[0]) { console.log('Usage: node server-monitor.mjs remove "Name"'); break; }
    removeService(args[0]);
    break;
  case 'report':
    showReport();
    break;
  case 'test-alert':
    await testAlert();
    break;
  default:
    console.log(`
🖥️  Server Monitor — Dynamic Health Checker

Usage:
  node server-monitor.mjs check              Run health checks
  node server-monitor.mjs status             Show current status
  node server-monitor.mjs add "Name" "URL"   Add a service
  node server-monitor.mjs remove "Name"      Remove a service
  node server-monitor.mjs report             Uptime report
  node server-monitor.mjs test-alert         Test Telegram notification
`);
}
