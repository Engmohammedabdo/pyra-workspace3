/**
 * Bayra Memory System — Daily Maintenance
 * Single script that runs: auto-ingest + hygiene + snapshot
 * Designed for cron: node daily-maintenance.mjs
 */

import { existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const DB_PATH = join(os.homedir(), '.openclaw', 'memory', 'bayra.db');

async function main() {
  const startTime = Date.now();
  const report = { autoIngest: null, hygiene: null, snapshot: null, errors: [] };

  console.log('🔧 Bayra Daily Maintenance — Starting...\n');

  // 1. Auto-Ingest today's daily log
  console.log('📥 Step 1: Auto-Ingest...');
  try {
    const { autoIngest } = await import('./auto-ingest.mjs');
    const today = new Date().toISOString().slice(0, 10) + '.md';
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10) + '.md';
    
    let totalCreated = 0, totalUpdated = 0, totalSkipped = 0, totalErrors = 0;
    
    for (const file of [yesterday, today]) {
      try {
        const result = await autoIngest(file);
        totalCreated += result.created;
        totalUpdated += result.updated;
        totalSkipped += result.skipped;
        totalErrors += result.errors;
      } catch (err) {
        console.warn(`  ⚠️ ${file}: ${err.message}`);
      }
    }
    
    report.autoIngest = { created: totalCreated, updated: totalUpdated, skipped: totalSkipped, errors: totalErrors };
    console.log(`  ✅ Created: ${totalCreated}, Updated: ${totalUpdated}, Skipped: ${totalSkipped}, Errors: ${totalErrors}\n`);
  } catch (err) {
    report.errors.push(`auto-ingest: ${err.message}`);
    console.error(`  ❌ ${err.message}\n`);
  }

  // 2. Memory Hygiene
  console.log('🧹 Step 2: Hygiene...');
  try {
    const { getDb } = await import('./db.mjs');
    const { setCacheDb } = await import('./embeddings.mjs');
    const { runHygiene } = await import('./hygiene.mjs');
    
    const db = getDb();
    setCacheDb(db);
    
    const result = runHygiene(db, {
      hygieneEnabled: true,
      intervalHours: 0,  // Force run
      archiveAfterDays: 14,
      purgeAfterDays: 60,
      conversationRetentionDays: 30,
      maxActiveMemories: 2000,
    });
    
    report.hygiene = result;
    if (result.skipped) {
      console.log(`  ⏭️ Skipped: ${result.reason}\n`);
    } else {
      console.log(`  ✅ Archived: ${result.archivedFiles}, Purged: ${result.purgedArchives}, Pruned: ${result.prunedConversations}\n`);
    }
  } catch (err) {
    report.errors.push(`hygiene: ${err.message}`);
    console.error(`  ❌ ${err.message}\n`);
  }

  // 2b. Smart Consolidation (weekly — only on Sundays)
  const dayOfWeek = new Date().getDay();
  if (dayOfWeek === 0) {
    console.log('🧬 Step 2b: Smart Consolidation...');
    try {
      const { getDb: getDb2 } = await import('./db.mjs');
      const { consolidate } = await import('./consolidate.mjs');
      const db2 = getDb2();
      const result = await consolidate(db2, { dryRun: false, minGroup: 3, minSimilarity: 0.85 });
      report.consolidation = {
        groups: result.groupsFound,
        consolidated: result.memoriesConsolidated,
        summaries: result.summariesCreated,
      };
      console.log(`  ✅ ${result.summariesCreated} summaries from ${result.memoriesConsolidated} memories\n`);
    } catch (err) {
      report.errors.push(`consolidation: ${err.message}`);
      console.error(`  ❌ ${err.message}\n`);
    }
  } else {
    console.log(`⏭️ Step 2b: Consolidation skipped (runs on Sundays, today is day ${dayOfWeek})\n`);
  }

  // 3. Soul Snapshot
  console.log('📸 Step 3: Snapshot...');
  try {
    const { getDb } = await import('./db.mjs');
    const { exportSnapshot } = await import('./snapshot.mjs');
    const db = getDb();
    const count = exportSnapshot(db);
    report.snapshot = { exported: count };
    console.log(`  ✅ Exported ${count} memories to MEMORY_SNAPSHOT.md\n`);
  } catch (err) {
    report.errors.push(`snapshot: ${err.message}`);
    console.error(`  ❌ ${err.message}\n`);
  }

  // 3b. Export knowledge base for OpenClaw memory_search integration
  console.log('🔗 Step 3b: OpenClaw Bridge Export...');
  try {
    const { getDb } = await import('./db.mjs');
    // writeFileSync and join already imported at top
    const db = getDb();
    
    // Export semantic + procedural memories to a markdown file OpenClaw can index
    // Get entity names for better searchability
    const entityMap = {};
    const links = db.prepare(`
      SELECT me.memory_id, GROUP_CONCAT(DISTINCT e.name) as names
      FROM memory_entities me JOIN entities e ON me.entity_id = e.id
      GROUP BY me.memory_id
    `).all();
    for (const l of links) entityMap[l.memory_id] = l.names;

    // Get memory IDs for entity lookup
    const memWithIds = db.prepare(`
      SELECT id, content, type, subtype, importance, confidence, tags, updated_at
      FROM memories
      WHERE status = 'active'
        AND (type IN ('semantic', 'procedural') OR importance >= 7)
      ORDER BY importance DESC, updated_at DESC
    `).all();

    let md = `# Bayra Knowledge Base\n\n`;
    md += `> Auto-synced from bayra.db — ${new Date().toISOString().slice(0,19)} UTC\n`;
    md += `> ${memWithIds.length} memories | Do not edit manually\n\n`;
    
    for (const m of memWithIds) {
      const conf = m.confidence < 0.8 ? ` ⚠️ low-confidence(${m.confidence.toFixed(2)})` : '';
      md += `## ${m.content}\n`;
      md += `- Type: ${m.type}/${m.subtype || 'general'} | Importance: ${m.importance}${conf}\n`;
      if (m.tags) md += `- Tags: ${m.tags}\n`;
      if (entityMap[m.id]) md += `- Entities: ${entityMap[m.id]}\n`;
      md += `\n`;
    }

    const outPath = join(__dirname, '..', '..', 'memory', 'bayra-knowledge.md');
    writeFileSync(outPath, md, 'utf-8');
    report.bridge = { exported: memWithIds.length };
    console.log(`  ✅ Exported ${memWithIds.length} memories to memory/bayra-knowledge.md\n`);
  } catch (err) {
    report.errors.push(`bridge: ${err.message}`);
    console.error(`  ❌ ${err.message}\n`);
  }

  // 3c. Daily Backup (keep last 7)
  console.log('💾 Step 3c: Backup...');
  try {
    const { copyFileSync, readdirSync, unlinkSync, mkdirSync: mkdirS } = await import('node:fs');
    const backupDir = join(__dirname, '..', '..', 'backups', 'memory');
    mkdirS(backupDir, { recursive: true });
    
    const today = new Date().toISOString().slice(0, 10);
    const backupPath = join(backupDir, `memory-${today}.db`);
    
    if (!existsSync(backupPath)) {
      copyFileSync(DB_PATH, backupPath);
      console.log(`  ✅ Backed up to memory-${today}.db\n`);
      report.backup = { created: true, path: backupPath };
      
      // Cleanup: keep only last 7 backups
      const backups = readdirSync(backupDir)
        .filter(f => f.startsWith('memory-') && f.endsWith('.db'))
        .sort()
        .reverse();
      
      if (backups.length > 7) {
        for (const old of backups.slice(7)) {
          unlinkSync(join(backupDir, old));
          console.log(`  🗑️ Removed old backup: ${old}`);
        }
      }
    } else {
      console.log(`  ⏭️ Backup already exists for today\n`);
      report.backup = { created: false, reason: 'already exists' };
    }
  } catch (err) {
    report.errors.push(`backup: ${err.message}`);
    console.error(`  ❌ ${err.message}\n`);
  }

  // 4. Quick health check
  console.log('🏥 Step 4: Health Check...');
  try {
    const { getDb } = await import('./db.mjs');
    const db = getDb();
    const stats = db.prepare(`SELECT COUNT(*) as total FROM memories WHERE status = 'active'`).get();
    const embeds = db.prepare(`SELECT COUNT(*) as total FROM memory_embeddings`).get();
    const entities = db.prepare(`SELECT COUNT(*) as total FROM entities`).get();
    const dbSize = (existsSync(DB_PATH) ? (await import('node:fs')).statSync(DB_PATH).size / 1024 / 1024 : 0).toFixed(2);
    
    console.log(`  Memories: ${stats.total} | Embeddings: ${embeds.total} | Entities: ${entities.total} | DB: ${dbSize} MB\n`);
  } catch (err) {
    console.warn(`  ⚠️ ${err.message}\n`);
  }

  // 5. Auto Fact Extraction from recent conversations
  console.log('🧠 Step 5: Auto Fact Extraction...');
  try {
    const bridge = await import('./conversation-bridge.mjs');
    const recentMessages = await bridge.getRecentConversations({
      sinceHours: 6,
      maxMessages: 100,
    });
    
    if (recentMessages.length > 0) {
      const { autoIngestConversation } = await import('./auto-ingest.mjs');
      const factResult = await autoIngestConversation(recentMessages, {
        source: 'auto-extract',
        channel: 'openclaw-bridge',
      });
      report.factExtraction = factResult;
      console.log(`  ✅ Extracted: ${factResult.extracted}, Ingested: ${factResult.ingested}, Superseded: ${factResult.superseded}\n`);
    } else {
      console.log('  ⏭️ No new conversations to process\n');
      report.factExtraction = { extracted: 0, ingested: 0, superseded: 0 };
    }
  } catch (err) {
    report.errors.push(`fact-extraction: ${err.message}`);
    console.error(`  ❌ ${err.message}\n`);
  }

  // Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`✅ Maintenance complete in ${elapsed}s`);
  if (report.errors.length > 0) {
    console.log(`⚠️ ${report.errors.length} error(s): ${report.errors.join(', ')}`);
  }
  
  // Output for cron
  console.log('\nREPORT:' + JSON.stringify(report));
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
