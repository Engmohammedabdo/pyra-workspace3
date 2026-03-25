/**
 * realtime-bridge.mjs — Process new content from daily files on-demand
 * 
 * Designed to run more frequently than daily-maintenance (e.g., every hour).
 * Uses offset tracking to only process NEW content since last run.
 * 
 * Usage:
 *   node realtime-bridge.mjs           # Process today's file
 *   node realtime-bridge.mjs --watch   # Watch mode (long-running)
 */

import { readFileSync, writeFileSync, existsSync, statSync, watch } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = '/home/node/openclaw/memory';
const STATE_FILE = join(MEMORY_DIR, 'realtime-state.json');

// ─── State Management ─────────────────────────────────

function loadState() {
  try {
    if (existsSync(STATE_FILE)) return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
  } catch {}
  return { files: {}, lastRun: null };
}

function saveState(state) {
  state.lastRun = new Date().toISOString();
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

// ─── Content Processing ───────────────────────────────

/**
 * Process new content from a specific file since last known offset.
 * Returns { processed: boolean, newBytes: number, facts: number }
 */
export async function processFileChanges(filePath, state) {
  if (!existsSync(filePath)) return { processed: false, newBytes: 0, facts: 0 };
  
  const content = readFileSync(filePath, 'utf-8');
  const fileName = filePath.split('/').pop();
  const fileState = state.files[fileName] || { offset: 0, lastProcessed: null };
  
  // Nothing new?
  if (fileState.offset >= content.length) {
    return { processed: false, newBytes: 0, facts: 0 };
  }
  
  const newContent = content.slice(fileState.offset);
  if (newContent.trim().length < 30) {
    // Update offset but don't process trivial additions
    state.files[fileName] = { offset: content.length, lastProcessed: new Date().toISOString() };
    return { processed: false, newBytes: newContent.length, facts: 0 };
  }
  
  console.log(`[realtime] Processing ${fileName}: ${newContent.length} new bytes`);
  
  // Convert to messages format, filtering out maintenance/monitor noise
  const NOISE_PATTERNS = [
    /scripts?\s+(have\s+)?syntax\s+OK/i,
    /Memory\s+DB\s+integrity\s+(is\s+)?OK/i,
    /all\s+(services?\s+)?(are\s+)?UP/i,
    /integrity_check.*ok/i,
    /HEARTBEAT_OK/i,
    /stale.?lock.?cleaner/i,
    /post.?update.?repair/i,
    /no\s+stale\s+locks/i,
    /REPAIR_OK/i,
    /0\s+unseen/i,
    /لا يوجد رسائل جديدة/,
    /تقرير صحة الذاكرة/,
    /النظام يعمل بكفاءة/,
  ];
  
  const sections = newContent.split(/^## /m).filter(s => {
    if (s.trim().length <= 30) return false;
    // Skip maintenance/health-check noise
    return !NOISE_PATTERNS.some(p => p.test(s));
  });
  const messages = sections.map(s => ({ role: 'user', content: `## ${s.trim()}` }));
  
  if (messages.length === 0) {
    state.files[fileName] = { offset: content.length, lastProcessed: new Date().toISOString() };
    return { processed: false, newBytes: newContent.length, facts: 0 };
  }
  
  // Run fact extraction
  let facts = 0;
  try {
    const { autoIngestConversation } = await import('./auto-ingest.mjs');
    const result = await autoIngestConversation(messages, {
      source: `realtime:${fileName}`,
      channel: 'realtime-bridge',
    });
    facts = result.ingested + result.superseded;
    console.log(`[realtime] ${fileName}: extracted=${result.extracted}, ingested=${result.ingested}, superseded=${result.superseded}`);
  } catch (err) {
    console.error(`[realtime] Error processing ${fileName}:`, err.message);
  }
  
  // Update offset
  state.files[fileName] = { offset: content.length, lastProcessed: new Date().toISOString() };
  
  return { processed: true, newBytes: newContent.length, facts };
}

// ─── Cron Mode ────────────────────────────────────────

/**
 * Run once — process today's and yesterday's files.
 */
export async function cronRun() {
  const state = loadState();
  const results = [];
  
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  
  for (const dateStr of [yesterday, today]) {
    const filePath = join(MEMORY_DIR, `${dateStr}.md`);
    const result = await processFileChanges(filePath, state);
    results.push({ file: `${dateStr}.md`, ...result });
  }
  
  // Also check WIP.md
  const wipPath = '/home/node/openclaw/WIP.md';
  const wipResult = await processFileChanges(wipPath, state);
  results.push({ file: 'WIP.md', ...wipResult });
  
  saveState(state);
  return results;
}

// ─── Watch Mode ───────────────────────────────────────

/**
 * Watch memory directory for changes (long-running).
 * Debounces to avoid processing mid-write.
 */
export function startWatcher() {
  console.log(`[realtime] Watching ${MEMORY_DIR} for changes...`);
  const state = loadState();
  let debounceTimer = null;
  
  watch(MEMORY_DIR, { recursive: false }, (event, filename) => {
    if (!filename || !filename.match(/^\d{4}-\d{2}-\d{2}\.md$/)) return;
    
    // Debounce: wait 5 seconds after last change
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(async () => {
      const filePath = join(MEMORY_DIR, filename);
      const result = await processFileChanges(filePath, state);
      if (result.processed) {
        saveState(state);
        console.log(`[realtime] ${filename}: ${result.facts} facts extracted`);
      }
    }, 5000);
  });
}

// ─── CLI ──────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('realtime-bridge.mjs');
if (isMain) {
  if (process.argv.includes('--watch')) {
    startWatcher();
  } else {
    cronRun()
      .then(results => {
        console.log('\nResults:');
        for (const r of results) {
          const status = r.processed ? '✅' : '⏭️';
          console.log(`  ${status} ${r.file}: ${r.newBytes} bytes, ${r.facts} facts`);
        }
      })
      .catch(err => { console.error('Fatal:', err); process.exit(1); });
  }
}
