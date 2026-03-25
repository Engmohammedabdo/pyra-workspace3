/**
 * Bayra Memory System — Episode Pattern Memory
 * 
 * Learns from experience patterns: mistakes, successes, preferences, workflows.
 * Detects recurring situations and surfaces lessons proactively.
 * 
 * Core Functions:
 *   detectPattern(text) → { type, trigger, lesson, confidence }
 *   recordEpisode(pattern) → saved/updated pattern
 *   findSimilarEpisodes(context, limit) → relevant patterns
 *   getActivePatterns(type?) → active patterns
 *   getLessonsForContext(text) → formatted lessons
 *   updatePattern(id, updates) → updated pattern
 *   archivePattern(id) → archived pattern
 *   getPatternStats() → summary stats
 */

import crypto from 'node:crypto';
import { getDb } from './db.mjs';
import {
  embed, embeddingToBuffer, bufferToEmbedding,
  cosineSimilarity, setCacheDb,
} from './embeddings.mjs';

// ─── Schema Migration ─────────────────────────────────────────────

let _initialized = false;

export function initEpisodeSchema() {
  if (_initialized) return;
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS episode_patterns (
      id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      trigger_description TEXT NOT NULL,
      lesson TEXT NOT NULL,
      action TEXT,
      occurrence_count INTEGER DEFAULT 1,
      last_occurred TEXT,
      first_occurred TEXT,
      confidence REAL DEFAULT 0.5,
      status TEXT DEFAULT 'active',
      related_memories TEXT,
      tags TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_episode_patterns_type
      ON episode_patterns(pattern_type);
    CREATE INDEX IF NOT EXISTS idx_episode_patterns_status
      ON episode_patterns(status);
  `);

  // Vec0 virtual table for episode trigger embeddings
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS episode_embeddings
      USING vec0(episode_id TEXT PRIMARY KEY, embedding float[512]);
  `);

  _initialized = true;
}

// ─── Signal Detection ─────────────────────────────────────────────

const SIGNALS = {
  mistake: {
    ar: ['غلطة', 'نسيت', 'خطأ', 'غلط', 'ما انتبهت', 'ما لاحظت', 'كان لازم', 'المفروض'],
    en: ['mistake', 'forgot', 'error', 'wrong', 'should have', 'shouldn\'t have', 'messed up', 'failed to', 'missed'],
    weight: 0.7,
  },
  success: {
    ar: ['اتعلمت', 'نجحت', 'زبط', 'ممتاز', 'الحل', 'اشتغل'],
    en: ['learned', 'succeeded', 'worked', 'solved', 'fixed', 'improvement', 'better now'],
    weight: 0.6,
  },
  preference: {
    ar: ['أفضل', 'أحب', 'بكره', 'ما أبي', 'دايماً', 'عادةً'],
    en: ['prefer', 'always', 'never', 'like to', 'hate', 'usually', 'my way'],
    weight: 0.5,
  },
  workflow: {
    ar: ['الخطوات', 'الطريقة', 'العملية', 'أول شي', 'بعدين', 'المرة الجاية'],
    en: ['steps', 'process', 'workflow', 'first', 'then', 'next time', 'procedure'],
    weight: 0.5,
  },
};

const LESSON_SIGNALS = {
  ar: ['الدرس', 'المرة الجاية', 'لازم', 'المفروض', 'القاعدة', 'دايماً'],
  en: ['lesson', 'next time', 'rule', 'must', 'always', 'from now on', 'remember to'],
};

/**
 * Detect if text contains a pattern signal (mistake, lesson, etc.)
 * Returns: { type, trigger, lesson, confidence } or null
 */
export function detectPattern(text) {
  if (!text || typeof text !== 'string') return null;
  const lower = text.toLowerCase();

  let bestType = null;
  let bestScore = 0;

  for (const [type, signals] of Object.entries(SIGNALS)) {
    let matchCount = 0;
    for (const signal of [...signals.ar, ...signals.en]) {
      if (lower.includes(signal.toLowerCase())) matchCount++;
    }
    if (matchCount > 0) {
      const score = matchCount * signals.weight;
      if (score > bestScore) {
        bestScore = score;
        bestType = type;
      }
    }
  }

  if (!bestType) return null;

  // Check for lesson signals to boost confidence
  let hasLesson = false;
  for (const signal of [...LESSON_SIGNALS.ar, ...LESSON_SIGNALS.en]) {
    if (lower.includes(signal.toLowerCase())) {
      hasLesson = true;
      break;
    }
  }

  const confidence = Math.min(0.9, 0.4 + bestScore * 0.15 + (hasLesson ? 0.15 : 0));

  return {
    type: bestType,
    trigger: text.substring(0, 200),
    lesson: text.substring(0, 500),
    confidence,
  };
}

// ─── Record Episode ───────────────────────────────────────────────

/**
 * Record an episode pattern. If similar exists, increment count & boost confidence.
 * @param {Object} pattern - { type, trigger, lesson, action?, tags?, confidence?, related_memories? }
 * @returns {Object} - { action: 'created'|'updated', pattern }
 */
export async function recordEpisode(pattern) {
  initEpisodeSchema();
  const db = getDb();
  setCacheDb(db);
  const now = new Date().toISOString();

  // Check for similar existing patterns via embedding
  let similar = null;
  try {
    const triggerEmb = await embed(pattern.trigger);
    const triggerBuf = embeddingToBuffer(triggerEmb);

    // Search existing episode embeddings
    const rows = db.prepare(`
      SELECT episode_id, distance
      FROM episode_embeddings
      WHERE embedding MATCH ?
      AND k = 3
    `).all(triggerBuf);

    if (rows.length > 0) {
      // distance is L2; convert to rough similarity (lower = more similar)
      const closest = rows[0];
      // For normalized 512-dim vectors, L2 < ~0.8 is quite similar
      if (closest.distance < 1.0) {
        const existing = db.prepare('SELECT * FROM episode_patterns WHERE id = ? AND status = ?').get(closest.episode_id, 'active');
        if (existing) similar = existing;
      }
    }
  } catch (e) {
    // If embedding fails, fall back to text matching
    const existing = db.prepare(`
      SELECT * FROM episode_patterns
      WHERE status = 'active' AND pattern_type = ?
      AND trigger_description LIKE ?
      LIMIT 1
    `).get(pattern.type, `%${pattern.trigger.substring(0, 50)}%`);
    if (existing) similar = existing;
  }

  if (similar) {
    // Update existing: boost confidence, increment count
    const newConfidence = Math.min(1.0, similar.confidence + 0.1);
    const newCount = similar.occurrence_count + 1;
    // Merge lessons if new lesson adds info
    const mergedLesson = similar.lesson === pattern.lesson
      ? similar.lesson
      : `${similar.lesson}\n---\n${pattern.lesson}`;

    db.prepare(`
      UPDATE episode_patterns
      SET occurrence_count = ?, confidence = ?, last_occurred = ?,
          lesson = ?, updated_at = ?
      WHERE id = ?
    `).run(newCount, newConfidence, now, mergedLesson, now, similar.id);

    const updated = db.prepare('SELECT * FROM episode_patterns WHERE id = ?').get(similar.id);
    return { action: 'updated', pattern: updated };
  }

  // Create new pattern
  const id = crypto.randomUUID();
  const conf = pattern.confidence ?? 0.5;
  const tags = pattern.tags ? (typeof pattern.tags === 'string' ? pattern.tags : JSON.stringify(pattern.tags)) : null;
  const relatedMemories = pattern.related_memories
    ? (typeof pattern.related_memories === 'string' ? pattern.related_memories : JSON.stringify(pattern.related_memories))
    : null;

  db.prepare(`
    INSERT INTO episode_patterns
      (id, pattern_type, trigger_description, lesson, action, occurrence_count,
       last_occurred, first_occurred, confidence, status, related_memories, tags,
       created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 'active', ?, ?, ?, ?)
  `).run(
    id, pattern.type, pattern.trigger, pattern.lesson,
    pattern.action || null, now, now, conf,
    relatedMemories, tags, now, now
  );

  // Store embedding for future similarity search
  try {
    const triggerEmb = await embed(pattern.trigger);
    const triggerBuf = embeddingToBuffer(triggerEmb);
    db.prepare('INSERT INTO episode_embeddings (episode_id, embedding) VALUES (?, ?)').run(id, triggerBuf);
  } catch (e) {
    // Non-fatal: pattern saved without embedding
  }

  const created = db.prepare('SELECT * FROM episode_patterns WHERE id = ?').get(id);
  return { action: 'created', pattern: created };
}

// ─── Find Similar Episodes ────────────────────────────────────────

/**
 * Find episode patterns similar to given context text.
 * @param {string} context - Current context/situation
 * @param {number} limit - Max results (default 5)
 * @returns {Array} - Patterns sorted by relevance * confidence
 */
export async function findSimilarEpisodes(context, limit = 5) {
  initEpisodeSchema();
  const db = getDb();
  setCacheDb(db);

  try {
    const contextEmb = await embed(context);
    const contextBuf = embeddingToBuffer(contextEmb);

    const rows = db.prepare(`
      SELECT ep.*, ee.distance
      FROM episode_embeddings ee
      JOIN episode_patterns ep ON ep.id = ee.episode_id
      WHERE ee.embedding MATCH ?
      AND k = ?
      AND ep.status = 'active'
    `).all(contextBuf, limit * 2);

    // Score = inverse distance * confidence
    const scored = rows.map(r => ({
      ...r,
      relevance: 1 / (1 + r.distance),
      score: (1 / (1 + r.distance)) * r.confidence,
    }));

    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, limit);
  } catch (e) {
    // Fallback: keyword search on trigger_description
    const words = context.split(/\s+/).filter(w => w.length > 3).slice(0, 5);
    if (words.length === 0) return [];

    const conditions = words.map(() => 'trigger_description LIKE ?').join(' OR ');
    const params = words.map(w => `%${w}%`);

    const rows = db.prepare(`
      SELECT * FROM episode_patterns
      WHERE status = 'active' AND (${conditions})
      ORDER BY confidence DESC, occurrence_count DESC
      LIMIT ?
    `).all(...params, limit);

    return rows.map(r => ({ ...r, relevance: 0.5, score: 0.5 * r.confidence }));
  }
}

// ─── Get Active Patterns ──────────────────────────────────────────

/**
 * List active episode patterns, optionally filtered by type.
 */
export function getActivePatterns(type = null) {
  initEpisodeSchema();
  const db = getDb();

  if (type) {
    return db.prepare(`
      SELECT * FROM episode_patterns
      WHERE status = 'active' AND pattern_type = ?
      ORDER BY confidence DESC, occurrence_count DESC
    `).all(type);
  }

  return db.prepare(`
    SELECT * FROM episode_patterns
    WHERE status = 'active'
    ORDER BY confidence DESC, occurrence_count DESC
  `).all();
}

// ─── Get Lessons for Context ──────────────────────────────────────

/**
 * Proactively find applicable lessons for a given context.
 * This is the key function for "before you act, check if there's a lesson."
 * @param {string} text - Current action context
 * @returns {Array} - Formatted lessons with confidence
 */
export async function getLessonsForContext(text) {
  const episodes = await findSimilarEpisodes(text, 5);

  if (episodes.length === 0) return [];

  // Only return high-confidence or frequently-occurring patterns
  const relevant = episodes.filter(e => e.confidence >= 0.5 || e.occurrence_count >= 2);

  return relevant.map(e => ({
    id: e.id,
    type: e.pattern_type,
    trigger: e.trigger_description,
    lesson: e.lesson,
    action: e.action,
    confidence: e.confidence,
    occurrences: e.occurrence_count,
    relevance: e.relevance,
    score: e.score,
    formatted: `⚠️ [${e.pattern_type}] (×${e.occurrence_count}, conf: ${(e.confidence * 100).toFixed(0)}%): ${e.lesson}`,
  }));
}

// ─── Update Pattern ───────────────────────────────────────────────

/**
 * Update a pattern's lesson, action, tags, etc.
 */
export function updatePattern(id, updates) {
  initEpisodeSchema();
  const db = getDb();
  const now = new Date().toISOString();

  const allowed = ['lesson', 'action', 'tags', 'pattern_type', 'trigger_description', 'confidence', 'status'];
  const sets = [];
  const vals = [];

  for (const [key, val] of Object.entries(updates)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = ?`);
      vals.push(typeof val === 'object' ? JSON.stringify(val) : val);
    }
  }

  if (sets.length === 0) return null;

  sets.push('updated_at = ?');
  vals.push(now);
  vals.push(id);

  db.prepare(`UPDATE episode_patterns SET ${sets.join(', ')} WHERE id = ?`).run(...vals);
  return db.prepare('SELECT * FROM episode_patterns WHERE id = ?').get(id);
}

// ─── Archive Pattern ──────────────────────────────────────────────

/**
 * Archive a pattern (soft-delete).
 */
export function archivePattern(id) {
  initEpisodeSchema();
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.prepare(`
    UPDATE episode_patterns SET status = 'archived', updated_at = ? WHERE id = ?
  `).run(now, id);

  if (result.changes === 0) return null;
  return db.prepare('SELECT * FROM episode_patterns WHERE id = ?').get(id);
}

// ─── Pattern Stats ────────────────────────────────────────────────

// ─── Pattern Categorization ───────────────────────────────

const CATEGORY_KEYWORDS = {
  communication: {
    keywords: ['كتبت', 'قلت', 'تنبيه', 'رد', 'رسالة', 'wrote', 'said', 'message', 'reply', 'notification', 'voice', 'تواصل'],
    sub: { tone: ['لهجة', 'tone', 'أسلوب'], clarity: ['واضح', 'clear', 'غامض'], timing: ['وقت الرد', 'response time'] },
  },
  technical: {
    keywords: ['كود', 'code', 'bug', 'error', 'deploy', 'server', 'API', 'سيرفر', 'database', 'قاعدة', 'upload', 'رفع', 'GitHub', 'path', 'مسار'],
    sub: { code: ['كود', 'code', 'script'], infra: ['server', 'deploy', 'hosting'], data: ['database', 'قاعدة', 'data'] },
  },
  process: {
    keywords: ['خطوات', 'steps', 'workflow', 'عملية', 'process', 'sub-agent', 'pipeline', 'مهمة', 'task'],
    sub: { workflow: ['workflow', 'pipeline'], delegation: ['sub-agent', 'تفويض'], planning: ['خطة', 'plan'] },
  },
  quality: {
    keywords: ['فحص', 'test', 'check', 'تأكد', 'verify', 'أرقام', 'numbers', 'مبالغ', 'دقة', 'accuracy', 'مفحوصة', 'مجربة'],
    sub: { testing: ['test', 'فحص', 'مجربة'], accuracy: ['أرقام', 'دقة', 'accuracy'], review: ['review', 'مراجعة'] },
  },
  timing: {
    keywords: ['وقت', 'time', 'متأخر', 'late', 'deadline', 'بسرعة', 'fast', 'تأخير', 'delay'],
    sub: { deadline: ['deadline', 'موعد'], speed: ['بسرعة', 'fast', 'slow'], scheduling: ['جدول', 'schedule'] },
  },
  client: {
    keywords: ['عميل', 'client', 'customer', 'محمد', 'Mohammed', 'طلب', 'request', 'مقصود', 'يبي'],
    sub: { expectations: ['توقعات', 'expectations'], requests: ['طلب', 'request'], satisfaction: ['راضي', 'satisfied'] },
  },
};

/**
 * Categorize a pattern with category and sub-category.
 * @param {Object} pattern - Episode pattern
 * @returns {Object} - Enriched pattern with category, subCategory
 */
export function categorizePattern(pattern) {
  const text = `${pattern.trigger_description || pattern.trigger || ''} ${pattern.lesson || ''}`.toLowerCase();
  
  let bestCategory = 'general';
  let bestScore = 0;
  let bestSub = null;
  
  for (const [category, { keywords, sub }] of Object.entries(CATEGORY_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw.toLowerCase())) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      bestCategory = category;
      // Find sub-category
      bestSub = null;
      for (const [subName, subKeywords] of Object.entries(sub)) {
        if (subKeywords.some(sk => text.includes(sk.toLowerCase()))) {
          bestSub = subName;
          break;
        }
      }
    }
  }
  
  return { ...pattern, category: bestCategory, subCategory: bestSub };
}

// ─── Pattern Chains ───────────────────────────────────────

/**
 * Find linked patterns that show learning progression.
 * @returns {Array<Array<Object>>} - Chains of related patterns
 */
export function getPatternChains() {
  initEpisodeSchema();
  const db = getDb();
  
  const patterns = db.prepare(`
    SELECT * FROM episode_patterns WHERE status = 'active'
    ORDER BY first_occurred ASC
  `).all();
  
  if (patterns.length < 2) return [];
  
  // Find chains by overlapping keywords in triggers/lessons
  const chains = [];
  const used = new Set();
  
  for (let i = 0; i < patterns.length; i++) {
    if (used.has(patterns[i].id)) continue;
    
    const chain = [patterns[i]];
    used.add(patterns[i].id);
    
    const iTokens = new Set(
      `${patterns[i].trigger_description} ${patterns[i].lesson}`
        .toLowerCase().split(/\s+/).filter(t => t.length > 3)
    );
    
    for (let j = i + 1; j < patterns.length; j++) {
      if (used.has(patterns[j].id)) continue;
      
      const jTokens = `${patterns[j].trigger_description} ${patterns[j].lesson}`
        .toLowerCase().split(/\s+/).filter(t => t.length > 3);
      
      const overlap = jTokens.filter(t => iTokens.has(t)).length;
      if (overlap >= 2) {
        chain.push(patterns[j]);
        used.add(patterns[j].id);
        // Add j's tokens for transitive chaining
        jTokens.forEach(t => iTokens.add(t));
      }
    }
    
    if (chain.length >= 2) {
      chains.push(chain.map(p => categorizePattern(p)));
    }
  }
  
  return chains;
}

// ─── Learning Report ──────────────────────────────────────

/**
 * Generate a comprehensive learning analysis report.
 * @returns {Object}
 */
export function generateLearningReport() {
  initEpisodeSchema();
  const db = getDb();
  
  const patterns = db.prepare(`SELECT * FROM episode_patterns WHERE status = 'active'`).all();
  const archived = db.prepare(`SELECT COUNT(*) as c FROM episode_patterns WHERE status = 'archived'`).get().c;
  
  // By type
  const byType = {};
  for (const p of patterns) {
    byType[p.pattern_type] = (byType[p.pattern_type] || 0) + 1;
  }
  
  // By category
  const byCategory = {};
  const categorized = patterns.map(p => categorizePattern(p));
  for (const p of categorized) {
    byCategory[p.category] = (byCategory[p.category] || 0) + 1;
  }
  
  // Most repeated mistakes
  const topMistakes = patterns
    .filter(p => p.pattern_type === 'mistake')
    .sort((a, b) => b.occurrence_count - a.occurrence_count)
    .slice(0, 5);
  
  // Confidence distribution
  const confidenceDist = {
    veryHigh: patterns.filter(p => p.confidence >= 0.9).length,
    high: patterns.filter(p => p.confidence >= 0.7 && p.confidence < 0.9).length,
    medium: patterns.filter(p => p.confidence >= 0.5 && p.confidence < 0.7).length,
    low: patterns.filter(p => p.confidence < 0.5).length,
  };
  
  // Learning progression timeline
  const timeline = patterns
    .filter(p => p.first_occurred)
    .sort((a, b) => new Date(a.first_occurred) - new Date(b.first_occurred))
    .map(p => ({
      date: p.first_occurred?.substring(0, 10),
      type: p.pattern_type,
      trigger: (p.trigger_description || '').substring(0, 60),
      confidence: p.confidence,
    }));
  
  // Chains
  const chains = getPatternChains();
  
  // Suggested rules
  const suggestedRules = suggestRulesFromPatterns(0.7);
  
  return {
    summary: {
      totalActive: patterns.length,
      totalArchived: archived,
      totalAll: patterns.length + archived,
    },
    byType,
    byCategory,
    topMistakes,
    confidenceDist,
    timeline,
    chains: chains.length,
    suggestedRules: suggestedRules.length,
  };
}

// ─── Suggest Rules ────────────────────────────────────────

/**
 * Suggest SOUL.md rules based on high-confidence patterns.
 * @param {number} minConfidence
 * @returns {Array<{rule: string, source: Object}>}
 */
export function suggestRulesFromPatterns(minConfidence = 0.7) {
  initEpisodeSchema();
  const db = getDb();
  
  const patterns = db.prepare(`
    SELECT * FROM episode_patterns
    WHERE status = 'active' AND confidence >= ?
    ORDER BY confidence DESC, occurrence_count DESC
  `).all(minConfidence);
  
  return patterns.map(p => {
    const cat = categorizePattern(p);
    const rule = formatAsRule(p);
    return {
      rule,
      category: cat.category,
      subCategory: cat.subCategory,
      confidence: p.confidence,
      occurrences: p.occurrence_count,
      patternId: p.id,
      trigger: p.trigger_description,
    };
  });
}

function formatAsRule(pattern) {
  // Try to extract a clean rule from the lesson
  let lesson = pattern.lesson || '';
  
  // If lesson has multiple lines (merged), take the first
  if (lesson.includes('\n---\n')) {
    lesson = lesson.split('\n---\n')[0];
  }
  
  // Clean up
  lesson = lesson.trim();
  if (lesson.length > 150) lesson = lesson.substring(0, 147) + '...';
  
  const typeEmoji = {
    mistake: '⛔',
    success: '✅',
    preference: '🎯',
    workflow: '📋',
  };
  
  const emoji = typeEmoji[pattern.pattern_type] || '📌';
  return `${emoji} ${lesson}`;
}

// ─── Decay Patterns ───────────────────────────────────────

/**
 * Decay old patterns: reduce confidence for stale ones, archive very low ones.
 * @param {number} days - Days of inactivity threshold
 * @returns {Object} - { decayed, archived, protected }
 */
export function decayPatterns(days = 90) {
  initEpisodeSchema();
  const db = getDb();
  const now = new Date();
  const cutoff = new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
  const nowStr = now.toISOString();
  
  const stalePatterns = db.prepare(`
    SELECT * FROM episode_patterns
    WHERE status = 'active'
    AND (last_occurred < ? OR last_occurred IS NULL)
  `).all(cutoff);
  
  let decayed = 0;
  let archived = 0;
  let protected_ = 0;
  
  for (const p of stalePatterns) {
    // Protect important patterns
    if (p.occurrence_count > 5) {
      protected_++;
      continue;
    }
    
    const newConfidence = Math.max(0, p.confidence - 0.15);
    
    if (newConfidence < 0.1) {
      // Archive
      db.prepare(`UPDATE episode_patterns SET status = 'archived', confidence = ?, updated_at = ? WHERE id = ?`)
        .run(newConfidence, nowStr, p.id);
      archived++;
    } else {
      // Just reduce confidence
      db.prepare(`UPDATE episode_patterns SET confidence = ?, updated_at = ? WHERE id = ?`)
        .run(newConfidence, nowStr, p.id);
      decayed++;
    }
  }
  
  return { decayed, archived, protected: protected_, totalChecked: stalePatterns.length };
}

// ─── Seed Patterns ────────────────────────────────────────

/**
 * Seed new patterns from today's learnings.
 */
export async function seedTodayPatterns() {
  const seeds = [
    {
      type: 'mistake',
      trigger: 'اقترحت أداة (ctx-zip) بدون فحص فعلي',
      lesson: 'كل أداة تُذكر في تقرير = مفحوصة ومجربة',
      action: 'فحص كل أداة قبل ذكرها في أي تقرير أو توصية',
      tags: 'quality,tools,reporting',
    },
    {
      type: 'mistake',
      trigger: 'الصفحة اتحدثت محلياً بدون رفع Supabase',
      lesson: 'sub-agents لازم يرفعوا على Supabase كجزء من المهمة',
      action: 'أضف "رفع على Supabase" كخطوة إلزامية في مهام sub-agents',
      tags: 'process,supabase,sub-agents',
    },
    {
      type: 'mistake',
      trigger: 'أرقام Radar مبالغ فيها',
      lesson: 'الأرقام تُبنى على اختبارات فعلية مش تقديرات',
      action: 'اختبر قبل ما تعطي أرقام — أي رقم في تقرير لازم يكون مبني على benchmark فعلي',
      tags: 'quality,accuracy,reporting',
    },
    {
      type: 'mistake',
      trigger: 'كتبت voice.pyramedia.info واقع وهو محمد مسحه',
      lesson: 'تأكد من السياق قبل التنبيه — ممكن يكون مقصود',
      action: 'قبل ما تنبه عن مشكلة، تأكد إنها فعلاً مشكلة وليست قرار مقصود',
      tags: 'communication,context,client',
    },
    {
      type: 'mistake',
      trigger: 'بحث GitHub بـ crawl4ai رجع صفحات login',
      lesson: 'GitHub search يحتاج authentication — استخدم raw.githubusercontent.com أو web_fetch',
      action: 'استخدم raw.githubusercontent.com مباشرة أو web_fetch بدل GitHub search',
      tags: 'technical,github,tools',
    },
  ];
  
  const results = [];
  for (const seed of seeds) {
    const result = await recordEpisode(seed);
    results.push(result);
  }
  return results;
}

/**
 * Get summary statistics for episode patterns.
 */
export function getPatternStats() {
  initEpisodeSchema();
  const db = getDb();

  const total = db.prepare('SELECT COUNT(*) as count FROM episode_patterns').get().count;
  const active = db.prepare("SELECT COUNT(*) as count FROM episode_patterns WHERE status = 'active'").get().count;
  const archived = db.prepare("SELECT COUNT(*) as count FROM episode_patterns WHERE status = 'archived'").get().count;

  const byType = db.prepare(`
    SELECT pattern_type, COUNT(*) as count
    FROM episode_patterns WHERE status = 'active'
    GROUP BY pattern_type ORDER BY count DESC
  `).all();

  const byConfidence = {
    high: db.prepare("SELECT COUNT(*) as count FROM episode_patterns WHERE status = 'active' AND confidence >= 0.8").get().count,
    medium: db.prepare("SELECT COUNT(*) as count FROM episode_patterns WHERE status = 'active' AND confidence >= 0.5 AND confidence < 0.8").get().count,
    low: db.prepare("SELECT COUNT(*) as count FROM episode_patterns WHERE status = 'active' AND confidence < 0.5").get().count,
  };

  const topPatterns = db.prepare(`
    SELECT * FROM episode_patterns
    WHERE status = 'active'
    ORDER BY occurrence_count DESC, confidence DESC
    LIMIT 5
  `).all();

  return { total, active, archived, byType, byConfidence, topPatterns };
}
