/**
 * Bayra Memory System — Auto-Ingest Module
 * Reads today's daily log, tracks ingestion state, and processes only new content.
 *
 * Usage:
 *   import { autoIngest } from './auto-ingest.mjs';
 *   const result = await autoIngest();          // today's file
 *   const result = await autoIngest('2026-02-18.md'); // specific file
 *
 * CLI:
 *   node auto-ingest.mjs                        # ingest today
 *   node auto-ingest.mjs 2026-02-18.md          # ingest specific file
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import MemoryManager from './memory-manager.mjs';
import { extractFromText } from './ingest.mjs';
import { ingestMemory } from './ingest.mjs';
import { autoIngestFacts } from './fact-extractor.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MEMORY_DIR = join(__dirname, '..', '..', 'memory');
const STATE_PATH = join(MEMORY_DIR, 'ingest-state.json');

// ─── State Management ─────────────────────────────────────────────────

function loadState() {
  try {
    if (existsSync(STATE_PATH)) {
      return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
    }
  } catch (err) {
    console.warn('[auto-ingest] Failed to read state file, starting fresh:', err.message);
  }
  return { files: {} };
}

function saveState(state) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2), 'utf-8');
}

// ─── Chunk Splitting ──────────────────────────────────────────────────

/**
 * Split markdown content into chunks by `## ` headers.
 * Each chunk includes the header line and all content until the next `## `.
 * Returns array of { header, text, startOffset, endOffset }.
 */
function splitByHeaders(content) {
  const chunks = [];
  // Match positions of all ## headers
  const headerRegex = /^## .+$/gm;
  const matches = [];
  let m;
  while ((m = headerRegex.exec(content)) !== null) {
    matches.push({ index: m.index, header: m[0] });
  }

  if (matches.length === 0) {
    // No headers — treat entire content as one chunk if non-trivial
    if (content.trim().length > 30) {
      chunks.push({
        header: null,
        text: content.trim(),
        startOffset: 0,
        endOffset: content.length,
      });
    }
    return chunks;
  }

  // Content before first header (preamble)
  if (matches[0].index > 0) {
    const preamble = content.slice(0, matches[0].index).trim();
    if (preamble.length > 30) {
      chunks.push({
        header: '(preamble)',
        text: preamble,
        startOffset: 0,
        endOffset: matches[0].index,
      });
    }
  }

  // Each header section
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : content.length;
    const text = content.slice(start, end).trim();
    if (text.length > 30) {
      chunks.push({
        header: matches[i].header,
        text,
        startOffset: start,
        endOffset: end,
      });
    }
  }

  return chunks;
}

// ─── Auto-Ingest ──────────────────────────────────────────────────────

/**
 * Auto-ingest new content from a daily log file.
 *
 * @param {string} [fileName] - e.g. '2026-02-19.md'. Defaults to today.
 * @returns {Promise<{ created: number, updated: number, skipped: number, errors: number }>}
 */
export async function autoIngest(fileName) {
  // Resolve file name
  if (!fileName) {
    const today = new Date().toISOString().slice(0, 10);
    fileName = `${today}.md`;
  }

  const filePath = join(MEMORY_DIR, fileName);
  const result = { created: 0, updated: 0, skipped: 0, errors: 0 };

  // Check file exists
  if (!existsSync(filePath)) {
    console.log(`[auto-ingest] File not found: ${filePath}`);
    return result;
  }

  // Read full content
  const content = readFileSync(filePath, 'utf-8');
  if (!content.trim()) {
    console.log(`[auto-ingest] File is empty: ${fileName}`);
    return result;
  }

  // Load state
  const state = loadState();
  if (!state.files) state.files = {};

  const fileState = state.files[fileName] || { offset: 0, lastRun: null };
  const lastOffset = fileState.offset;

  // Nothing new?
  if (lastOffset >= content.length) {
    console.log(`[auto-ingest] No new content in ${fileName} (offset ${lastOffset}/${content.length})`);
    return result;
  }

  // Get new content only
  const newContent = content.slice(lastOffset);
  console.log(`[auto-ingest] Processing ${fileName}: ${newContent.length} new bytes (offset ${lastOffset} → ${content.length})`);

  // Split into chunks
  const chunks = splitByHeaders(newContent);
  if (chunks.length === 0) {
    console.log(`[auto-ingest] No substantial chunks found in new content`);
    // Still update offset so we don't re-scan trivial additions
    state.files[fileName] = { offset: content.length, lastRun: new Date().toISOString() };
    saveState(state);
    return result;
  }

  console.log(`[auto-ingest] Found ${chunks.length} chunk(s) to process`);

  // Initialize MemoryManager
  const mm = new MemoryManager();
  await mm.init();

  try {
    const db = mm.db;
    const dateMatch = fileName.match(/^(\d{4}-\d{2}-\d{2})/);
    const dateStr = dateMatch ? dateMatch[1] : null;

    for (const chunk of chunks) {
      try {
        console.log(`[auto-ingest]   → Chunk: ${chunk.header || '(no header)'} (${chunk.text.length} chars)`);

        // Extract memories via LLM
        const extracted = await extractFromText(chunk.text, `daily-log:${fileName}`);

        if (extracted.length === 0) {
          console.log(`[auto-ingest]     No memories extracted`);
          result.skipped++;
          continue;
        }

        console.log(`[auto-ingest]     Extracted ${extracted.length} memories`);

        // Ingest each extracted memory
        for (const mem of extracted) {
          try {
            const ingestResult = await ingestMemory(db, mem.content, {
              type: mem.type,
              subtype: mem.subtype,
              importance: mem.importance,
              entities: mem.entities,
              tags: [...(mem.tags || []), 'auto-ingest', ...(dateStr ? [dateStr] : [])],
              source: `daily-log:${fileName}`,
              channel: 'daily-log',
            });

            if (ingestResult.action === 'created') result.created++;
            else if (ingestResult.action === 'updated') result.updated++;
            else result.skipped++;
          } catch (err) {
            console.error(`[auto-ingest]     Ingest error: ${err.message}`);
            result.errors++;
          }
        }
      } catch (err) {
        console.error(`[auto-ingest]   Chunk error (${chunk.header}): ${err.message}`);
        result.errors++;
      }
    }

    // Update state — always move offset to end of file
    state.files[fileName] = {
      offset: content.length,
      lastRun: new Date().toISOString(),
    };
    saveState(state);

    console.log(`[auto-ingest] Done: ${result.created} created, ${result.updated} updated, ${result.skipped} skipped, ${result.errors} errors`);
  } finally {
    mm.close();
  }

  return result;
}

// ─── Conversation Auto-Ingest ─────────────────────────────────────────

/**
 * Auto-ingest facts from conversation messages.
 * Uses the fact-extractor pipeline with conflict detection and auto-supersede.
 *
 * @param {Array<{role: string, content: string}>} messages - Conversation messages
 * @param {object} [options] - Options passed to autoIngestFacts
 * @returns {Promise<{extracted, ingested, superseded, skipped, errors, details}>}
 */
export async function autoIngestConversation(messages, options = {}) {
  const mm = new MemoryManager();
  await mm.init();

  try {
    const db = mm.db;
    const result = await autoIngestFacts(db, messages, {
      source: options.source || 'conversation',
      channel: options.channel || null,
      session_id: options.session_id || null,
      ...options,
    });
    console.log(`[auto-ingest] Conversation ingest: ${result.extracted} extracted, ${result.ingested} ingested, ${result.superseded} superseded`);
    return result;
  } finally {
    mm.close();
  }
}

// ─── CLI ──────────────────────────────────────────────────────────────

const isMain = process.argv[1] && (
  process.argv[1].endsWith('auto-ingest.mjs') ||
  process.argv[1].endsWith('auto-ingest')
);

if (isMain) {
  const fileName = process.argv[2] || undefined;
  autoIngest(fileName)
    .then(result => {
      console.log('\nResult:', JSON.stringify(result, null, 2));
      process.exit(result.errors > 0 ? 1 : 0);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(2);
    });
}
