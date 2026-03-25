#!/usr/bin/env node
/**
 * Content A/B Testing System — Pyramedia
 * Generate variations, score content, compare, and learn winning patterns.
 * 
 * CLI:
 *   node ab-testing.mjs score "content text"
 *   node ab-testing.mjs compare "v1" "v2" "v3"
 *   node ab-testing.mjs variations "content" [--count 3]
 *   node ab-testing.mjs patterns [--limit 10]
 *   node ab-testing.mjs track <contentId> <variationName> <scoresJson> [--winner]
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from '../memory/node_modules/openai/index.mjs';
import { getDb, closeDb } from '../memory/db.mjs';

// ─── Config ──────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveApiKey() {
  if (process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  try {
    const env = readFileSync('/home/node/.openclaw/credentials/pyra-voice.env', 'utf8');
    const m = env.match(/^OPENAI_API_KEY=(.+)$/m);
    if (m) return m[1].trim();
  } catch {}
  throw new Error('OPENAI_API_KEY not found');
}

const openai = new OpenAI({ apiKey: resolveApiKey() });
const MODEL = process.env.AB_TEST_MODEL || 'gpt-4o-mini';

// ─── DB Setup ────────────────────────────────────────────────────

function ensureTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS content_ab_tests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id TEXT NOT NULL,
      variation_name TEXT NOT NULL,
      scores_json TEXT,
      winner INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ab_content_id ON content_ab_tests(content_id)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_ab_winner ON content_ab_tests(winner)`);
  return db;
}

// ─── LLM Helper ──────────────────────────────────────────────────

async function askLLM(systemPrompt, userPrompt, jsonMode = true) {
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    ...(jsonMode ? { response_format: { type: 'json_object' } } : {})
  });
  const text = res.choices[0].message.content.trim();
  if (jsonMode) {
    try { return JSON.parse(text); }
    catch { return { raw: text }; }
  }
  return text;
}

// ─── Core Functions ──────────────────────────────────────────────

/**
 * Generate N variations of content across multiple dimensions.
 */
export async function generateVariations(content, count = 3, dimensions = null) {
  const dims = dimensions || ['tone', 'hook', 'length', 'cta'];
  
  const system = `You are a creative marketing expert specializing in UAE/Dubai market content.
Generate ${count} variations of the given content. For each variation, modify across these dimensions: ${dims.join(', ')}.

Dimension options:
- tone: formal, casual, provocative, inspirational, humorous
- hook: question, statistic, story, controversy, bold claim
- length: short (under 50 words), medium (50-150 words), long (150+ words)  
- cta: direct ("Buy now"), subtle ("Learn more"), urgent ("Limited time")

Return JSON: {"variations": [{"variation": "text", "changes_made": {"tone": "casual", ...}, "rationale": "why this works"}]}`;

  return askLLM(system, `Original content:\n\n${content}`);
}

/**
 * Score content across multiple criteria (1-10 each).
 */
export async function scoreContent(content, criteria = null) {
  const defaultCriteria = [
    'clarity', 'persuasiveness', 'originality', 'emotional_impact',
    'cultural_fit_uae', 'call_to_action', 'readability'
  ];
  const activeCriteria = criteria || defaultCriteria;

  const system = `You are a content quality evaluator with deep expertise in UAE/Dubai marketing.
Score the given content on each criterion from 1-10. Be critical but fair.

Criteria to evaluate: ${activeCriteria.join(', ')}

For cultural_fit_uae, consider:
- UAE audience sensibilities and values
- Arabic/English bilingual market norms
- Dubai luxury vs mass market positioning
- Regional cultural references and tone

Return JSON:
{
  "scores": {"criterion_name": {"score": 8, "reasoning": "why"}},
  "total": 56,
  "max_possible": 70,
  "strengths": ["str1", "str2"],
  "weaknesses": ["weak1", "weak2"]
}`;

  return askLLM(system, `Content to evaluate:\n\n${content}`);
}

/**
 * Compare multiple variations and rank them.
 */
export async function compareVariations(variations) {
  const numbered = variations.map((v, i) => `--- Variation ${i + 1} ---\n${v}`).join('\n\n');

  const system = `You are a content strategist for UAE/Dubai marketing.
Compare the given content variations and rank them. Score each on:
clarity, persuasiveness, originality, emotional_impact, cultural_fit_uae, call_to_action, readability (1-10 each).

Return JSON:
{
  "rankings": [
    {"rank": 1, "variation_index": 0, "total_score": 58, "scores": {...}, "why_winner": "reason"}
  ],
  "winner": {"index": 0, "key_advantage": "what makes it best"},
  "recommendations": ["suggestion to improve further"]
}`;

  return askLLM(system, `Compare these variations:\n\n${numbered}`);
}

/**
 * Track A/B test results in the database.
 */
export function trackResults(contentId, variationName, scoresJson, winner = false) {
  const db = ensureTable();
  const stmt = db.prepare(`
    INSERT INTO content_ab_tests (content_id, variation_name, scores_json, winner)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(contentId, variationName, 
    typeof scoresJson === 'string' ? scoresJson : JSON.stringify(scoresJson),
    winner ? 1 : 0
  );
  return { id: result.lastInsertRowid, contentId, variationName, winner };
}

/**
 * Analyze past winners to identify winning patterns.
 */
export async function getWinningPatterns(limit = 10) {
  const db = ensureTable();
  
  // Get recent winners
  const winners = db.prepare(`
    SELECT * FROM content_ab_tests 
    WHERE winner = 1 
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(limit);

  // Get all recent tests for context
  const allTests = db.prepare(`
    SELECT * FROM content_ab_tests 
    ORDER BY created_at DESC 
    LIMIT ?
  `).all(limit * 3);

  if (winners.length === 0 && allTests.length === 0) {
    return {
      message: 'No A/B test data yet. Run some comparisons and track results first.',
      winners: 0,
      total_tests: 0
    };
  }

  // Parse scores for analysis
  const winnerScores = winners.map(w => {
    try { return { name: w.variation_name, scores: JSON.parse(w.scores_json) }; }
    catch { return { name: w.variation_name, scores: null }; }
  }).filter(w => w.scores);

  if (winnerScores.length === 0) {
    return {
      message: 'Tests tracked but no scored winners yet.',
      winners: winners.length,
      total_tests: allTests.length,
      recent_tests: allTests.slice(0, 5).map(t => ({
        content_id: t.content_id,
        variation: t.variation_name,
        winner: !!t.winner,
        date: t.created_at
      }))
    };
  }

  // Ask LLM to find patterns
  const system = `You are a marketing analyst for UAE/Dubai content.
Analyze the winning content variations and their scores to identify patterns.

Return JSON:
{
  "patterns": {
    "winning_hooks": ["what hook styles win most"],
    "winning_tones": ["what tones work for UAE audience"],
    "winning_cta": ["what CTA styles convert"],
    "key_insights": ["other patterns noticed"]
  },
  "recommendations": ["actionable advice based on data"],
  "sample_size": N,
  "confidence": "low|medium|high"
}`;

  return askLLM(system, `Winner data:\n${JSON.stringify(winnerScores, null, 2)}`);
}

// ─── CLI ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`Usage:
  node ab-testing.mjs score "content text"
  node ab-testing.mjs compare "v1" "v2" "v3"
  node ab-testing.mjs variations "content" [--count 3]
  node ab-testing.mjs track <contentId> <variationName> <scoresJson> [--winner]
  node ab-testing.mjs patterns [--limit 10]`);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'score': {
        const content = args[1];
        if (!content) { console.error('Usage: node ab-testing.mjs score "content"'); process.exit(1); }
        const result = await scoreContent(content);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'compare': {
        const variations = args.slice(1);
        if (variations.length < 2) { console.error('Need at least 2 variations to compare'); process.exit(1); }
        const result = await compareVariations(variations);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'variations': {
        const content = args[1];
        if (!content) { console.error('Usage: node ab-testing.mjs variations "content" [--count N]'); process.exit(1); }
        const countIdx = args.indexOf('--count');
        const count = countIdx > -1 ? parseInt(args[countIdx + 1]) || 3 : 3;
        const result = await generateVariations(content, count);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'track': {
        const [, contentId, variationName, scoresJson] = args;
        if (!contentId || !variationName) {
          console.error('Usage: node ab-testing.mjs track <contentId> <variationName> <scoresJson> [--winner]');
          process.exit(1);
        }
        const winner = args.includes('--winner');
        const result = trackResults(contentId, variationName, scoresJson || '{}', winner);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'patterns': {
        const limitIdx = args.indexOf('--limit');
        const limit = limitIdx > -1 ? parseInt(args[limitIdx + 1]) || 10 : 10;
        const result = await getWinningPatterns(limit);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        process.exit(1);
    }
  } finally {
    closeDb();
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  closeDb();
  process.exit(1);
});
