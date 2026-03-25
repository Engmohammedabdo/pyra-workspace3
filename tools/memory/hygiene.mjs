/**
 * Bayra Memory System — Hygiene Module
 * Inspired by ZeroClaw's hygiene.rs
 * 
 * Automated maintenance: archiving old daily logs, purging old archives,
 * pruning stale conversation memories, and running on a configurable cadence.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, renameSync, unlinkSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE_DIR = join(__dirname, '..', '..');
const MEMORY_DIR = join(WORKSPACE_DIR, 'memory');
const STATE_FILE = join(MEMORY_DIR, 'hygiene-state.json');

// ─── Config ────────────────────────────────────────────────────────

const DEFAULT_CONFIG = {
  hygieneEnabled: true,
  intervalHours: 12,           // Run every 12 hours
  archiveAfterDays: 14,        // Archive daily logs older than 14 days
  purgeAfterDays: 60,          // Purge archives older than 60 days
  conversationRetentionDays: 30, // Prune conversation memories older than 30 days
  maxActiveMemories: 2000,     // Soft cap on active memories
};

// ─── State Management ──────────────────────────────────────────────

function loadState() {
  try {
    if (existsSync(STATE_FILE)) {
      return JSON.parse(readFileSync(STATE_FILE, 'utf-8'));
    }
  } catch { /* fresh start */ }
  return { lastRunAt: null, lastReport: {} };
}

function saveState(report) {
  mkdirSync(dirname(STATE_FILE), { recursive: true });
  const state = {
    lastRunAt: new Date().toISOString(),
    lastReport: report,
  };
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
}

// ─── Check if Due ──────────────────────────────────────────────────

export function shouldRunNow(config = DEFAULT_CONFIG) {
  const state = loadState();
  if (!state.lastRunAt) return true;
  
  const lastRun = new Date(state.lastRunAt);
  const hoursSince = (Date.now() - lastRun.getTime()) / (1000 * 60 * 60);
  return hoursSince >= config.intervalHours;
}

// ─── Date Helpers ──────────────────────────────────────────────────

function dateFromFilename(filename) {
  const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;
  const d = new Date(match[1] + 'T00:00:00Z');
  return isNaN(d.getTime()) ? null : d;
}

function daysAgo(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

// ─── Archive Daily Memory Files ────────────────────────────────────

export function archiveDailyFiles(config = DEFAULT_CONFIG) {
  if (config.archiveAfterDays <= 0) return 0;
  if (!existsSync(MEMORY_DIR)) return 0;

  const archiveDir = join(MEMORY_DIR, 'archive');
  mkdirSync(archiveDir, { recursive: true });

  const cutoff = daysAgo(config.archiveAfterDays);
  let moved = 0;

  for (const file of readdirSync(MEMORY_DIR)) {
    if (!file.endsWith('.md')) continue;
    const fileDate = dateFromFilename(file);
    if (!fileDate) continue;
    if (fileDate >= cutoff) continue;

    const src = join(MEMORY_DIR, file);
    const dst = join(archiveDir, file);
    try {
      renameSync(src, dst);
      moved++;
    } catch (err) {
      console.warn(`[hygiene] Failed to archive ${file}: ${err.message}`);
    }
  }

  return moved;
}

// ─── Purge Old Archives ────────────────────────────────────────────

export function purgeOldArchives(config = DEFAULT_CONFIG) {
  if (config.purgeAfterDays <= 0) return 0;
  const archiveDir = join(MEMORY_DIR, 'archive');
  if (!existsSync(archiveDir)) return 0;

  const cutoff = daysAgo(config.purgeAfterDays);
  let removed = 0;

  for (const file of readdirSync(archiveDir)) {
    if (!file.endsWith('.md')) continue;
    const fileDate = dateFromFilename(file);
    if (!fileDate) continue;
    if (fileDate >= cutoff) continue;

    try {
      unlinkSync(join(archiveDir, file));
      removed++;
    } catch (err) {
      console.warn(`[hygiene] Failed to purge ${file}: ${err.message}`);
    }
  }

  return removed;
}

// ─── Prune Stale Conversation Memories (DB) ────────────────────────

export function pruneConversationRows(db, config = DEFAULT_CONFIG) {
  if (config.conversationRetentionDays <= 0) return 0;

  const cutoff = daysAgo(config.conversationRetentionDays).toISOString();

  // Soft-delete old episodic/conversation memories with low importance
  const result = db.prepare(`
    UPDATE memories SET status = 'archived', updated_at = ?
    WHERE status = 'active'
      AND type = 'episodic'
      AND importance < 6
      AND created_at < ?
      AND (last_accessed_at IS NULL OR last_accessed_at < ?)
  `).run(new Date().toISOString(), cutoff, cutoff);

  return result.changes;
}

// ─── Main Hygiene Runner ───────────────────────────────────────────

export function runHygiene(db, config = DEFAULT_CONFIG) {
  if (!config.hygieneEnabled) {
    return { skipped: true, reason: 'disabled' };
  }

  if (!shouldRunNow(config)) {
    return { skipped: true, reason: 'not_due' };
  }

  const report = {
    archivedFiles: archiveDailyFiles(config),
    purgedArchives: purgeOldArchives(config),
    prunedConversations: pruneConversationRows(db, config),
    timestamp: new Date().toISOString(),
  };

  const totalActions = report.archivedFiles + report.purgedArchives + report.prunedConversations;
  
  if (totalActions > 0) {
    console.log(`[hygiene] Complete: archived=${report.archivedFiles} purged=${report.purgedArchives} pruned=${report.prunedConversations}`);
  }

  saveState(report);
  return report;
}

// ─── CLI ───────────────────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('hygiene.mjs');
if (isMain) {
  const force = process.argv.includes('--force');
  
  // Need DB for pruning
  const { getDb } = await import('./db.mjs');
  const db = getDb();
  
  const config = { ...DEFAULT_CONFIG };
  if (force) config.intervalHours = 0; // bypass cadence check
  
  const result = runHygiene(db, config);
  console.log(JSON.stringify(result, null, 2));
}
