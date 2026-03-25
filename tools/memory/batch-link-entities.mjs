import { getDb } from './db.mjs';
import crypto from 'crypto';

const db = getDb();

// Stats
let linked = 0;
let created = 0;
let totalLinks = 0;
let unlinked = [];

// Get all existing entities
const allEntities = db.prepare('SELECT id, name, type FROM entities ORDER BY name').all();
console.log(`Loaded ${allEntities.length} existing entities\n`);

// Build pattern → entityId map
const patterns = [
  // People
  { rx: /\bMohammed\b|محمد/i, entityId: '62799a69-d047-4fff-a21e-fe859959687b' },
  { rx: /\bBayra\b|بايرا/i, entityId: 'bb61738b-5a6a-49d3-b1d8-939704ce84e6' },
  { rx: /Dr\.?\s*Adel|د\.\s*عادل/i, entityId: '87e907c4-dbec-4a11-b480-761671a15430' },
  { rx: /د\.\s*رشا/i, entityId: '8a809163-3ab5-43ba-9b10-073ba16512dd' },
  { rx: /\bHisham\b|هشام\s*دقاق/i, entityId: 'cbf0b3de-3124-4cde-b62a-9ec410286b0c' },
  { rx: /\bAbdelaziz\b|عبدالعزيز/i, entityId: 'b618ef02-68fc-43cb-a910-2c7472846e77' },
  { rx: /\bAhmed\b|أحمد/i, entityId: '6ceb6bdd-b266-4648-b692-a107231fadeb' },
  { rx: /\bUbada\b|عبادة/i, entityId: '00590eba-b1ee-4cbe-8d05-5a59bad18680' },

  // Companies/Orgs
  { rx: /\bPyramedia\s*X\b|PyramediaX/i, entityId: '8b203cbe-cf7e-45e7-84ad-8e1b1a201cd2' },
  { rx: /\bPyramedia\b/i, entityId: 'd551cdc6-aff1-404b-a04b-477cf96005f9' },
  { rx: /\bEliteLife\b/i, entityId: 'c0e63807-46d3-4ea7-b1c8-b7dfe4b84913' },
  { rx: /\bEtmam\b|إتمام/i, entityId: '62f6abd8-38bb-4190-b5b4-958230a3ed1d' },

  // Tools
  { rx: /\bn8n\b/i, entityId: 'aea84727-3542-4c78-9b92-2d2819ae7596' },
  { rx: /\bWhatsApp\b|واتساب|الواتساب/i, entityId: 'dfc93973-260d-44a3-a134-f1aeca5f2efc' },
  { rx: /\bSupabase\b/i, entityId: 'f4d4ef91-3839-4864-b754-0d87906279eb' },
  { rx: /\bCoolify\b/i, entityId: 'bf9aeae5-6940-4a79-b2b3-475338061f80' },
  { rx: /\bOpenClaw\b/i, entityId: '43c7655a-76d5-4a74-9460-2f03782aa8b0' },
  { rx: /\bEvolution\s*API\b/i, entityId: 'c55dc3c7-db93-428a-b9ab-0cd4e408163a' },
  { rx: /\bChatwoot\b/i, entityId: 'f6a5b040-fee1-46e4-ae91-0cca930e71c5' },
  { rx: /\bMeta\s*Ads\b/i, entityId: '81f44f80-b4a2-4ceb-b4c2-838ef3a4c594' },
  { rx: /\bCloudflare\b/i, entityId: 'a70c026b-146c-4bc1-9299-f1f5c6705bf6' },
  { rx: /\bKie\.ai\b/i, entityId: 'f7365b67-fa14-4865-bd0b-dccee01f19bb' },
  { rx: /\bNext\.js\b/i, entityId: '3fec04b8-c6d9-4357-93f7-e4ae8354d5d5' },

  // Projects
  { rx: /\bPyra\s*Voice\b/i, entityId: 'c39e79b5-9e2c-4e54-bbb7-fddea7fde457' },
  { rx: /\bPyra\s*Workspace\b/i, entityId: '7f0711b1-3f14-454b-8449-7b4a19dac79e' },
  { rx: /\bEtmam\s*video\s*10\b/i, entityId: '81933f87-5231-4ad3-bd0e-c8c3a7a941cd' },

  // Agents
  { rx: /\bEvaluator?\s*Agent\b|Evaluate[\s-]*Loop/i, entityId: 'c959363f-77f6-41a6-8fef-9be5ffd1543d' },
  { rx: /\bPyraWhatsapp.?Agent\b/i, entityId: '53fefa18-91b9-4e61-8866-709cbe57ad84' },

  // Other
  { rx: /\bDubai\b|دبي/i, entityId: '6297d852-f819-4b52-9337-1272aa2e92e9' },
  { rx: /\bClaude\s*(Max|Code|Opus)\b/i, entityId: 'f79227ed-7ed0-40a3-a4b1-fdeafea68a26' },
  { rx: /\bpyramedia\.info\b/i, entityId: '982b096c-d3da-4457-b08e-53c0d0a32026' },
  { rx: /\bCoolify\s*Server\b/i, entityId: 'b7989254-8db3-444f-b08f-55c45ae55675' },
  { rx: /\bOpenClaw\s*Server\b/i, entityId: '07c65308-1491-470d-a3d8-c05651e20d28' },
  { rx: /\bDigital\s*Marketing\b/i, entityId: '4e33a22f-8fc2-4270-9bba-088d2f72a960' },
  { rx: /\bAI\s*Solutions?\b/i, entityId: '73b9ff1f-bb34-4681-93bb-a1f9f41939c5' },

  // Additional tool patterns
  { rx: /\bTelegram\b/i, entityId: null, name: 'Telegram', type: 'tool' },
  { rx: /\bPerplexity\b/i, entityId: null, name: 'Perplexity', type: 'tool' },
  { rx: /\bSerpAPI\b/i, entityId: null, name: 'SerpAPI', type: 'tool' },
  { rx: /\bBrave\s*Search\b/i, entityId: null, name: 'Brave Search', type: 'tool' },
  { rx: /\bffmpeg\b/i, entityId: null, name: 'ffmpeg', type: 'tool' },
  { rx: /\byt-dlp\b/i, entityId: null, name: 'yt-dlp', type: 'tool' },
  { rx: /\bGemini\b/i, entityId: null, name: 'Gemini', type: 'tool' },
  { rx: /\bElevenLabs\b/i, entityId: null, name: 'ElevenLabs', type: 'tool' },
  { rx: /\bFreepik\b/i, entityId: null, name: 'Freepik', type: 'tool' },
  { rx: /\bOpenRouter\b/i, entityId: null, name: 'OpenRouter', type: 'tool' },
  { rx: /\bImageMagick\b|pdfjs/i, entityId: null, name: 'pdfjs-dist', type: 'tool' },
];

// Helper: find or create entity
function findOrCreate(name, type) {
  let entity = db.prepare('SELECT id FROM entities WHERE LOWER(name) = LOWER(?)').get(name);
  if (!entity) {
    const id = crypto.randomUUID();
    db.prepare('INSERT INTO entities (id, type, name, aliases) VALUES (?, ?, ?, ?)').run(id, type, name, JSON.stringify([name]));
    entity = { id };
    created++;
    console.log(`  ✨ Created entity: ${name} (${type})`);
  }
  return entity.id;
}

// Resolve entityId for patterns that may need creation
for (const p of patterns) {
  if (!p.entityId && p.name) {
    p.entityId = findOrCreate(p.name, p.type);
  }
}

// Link helper
const linkStmt = db.prepare('INSERT OR IGNORE INTO memory_entities (memory_id, entity_id) VALUES (?, ?)');
function link(memoryId, entityId) {
  const r = linkStmt.run(memoryId, entityId);
  return r.changes > 0;
}

// Get orphan memories
const orphans = db.prepare(`
  SELECT id, content, type, importance 
  FROM memories 
  WHERE status='active' 
    AND id NOT IN (SELECT memory_id FROM memory_entities) 
  ORDER BY importance DESC
`).all();

console.log(`\nProcessing ${orphans.length} orphan memories...\n`);

// Process each memory
const linkAll = db.transaction(() => {
  for (const mem of orphans) {
    const content = mem.content;
    const matches = [];
    const seenIds = new Set();

    for (const p of patterns) {
      if (p.rx.test(content) && !seenIds.has(p.entityId)) {
        seenIds.add(p.entityId);
        if (link(mem.id, p.entityId)) {
          totalLinks++;
          const ent = allEntities.find(e => e.id === p.entityId) || { name: p.name || '?' };
          matches.push(ent.name);
        }
      }
    }

    if (matches.length > 0) {
      linked++;
      console.log(`✅ ${mem.id.slice(0,8)} ★${mem.importance} → [${matches.join(', ')}]`);
    } else {
      unlinked.push({ id: mem.id, importance: mem.importance, preview: content.slice(0, 80).replace(/\n/g, ' ') });
    }
  }
});

linkAll();

// Report
console.log('\n' + '='.repeat(60));
console.log('📊 Entity Linking Report');
console.log('='.repeat(60));
console.log(`Total orphan memories: ${orphans.length}`);
console.log(`Linked: ${linked}`);
console.log(`Total links created: ${totalLinks}`);
console.log(`New entities created: ${created}`);
console.log(`Still unlinked: ${unlinked.length}`);

if (unlinked.length > 0) {
  console.log('\n📋 Unlinked memories (no entity matches found):');
  for (const u of unlinked) {
    console.log(`  ${u.id.slice(0,8)} ★${u.importance} | ${u.preview}`);
  }
}

db.close();
console.log('\n✅ Done!');
