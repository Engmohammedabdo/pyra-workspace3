import fs from 'fs';
import path from 'path';

// DB imports for entity relations (graceful fail if not ready)
let dbFns = null;
try {
  const db = await import('./tools/memory/db.mjs');
  dbFns = {
    getDb: db.getDb, closeDb: db.closeDb, findEntity: db.findEntity,
    createEntity: db.createEntity, createEntityRelation: db.createEntityRelation,
    getEntityRelationStats: db.getEntityRelationStats,
  };
} catch {
  try {
    const db = await import('/home/node/openclaw/tools/memory/db.mjs');
    dbFns = {
      getDb: db.getDb, closeDb: db.closeDb, findEntity: db.findEntity,
      createEntity: db.createEntity, createEntityRelation: db.createEntityRelation,
      getEntityRelationStats: db.getEntityRelationStats,
    };
  } catch { /* DB not available — will skip DB writes */ }
}

const GRAPH_PATH = '/home/node/openclaw/memory/ontology/graph.jsonl';
const MEMORY_DIR = '/home/node/openclaw/memory';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent';
const TIMEOUT_MS = 15000;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getDates() {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  return [
    today.toISOString().split('T')[0],
    yesterday.toISOString().split('T')[0]
  ];
}

function slugify(text) {
  return text.toLowerCase()
    .replace(/[^\w\u0600-\u06FF]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

function loadExistingGraph() {
  if (!fs.existsSync(GRAPH_PATH)) return { names: new Set(), entries: [] };
  const content = fs.readFileSync(GRAPH_PATH, 'utf8');
  const names = new Set();
  const entries = [];
  for (const line of content.split('\n')) {
    if (!line.trim()) continue;
    try {
      const obj = JSON.parse(line);
      entries.push(obj);
      if (obj.name) names.add(obj.name.toLowerCase());
    } catch { /* skip */ }
  }
  return { names, entries };
}

// Arabic ↔ English name mapping for known duplicates
const NAME_ALIASES = {
  'محمد': ['mohammed', 'mohamed', 'mohamed abdou'],
  'ليلى': ['layla', 'leila', 'lyla'],
  'أحمد': ['ahmed', 'ahmad'],
  'بايرا': ['bayra', 'pyraai', 'pyra'],
  'أفراح': ['afrah'],
  'خلود': ['khuloud'],
};

function normalizeForMatch(name) {
  return name.toLowerCase().replace(/[^\w\u0600-\u06FF]/g, ' ').replace(/\s+/g, ' ').trim();
}

function isSimilarName(name, existingNames) {
  const key = normalizeForMatch(name);
  if (existingNames.has(key)) return true;
  
  // Check partial matches
  for (const existing of existingNames) {
    if (existing.length > 3 && key.length > 3) {
      if (existing.includes(key) || key.includes(existing)) return true;
    }
  }
  
  // Check known aliases (Arabic ↔ English)
  for (const [arabic, aliases] of Object.entries(NAME_ALIASES)) {
    const allForms = [normalizeForMatch(arabic), ...aliases.map(a => normalizeForMatch(a))];
    if (allForms.includes(key)) {
      // If any alias exists in existingNames, it's a duplicate
      for (const form of allForms) {
        if (existingNames.has(form)) return true;
        for (const existing of existingNames) {
          if (existing.includes(form) || form.includes(existing)) return true;
        }
      }
    }
  }
  
  return false;
}

// ─── Gemini LLM Extraction ────────────────────────────────────────────────────

async function extractWithGemini(content, apiKey) {
  const prompt = `Extract structured entities and relationships from this daily memory log. Return ONLY valid JSON object.

Return format:
{
  "entities": [
    {"type": "Person|Organization|Project|Service|Tool|Client", "name": "...", "confidence": 0.0-1.0, "context": "brief description"}
  ],
  "relations": [
    {"source": "entity_name", "target": "entity_name", "type": "works_at|manages|client_of|uses|provides|reports_to|contacts|part_of|owns", "confidence": 0.0-1.0}
  ]
}

Relation types:
- works_at: Person → Organization
- manages: Person → Project
- client_of: Organization → Organization (client relationship)
- uses: Project → Tool
- provides: Organization → Service
- reports_to: Person → Person
- contacts: Person ↔ Person (communication/interaction)
- part_of: Project → Project
- owns: Person → Organization

Rules:
- Skip technical noise (file paths, config keys, timestamps, command outputs, version numbers)
- Skip generic Arabic words (الحل، المشكلة، النتيجة)
- Skip single generic English words like "Email", "Caption", "Scanner", "Planner", "Developer", "Fixer", "Reviewer" — these are agent role names, NOT real entities
- Skip LLM model names (GPT-4o, Claude, Gemini, Sonnet, etc.)
- Only extract entities that are REAL people, companies, projects, or services
- Only extract relations that are EXPLICITLY mentioned — do NOT infer
- Person names must be actual human names, not roles
- Confidence < 0.5 = skip
- For Arabic names, keep Arabic as primary
- When in doubt, DON'T extract

Memory log:
${content.slice(0, 8000)}`;

  const body = JSON.stringify({
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 }
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      signal: controller.signal
    });
    clearTimeout(timer);

    if (!res.ok) {
      throw new Error(`Gemini API error: ${res.status} ${await res.text()}`);
    }

    const data = await res.json();
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return parseGeminiJSON(text);
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

function parseGeminiJSON(text) {
  // Strip markdown code fences if present
  const clean = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  
  // Try parsing as object first (new format)
  const objStart = clean.indexOf('{');
  const objEnd = clean.lastIndexOf('}');
  if (objStart !== -1 && objEnd !== -1) {
    try {
      const parsed = JSON.parse(clean.slice(objStart, objEnd + 1));
      if (parsed.entities || parsed.relations) {
        return { entities: parsed.entities || [], relations: parsed.relations || [] };
      }
    } catch { /* try array fallback */ }
  }
  
  // Fallback: try parsing as array (old format)
  const arrStart = clean.indexOf('[');
  const arrEnd = clean.lastIndexOf(']');
  if (arrStart !== -1 && arrEnd !== -1) {
    try {
      const arr = JSON.parse(clean.slice(arrStart, arrEnd + 1));
      return { entities: arr, relations: [] };
    } catch { /* fail */ }
  }
  
  throw new Error('No valid JSON found in response');
}

// ─── Regex Fallback ───────────────────────────────────────────────────────────

const NOISE = new Set([
  'ai', 'api', 'url', 'http', 'https', 'json', 'html', 'css', 'js', 'md',
  'true', 'false', 'null', 'node', 'npm', 'git', 'ssh', 'curl', 'bash',
  'ok', 'yes', 'no', 'the', 'and', 'for', 'with', 'from', 'that', 'this',
  'sub', 'agent', 'file', 'path', 'data', 'test', 'main', 'new', 'old',
  'utc', 'result', 'check', 'status', 'error', 'warn', 'info',
  'الـ', 'هذا', 'هذي', 'كلهم', 'واحد', 'ثاني', 'شامل', 'كبير', 'صغير',
  'الحل', 'مشكلة', 'السؤال', 'الجواب', 'حالة', 'نظام', 'ملف', 'شغل',
  'agents', 'crons', 'config', 'workflow', 'server', 'monitor', 'webhook',
]);

function isValidName(name) {
  if (!name || name.length < 2 || name.length > 40) return false;
  if (NOISE.has(name.toLowerCase())) return false;
  if (/[\/\\{}()\[\]`$#@=<>|;]/.test(name)) return false;
  if (/^\d+$/.test(name)) return false;
  if (!/[a-zA-Z\u0600-\u06FF]/.test(name)) return false;
  return true;
}

function extractWithRegex(content) {
  const found = [];
  let m;

  const personPatterns = [
    /(?:اسم(?:ها|ه|هم)?|موظف(?:ة|ين)?|مسؤول(?:ة)?|مشرف(?:ة)?)\s+([أ-ي\w]{2,15})/g,
  ];
  for (const re of personPatterns) {
    while ((m = re.exec(content)) !== null) {
      const name = m[1].trim();
      if (isValidName(name)) found.push({ type: 'person', name, confidence: 0.7, context: 'Extracted via regex', relations: [] });
    }
  }

  const projRe = /^(?!#).*(?:مشروع|project)\s*(?:[:—]\s*)?([^\n,.(]{3,35})/gim;
  while ((m = projRe.exec(content)) !== null) {
    const name = m[1].trim();
    if (isValidName(name)) found.push({ type: 'project', name, confidence: 0.7, context: 'Extracted via regex', relations: [] });
  }

  const orgRe = /^(?!#).*(?:شركة|مؤسسة)\s+([^\n,.(]{2,30})/gm;
  while ((m = orgRe.exec(content)) !== null) {
    const name = m[1].trim();
    if (isValidName(name)) found.push({ type: 'organization', name, confidence: 0.7, context: 'Extracted via regex', relations: [] });
  }

  return found;
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function run() {
  const apiKey = process.env.GOOGLE_API_KEY;
  const dates = getDates();
  const { names: existingNames } = loadExistingGraph();

  // Collect memory content
  const memoryParts = [];
  for (const date of dates) {
    const filePath = path.join(MEMORY_DIR, `${date}.md`);
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    memoryParts.push(`=== ${date} ===\n${content}`);
  }

  if (memoryParts.length === 0) {
    console.log('ontology-sync: No memory files found for today/yesterday');
    console.log('ontology-sync: 0 new entities added, 0 relations added');
    return;
  }

  const combinedContent = memoryParts.join('\n\n');

  // Try LLM extraction, fallback to regex
  let entities = [];
  let relations = [];
  let usedFallback = false;

  if (apiKey) {
    try {
      let raw = await extractWithGemini(combinedContent, apiKey);
      if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        entities = raw.entities || [];
        relations = raw.relations || [];
      } else if (Array.isArray(raw)) {
        entities = raw;
      } else {
        throw new Error('Unexpected response format');
      }
    } catch (err) {
      console.error(`ontology-sync: Gemini failed (${err.message}), using regex fallback`);
      entities = extractWithRegex(combinedContent);
      usedFallback = true;
    }
  } else {
    console.warn('ontology-sync: No GOOGLE_API_KEY, using regex fallback');
    entities = extractWithRegex(combinedContent);
    usedFallback = true;
  }

  // Filter by confidence
  const highConfidence = entities.filter(e => (e.confidence ?? 1) >= 0.7);
  const highConfRelations = relations.filter(r => (r.confidence ?? 1) >= 0.6);

  // Ensure graph dir exists
  const graphDir = path.dirname(GRAPH_PATH);
  if (!fs.existsSync(graphDir)) fs.mkdirSync(graphDir, { recursive: true });

  const now = new Date().toISOString();
  const newLines = [];
  let addedEntities = 0;
  let addedRelations = 0;

  for (const entity of highConfidence) {
    const name = (entity.name || '').trim();
    if (!name || name.length < 2) continue;

    // Skip duplicates
    if (isSimilarName(name, existingNames)) continue;
    existingNames.add(name.toLowerCase());

    const entry = {
      type: 'entity',
      entityType: entity.type || 'unknown',
      name,
      id: `${slugify(name)}-auto-${Date.now()}`,
      metadata: {
        source: `memory/${dates[0]}.md`,
        auto: true,
        context: entity.context || '',
        confidence: entity.confidence ?? 1,
        method: usedFallback ? 'regex' : 'gemini'
      },
      createdAt: now
    };
    newLines.push(JSON.stringify(entry));
    addedEntities++;

  }

  // Process standalone relations from LLM
  for (const rel of highConfRelations) {
    if (!rel.source || !rel.target || !rel.type) continue;
    const relEntry = {
      type: 'relation',
      from: rel.source,
      to: rel.target,
      relation: rel.type,
      metadata: { source: `memory/${dates[0]}.md`, auto: true, confidence: rel.confidence ?? 1 },
      createdAt: now
    };
    newLines.push(JSON.stringify(relEntry));
    addedRelations++;
  }

  if (newLines.length > 0) {
    fs.appendFileSync(GRAPH_PATH, newLines.join('\n') + '\n');
  }

  // Write relations to DB (entity_relations table)
  let dbRelations = 0;
  if (dbFns && addedRelations > 0) {
    try {
      for (const rel of highConfRelations) {
        if (!rel.source || !rel.target || !rel.type) continue;
        // Find entity IDs
        const srcEntity = dbFns.findEntity(rel.source);
        const tgtEntity = dbFns.findEntity(rel.target);
        if (srcEntity && tgtEntity) {
          dbFns.createEntityRelation({
            source_entity_id: srcEntity.id,
            target_entity_id: tgtEntity.id,
            relation_type: rel.type,
            confidence: rel.confidence ?? 1.0,
            source: `memory/${dates[0]}.md`,
            metadata: rel.metadata || null,
          });
          dbRelations++;
        }
      }
      if (dbRelations > 0) dbFns.closeDb();
    } catch (err) {
      console.error(`ontology-sync: DB write failed (${err.message}) — relations saved to graph.jsonl only`);
    }
  }

  console.log(`ontology-sync: ${addedEntities} new entities added, ${addedRelations} relations added${dbRelations > 0 ? ` (${dbRelations} in DB)` : ''}`);
}

run().catch(err => {
  console.error('ontology-sync: Fatal error:', err.message);
  process.exit(1);
});
