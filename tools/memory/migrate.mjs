#!/usr/bin/env node
/**
 * Bayra Memory System — Migration Script
 * Imports existing markdown memory files into the SQLite memory system.
 *
 * Usage:
 *   node migrate.mjs --dry-run        # Preview without writing
 *   node migrate.mjs                  # Full migration
 *   node migrate.mjs --validate       # Validate after migration
 *   node migrate.mjs --export ./out/  # Export back to markdown
 */

import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import crypto from 'node:crypto';

import {
  getDb, closeDb, createMemory, createEntity, findEntity,
  linkMemoryEntity, getStats, searchMemories, listMemories,
} from './db.mjs';
import { embedBatch, embeddingToBuffer, setCacheDb } from './embeddings.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WORKSPACE = join(__dirname, '..', '..');
const MEMORY_DIR = join(WORKSPACE, 'memory');
const MEMORY_MD = join(WORKSPACE, 'MEMORY.md');

// ============================================================
// KNOWN ENTITIES
// ============================================================

const KNOWN_ENTITIES = [
  { name: 'Mohammed', type: 'person', aliases: ['محمد', 'Mohamed', 'Mohammed Abdou', 'محمد عبده'] },
  { name: 'Ubada', type: 'person', aliases: ['عبادة'] },
  { name: 'Ahmed', type: 'person', aliases: ['أحمد'] },
  { name: 'Bayra', type: 'person', aliases: ['بايرا', 'Pyra', 'بايرا 🦊'] },
  { name: 'Pyramedia', type: 'company', aliases: ['PyramediaX', 'بيراميديا'] },
  { name: 'EliteLife', type: 'project', aliases: ['Elite Life', 'EliteLife Clinic'] },
  { name: 'Chatwoot', type: 'tool', aliases: [] },
  { name: 'Etmam', type: 'project', aliases: ['اتمام', 'Tasheel AI'] },
  { name: 'Pyra Workspace', type: 'project', aliases: ['Pyra Workspace 3.0'] },
  { name: 'Pyra Voice', type: 'project', aliases: ['voice.pyramedia.info'] },
  { name: 'Coolify', type: 'tool', aliases: [] },
  { name: 'Supabase', type: 'tool', aliases: ['db.pyramedia.info'] },
  { name: 'n8n', type: 'tool', aliases: ['n8n.pyramedia.info'] },
  { name: 'Evolution API', type: 'tool', aliases: ['Evo API', 'evo.pyramedia.info'] },
  { name: 'Kie.ai', type: 'tool', aliases: ['Kie'] },
  { name: 'Meta Ads', type: 'tool', aliases: ['Facebook Ads', 'Meta Ads Manager'] },
  { name: 'OpenClaw Server', type: 'server', aliases: ['72.61.255.111'] },
  { name: 'Coolify Server', type: 'server', aliases: ['72.61.148.81'] },
];

// ============================================================
// ENTITY EXTRACTION (simple, no LLM)
// ============================================================

export function extractEntitiesSimple(text) {
  const found = [];
  const lowerText = text.toLowerCase();
  const seen = new Set();

  for (const entity of KNOWN_ENTITIES) {
    const allNames = [entity.name, ...entity.aliases];
    for (const name of allNames) {
      if (!name) continue;
      // Case-insensitive check; for Arabic/special chars do exact substring
      if (lowerText.includes(name.toLowerCase()) || text.includes(name)) {
        if (!seen.has(entity.name)) {
          seen.add(entity.name);
          found.push({ name: entity.name, type: entity.type });
        }
        break;
      }
    }
  }
  return found;
}

// ============================================================
// IMPORTANCE SCORING
// ============================================================

function scoreImportance(text, type) {
  const lower = text.toLowerCase();

  // High importance keywords
  if (/قواعد|قاعدة|rule|important|⚠️|🚨|لا تنس|never|always/i.test(text)) return 9;
  if (/lesson|درس|خطأ|غلطة|mistake|learned/i.test(text)) return 8.5;
  if (/security|أمن|password|key|credential/i.test(text)) return 8;
  if (/fix|إصلاح|bug|error|مشكلة|problem/i.test(text)) return 7.5;
  if (/deploy|نشر|production|live/i.test(text)) return 7;
  if (/api|server|سيرفر|database/i.test(lower)) return 7;
  if (/setup|install|configured|تثبيت/i.test(text)) return 6.5;
  if (/created|built|أنشأ|بنى/i.test(text)) return 6;

  // Type-based defaults
  if (type === 'semantic') return 6;
  if (type === 'episodic') return 5;
  return 5;
}

function guessSubtype(text, type) {
  const lower = text.toLowerCase();
  if (type === 'semantic') {
    if (/قواعد|قاعدة|rule|policy/i.test(text)) return 'rule';
    if (/link|url|http|email/i.test(lower)) return 'reference';
    if (/server|ip|سيرفر|port|docker/i.test(lower)) return 'infrastructure';
    if (/api|key|token|credential/i.test(lower)) return 'credential';
    return 'fact';
  }
  if (type === 'episodic') {
    if (/fix|إصلاح|bug|error|مشكلة/i.test(text)) return 'bugfix';
    if (/deploy|نشر|setup|install/i.test(text)) return 'deployment';
    if (/lesson|درس|خطأ|غلطة|mistake/i.test(text)) return 'lesson';
    if (/created|built|أنشأ/i.test(text)) return 'creation';
    return 'event';
  }
  return null;
}

function extractTags(text) {
  const tags = new Set();
  const lower = text.toLowerCase();

  const tagPatterns = [
    [/n8n/i, 'n8n'], [/supabase/i, 'supabase'], [/coolify/i, 'coolify'],
    [/whatsapp/i, 'whatsapp'], [/telegram/i, 'telegram'], [/chatwoot/i, 'chatwoot'],
    [/meta ads|facebook ads/i, 'meta-ads'], [/seo/i, 'seo'],
    [/docker/i, 'docker'], [/api/i, 'api'], [/postgres/i, 'postgresql'],
    [/voice|tts/i, 'voice'], [/security|أمن/i, 'security'],
    [/elite\s?life/i, 'elitelife'], [/pyramedia/i, 'pyramedia'],
    [/evolution api/i, 'evolution-api'], [/podcast/i, 'podcast'],
  ];

  for (const [pattern, tag] of tagPatterns) {
    if (pattern.test(text)) tags.add(tag);
  }
  return tags.size > 0 ? JSON.stringify([...tags]) : null;
}

// ============================================================
// MARKDOWN PARSERS
// ============================================================

/**
 * Parse MEMORY.md or long-term.md into memory entries.
 * Splits by ## headers, then by meaningful bullet groups.
 */
export function parseMemoryMd(content, source) {
  const entries = [];
  // Split by ## headers
  const sections = content.split(/^## /m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.split('\n');
    const header = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    if (!body || body.length < 10) continue;

    // Split section into logical chunks by sub-headers (###) or bullet groups
    const chunks = splitIntoChunks(body, header);

    for (const chunk of chunks) {
      if (chunk.length < 15) continue; // skip tiny fragments

      const fullContent = `## ${header}\n${chunk}`;
      const importance = scoreImportance(fullContent, 'semantic');
      const subtype = guessSubtype(fullContent, 'semantic');
      const entities = extractEntitiesSimple(fullContent);
      const tags = extractTags(fullContent);

      entries.push({
        content: fullContent.trim(),
        type: 'semantic',
        subtype,
        importance,
        confidence: 0.9,
        tags,
        entities,
        source,
      });
    }
  }

  return entries;
}

/**
 * Split a section body into logical chunks.
 * Tries ### sub-headers first, then groups bullet points.
 */
function splitIntoChunks(body, parentHeader) {
  // If there are ### sub-headers, split by them
  const subSections = body.split(/^### /m);
  if (subSections.length > 1) {
    const chunks = [];
    // First part (before any ###) as one chunk if non-trivial
    if (subSections[0].trim().length > 15) {
      chunks.push(subSections[0].trim());
    }
    for (let i = 1; i < subSections.length; i++) {
      const sub = `### ${subSections[i].trim()}`;
      if (sub.length > 15) chunks.push(sub);
    }
    return chunks;
  }

  // If the section is short enough, keep as one chunk
  if (body.length < 800) return [body];

  // Split by double newlines (paragraph groups)
  const paragraphs = body.split(/\n\n+/).filter(p => p.trim().length > 15);
  if (paragraphs.length <= 1) return [body];

  // Group small paragraphs together (target ~400-600 chars per chunk)
  const chunks = [];
  let current = '';
  for (const p of paragraphs) {
    if (current.length + p.length > 600 && current.length > 100) {
      chunks.push(current.trim());
      current = p;
    } else {
      current += (current ? '\n\n' : '') + p;
    }
  }
  if (current.trim().length > 15) chunks.push(current.trim());
  return chunks;
}

/**
 * Parse a daily log file into episodic memory entries.
 * Each ## section becomes an episodic memory.
 */
export function parseDailyLog(content, dateStr, source) {
  const entries = [];
  const sections = content.split(/^## /m).filter(s => s.trim());

  for (const section of sections) {
    const lines = section.split('\n');
    const header = lines[0].trim();
    const body = lines.slice(1).join('\n').trim();

    if (!body || body.length < 15) continue;

    // For very long sections, split into sub-sections
    const chunks = splitIntoChunks(body, header);

    for (const chunk of chunks) {
      if (chunk.length < 15) continue;

      const fullContent = `## ${header}\n${chunk}`;
      const importance = scoreImportance(fullContent, 'episodic');
      const subtype = guessSubtype(fullContent, 'episodic');
      const entities = extractEntitiesSimple(fullContent);
      const tags = extractTags(fullContent);

      entries.push({
        content: fullContent.trim(),
        type: 'episodic',
        subtype,
        importance,
        confidence: 1.0,
        tags,
        entities,
        event_at: `${dateStr}T00:00:00Z`,
        source,
      });
    }
  }

  return entries;
}

// ============================================================
// DEDUPLICATION
// ============================================================

/**
 * Simple content-hash deduplication.
 * If two entries have very similar content, keep the one from the richer source.
 */
function deduplicateEntries(entries) {
  const seen = new Map(); // hash → entry
  const unique = [];
  let dupes = 0;

  for (const entry of entries) {
    // Normalize content for comparison
    const normalized = entry.content
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
      .slice(0, 200); // compare first 200 chars

    const hash = crypto.createHash('md5').update(normalized).digest('hex');

    if (seen.has(hash)) {
      dupes++;
      // Keep the one with higher importance or from long-term.md (richer)
      const existing = seen.get(hash);
      if (entry.importance > existing.importance ||
          (entry.source?.includes('long-term') && !existing.source?.includes('long-term'))) {
        // Replace
        const idx = unique.indexOf(existing);
        if (idx >= 0) unique[idx] = entry;
        seen.set(hash, entry);
      }
    } else {
      seen.set(hash, entry);
      unique.push(entry);
    }
  }

  return { unique, dupes };
}

// ============================================================
// FULL MIGRATION
// ============================================================

export async function migrate(options = {}) {
  const { dryRun = false, batchSize = 20, skipEmbeddings = false } = options;

  console.log(`\n${'='.repeat(60)}`);
  console.log(`  Bayra Memory Migration ${dryRun ? '(DRY RUN)' : ''}`);
  console.log(`${'='.repeat(60)}\n`);

  const allEntries = [];
  const errors = [];

  // ── 1. Parse MEMORY.md ───────────────────────────────────
  if (existsSync(MEMORY_MD)) {
    try {
      const content = readFileSync(MEMORY_MD, 'utf-8');
      const entries = parseMemoryMd(content, 'MEMORY.md');
      allEntries.push(...entries);
      console.log(`📄 MEMORY.md → ${entries.length} entries`);
    } catch (err) {
      errors.push({ file: 'MEMORY.md', error: err.message });
      console.error(`❌ MEMORY.md: ${err.message}`);
    }
  }

  // ── 2. Parse long-term.md ────────────────────────────────
  const longTermPath = join(MEMORY_DIR, 'long-term.md');
  if (existsSync(longTermPath)) {
    try {
      const content = readFileSync(longTermPath, 'utf-8');
      const entries = parseMemoryMd(content, 'memory/long-term.md');
      allEntries.push(...entries);
      console.log(`📄 long-term.md → ${entries.length} entries`);
    } catch (err) {
      errors.push({ file: 'long-term.md', error: err.message });
      console.error(`❌ long-term.md: ${err.message}`);
    }
  }

  // ── 3. Parse daily files ─────────────────────────────────
  const dailyFiles = readdirSync(MEMORY_DIR)
    .filter(f => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort();

  for (const file of dailyFiles) {
    try {
      const dateStr = file.replace('.md', '');
      const content = readFileSync(join(MEMORY_DIR, file), 'utf-8');
      const entries = parseDailyLog(content, dateStr, `memory/${file}`);
      allEntries.push(...entries);
      console.log(`📅 ${file} → ${entries.length} entries`);
    } catch (err) {
      errors.push({ file, error: err.message });
      console.error(`❌ ${file}: ${err.message}`);
    }
  }

  // ── 4. Parse other .md files (not daily, not long-term) ──
  const otherFiles = readdirSync(MEMORY_DIR)
    .filter(f => f.endsWith('.md') && !/^\d{4}-\d{2}-\d{2}\.md$/.test(f) && f !== 'long-term.md');

  for (const file of otherFiles) {
    try {
      const content = readFileSync(join(MEMORY_DIR, file), 'utf-8');
      const entries = parseMemoryMd(content, `memory/${file}`);
      allEntries.push(...entries);
      console.log(`📋 ${file} → ${entries.length} entries`);
    } catch (err) {
      errors.push({ file, error: err.message });
      console.error(`❌ ${file}: ${err.message}`);
    }
  }

  console.log(`\n📊 Total parsed: ${allEntries.length}`);

  // ── 5. Deduplicate ───────────────────────────────────────
  const { unique, dupes } = deduplicateEntries(allEntries);
  console.log(`🔄 Deduplicated: ${dupes} duplicates removed → ${unique.length} unique entries`);

  // ── 6. Collect all mentioned entities ────────────────────
  const entityMentions = new Map(); // entity name → Set of entry indices
  for (let i = 0; i < unique.length; i++) {
    for (const ent of unique[i].entities) {
      if (!entityMentions.has(ent.name)) entityMentions.set(ent.name, new Set());
      entityMentions.get(ent.name).add(i);
    }
  }
  console.log(`👤 Entities found: ${entityMentions.size}`);
  for (const [name, indices] of entityMentions) {
    console.log(`   - ${name}: ${indices.size} memories`);
  }

  // ── DRY RUN: stop here ───────────────────────────────────
  if (dryRun) {
    console.log('\n── DRY RUN SUMMARY ──');
    console.log(`  Semantic: ${unique.filter(e => e.type === 'semantic').length}`);
    console.log(`  Episodic: ${unique.filter(e => e.type === 'episodic').length}`);
    console.log(`  Entities: ${entityMentions.size}`);
    console.log(`  Duplicates removed: ${dupes}`);
    console.log(`  Errors: ${errors.length}`);
    if (errors.length) console.log('  Error files:', errors.map(e => e.file).join(', '));
    console.log(`  Would create: ${unique.length} memories`);
    console.log(`  Would generate: ${skipEmbeddings ? 0 : unique.length} embeddings`);
    console.log('── END DRY RUN ──\n');
    return { totalParsed: allEntries.length, created: 0, skipped: 0, duplicates: dupes, entities: entityMentions.size, errors };
  }

  // ── 7. Open DB and create entities ───────────────────────
  const db = getDb();
  setCacheDb(db);

  const entityIdMap = new Map(); // entity name → id

  for (const known of KNOWN_ENTITIES) {
    // Check if already exists
    let existing = findEntity(known.name);
    if (!existing) {
      const created = createEntity({
        type: known.type,
        name: known.name,
        aliases: JSON.stringify(known.aliases),
      });
      entityIdMap.set(known.name, created.id);
    } else {
      entityIdMap.set(known.name, existing.id);
    }
  }
  console.log(`\n✅ ${entityIdMap.size} entities created/found`);

  // ── 8. Insert memories ───────────────────────────────────
  let created = 0;
  let skipped = 0;
  const memoryIds = []; // parallel array with unique[]

  for (const entry of unique) {
    try {
      const mem = createMemory({
        type: entry.type,
        subtype: entry.subtype,
        content: entry.content,
        importance: entry.importance,
        confidence: entry.confidence,
        event_at: entry.event_at || null,
        source: entry.source,
        tags: entry.tags,
        metadata: JSON.stringify({ migrated: true, originalSource: entry.source }),
        channel: 'migration',
      });
      memoryIds.push(mem.id);

      // Link entities
      for (const ent of entry.entities) {
        const entityId = entityIdMap.get(ent.name);
        if (entityId) {
          linkMemoryEntity(mem.id, entityId);
        }
      }
      created++;
    } catch (err) {
      memoryIds.push(null);
      skipped++;
      errors.push({ content: entry.content.slice(0, 80), error: err.message });
    }
  }
  console.log(`✅ ${created} memories created, ${skipped} skipped`);

  // ── 9. Generate embeddings in batches ────────────────────
  if (!skipEmbeddings) {
    console.log(`\n🧠 Generating embeddings in batches of ${batchSize}...`);

    const validEntries = unique.map((entry, i) => ({
      content: entry.content,
      memoryId: memoryIds[i],
    })).filter(e => e.memoryId);

    let embeddingCount = 0;
    let embeddingErrors = 0;

    // Prepare the vec insert statement
    const vecInsert = db.prepare(
      'INSERT OR REPLACE INTO memory_embeddings (memory_id, embedding) VALUES (?, ?)'
    );

    for (let i = 0; i < validEntries.length; i += batchSize) {
      const batch = validEntries.slice(i, i + batchSize);
      const texts = batch.map(e => e.content.slice(0, 8000)); // truncate for API

      try {
        const embeddings = await embedBatch(texts);

        const insertMany = db.transaction(() => {
          for (let j = 0; j < batch.length; j++) {
            if (embeddings[j]) {
              vecInsert.run(batch[j].memoryId, embeddingToBuffer(embeddings[j]));
              embeddingCount++;
            }
          }
        });
        insertMany();

        const progress = Math.min(i + batchSize, validEntries.length);
        process.stdout.write(`\r   Embedded ${progress}/${validEntries.length}`);
      } catch (err) {
        embeddingErrors++;
        console.error(`\n   ❌ Batch ${Math.floor(i / batchSize) + 1} failed: ${err.message}`);
      }
    }
    console.log(`\n✅ ${embeddingCount} embeddings generated, ${embeddingErrors} batch errors`);
  }

  // ── 10. Report ───────────────────────────────────────────
  console.log(`\n${'='.repeat(60)}`);
  console.log('  MIGRATION COMPLETE');
  console.log(`${'='.repeat(60)}`);
  console.log(`  Total parsed:   ${allEntries.length}`);
  console.log(`  Duplicates:     ${dupes}`);
  console.log(`  Created:        ${created}`);
  console.log(`  Skipped:        ${skipped}`);
  console.log(`  Entities:       ${entityIdMap.size}`);
  console.log(`  Errors:         ${errors.length}`);
  if (errors.length > 0) {
    console.log('  Error details:');
    for (const e of errors.slice(0, 5)) {
      console.log(`    - ${e.file || e.content}: ${e.error}`);
    }
    if (errors.length > 5) console.log(`    ... and ${errors.length - 5} more`);
  }
  console.log(`${'='.repeat(60)}\n`);

  return { totalParsed: allEntries.length, created, skipped, duplicates: dupes, entities: entityIdMap.size, errors };
}

// ============================================================
// VALIDATION
// ============================================================

export async function validateMigration() {
  const db = getDb();
  setCacheDb(db);

  console.log(`\n${'='.repeat(60)}`);
  console.log('  MIGRATION VALIDATION');
  console.log(`${'='.repeat(60)}\n`);

  // 1. Count by type
  const stats = getStats();
  console.log('📊 Memory counts:');
  for (const [type, count] of Object.entries(stats.byType)) {
    console.log(`   ${type}: ${count}`);
  }
  console.log(`   TOTAL: ${stats.totalActive}`);

  // 2. Check embeddings
  const embCount = db.prepare('SELECT COUNT(*) as c FROM memory_embeddings').get().c;
  const memCount = stats.totalActive;
  const embCoverage = memCount > 0 ? ((embCount / memCount) * 100).toFixed(1) : '0';
  console.log(`\n🧠 Embeddings: ${embCount}/${memCount} (${embCoverage}%)`);

  // 3. Check entities
  const entityCount = db.prepare('SELECT COUNT(*) as c FROM entities').get().c;
  const linkCount = db.prepare('SELECT COUNT(*) as c FROM memory_entities').get().c;
  console.log(`\n👤 Entities: ${entityCount}`);
  console.log(`   Links: ${linkCount}`);

  // Entity details
  const entityDetails = db.prepare(`
    SELECT e.name, e.type, COUNT(me.memory_id) as memories
    FROM entities e
    LEFT JOIN memory_entities me ON e.id = me.entity_id
    GROUP BY e.id
    ORDER BY memories DESC
  `).all();
  for (const e of entityDetails) {
    console.log(`   - ${e.name} (${e.type}): ${e.memories} memories`);
  }

  // 4. Test FTS searches
  console.log('\n🔍 Test searches:');
  const testQueries = ['Mohammed', 'Coolify', 'Pyramedia', 'n8n', 'قواعد'];
  for (const q of testQueries) {
    try {
      const results = searchMemories(q, 3);
      console.log(`   "${q}": ${results.length} results`);
      if (results.length > 0) {
        console.log(`     → ${results[0].content.slice(0, 80)}...`);
      }
    } catch (err) {
      console.log(`   "${q}": ❌ ${err.message}`);
    }
  }

  // 5. Source distribution
  const sources = db.prepare(`
    SELECT source, COUNT(*) as c FROM memories
    WHERE status != 'deleted'
    GROUP BY source ORDER BY c DESC
  `).all();
  console.log('\n📁 Sources:');
  for (const s of sources) {
    console.log(`   ${s.source}: ${s.c}`);
  }

  // 6. DB size
  console.log(`\n💾 DB: ${stats.dbSizeMB} MB at ${stats.dbPath}`);

  console.log(`\n${'='.repeat(60)}`);
  console.log('  VALIDATION COMPLETE');
  console.log(`${'='.repeat(60)}\n`);
}

// ============================================================
// EXPORT TO MARKDOWN
// ============================================================

export async function exportToMarkdown(outputDir) {
  const db = getDb();
  mkdirSync(outputDir, { recursive: true });

  const types = ['semantic', 'episodic', 'procedural'];

  for (const type of types) {
    const memories = listMemories({ type, limit: 10000 });
    if (memories.length === 0) continue;

    // Sort by importance desc
    memories.sort((a, b) => (b.importance || 0) - (a.importance || 0));

    let md = `# ${type.charAt(0).toUpperCase() + type.slice(1)} Memories\n\n`;
    md += `*Exported: ${new Date().toISOString()} — ${memories.length} entries*\n\n---\n\n`;

    for (const mem of memories) {
      const imp = mem.importance ? ` (importance: ${mem.importance})` : '';
      const src = mem.source ? ` — source: ${mem.source}` : '';
      const date = mem.event_at ? ` — ${mem.event_at.slice(0, 10)}` : '';
      md += `### [${mem.subtype || type}]${imp}${date}${src}\n\n`;
      md += `${mem.content}\n\n---\n\n`;
    }

    const outPath = join(outputDir, `${type}.md`);
    writeFileSync(outPath, md);
    console.log(`📝 Exported ${memories.length} ${type} memories → ${outPath}`);
  }
}

// ============================================================
// CLI
// ============================================================

async function main() {
  const args = process.argv.slice(2);

  try {
    if (args.includes('--validate')) {
      await validateMigration();
    } else if (args.includes('--export')) {
      const exportIdx = args.indexOf('--export');
      const outputDir = args[exportIdx + 1] || './memory-export';
      await exportToMarkdown(outputDir);
    } else {
      const dryRun = args.includes('--dry-run');
      const skipEmbeddings = args.includes('--skip-embeddings');
      const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] || '20', 10);
      await migrate({ dryRun, skipEmbeddings, batchSize });
    }
  } catch (err) {
    console.error('❌ Fatal error:', err);
    process.exit(1);
  } finally {
    closeDb();
  }
}

main();
