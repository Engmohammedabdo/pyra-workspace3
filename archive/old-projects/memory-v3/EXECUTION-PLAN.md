# خطة تنفيذ 10/10 — نظام الذاكرة والبحث والمهام 🎯

> **التاريخ:** 21 فبراير 2026
> **الهدف:** وصول الذاكرة + البحث + المهام لـ 10/10
> **القاعدة:** كل مهمة = sub-agent واحد، max 2 ملفات لكل sub-agent

---

## 📐 تحليل الحالة الحالية

### الملفات الحالية (لا تُعدَّل إلا بوضوح):
```
tools/memory/
├── cli.mjs              — CLI (620+ سطر)
├── db.mjs               — Database layer (417 سطر)
├── schema.sql           — SQLite schema (tables + triggers + indexes)
├── search.mjs           — Hybrid search engine (475 سطر)
├── ingest.mjs           — Ingestion pipeline (479 سطر)
├── embeddings.mjs       — OpenAI embeddings + cache (309 سطر)
├── lifecycle.mjs        — Consolidation, decay, GC, backup (386 سطر)
├── fact-extractor.mjs   — Auto fact extraction + conflict detection (464 سطر)
├── vector-backend.mjs   — Abstract vector backend (348 سطر)
├── auto-ingest.mjs      — Auto-ingest daily logs (248 سطر)
├── daily-maintenance.mjs — Cron maintenance script (175 سطر)
├── consolidate.mjs      — Smart consolidation
├── snapshot.mjs         — Memory snapshot export
├── hygiene.mjs          — Archive/purge/prune
├── memory-manager.mjs   — Manager wrapper
├── response-cache.mjs   — Response cache
└── package.json         — Dependencies: better-sqlite3, openai, sqlite-vec
```

### الأرقام الحالية:
- 474 active memories, 528 total
- 527 embeddings (512-dim, text-embedding-3-small)
- 69 entities, 201 relations
- DB size: 5.44 MB
- Vector search: ~1.35ms @ 527 embeddings

---

## 🏗️ هيكل التوزيع — 4 موجات

### الموجة 1 — مستقلة تماماً (متوازية)
| # | المهمة | Sub-Agent | الملفات المعدلة/الجديدة |
|---|--------|-----------|------------------------|
| 1 | تفعيل Auto Fact Extraction | SA-1 | `daily-maintenance.mjs` + `conversation-bridge.mjs` (جديد) |
| 2 | تفعيل Conflict Detection | SA-1 | (ضمن نفس SA-1 — مرتبط عضوياً) |
| 3 | LanceDB Backend | SA-2 | `vector-backend.mjs` + `package.json` |
| 8 | Task Queue | SA-3 | `task-queue.mjs` (جديد) + `task-schema.sql` (جديد) |

### الموجة 2 — تعتمد على الموجة 1
| # | المهمة | Sub-Agent | يعتمد على |
|---|--------|-----------|-----------|
| 4 | Real-time Memory Bridge | SA-4 | مهمة 1 (conversation-bridge.mjs) |
| 7 | File Indexing | SA-5 | مهمة 3 (LanceDB for scale) |
| 9 | Sub-agent Shared Memory | SA-6 | الـ DB schema الحالي (memory_staging table) |

### الموجة 3 — تعتمد على الموجة 2
| # | المهمة | Sub-Agent | يعتمد على |
|---|--------|-----------|-----------|
| 5 | Unified Search | SA-7 | مهمة 7 (file index) + search.mjs |
| 10 | Proactive Task Tracking | SA-8 | مهمة 8 (task queue) |

### الموجة 4 — النهائية
| # | المهمة | Sub-Agent | يعتمد على |
|---|--------|-----------|-----------|
| 6 | RAG Pipeline | SA-9 | مهمة 5 (unified search) |

### الأوركسترا — التدقيق الشامل
| المهمة | Sub-Agent |
|--------|-----------|
| Integration Test | SA-10 |

---

## 📋 تفاصيل كل مهمة

---

### مهمة 1+2: تفعيل Auto Fact Extraction + Conflict Detection (SA-1)

**الملف المعدل:** `daily-maintenance.mjs`
**الملف الجديد:** `conversation-bridge.mjs`

**ماذا يفعل:**
`fact-extractor.mjs` جاهز بالكامل (`extractFacts()`, `detectConflicts()`, `autoIngestFacts()`) لكنه مش مربوط بالـ maintenance cron.

**التعديلات المطلوبة:**

#### 1. إضافة Step 5 في `daily-maintenance.mjs` (بعد Step 4):
```javascript
// 5. Auto Fact Extraction from recent conversations
console.log('🧠 Step 5: Auto Fact Extraction...');
try {
  const { autoIngestConversation } = await import('./auto-ingest.mjs');
  const { getDb } = await import('./db.mjs');
  const db = getDb();
  
  // قراءة آخر المحادثات من OpenClaw session logs
  const bridge = await import('./conversation-bridge.mjs');
  const recentMessages = await bridge.getRecentConversations({
    sinceHours: 6, // آخر 6 ساعات (يتوافق مع الـ cron interval)
    maxMessages: 100,
  });
  
  if (recentMessages.length > 0) {
    const result = await autoIngestConversation(recentMessages, {
      source: 'auto-extract',
      channel: 'openclaw-bridge',
    });
    report.factExtraction = result;
    console.log(`  ✅ Extracted: ${result.extracted}, Ingested: ${result.ingested}, Superseded: ${result.superseded}\n`);
  } else {
    console.log('  ⏭️ No new conversations to process\n');
    report.factExtraction = { extracted: 0, ingested: 0, superseded: 0 };
  }
} catch (err) {
  report.errors.push(`fact-extraction: ${err.message}`);
  console.error(`  ❌ ${err.message}\n`);
}
```

#### 2. إنشاء `conversation-bridge.mjs`:
```javascript
/**
 * conversation-bridge.mjs — Bridge between OpenClaw sessions and Memory System
 * 
 * Reads recent conversation messages from:
 * 1. OpenClaw session transcripts (if accessible)
 * 2. Daily memory files (memory/YYYY-MM-DD.md) as fallback
 * 3. WIP.md changes
 */

export async function getRecentConversations(options = {}) {
  const { sinceHours = 6, maxMessages = 100 } = options;
  // ... implementation
}
```

**المصادر للمحادثات (بالترتيب):**
1. `memory/YYYY-MM-DD.md` — الملف اليومي (مصدر موثوق)
2. `WIP.md` — التغييرات الأخيرة
3. أي ملفات جديدة في `/home/node/openclaw/` تم تعديلها آخر 6 ساعات

**Conflict Detection مفعّل تلقائياً** — `autoIngestFacts()` بالفعل يستدعي `detectConflicts()` لكل fact. Threshold = 0.60.

**اختبار:**
```bash
node daily-maintenance.mjs  # يجب أن يظهر Step 5
node -e "
  import {autoIngestFacts} from './fact-extractor.mjs';
  import {getDb} from './db.mjs';
  const db = getDb();
  const r = await autoIngestFacts(db, [
    {role:'user', content:'سعر خدمة الواتساب صار 10000 درهم بدل 8000'}
  ]);
  console.log(JSON.stringify(r, null, 2));
"
```

---

### مهمة 3: LanceDB Backend (SA-2)

**الملف المعدل:** `vector-backend.mjs` (إضافة `LanceDBBackend` class)
**الملف المعدل:** `package.json` (إضافة `@lancedb/lancedb`)
**الملف الجديد:** `migrate-to-lancedb.mjs`

**الحالة الحالية:**
- `VectorBackend` abstract class ✅
- `SqliteVecBackend` implementation ✅
- `LanceDBBackend` placeholder (empty class) ❌
- `createVectorBackend(type, config)` factory ✅

**التنفيذ:**

#### 1. تثبيت LanceDB:
```bash
cd /home/node/openclaw/tools/memory
npm install @lancedb/lancedb
```

#### 2. تنفيذ `LanceDBBackend` class:
```javascript
import * as lancedb from '@lancedb/lancedb';

export class LanceDBBackend extends VectorBackend {
  constructor(config = {}) {
    super();
    this.dbPath = config.dbPath || join(os.homedir(), '.openclaw', 'memory', 'lance');
    this.tableName = config.tableName || 'memory_embeddings';
    this.dimensions = config.dimensions || 512;
    this._db = null;
    this._table = null;
  }

  async init() {
    this._db = await lancedb.connect(this.dbPath);
    try {
      this._table = await this._db.openTable(this.tableName);
    } catch {
      // Create table with schema
      this._table = await this._db.createTable(this.tableName, [
        { memory_id: 'init', vector: new Array(this.dimensions).fill(0) }
      ]);
      // Delete init row
      await this._table.delete('memory_id = "init"');
    }
  }

  async search(embedding, limit = 20, filters = {}) {
    if (!this._table) await this.init();
    const { types, status, minImportance, excludeIds } = filters;
    
    // Convert Buffer to Float32Array
    const vec = embedding instanceof Buffer
      ? Array.from(new Float32Array(embedding.buffer, embedding.byteOffset, embedding.byteLength / 4))
      : Array.from(embedding);
    
    let query = this._table.vectorSearch(vec).limit(limit * 3);
    
    // LanceDB returns results, we post-filter with SQLite metadata
    const results = await query.toArray();
    
    return results
      .map(r => ({
        memory_id: r.memory_id,
        distance: r._distance || r.distance || 0,
      }))
      .slice(0, limit);
  }

  async upsert(id, embedding) {
    if (!this._table) await this.init();
    const vec = embedding instanceof Buffer
      ? Array.from(new Float32Array(embedding.buffer, embedding.byteOffset, embedding.byteLength / 4))
      : Array.from(embedding);
    
    // Delete existing first
    try { await this._table.delete(`memory_id = "${id}"`); } catch {}
    await this._table.add([{ memory_id: id, vector: vec }]);
    return true;
  }

  async delete(id) {
    if (!this._table) await this.init();
    try {
      await this._table.delete(`memory_id = "${id}"`);
      return true;
    } catch { return false; }
  }

  async count() {
    if (!this._table) await this.init();
    return await this._table.countRows();
  }

  async healthCheck() {
    try {
      if (!this._table) await this.init();
      const count = await this.count();
      return { ok: true, message: `LanceDB healthy: ${count} embeddings`, details: { count } };
    } catch (e) {
      return { ok: false, message: e.message };
    }
  }
}
```

#### 3. تحديث `createVectorBackend()` factory:
```javascript
export function createVectorBackend(type, config = {}) {
  switch (type) {
    case 'sqlite-vec': return new SqliteVecBackend(config.db);
    case 'lancedb': return new LanceDBBackend(config);
    default: throw new Error(`Unknown vector backend: ${type}`);
  }
}
```

#### 4. إنشاء `migrate-to-lancedb.mjs`:
سكريبت لنقل الـ embeddings من sqlite-vec إلى LanceDB:
```javascript
// 1. قراءة كل embeddings من sqlite-vec
// 2. كتابتها في LanceDB batch-wise (100 per batch)
// 3. التحقق من العدد المطابق
// 4. لا تحذف sqlite-vec (fallback)
```

**اختبار:**
```bash
# Test LanceDB backend independently
node -e "
  import { LanceDBBackend } from './vector-backend.mjs';
  const backend = new LanceDBBackend({ dbPath: '/tmp/test-lance' });
  await backend.init();
  
  // Insert test embedding
  const testVec = Buffer.alloc(512 * 4);
  new Float32Array(testVec.buffer).fill(0.1);
  await backend.upsert('test-1', testVec);
  
  console.log('Count:', await backend.count());
  const results = await backend.search(testVec, 5);
  console.log('Search results:', results);
  
  await backend.delete('test-1');
  console.log('After delete:', await backend.count());
  console.log('✅ LanceDB backend working');
"

# Test migration
node migrate-to-lancedb.mjs --dry-run
node migrate-to-lancedb.mjs
```

**⚠️ مهم:** لا تحذف sqlite-vec — ابقِ كـ fallback. الـ search.mjs يستخدم sqlite-vec مباشرة — لا تعدل search.mjs في هذه المهمة.

---

### مهمة 4: Real-time Memory Bridge (SA-4) — موجة 2

**الملف الجديد:** `realtime-bridge.mjs`
**الملف المعدل:** `daily-maintenance.mjs` (ربط إضافي)

**ماذا يفعل:**
يراقب ملفات الـ memory ويستخرج الحقائق فور تعديلها (مش كل 6 ساعات).

**التنفيذ:**
```javascript
/**
 * realtime-bridge.mjs — Watch for file changes and auto-ingest
 * 
 * يستخدم fs.watch أو يشتغل كـ cron كل ساعة (بدل 6)
 * يقرأ فقط المحتوى الجديد (state tracking بـ offset)
 */

import { watch, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { autoIngestConversation } from './auto-ingest.mjs';

const WATCH_DIR = '/home/node/openclaw/memory';
const STATE_FILE = join(WATCH_DIR, 'realtime-state.json');

export async function processNewContent(filePath) {
  // 1. Load state (last offset for this file)
  // 2. Read new content since last offset
  // 3. Convert to messages array
  // 4. Call autoIngestConversation()
  // 5. Update state
}

// Watch mode (for long-running process)
export function startWatcher() {
  watch(WATCH_DIR, { recursive: false }, async (event, filename) => {
    if (!filename.match(/^\d{4}-\d{2}-\d{2}\.md$/)) return;
    await processNewContent(join(WATCH_DIR, filename));
  });
}

// Cron mode (run once, process changes since last run)
export async function cronRun() {
  const today = new Date().toISOString().slice(0, 10);
  const todayFile = join(WATCH_DIR, `${today}.md`);
  if (existsSync(todayFile)) {
    await processNewContent(todayFile);
  }
}
```

**الربط:** إضافة cron جديد بتردد ساعة (بدل 6):
```bash
openclaw cron add --name bayra-realtime --schedule "0 * * * *" --timezone Asia/Dubai \
  --command "node /home/node/openclaw/tools/memory/realtime-bridge.mjs"
```

**اختبار:**
```bash
# إضافة سطر جديد للملف اليومي
echo "## Test Real-time\n- محمد قرر يغير السعر ل 15000 درهم" >> memory/2026-02-21.md
node realtime-bridge.mjs  # يجب يستخرج الحقيقة
```

---

### مهمة 5: Unified Search (SA-7) — موجة 3

**الملف الجديد:** `unified-search.mjs`

**ماذا يفعل:**
بحث واحد يمر على 3 مصادر ويدمج النتائج:
1. **Memory DB** — hybrid search الحالي
2. **File Index** — بحث في الملفات المفهرسة (من مهمة 7)
3. **Web** — Brave search API (اختياري)

**التنفيذ:**
```javascript
/**
 * unified-search.mjs — Single search across all knowledge sources
 */

import { smartSearch } from './search.mjs';
import { searchFileIndex } from './file-indexer.mjs';

export async function unifiedSearch(db, query, options = {}) {
  const {
    sources = ['memory', 'files'],  // 'web' optional
    limit = 10,
    includeWeb = false,
  } = options;

  const results = { memory: [], files: [], web: [], merged: [] };
  
  // 1. Memory search
  if (sources.includes('memory')) {
    results.memory = await smartSearch(db, query, { limit: limit * 2 });
  }
  
  // 2. File search
  if (sources.includes('files')) {
    results.files = await searchFileIndex(db, query, { limit: limit * 2 });
  }
  
  // 3. Web search (optional)
  if (includeWeb || sources.includes('web')) {
    // Use built-in web_search capabilities
    results.web = []; // placeholder — populated by caller
  }
  
  // 4. Merge with RRF
  results.merged = mergeResults(results, { limit });
  
  return results;
}

function mergeResults(results, { limit = 10 }) {
  // RRF across all sources with source-specific weights
  const k = 60;
  const weights = { memory: 0.5, files: 0.3, web: 0.2 };
  // ... RRF implementation
}
```

**اختبار:**
```bash
node -e "
  import { unifiedSearch } from './unified-search.mjs';
  import { getDb } from './db.mjs';
  const db = getDb();
  const r = await unifiedSearch(db, 'Pyramedia pricing');
  console.log('Memory hits:', r.memory.length);
  console.log('File hits:', r.files.length);
  console.log('Merged:', r.merged.length);
"
```

---

### مهمة 6: RAG Pipeline (SA-9) — موجة 4

**الملف الجديد:** `rag-pipeline.mjs`

**ماذا يفعل:**
لما أحتاج أجاوب سؤال → بحث تلقائي → استرجاع السياق → تنسيق الجواب.

**التنفيذ:**
```javascript
/**
 * rag-pipeline.mjs — Retrieval-Augmented Generation pipeline
 * 
 * query → unifiedSearch → context assembly → formatted context
 * 
 * ملاحظة: لا يستدعي LLM مباشرة — يحضّر السياق وبايرا تجاوب
 */

export async function retrieveContext(db, query, options = {}) {
  const { maxTokens = 4000, sources = ['memory', 'files'] } = options;
  
  // 1. Search
  const searchResults = await unifiedSearch(db, query, { sources, limit: 20 });
  
  // 2. Re-rank by relevance
  const ranked = rerank(searchResults.merged, query);
  
  // 3. Assemble context within token budget
  const context = assembleContext(ranked, maxTokens);
  
  // 4. Format for LLM consumption
  return formatContext(context, query);
}

function rerank(results, query) {
  // MMR (Maximal Marginal Relevance) — diversity + relevance
  // ...
}

function assembleContext(results, maxTokens) {
  // Fit results within token budget (~4 chars/token)
  const maxChars = maxTokens * 4;
  let totalChars = 0;
  const selected = [];
  for (const r of results) {
    const len = (r.content || '').length;
    if (totalChars + len > maxChars && selected.length > 0) break;
    totalChars += len;
    selected.push(r);
  }
  return selected;
}

function formatContext(results, query) {
  // Format as structured context block
  let ctx = `## Retrieved Context for: "${query}"\n\n`;
  for (const r of results) {
    ctx += `### [${r.source || 'memory'}] ${r.type || 'unknown'} (relevance: ${r.finalScore?.toFixed(3) || '?'})\n`;
    ctx += `${r.content}\n\n`;
  }
  return ctx;
}
```

**اختبار:**
```bash
node -e "
  import { retrieveContext } from './rag-pipeline.mjs';
  import { getDb } from './db.mjs';
  const db = getDb();
  const ctx = await retrieveContext(db, 'ما هي خدمات Pyramedia وأسعارها؟');
  console.log(ctx);
"
```

---

### مهمة 7: File Indexing (SA-5) — موجة 2

**الملف الجديد:** `file-indexer.mjs`
**الجدول الجديد:** `file_index` في schema.sql

**ماذا يفعل:**
يفهرس الملفات المهمة في الـ workspace بـ embeddings للبحث.

**التنفيذ:**

#### Schema:
```sql
CREATE TABLE IF NOT EXISTS file_index (
  id TEXT PRIMARY KEY,
  file_path TEXT NOT NULL UNIQUE,
  chunk_index INTEGER DEFAULT 0,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding_id TEXT,
  file_type TEXT,
  last_indexed TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  file_modified TEXT
);
CREATE INDEX IF NOT EXISTS idx_file_index_path ON file_index(file_path);
```

#### الملفات المفهرسة:
```javascript
const INDEX_PATHS = [
  // Skills (أهم 50 skill)
  '/home/node/openclaw/antigravity-awesome-skills/skills/*/SKILL.md',
  // Project docs
  '/home/node/openclaw/projects/**/*.md',
  // Agent configs
  '/home/node/openclaw/agents/*.md',
  // Core workspace files
  '/home/node/openclaw/SOUL.md',
  '/home/node/openclaw/USER.md',
  '/home/node/openclaw/TOOLS.md',
  '/home/node/openclaw/AGENTS.md',
];

const CHUNK_SIZE = 1000;  // chars per chunk (مع overlap 200)
```

#### الوظائف:
```javascript
export async function indexFile(db, filePath, options = {}) {
  // 1. قراءة الملف
  // 2. تقسيم لـ chunks (1000 char مع 200 overlap)
  // 3. توليد embedding لكل chunk
  // 4. حفظ في file_index + memory_embeddings
}

export async function indexDirectory(db, dirPath, pattern, options = {}) {
  // Glob + filter + index each file
}

export async function searchFileIndex(db, query, options = {}) {
  // 1. Embed query
  // 2. Vector search في file_index embeddings
  // 3. Return ranked results with file path + content
}

export async function reindexStale(db, options = {}) {
  // Check file_modified vs actual mtime, re-index if changed
}
```

**اختبار:**
```bash
# Index workspace
node -e "
  import { indexDirectory } from './file-indexer.mjs';
  import { getDb } from './db.mjs';
  const db = getDb();
  const r = await indexDirectory(db, '/home/node/openclaw/agents', '*.md');
  console.log('Indexed:', r);
"

# Search
node -e "
  import { searchFileIndex } from './file-indexer.mjs';
  import { getDb } from './db.mjs';
  const db = getDb();
  const r = await searchFileIndex(db, 'n8n workflow automation');
  console.log(r);
"
```

**⚠️ حدود:**
- لا تفهرس أكثر من 200 ملف بالبداية (token cost)
- Embedding cost: ~$0.001 لكل 1000 chunk (رخيص جداً)
- re-index فقط للملفات اللي تغيرت (content_hash comparison)

---

### مهمة 8: Task Queue (SA-3) — موجة 1

**الملف الجديد:** `task-queue.mjs`
**الجدول الجديد:** `tasks` في bayra.db

**ماذا يفعل:**
نظام مهام يحفظ في SQLite — يبدأ اليوم ويكمل بكرة.

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending','in_progress','blocked','done','cancelled')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('critical','high','medium','low')),
  created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
  due_at TEXT,
  completed_at TEXT,
  assigned_to TEXT DEFAULT 'bayra',
  source TEXT,  -- 'user', 'auto', 'cron'
  checkpoint TEXT,  -- JSON: آخر نقطة وقف
  tags TEXT,
  parent_task_id TEXT REFERENCES tasks(id),
  metadata TEXT  -- JSON: أي بيانات إضافية
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
```

**الوظائف:**
```javascript
export function createTask(title, options = {}) { /* ... */ }
export function updateTask(id, updates) { /* ... */ }
export function getTask(id) { /* ... */ }
export function listTasks(filters = {}) { /* ... */ }
export function completeTask(id, result = null) { /* ... */ }
export function saveCheckpoint(id, checkpoint) { /* ... */ }
export function loadCheckpoint(id) { /* ... */ }
export function getOverdueTasks() { /* ... */ }
export function getTasksByStatus(status) { /* ... */ }
```

**CLI commands (إضافة لـ cli.mjs):**
```
task add <title> [--priority P] [--due DATE]
task list [--status S] [--priority P]
task update <id> --status S
task done <id>
task checkpoint <id> <json>
task overdue
```

**اختبار:**
```bash
node cli.mjs task add "متابعة رد العميل على سكريبتات إتمام" --priority high --due 2026-02-25
node cli.mjs task list
node cli.mjs task checkpoint <id> '{"lastAction": "sent to Layla", "nextStep": "wait for reply"}'
node cli.mjs task overdue
```

---

### مهمة 9: Sub-agent Shared Memory (SA-6) — موجة 2

**الملف الجديد:** `shared-memory.mjs`

**ماذا يفعل:**
يستخدم جدول `memory_staging` الموجود أصلاً + يضيف write/read pattern.

**التنفيذ:**
```javascript
/**
 * shared-memory.mjs — Sub-agent knowledge sharing
 * 
 * Uses existing memory_staging table for sub-agents to publish findings.
 * Main agent reviews and approves during heartbeat/maintenance.
 */

// Sub-agent writes its findings
export function publishFinding(db, agentId, finding) {
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO memory_staging (id, agent_id, content, type, subtype, importance, tags, metadata, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(id, agentId, finding.content, finding.type || 'semantic',
    finding.subtype, finding.importance || 5,
    JSON.stringify(finding.tags || []),
    JSON.stringify(finding.metadata || {}));
  return id;
}

// Main agent reviews pending findings
export function getPendingFindings(db, options = {}) {
  const { limit = 50 } = options;
  return db.prepare(`
    SELECT * FROM memory_staging WHERE status = 'pending'
    ORDER BY importance DESC, created_at ASC LIMIT ?
  `).all(limit);
}

// Approve and promote to main memory
export async function approveAndIngest(db, stagingId) {
  const staging = db.prepare('SELECT * FROM memory_staging WHERE id = ?').get(stagingId);
  if (!staging) throw new Error('Staging entry not found');
  
  // Use existing ingest pipeline
  const result = await ingestMemory(db, staging.content, {
    type: staging.type,
    subtype: staging.subtype,
    importance: staging.importance,
    tags: [...JSON.parse(staging.tags || '[]'), `from-agent:${staging.agent_id}`],
    source: `sub-agent:${staging.agent_id}`,
  });
  
  // Mark as approved
  db.prepare("UPDATE memory_staging SET status = 'approved' WHERE id = ?").run(stagingId);
  return result;
}

// Auto-approve high-confidence findings
export async function autoApproveFindings(db, options = {}) {
  const { minImportance = 7 } = options;
  const pending = getPendingFindings(db);
  const highPriority = pending.filter(f => f.importance >= minImportance);
  
  let approved = 0;
  for (const finding of highPriority) {
    try {
      await approveAndIngest(db, finding.id);
      approved++;
    } catch (e) {
      console.warn(`[shared-memory] Failed to approve ${finding.id}: ${e.message}`);
    }
  }
  return { total: pending.length, approved };
}
```

**الربط بالـ maintenance:**
```javascript
// في daily-maintenance.mjs — Step 6
console.log('🤝 Step 6: Sub-agent Knowledge Sync...');
const { autoApproveFindings } = await import('./shared-memory.mjs');
const syncResult = await autoApproveFindings(db);
console.log(`  ✅ Reviewed: ${syncResult.total}, Auto-approved: ${syncResult.approved}`);
```

---

### مهمة 10: Proactive Task Tracking (SA-8) — موجة 3

**الملف الجديد:** `task-tracker.mjs`

**ماذا يفعل:**
يراقب المهام المعلقة ويولّد تنبيهات عند:
- مهمة مر عليها 48+ ساعة بدون تقدم
- مهمة فات موعدها (overdue)
- مهمة جديدة من كلام محمد ("تابعي"، "ذكريني")

**التنفيذ:**
```javascript
/**
 * task-tracker.mjs — Proactive task monitoring
 */

import { listTasks, getOverdueTasks } from './task-queue.mjs';

// Phrases that signal "track this"
const TRACK_TRIGGERS = [
  /تابع(ي|و|ها)?/,
  /ذكر(ي|و|ني)?/,
  /لا تنس(ي|و|ى)/,
  /follow.?up/i,
  /remind/i,
  /don'?t forget/i,
  /check.?on/i,
];

export function detectTaskFromMessage(message) {
  for (const pattern of TRACK_TRIGGERS) {
    if (pattern.test(message)) return true;
  }
  return false;
}

export function generateAlerts(db) {
  const alerts = [];
  
  // 1. Overdue tasks
  const overdue = getOverdueTasks();
  for (const task of overdue) {
    alerts.push({
      type: 'overdue',
      severity: task.priority === 'critical' ? 'urgent' : 'warning',
      message: `⏰ مهمة متأخرة: "${task.title}" (كان المفروض ${task.due_at})`,
      task_id: task.id,
    });
  }
  
  // 2. Stale tasks (no progress for 48h)
  const stale = listTasks({ status: 'in_progress' }).filter(t => {
    const lastUpdate = new Date(t.updated_at).getTime();
    return Date.now() - lastUpdate > 48 * 60 * 60 * 1000;
  });
  
  for (const task of stale) {
    alerts.push({
      type: 'stale',
      severity: 'info',
      message: `🔄 مهمة بدون تقدم: "${task.title}" (آخر تحديث ${task.updated_at})`,
      task_id: task.id,
    });
  }
  
  return alerts;
}
```

**الربط بالـ HEARTBEAT.md:**
```javascript
// في daily-maintenance.mjs
// أو يُستدعى من الـ heartbeat
const { generateAlerts } = await import('./task-tracker.mjs');
const alerts = generateAlerts(db);
if (alerts.length > 0) {
  // كتابة التنبيهات في HEARTBEAT.md ليقرأها الـ agent
  const alertText = alerts.map(a => `- ${a.message}`).join('\n');
  writeFileSync('/home/node/openclaw/HEARTBEAT.md', `# HEARTBEAT.md\n\n## Task Alerts\n${alertText}\n`);
}
```

---

## 🔍 الأوركسترا — التدقيق الشامل (SA-10)

**بعد اكتمال كل الموجات:**

```bash
# 1. Unit tests لكل ملف جديد
node -e "import('./conversation-bridge.mjs').then(m => console.log('✅ conversation-bridge'))"
node -e "import('./unified-search.mjs').then(m => console.log('✅ unified-search'))"
node -e "import('./file-indexer.mjs').then(m => console.log('✅ file-indexer'))"
node -e "import('./task-queue.mjs').then(m => console.log('✅ task-queue'))"
node -e "import('./shared-memory.mjs').then(m => console.log('✅ shared-memory'))"
node -e "import('./task-tracker.mjs').then(m => console.log('✅ task-tracker'))"
node -e "import('./rag-pipeline.mjs').then(m => console.log('✅ rag-pipeline'))"
node -e "import('./realtime-bridge.mjs').then(m => console.log('✅ realtime-bridge'))"

# 2. Integration test
node daily-maintenance.mjs  # كل الـ steps تشتغل بدون أخطاء

# 3. Data integrity
node cli.mjs integrity
node cli.mjs stats
node cli.mjs health

# 4. Search quality test
node cli.mjs search "أسعار Pyramedia"
node -e "import('./unified-search.mjs').then(async m => {
  const {getDb} = await import('./db.mjs');
  const r = await m.unifiedSearch(getDb(), 'Pyramedia pricing');
  console.log(r.merged.length, 'results');
})"

# 5. Task system test
node cli.mjs task add "test task" --priority high
node cli.mjs task list
node cli.mjs task done <id>

# 6. Zero data loss verification
node -e "
  import {getDb} from './db.mjs';
  const db = getDb();
  const active = db.prepare('SELECT COUNT(*) as c FROM memories WHERE status = \"active\"').get().c;
  const embeds = db.prepare('SELECT COUNT(*) as c FROM memory_embeddings').get().c;
  const entities = db.prepare('SELECT COUNT(*) as c FROM entities').get().c;
  const relations = db.prepare('SELECT COUNT(*) as c FROM memory_relations').get().c;
  console.log({active, embeds, entities, relations});
  // يجب: active >= 474, embeds >= 527, entities >= 69, relations >= 201
"
```

---

## ⚠️ قواعد حماية

1. **Backup قبل أي تعديل:** `cp bayra.db bayra.db.pre-v3-backup`
2. **لا تعدل ملفات موجودة إلا بالحد الأدنى** — أضف، لا تستبدل
3. **كل ملف جديد = ESM** (`export`, `import`, لا `require`)
4. **كل ملف يجب يكون importable بدون side effects** (no auto-execution)
5. **لا تعدل schema.sql مباشرة** — أضف tables جديدة بـ `CREATE TABLE IF NOT EXISTS` في الكود
6. **الـ test ما ينجح = ما ترسل الملف** — كل sub-agent يختبر قبل ما يسلّم

---

## 📊 توزيع Sub-Agents

| Wave | Sub-Agents | المهام | الوقت المتوقع |
|------|-----------|--------|---------------|
| 1 | SA-1, SA-2, SA-3 | 1+2, 3, 8 | 15 دقيقة |
| 2 | SA-4, SA-5, SA-6 | 4, 7, 9 | 15 دقيقة |
| 3 | SA-7, SA-8 | 5, 10 | 10 دقائق |
| 4 | SA-9 | 6 | 5 دقائق |
| Audit | SA-10 | تدقيق شامل | 10 دقائق |

**المجموع: ~55 دقيقة** (بالتوازي) بدل 29 ساعة (بالتسلسل) ⚡
