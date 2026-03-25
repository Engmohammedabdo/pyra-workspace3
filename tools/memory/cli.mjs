#!/usr/bin/env node

/**
 * Bayra Memory System — CLI Tool
 * Usage: node cli.mjs <command> [args] [--flags]
 */

import { getDb, closeDb, createMemory, getMemory, deleteMemory, listMemories, getStats, searchMemories, findEntity, supersedeMemory } from './db.mjs';
import { embed, embeddingToBuffer, setCacheDb } from './embeddings.mjs';
import { recordEpisode, findSimilarEpisodes, getActivePatterns, getLessonsForContext, archivePattern, getPatternStats, initEpisodeSchema, generateLearningReport, suggestRulesFromPatterns, getPatternChains, decayPatterns, categorizePattern } from './episode-memory.mjs';
import { keywordSearch, vectorSearch, hybridSearch, entitySearch } from './search.mjs';
import { ingestMemory, ingestMarkdownFile, ingestConversation } from './ingest.mjs';
import { sleepTimeReflection, backupDatabase, checkIntegrity, getMemoryHealth } from './lifecycle.mjs';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// ─── Colors ────────────────────────────────────────────────

const isTTY = process.stdout.isTTY;
const c = {
  reset: isTTY ? '\x1b[0m' : '',
  bold: isTTY ? '\x1b[1m' : '',
  dim: isTTY ? '\x1b[2m' : '',
  red: isTTY ? '\x1b[31m' : '',
  green: isTTY ? '\x1b[32m' : '',
  yellow: isTTY ? '\x1b[33m' : '',
  blue: isTTY ? '\x1b[34m' : '',
  magenta: isTTY ? '\x1b[35m' : '',
  cyan: isTTY ? '\x1b[36m' : '',
  white: isTTY ? '\x1b[37m' : '',
  gray: isTTY ? '\x1b[90m' : '',
};

// ─── Argument Parsing ──────────────────────────────────────

function parseFlags(args) {
  const flags = {};
  const positional = [];
  let i = 0;
  while (i < args.length) {
    const arg = args[i];
    if (arg === '--dry-run') {
      flags.dryRun = true;
      i++;
    } else if (arg === '--important') {
      flags.important = true;
      i++;
    } else if (arg.startsWith('--') && i + 1 < args.length && !args[i + 1].startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      flags[key] = args[i + 1];
      i += 2;
    } else if (arg.startsWith('--')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase());
      flags[key] = true;
      i++;
    } else {
      positional.push(arg);
      i++;
    }
  }
  return { flags, positional };
}

// ─── Formatting Helpers ────────────────────────────────────

function truncate(str, len = 80) {
  if (!str) return '';
  str = str.replace(/\n/g, ' ');
  return str.length > len ? str.substring(0, len - 1) + '…' : str;
}

function formatDate(dateStr) {
  if (!dateStr) return c.dim + 'n/a' + c.reset;
  try {
    const d = new Date(dateStr);
    return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z');
  } catch { return dateStr; }
}

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / 1024 / 1024).toFixed(2) + ' MB';
}

function typeColor(type) {
  switch (type) {
    case 'semantic': return c.blue;
    case 'episodic': return c.magenta;
    case 'procedural': return c.cyan;
    default: return c.white;
  }
}

function printMemoryRow(m, idx, showScore = false) {
  const num = idx != null ? `${c.dim}${String(idx + 1).padStart(3)}${c.reset} ` : '';
  const type = `${typeColor(m.type)}${(m.type || '?').padEnd(10)}${c.reset}`;
  const imp = `${c.yellow}★${(m.importance ?? 0).toFixed(1).padStart(4)}${c.reset}`;
  const score = showScore && m.finalScore != null ? ` ${c.green}↑${m.finalScore.toFixed(3)}${c.reset}` : '';
  const content = truncate(m.content);
  const id = `${c.dim}${m.id?.substring(0, 8) || '?'}${c.reset}`;
  console.log(`${num}${id} ${type} ${imp}${score}  ${content}`);
}

function printMemoryFull(m) {
  console.log(`${c.bold}Memory: ${m.id}${c.reset}`);
  console.log(`  ${c.cyan}Type:${c.reset}       ${typeColor(m.type)}${m.type}${c.reset}${m.subtype ? ` / ${m.subtype}` : ''}`);
  console.log(`  ${c.cyan}Status:${c.reset}     ${m.status}`);
  console.log(`  ${c.cyan}Importance:${c.reset} ${c.yellow}★ ${m.importance}${c.reset}`);
  console.log(`  ${c.cyan}Confidence:${c.reset} ${m.confidence}`);
  console.log(`  ${c.cyan}Created:${c.reset}    ${formatDate(m.created_at)}`);
  console.log(`  ${c.cyan}Updated:${c.reset}    ${formatDate(m.updated_at)}`);
  console.log(`  ${c.cyan}Accessed:${c.reset}   ${m.access_count || 0} times, last: ${formatDate(m.last_accessed_at)}`);
  if (m.source) console.log(`  ${c.cyan}Source:${c.reset}     ${m.source}`);
  if (m.channel) console.log(`  ${c.cyan}Channel:${c.reset}    ${m.channel}`);
  if (m.tags) console.log(`  ${c.cyan}Tags:${c.reset}       ${m.tags}`);
  console.log(`  ${c.cyan}Content:${c.reset}`);
  console.log(`    ${m.content}`);
  if (m.summary) console.log(`  ${c.cyan}Summary:${c.reset}    ${m.summary}`);
}

function ok(msg) { console.log(`${c.green}✓${c.reset} ${msg}`); }
function err(msg) { console.error(`${c.red}✗${c.reset} ${msg}`); }
function info(msg) { console.log(`${c.blue}ℹ${c.reset} ${msg}`); }
function warn(msg) { console.log(`${c.yellow}⚠${c.reset} ${msg}`); }

// ─── Commands ──────────────────────────────────────────────

async function cmdSearch(positional, flags) {
  const query = positional.join(' ');
  if (!query) { err('Usage: search <query> [--limit N] [--type TYPE]'); process.exit(1); }

  const limit = parseInt(flags.limit) || 10;
  const types = flags.type ? [flags.type] : null;

  const db = getDb();
  setCacheDb(db);

  info(`Searching: "${query}" (limit: ${limit}${types ? ', type: ' + types.join(',') : ''})`)

  // Try hybrid search (keyword + vector)
  let results;
  try {
    const queryEmb = await embed(query);
    results = hybridSearch(db, query, queryEmb, { limit, types });
  } catch (e) {
    // Fall back to keyword-only
    warn(`Vector search unavailable (${e.message}), using keyword search`);
    results = keywordSearch(db, query, { limit, types });
  }

  if (results.length === 0) {
    warn('No results found.');
    return;
  }

  console.log(`\n${c.bold}Found ${results.length} results:${c.reset}\n`);
  for (let i = 0; i < results.length; i++) {
    printMemoryRow(results[i], i, true);
  }

  // Show full content of top 3
  if (results.length > 0) {
    console.log(`\n${c.bold}─── Top Results Detail ───${c.reset}\n`);
    for (let i = 0; i < Math.min(3, results.length); i++) {
      printMemoryFull(results[i]);
      console.log();
    }
  }
}

async function cmdAdd(positional, flags) {
  const content = positional.join(' ');
  if (!content) { err('Usage: add <content> [--type TYPE] [--importance N]'); process.exit(1); }

  const type = flags.type || 'semantic';
  const importance = parseFloat(flags.importance) || 5;

  const db = getDb();
  setCacheDb(db);

  info(`Adding memory (type: ${type}, importance: ${importance})...`);

  const result = await ingestMemory(db, content, {
    type,
    importance,
    source: 'cli',
    channel: 'cli',
  });

  if (result.action === 'created') {
    ok(`Memory created: ${result.memory.id}`);
  } else if (result.action === 'updated') {
    ok(`Duplicate found, updated existing: ${result.memory.id}`);
  } else {
    warn(`Memory skipped: ${result.reason || 'unknown'}`);
  }
}

function cmdGet(positional) {
  const id = positional[0];
  if (!id) { err('Usage: get <memory-id>'); process.exit(1); }

  const db = getDb();
  
  // Support partial ID
  let memory = getMemory(id);
  if (!memory) {
    const row = db.prepare("SELECT * FROM memories WHERE id LIKE ? LIMIT 1").get(id + '%');
    if (row) memory = row;
  }

  if (!memory) { err(`Memory not found: ${id}`); process.exit(1); }
  
  console.log();
  printMemoryFull(memory);
}

function cmdList(positional, flags) {
  const db = getDb();
  const filters = {};

  if (flags.type) filters.type = flags.type;
  if (flags.limit) filters.limit = parseInt(flags.limit);
  else filters.limit = 20;
  if (flags.important) filters.minImportance = 7;

  // Parse --recent Xh
  if (flags.recent) {
    const match = String(flags.recent).match(/^(\d+)([hd])$/);
    if (match) {
      const n = parseInt(match[1]);
      const unit = match[2] === 'h' ? 3600000 : 86400000;
      filters.since = new Date(Date.now() - n * unit).toISOString();
    }
  }

  const memories = listMemories(filters);
  
  if (memories.length === 0) {
    warn('No memories found matching filters.');
    return;
  }

  console.log(`\n${c.bold}${memories.length} memories:${c.reset}\n`);
  for (let i = 0; i < memories.length; i++) {
    printMemoryRow(memories[i], i);
  }
}

function cmdEntity(positional) {
  const name = positional.join(' ');
  if (!name) { err('Usage: entity <name>'); process.exit(1); }

  const db = getDb();
  
  info(`Searching entity: "${name}"`);
  
  const results = entitySearch(db, name, { limit: 20 });
  
  if (results.length === 0) {
    // Fallback: try FTS with entity name
    const ftsResults = searchMemories(name, 20);
    if (ftsResults.length === 0) {
      warn(`No memories found for entity "${name}".`);
      return;
    }
    console.log(`\n${c.dim}(No linked entity found, showing keyword matches)${c.reset}\n`);
    console.log(`${c.bold}${ftsResults.length} results:${c.reset}\n`);
    for (let i = 0; i < ftsResults.length; i++) {
      printMemoryRow(ftsResults[i], i);
    }
    return;
  }

  // Show entity info
  const entity = findEntity(name);
  if (entity) {
    console.log(`\n${c.bold}Entity: ${entity.name}${c.reset} (${entity.type})`);
    if (entity.aliases) {
      try {
        const aliases = JSON.parse(entity.aliases);
        if (aliases.length > 1) console.log(`  Aliases: ${aliases.join(', ')}`);
      } catch {}
    }
  }

  console.log(`\n${c.bold}${results.length} linked memories:${c.reset}\n`);
  for (let i = 0; i < results.length; i++) {
    const role = results[i].role ? ` ${c.dim}[${results[i].role}]${c.reset}` : '';
    printMemoryRow(results[i], i);
  }
}

function cmdDelete(positional) {
  const id = positional[0];
  if (!id) { err('Usage: delete <memory-id>'); process.exit(1); }

  const db = getDb();
  const memory = getMemory(id);
  if (!memory) { err(`Memory not found: ${id}`); process.exit(1); }

  const result = deleteMemory(id);
  if (result) {
    ok(`Memory soft-deleted: ${id}`);
  } else {
    err(`Failed to delete memory: ${id}`);
  }
}

function cmdStats() {
  const stats = getStats();
  
  console.log(`\n${c.bold}📊 Memory Stats${c.reset}\n`);
  console.log(`  ${c.cyan}Total Active:${c.reset}  ${stats.totalActive}`);
  console.log(`  ${c.cyan}Total (all):${c.reset}   ${stats.totalAll}`);
  console.log(`  ${c.cyan}DB Size:${c.reset}       ${formatSize(stats.dbSizeBytes)}`);
  console.log(`  ${c.cyan}DB Path:${c.reset}       ${stats.dbPath}`);
  console.log(`\n  ${c.bold}By Type:${c.reset}`);
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`    ${typeColor(type)}${type.padEnd(12)}${c.reset} ${count}`);
  }
}

function cmdHealth() {
  const db = getDb();
  const health = getMemoryHealth(db);
  
  console.log(`\n${c.bold}🏥 Memory Health Report${c.reset}\n`);

  // Type/Status breakdown
  console.log(`  ${c.bold}By Type & Status:${c.reset}`);
  for (const row of health.byTypeStatus) {
    console.log(`    ${typeColor(row.type)}${row.type.padEnd(12)}${c.reset} ${row.status.padEnd(12)} ${row.count}`);
  }

  // Avg importance
  console.log(`\n  ${c.bold}Avg Importance:${c.reset}`);
  for (const [type, avg] of Object.entries(health.avgImportance)) {
    console.log(`    ${typeColor(type)}${type.padEnd(12)}${c.reset} ${c.yellow}★ ${avg}${c.reset}`);
  }

  // Recent activity
  console.log(`\n  ${c.bold}Recent Activity:${c.reset}`);
  console.log(`    Last 24h: ${health.recentActivity.last24h}`);
  console.log(`    Last 7d:  ${health.recentActivity.last7d}`);
  console.log(`    Last 30d: ${health.recentActivity.last30d}`);

  // Embedding coverage
  console.log(`\n  ${c.bold}Embedding Coverage:${c.reset} ${health.embeddingCoverage}`);
  console.log(`  ${c.bold}DB Size:${c.reset} ${health.dbSizeMB} MB`);
  console.log(`  ${c.bold}Date Range:${c.reset} ${formatDate(health.dateRange.oldest)} → ${formatDate(health.dateRange.newest)}`);

  // Entities
  console.log(`\n  ${c.bold}Entities:${c.reset} ${health.entities.count} total`);
  if (health.entities.top.length > 0) {
    console.log(`  ${c.bold}Top Entities:${c.reset}`);
    for (const e of health.entities.top.slice(0, 5)) {
      console.log(`    ${e.name.padEnd(20)} ${c.dim}(${e.type})${c.reset} — ${e.memory_count} memories`);
    }
  }

  // Top importance
  if (health.topImportance.length > 0) {
    console.log(`\n  ${c.bold}Most Important:${c.reset}`);
    for (const m of health.topImportance.slice(0, 5)) {
      console.log(`    ${c.yellow}★ ${m.importance}${c.reset}  ${truncate(m.content, 60)}`);
    }
  }
}

async function cmdMaintain(flags) {
  const db = getDb();
  const dryRun = !!flags.dryRun;

  info(`Running maintenance${dryRun ? ' (DRY RUN)' : ''}...`);
  
  const result = await sleepTimeReflection(db, { dryRun });
  
  console.log(`\n${result.summary}`);
  
  if (result.consolidation.pairs.length > 0) {
    console.log(`\n  ${c.bold}Consolidation pairs:${c.reset}`);
    for (const p of result.consolidation.pairs.slice(0, 10)) {
      console.log(`    ${c.dim}${p.primary.substring(0, 8)}${c.reset} ← ${c.dim}${p.consolidated.substring(0, 8)}${c.reset} (sim: ${p.similarity})`);
      console.log(`      ${truncate(p.primaryContent, 60)}`);
    }
  }

  if (result.decay.details.length > 0) {
    console.log(`\n  ${c.bold}Decay adjustments (first 10):${c.reset}`);
    for (const d of result.decay.details.slice(0, 10)) {
      console.log(`    ${c.dim}${d.id.substring(0, 8)}${c.reset} ${d.type.padEnd(10)} ${c.yellow}★${d.oldImportance}${c.reset} → ${c.yellow}★${d.newImportance}${c.reset}`);
    }
  }
}

async function cmdBackup() {
  const db = getDb();
  info('Creating backup...');
  
  const result = await backupDatabase(db);
  
  ok(`Backup created: ${result.path}`);
  info(`Size: ${formatSize(result.size)} | Kept: ${result.kept} backups | Deleted old: ${result.deleted}`);
}

function cmdIntegrity() {
  const db = getDb();
  info('Running integrity check...');
  
  const result = checkIntegrity(db);
  
  if (result.ok) {
    ok(`Database integrity: OK`);
  } else {
    err(`Database integrity issues: ${result.result}`);
  }
}

async function cmdExport(positional) {
  const exportDir = positional[0] || './memory-export';
  mkdirSync(exportDir, { recursive: true });

  const db = getDb();
  const types = ['semantic', 'episodic', 'procedural'];
  let totalExported = 0;

  for (const type of types) {
    const memories = listMemories({ type, limit: 10000 });
    if (memories.length === 0) continue;

    const lines = [`# ${type.charAt(0).toUpperCase() + type.slice(1)} Memories\n`, `Exported: ${new Date().toISOString()}\n`, `Total: ${memories.length}\n`, '---\n'];
    
    for (const m of memories) {
      lines.push(`## ${m.id}\n`);
      lines.push(`- **Importance:** ${m.importance}`);
      lines.push(`- **Created:** ${m.created_at}`);
      if (m.tags) lines.push(`- **Tags:** ${m.tags}`);
      if (m.source) lines.push(`- **Source:** ${m.source}`);
      lines.push(`\n${m.content}\n`);
      lines.push('---\n');
      totalExported++;
    }

    writeFileSync(join(exportDir, `${type}.md`), lines.join('\n'));
  }

  ok(`Exported ${totalExported} memories to ${exportDir}/`);
}

async function cmdIngest(positional) {
  const filePath = positional[0];
  if (!filePath) { err('Usage: ingest <file.md>'); process.exit(1); }

  const db = getDb();
  setCacheDb(db);

  info(`Ingesting file: ${filePath}`);

  try {
    readFileSync(filePath); // check exists
  } catch {
    err(`File not found: ${filePath}`);
    process.exit(1);
  }

  const result = await ingestMarkdownFile(db, filePath, 'file');
  
  ok(`Ingested: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped (${result.total} total)`);
}

async function cmdAutoIngest(positional, flags) {
  const dryRun = !!flags.dryRun;
  const file = flags.file || null;

  let autoIngest;
  try {
    const mod = await import('./auto-ingest.mjs');
    autoIngest = mod.autoIngest;
  } catch (e) {
    err(`Failed to load auto-ingest module: ${e.message}`);
    process.exit(1);
  }

  const db = getDb();
  setCacheDb(db);

  info(`Auto-ingesting daily logs${file ? ` (file: ${file})` : ''}${dryRun ? ' (DRY RUN)' : ''}...`);

  try {
    const result = await autoIngest(file || undefined);

    console.log(`\n${c.bold}📥 Auto-Ingest Results${c.reset}\n`);
    console.log(`  ${c.green}Created:${c.reset}  ${result.created || 0}`);
    console.log(`  ${c.cyan}Updated:${c.reset}  ${result.updated || 0}`);
    console.log(`  ${c.yellow}Skipped:${c.reset}  ${result.skipped || 0}`);
    if (result.errors?.length > 0) {
      console.log(`  ${c.red}Errors:${c.reset}   ${result.errors.length}`);
      for (const e of result.errors.slice(0, 5)) {
        console.log(`    ${c.red}•${c.reset} ${e}`);
      }
    }
    if (result.files) {
      console.log(`  ${c.dim}Files processed: ${result.files}${c.reset}`);
    }
    if (dryRun) {
      warn('Dry run — no changes were made.');
    }
  } catch (e) {
    err(`Auto-ingest failed: ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  }
}

async function cmdIngestConversation(positional, flags) {
  const text = positional.join(' ');
  if (!text) {
    err('Usage: ingest-conversation "conversation text here"');
    process.exit(1);
  }

  const db = getDb();
  setCacheDb(db);

  info('Ingesting conversation...');

  try {
    const result = await ingestConversation(db, text, {
      source: flags.source || 'cli',
      channel: flags.channel || 'cli',
      session_id: flags.sessionId || null,
    });

    ok(`Conversation ingested: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped`);
    if (result.memories?.length > 0) {
      console.log(`\n${c.bold}Extracted memories:${c.reset}\n`);
      for (let i = 0; i < result.memories.length; i++) {
        printMemoryRow(result.memories[i], i);
      }
    }
  } catch (e) {
    err(`Conversation ingest failed: ${e.message}`);
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  }
}

function cmdSupersede(positional, flags) {
  const oldId = positional[0];
  const newId = positional[1];
  if (!oldId || !newId) {
    err('Usage: supersede <old_id> <new_id> [--reason "reason"]');
    process.exit(1);
  }

  const db = getDb();
  const reason = flags.reason || null;

  try {
    const result = supersedeMemory(db, oldId, newId, reason);
    ok(`Superseded: ${oldId.substring(0, 8)} → ${newId.substring(0, 8)}`);
    console.log(`\n${c.bold}Old memory:${c.reset}`);
    console.log(`  valid_until:   ${result.old.valid_until}`);
    console.log(`  superseded_by: ${result.old.superseded_by?.substring(0, 8)}`);
    console.log(`  content:       ${truncate(result.old.content, 80)}`);
    console.log(`\n${c.bold}New memory:${c.reset}`);
    console.log(`  valid_from:    ${result.new.valid_from}`);
    console.log(`  content:       ${truncate(result.new.content, 80)}`);
    if (reason) console.log(`\n${c.dim}Reason: ${reason}${c.reset}`);
  } catch (e) {
    err(e.message);
    process.exit(1);
  }
}

async function cmdTask(positional, flags) {
  const { createTask, getTask, updateTask, completeTask, deleteTask, listTasks, 
          saveCheckpoint, loadCheckpoint, getOverdueTasks, getStaleTasks, getTaskStats } = await import('./task-queue.mjs');
  
  const [subCmd, ...rest] = positional;
  
  switch (subCmd) {
    case 'add': {
      const title = rest.join(' ');
      if (!title) { err('Usage: task add <title> [--priority P] [--due DATE]'); return; }
      const task = createTask(title, {
        priority: flags.priority || 'medium',
        dueAt: flags.due || null,
        description: flags.desc || null,
        source: flags.source || 'cli',
        tags: flags.tags || null,
      });
      ok(`Task created: ${task.id.substring(0, 8)}`);
      console.log(`  Title: ${task.title}`);
      console.log(`  Priority: ${task.priority}`);
      if (task.due_at) console.log(`  Due: ${task.due_at}`);
      break;
    }
    case 'list': {
      const tasks = listTasks({
        status: flags.status || null,
        priority: flags.priority || null,
        includeCompleted: !!flags.all,
      });
      if (tasks.length === 0) { info('No tasks found.'); return; }
      console.log(`\n${c.bold}${tasks.length} tasks:${c.reset}\n`);
      for (const t of tasks) {
        const pri = t.priority === 'critical' ? c.red + '🔴' : t.priority === 'high' ? c.yellow + '🟠' : t.priority === 'medium' ? c.blue + '🔵' : c.green + '🟢';
        const status = t.status === 'done' ? '✅' : t.status === 'in_progress' ? '🔄' : t.status === 'blocked' ? '🚫' : '⬜';
        console.log(`  ${c.dim}${t.id.substring(0, 8)}${c.reset} ${pri}${c.reset} ${status} ${t.title}`);
        if (t.due_at) console.log(`    ${c.dim}Due: ${t.due_at}${c.reset}`);
      }
      break;
    }
    case 'get': {
      const id = rest[0];
      if (!id) { err('Usage: task get <id>'); return; }
      const task = getTask(id);
      if (!task) { err(`Task not found: ${id}`); return; }
      console.log(`\n${c.bold}Task: ${task.id}${c.reset}`);
      console.log(`  Title:       ${task.title}`);
      console.log(`  Status:      ${task.status}`);
      console.log(`  Priority:    ${task.priority}`);
      console.log(`  Created:     ${task.created_at}`);
      console.log(`  Updated:     ${task.updated_at}`);
      if (task.due_at) console.log(`  Due:         ${task.due_at}`);
      if (task.completed_at) console.log(`  Completed:   ${task.completed_at}`);
      if (task.description) console.log(`  Description: ${task.description}`);
      if (task.checkpoint) console.log(`  Checkpoint:  ${task.checkpoint}`);
      if (task.tags) console.log(`  Tags:        ${task.tags}`);
      break;
    }
    case 'done': {
      const id = rest[0];
      if (!id) { err('Usage: task done <id>'); return; }
      const task = completeTask(id);
      ok(`Task completed: ${task.title}`);
      break;
    }
    case 'update': {
      const id = rest[0];
      if (!id) { err('Usage: task update <id> --status S [--priority P]'); return; }
      const updates = {};
      if (flags.status) updates.status = flags.status;
      if (flags.priority) updates.priority = flags.priority;
      if (flags.title) updates.title = flags.title;
      if (flags.due) updates.due_at = flags.due;
      if (flags.desc) updates.description = flags.desc;
      const task = updateTask(id, updates);
      ok(`Task updated: ${task.title} (${task.status})`);
      break;
    }
    case 'checkpoint': {
      const id = rest[0];
      const json = rest.slice(1).join(' ');
      if (!id || !json) { err('Usage: task checkpoint <id> <json>'); return; }
      saveCheckpoint(id, json);
      ok(`Checkpoint saved for ${id.substring(0, 8)}`);
      break;
    }
    case 'overdue': {
      const tasks = getOverdueTasks();
      if (tasks.length === 0) { info('No overdue tasks! 🎉'); return; }
      console.log(`\n${c.bold}${c.red}${tasks.length} overdue tasks:${c.reset}\n`);
      for (const t of tasks) {
        console.log(`  ${c.dim}${t.id.substring(0, 8)}${c.reset} ${c.red}⏰${c.reset} ${t.title} (due: ${t.due_at})`);
      }
      break;
    }
    case 'stats': {
      const stats = getTaskStats();
      console.log(`\n${c.bold}📋 Task Stats${c.reset}\n`);
      for (const [status, count] of Object.entries(stats.byStatus)) {
        console.log(`  ${status.padEnd(15)} ${count}`);
      }
      console.log(`  ${'overdue'.padEnd(15)} ${stats.overdue}`);
      console.log(`  ${'stale (48h+)'.padEnd(15)} ${stats.stale}`);
      break;
    }
    default:
      console.log(`${c.bold}Task Commands:${c.reset}`);
      console.log(`  task add <title> [--priority P] [--due DATE] [--desc TEXT]`);
      console.log(`  task list [--status S] [--priority P] [--all]`);
      console.log(`  task get <id>`);
      console.log(`  task done <id>`);
      console.log(`  task update <id> --status S [--priority P]`);
      console.log(`  task checkpoint <id> <json>`);
      console.log(`  task overdue`);
      console.log(`  task stats`);
  }
}

function cmdHelp() {
  console.log(`
${c.bold}🧠 Bayra Memory System CLI${c.reset}

${c.bold}Usage:${c.reset} node cli.mjs <command> [args] [flags]

${c.bold}Commands:${c.reset}
  ${c.green}search${c.reset} <query>         Hybrid search (keyword + vector)
                           --limit N  --type TYPE
  ${c.green}add${c.reset} <content>           Add a memory manually
                           --type TYPE  --importance N
  ${c.green}get${c.reset} <id>                Get memory by ID (supports partial)
  ${c.green}list${c.reset}                    List memories
                           --type TYPE  --limit N  --recent Xh  --important
  ${c.green}entity${c.reset} <name>           Search memories by entity
  ${c.green}delete${c.reset} <id>             Soft-delete a memory
  ${c.green}supersede${c.reset} <old> <new>   Mark old fact as superseded by new one
                           --reason "reason"

  ${c.cyan}stats${c.reset}                   Show memory statistics
  ${c.cyan}health${c.reset}                  Detailed health report
  ${c.cyan}integrity${c.reset}               Run database integrity check

  ${c.yellow}maintain${c.reset}                Run maintenance (consolidation, decay, GC)
                           --dry-run
  ${c.yellow}backup${c.reset}                  Create database backup

  ${c.magenta}export${c.reset} [dir]            Export memories to markdown
  ${c.magenta}ingest${c.reset} <file.md>        Ingest a markdown file
  ${c.magenta}auto-ingest${c.reset}             Auto-ingest daily log files
                           --dry-run  --file YYYY-MM-DD.md
  ${c.magenta}ingest-conversation${c.reset} <text>  Ingest a conversation via LLM extraction
                           --source SRC  --channel CH

  ${c.cyan}snapshot${c.reset}                Export soul snapshot to MEMORY_SNAPSHOT.md
  ${c.cyan}hygiene${c.reset}                 Run memory hygiene (archive/purge/prune)
                           --force     Bypass cadence check
  ${c.cyan}cache-stats${c.reset}             Show response cache statistics
  ${c.cyan}cache-clear${c.reset}             Clear the response cache

  ${c.green}task${c.reset}                    Task management (add, list, get, done, update, checkpoint, overdue, stats)
  ${c.green}episode${c.reset}                 Episode patterns (record, find, lessons, list, stats, archive)

  ${c.dim}help${c.reset}                    Show this help
`);
}

// ─── Main ──────────────────────────────────────────────────

// ─── ZeroClaw-inspired Commands ────────────────────────────

async function cmdSnapshot() {
  const db = getDb();
  setCacheDb(db);
  const { exportSnapshot } = await import('./snapshot.mjs');
  const count = exportSnapshot(db);
  console.log(`📸 Exported ${count} memories to MEMORY_SNAPSHOT.md`);
}

async function cmdHygiene(flags) {
  const db = getDb();
  setCacheDb(db);
  const { runHygiene } = await import('./hygiene.mjs');
  const config = flags.force ? { hygieneEnabled: true, intervalHours: 0, archiveAfterDays: 14, purgeAfterDays: 60, conversationRetentionDays: 30, maxActiveMemories: 2000 } : undefined;
  const result = runHygiene(db, config);
  if (result.skipped) {
    info(`Hygiene skipped: ${result.reason}`);
  } else {
    console.log(`\n${c.bold}🧹 Hygiene Results${c.reset}\n`);
    console.log(`  Archived files:     ${result.archivedFiles}`);
    console.log(`  Purged archives:    ${result.purgedArchives}`);
    console.log(`  Pruned memories:    ${result.prunedConversations}`);
  }
}

async function cmdCacheStats() {
  const db = getDb();
  setCacheDb(db);
  const { initCacheSchema, cacheStats } = await import('./response-cache.mjs');
  try { initCacheSchema(db); } catch {}
  const stats = cacheStats(db);
  console.log(`\n${c.bold}📦 Response Cache${c.reset}\n`);
  console.log(`  Entries:     ${stats.entries}`);
  console.log(`  Total hits:  ${stats.totalHits || 0}`);
  console.log(`  Max hits:    ${stats.maxHits || 0}`);
}

async function cmdCacheClear() {
  const db = getDb();
  setCacheDb(db);
  const { initCacheSchema, cacheClear } = await import('./response-cache.mjs');
  try { initCacheSchema(db); } catch {}
  cacheClear(db);
  info('Response cache cleared');
}

async function cmdConfidence(positional, flags) {
  const db = getDb();
  const { decreaseConfidence } = await import('./ingest.mjs');

  const [subCmd, memoryId] = positional;

  if (subCmd === 'boost' && memoryId) {
    const memory = getMemory(memoryId);
    if (!memory) return err(`Memory ${memoryId} not found`);
    const boost = parseFloat(flags.amount || '0.1');
    const newConf = Math.min(1.0, (memory.confidence ?? 1.0) + boost);
    updateMemory(memoryId, { confidence: newConf });
    info(`Confidence boosted: ${(memory.confidence ?? 1.0).toFixed(2)} → ${newConf.toFixed(2)}`);
  } else if (subCmd === 'decrease' && memoryId) {
    const penalty = parseFloat(flags.amount || '0.2');
    const reason = flags.reason || 'manual';
    const updated = decreaseConfidence(db, memoryId, penalty, reason);
    if (updated) info(`Confidence decreased for ${memoryId}`);
    else err(`Memory ${memoryId} not found`);
  } else if (subCmd === 'report') {
    // Show memories with low confidence
    const threshold = parseFloat(flags.threshold || '0.8');
    const rows = db.prepare(
      `SELECT id, content, confidence, importance FROM memories WHERE status = 'active' AND confidence < ? ORDER BY confidence ASC LIMIT 20`
    ).all(threshold);
    if (rows.length === 0) {
      info(`All active memories have confidence >= ${threshold}`);
    } else {
      console.log(`\n${c.bold}Low-confidence memories (< ${threshold}):${c.reset}\n`);
      for (const r of rows) {
        console.log(`  ${c.dim}${r.id.slice(0,8)}${c.reset} conf=${c.yellow}${(r.confidence ?? 1.0).toFixed(2)}${c.reset} imp=${r.importance} ${r.content.slice(0,80)}`);
      }
    }
  } else {
    console.log(`${c.bold}Usage:${c.reset}`);
    console.log(`  confidence boost <id> [--amount=0.1]`);
    console.log(`  confidence decrease <id> [--amount=0.2] [--reason=...]`);
    console.log(`  confidence report [--threshold=0.8]`);
  }
}

async function cmdConsolidate(flags) {
  const db = getDb();
  setCacheDb(db);
  const { consolidate } = await import('./consolidate.mjs');
  const opts = {
    dryRun: !!flags.dryRun,
    minGroup: parseInt(flags.minGroup) || 3,
    minSimilarity: parseFloat(flags.minSimilarity) || 0.85,
  };
  if (opts.dryRun) info('Running in DRY-RUN mode (no changes)');
  const report = await consolidate(db, opts);
  if (!opts.dryRun && report.summariesCreated > 0) {
    ok(`Consolidated ${report.memoriesConsolidated} memories into ${report.summariesCreated} summaries`);
  }
}

// ─── Episode Pattern Commands ──────────────────────────────

async function cmdEpisode(positional, flags) {
  const [subCmd, ...rest] = positional;
  const db = getDb();
  setCacheDb(db);

  switch (subCmd) {
    case 'record': {
      const trigger = rest[0];
      const lesson = rest[1];
      if (!trigger || !lesson) {
        err('Usage: episode record "trigger" "lesson" [--type mistake|success|preference|workflow] [--action "action"]');
        return;
      }
      const type = flags.type || 'mistake';
      info(`Recording ${type} pattern...`);
      const result = await recordEpisode({
        type,
        trigger,
        lesson,
        action: flags.action || null,
        tags: flags.tags ? flags.tags.split(',') : null,
      });
      if (result.action === 'created') {
        ok(`Pattern created: ${result.pattern.id.substring(0, 8)}`);
      } else {
        ok(`Pattern updated (×${result.pattern.occurrence_count}): ${result.pattern.id.substring(0, 8)}`);
      }
      console.log(`  ${c.cyan}Type:${c.reset}       ${result.pattern.pattern_type}`);
      console.log(`  ${c.cyan}Trigger:${c.reset}    ${truncate(result.pattern.trigger_description, 80)}`);
      console.log(`  ${c.cyan}Lesson:${c.reset}     ${truncate(result.pattern.lesson, 80)}`);
      console.log(`  ${c.cyan}Confidence:${c.reset} ${(result.pattern.confidence * 100).toFixed(0)}%`);
      console.log(`  ${c.cyan}Count:${c.reset}      ${result.pattern.occurrence_count}`);
      break;
    }
    case 'find': {
      const context = rest.join(' ');
      if (!context) { err('Usage: episode find "context text"'); return; }
      info(`Finding similar episodes for: "${truncate(context, 60)}"...`);
      const episodes = await findSimilarEpisodes(context);
      if (episodes.length === 0) {
        warn('No similar episodes found.');
        return;
      }
      console.log(`\n${c.bold}Found ${episodes.length} similar episodes:${c.reset}\n`);
      for (const ep of episodes) {
        const conf = `${(ep.confidence * 100).toFixed(0)}%`;
        const score = ep.score ? ` ${c.green}↑${ep.score.toFixed(3)}${c.reset}` : '';
        console.log(`  ${c.dim}${ep.id.substring(0, 8)}${c.reset} ${c.yellow}[${ep.pattern_type}]${c.reset} ×${ep.occurrence_count} conf:${conf}${score}`);
        console.log(`    ${c.cyan}Trigger:${c.reset} ${truncate(ep.trigger_description, 70)}`);
        console.log(`    ${c.cyan}Lesson:${c.reset}  ${truncate(ep.lesson, 70)}`);
        if (ep.action) console.log(`    ${c.cyan}Action:${c.reset}  ${truncate(ep.action, 70)}`);
        console.log();
      }
      break;
    }
    case 'list': {
      const type = flags.type || null;
      const minConf = parseFloat(flags.minConfidence) || 0;
      let patterns = getActivePatterns(type);
      if (minConf > 0) {
        patterns = patterns.filter(p => p.confidence >= minConf);
      }
      if (patterns.length === 0) {
        warn(`No active patterns found${type ? ` of type "${type}"` : ''}.`);
        return;
      }
      console.log(`\n${c.bold}${patterns.length} active episode patterns:${c.reset}\n`);
      for (const p of patterns) {
        const conf = `${(p.confidence * 100).toFixed(0)}%`;
        console.log(`  ${c.dim}${p.id.substring(0, 8)}${c.reset} ${c.yellow}[${p.pattern_type}]${c.reset} ×${p.occurrence_count} conf:${conf}`);
        console.log(`    ${c.cyan}Trigger:${c.reset} ${truncate(p.trigger_description, 70)}`);
        console.log(`    ${c.cyan}Lesson:${c.reset}  ${truncate(p.lesson, 70)}`);
        console.log();
      }
      break;
    }
    case 'stats': {
      const stats = getPatternStats();
      console.log(`\n${c.bold}📊 Episode Pattern Stats${c.reset}\n`);
      console.log(`  ${c.cyan}Total:${c.reset}     ${stats.total}`);
      console.log(`  ${c.cyan}Active:${c.reset}    ${stats.active}`);
      console.log(`  ${c.cyan}Archived:${c.reset}  ${stats.archived}`);
      console.log(`\n  ${c.bold}By Type:${c.reset}`);
      for (const { pattern_type, count } of stats.byType) {
        console.log(`    ${c.yellow}${pattern_type.padEnd(12)}${c.reset} ${count}`);
      }
      console.log(`\n  ${c.bold}By Confidence:${c.reset}`);
      console.log(`    ${c.green}High (≥80%)${c.reset}   ${stats.byConfidence.high}`);
      console.log(`    ${c.yellow}Medium (50-79%)${c.reset} ${stats.byConfidence.medium}`);
      console.log(`    ${c.red}Low (<50%)${c.reset}    ${stats.byConfidence.low}`);
      if (stats.topPatterns.length > 0) {
        console.log(`\n  ${c.bold}Top Patterns:${c.reset}`);
        for (const p of stats.topPatterns) {
          console.log(`    ×${p.occurrence_count} ${c.yellow}[${p.pattern_type}]${c.reset} ${truncate(p.trigger_description, 60)}`);
        }
      }
      break;
    }
    case 'archive': {
      const id = rest[0];
      if (!id) { err('Usage: episode archive <id>'); return; }
      // Support partial ID
      let fullId = id;
      if (id.length < 36) {
        const row = db.prepare("SELECT id FROM episode_patterns WHERE id LIKE ? LIMIT 1").get(id + '%');
        if (row) fullId = row.id;
      }
      const result = archivePattern(fullId);
      if (result) {
        ok(`Pattern archived: ${result.id.substring(0, 8)}`);
      } else {
        err(`Pattern not found: ${id}`);
      }
      break;
    }
    case 'lessons': {
      const context = rest.join(' ');
      if (!context) { err('Usage: episode lessons "context for upcoming action"'); return; }
      info(`Checking lessons for: "${truncate(context, 60)}"...`);
      const lessons = await getLessonsForContext(context);
      if (lessons.length === 0) {
        ok('No applicable lessons found. Proceed freely!');
        return;
      }
      console.log(`\n${c.bold}⚠️  Applicable Lessons:${c.reset}\n`);
      for (const l of lessons) {
        console.log(`  ${l.formatted}`);
      }
      console.log();
      break;
    }
    case 'report': {
      const report = generateLearningReport();
      console.log(`\n${c.bold}📊 Learning Report${c.reset}\n`);
      console.log(`  ${c.cyan}Active:${c.reset}    ${report.summary.totalActive}`);
      console.log(`  ${c.cyan}Archived:${c.reset}  ${report.summary.totalArchived}`);
      console.log(`  ${c.cyan}Total:${c.reset}     ${report.summary.totalAll}`);
      console.log(`\n  ${c.bold}By Type:${c.reset}`);
      for (const [type, count] of Object.entries(report.byType)) {
        console.log(`    ${c.yellow}${type.padEnd(12)}${c.reset} ${count}`);
      }
      console.log(`\n  ${c.bold}By Category:${c.reset}`);
      for (const [cat, count] of Object.entries(report.byCategory)) {
        console.log(`    ${c.blue}${cat.padEnd(15)}${c.reset} ${count}`);
      }
      console.log(`\n  ${c.bold}Confidence Distribution:${c.reset}`);
      console.log(`    ${c.green}Very High (≥90%)${c.reset}  ${report.confidenceDist.veryHigh}`);
      console.log(`    ${c.green}High (70-89%)${c.reset}     ${report.confidenceDist.high}`);
      console.log(`    ${c.yellow}Medium (50-69%)${c.reset}   ${report.confidenceDist.medium}`);
      console.log(`    ${c.red}Low (<50%)${c.reset}        ${report.confidenceDist.low}`);
      if (report.topMistakes.length > 0) {
        console.log(`\n  ${c.bold}Top Repeated Mistakes:${c.reset}`);
        for (const m of report.topMistakes) {
          console.log(`    ×${m.occurrence_count} ${truncate(m.trigger_description, 60)}`);
        }
      }
      console.log(`\n  ${c.cyan}Pattern Chains:${c.reset}    ${report.chains}`);
      console.log(`  ${c.cyan}Suggested Rules:${c.reset}   ${report.suggestedRules}`);
      if (report.timeline.length > 0) {
        console.log(`\n  ${c.bold}Learning Timeline:${c.reset}`);
        for (const t of report.timeline.slice(-10)) {
          console.log(`    ${c.dim}${t.date}${c.reset} ${c.yellow}[${t.type}]${c.reset} ${truncate(t.trigger, 50)} ${c.dim}conf:${(t.confidence * 100).toFixed(0)}%${c.reset}`);
        }
      }
      console.log();
      break;
    }
    case 'suggest': {
      const minConf = parseFloat(flags.minConfidence) || 0.7;
      const rules = suggestRulesFromPatterns(minConf);
      if (rules.length === 0) {
        console.log(`${c.yellow}No patterns with confidence ≥ ${(minConf * 100).toFixed(0)}% to suggest rules from.${c.reset}`);
        break;
      }
      console.log(`\n${c.bold}📋 Suggested SOUL.md Rules${c.reset} (from patterns with conf ≥ ${(minConf * 100).toFixed(0)}%)\n`);
      for (const r of rules) {
        console.log(`  ${r.rule}`);
        console.log(`    ${c.dim}Category: ${r.category}${r.subCategory ? '/' + r.subCategory : ''} | Confidence: ${(r.confidence * 100).toFixed(0)}% | Occurrences: ${r.occurrences} | Pattern: ${r.patternId.substring(0, 8)}${c.reset}`);
        console.log();
      }
      break;
    }
    case 'chains': {
      const chains = getPatternChains();
      if (chains.length === 0) {
        console.log(`${c.yellow}No pattern chains found.${c.reset}`);
        break;
      }
      console.log(`\n${c.bold}🔗 Pattern Chains (${chains.length} chains)${c.reset}\n`);
      for (let i = 0; i < chains.length; i++) {
        const chain = chains[i];
        console.log(`  ${c.bold}Chain ${i + 1}:${c.reset} (${chain.length} patterns)`);
        for (let j = 0; j < chain.length; j++) {
          const p = chain[j];
          const arrow = j < chain.length - 1 ? ' →' : '';
          console.log(`    ${j === 0 ? '┌' : j < chain.length - 1 ? '├' : '└'} ${c.yellow}[${p.pattern_type}]${c.reset} ${c.blue}(${p.category})${c.reset} ${truncate(p.trigger_description, 50)}`);
          console.log(`    ${j < chain.length - 1 ? '│' : ' '}   ${c.dim}Lesson: ${truncate(p.lesson, 50)}${c.reset}`);
        }
        console.log();
      }
      break;
    }
    case 'decay': {
      const days = parseInt(flags.days) || 90;
      const dryRun = !!flags.dryRun;
      if (dryRun) {
        console.log(`${c.yellow}DRY-RUN mode${c.reset}`);
      }
      const result = decayPatterns(days);
      console.log(`\n${c.bold}🕐 Pattern Decay (${days} day threshold)${c.reset}\n`);
      console.log(`  ${c.cyan}Checked:${c.reset}   ${result.totalChecked} stale patterns`);
      console.log(`  ${c.yellow}Decayed:${c.reset}   ${result.decayed} (confidence reduced)`);
      console.log(`  ${c.red}Archived:${c.reset}  ${result.archived} (confidence < 0.1)`);
      console.log(`  ${c.green}Protected:${c.reset} ${result.protected} (occurrence_count > 5)`);
      console.log();
      break;
    }
    default:
      console.log(`${c.bold}Episode Pattern Commands:${c.reset}`);
      console.log(`  episode record "trigger" "lesson" [--type TYPE] [--action "action"]`);
      console.log(`  episode find "context text"`);
      console.log(`  episode lessons "upcoming action context"`);
      console.log(`  episode list [--type mistake] [--min-confidence 0.7]`);
      console.log(`  episode stats`);
      console.log(`  episode archive <id>`);
      console.log(`  episode report                  Learning report`);
      console.log(`  episode suggest [--min-confidence 0.7]  Suggest SOUL.md rules`);
      console.log(`  episode chains                  Show pattern chains`);
      console.log(`  episode decay [--days 90]       Archive old patterns`);
      break;
  }
}

const [command, ...rawArgs] = process.argv.slice(2);
const { flags, positional } = parseFlags(rawArgs);

async function main() {
  try {
    switch (command) {
      case 'search':    await cmdSearch(positional, flags); break;
      case 'add':       await cmdAdd(positional, flags); break;
      case 'get':       cmdGet(positional); break;
      case 'list':      cmdList(positional, flags); break;
      case 'entity':    cmdEntity(positional); break;
      case 'delete':    cmdDelete(positional); break;
      case 'supersede': cmdSupersede(positional, flags); break;
      case 'stats':     cmdStats(); break;
      case 'health':    cmdHealth(); break;
      case 'maintain':  await cmdMaintain(flags); break;
      case 'backup':    await cmdBackup(); break;
      case 'integrity': cmdIntegrity(); break;
      case 'export':    await cmdExport(positional); break;
      case 'ingest':    await cmdIngest(positional); break;
      case 'auto-ingest':       await cmdAutoIngest(positional, flags); break;
      case 'ingest-conversation': await cmdIngestConversation(positional, flags); break;
      case 'snapshot':  await cmdSnapshot(); break;
      case 'hygiene':   await cmdHygiene(flags); break;
      case 'cache-stats': await cmdCacheStats(); break;
      case 'cache-clear': await cmdCacheClear(); break;
      case 'confidence': await cmdConfidence(positional, flags); break;
      case 'consolidate': await cmdConsolidate(flags); break;
      case 'task':      await cmdTask(positional, flags); break;
      case 'episode':   await cmdEpisode(positional, flags); break;
      case 'help':      cmdHelp(); break;
      default:          cmdHelp(); break;
    }
  } catch (e) {
    err(e.message || String(e));
    if (process.env.DEBUG) console.error(e.stack);
    process.exit(1);
  } finally {
    closeDb();
  }
}

main();
