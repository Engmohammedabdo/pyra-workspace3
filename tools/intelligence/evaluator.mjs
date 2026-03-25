#!/usr/bin/env node
/**
 * Evaluator-Optimizer Pattern — Pyramedia
 * Second-pass quality checker for ANY output: content, code, reports, etc.
 * 
 * CLI:
 *   node evaluator.mjs check "output text"
 *   node evaluator.mjs evaluate "output" --task "task description"
 *   node evaluator.mjs code /path/to/file.mjs
 *   node evaluator.mjs report "report text"
 *   node evaluator.mjs optimize "output" --evaluation '{"issues":["..."]}'
 *   node evaluator.mjs history [--days 7]
 */

import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import OpenAI from '../memory/node_modules/openai/index.mjs';
import { getDb, closeDb } from '../memory/db.mjs';

// ─── Config ──────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const THRESHOLD = 7; // minimum average score to pass

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
const MODEL = process.env.EVALUATOR_MODEL || 'gpt-4o-mini';

// ─── DB Setup ────────────────────────────────────────────────────

function ensureTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      eval_type TEXT NOT NULL,
      input_preview TEXT,
      task_description TEXT,
      scores_json TEXT,
      overall_score REAL,
      passed INTEGER DEFAULT 0,
      issues_json TEXT,
      suggestions_json TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_type ON evaluations(eval_type)`);
  db.exec(`CREATE INDEX IF NOT EXISTS idx_eval_created ON evaluations(created_at)`);
  return db;
}

function saveEvaluation(evalType, inputPreview, taskDesc, result) {
  const db = ensureTable();
  const scores = result.scores || result.quality_score || null;
  const overall = result.overall || result.quality_score || 0;
  const passed = (result.passesThreshold ?? (overall >= THRESHOLD)) ? 1 : 0;
  
  db.prepare(`
    INSERT INTO evaluations (eval_type, input_preview, task_description, scores_json, overall_score, passed, issues_json, suggestions_json)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    evalType,
    (inputPreview || '').slice(0, 200),
    taskDesc || null,
    JSON.stringify(scores),
    overall,
    passed,
    JSON.stringify(result.issues || []),
    JSON.stringify(result.suggestions || [])
  );
}

// ─── LLM Helper ──────────────────────────────────────────────────

async function askLLM(systemPrompt, userPrompt) {
  const res = await openai.chat.completions.create({
    model: MODEL,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    response_format: { type: 'json_object' }
  });
  const text = res.choices[0].message.content.trim();
  try { return JSON.parse(text); }
  catch { return { raw: text }; }
}

// ─── Core Functions ──────────────────────────────────────────────

/**
 * Evaluate any output against criteria.
 */
export async function evaluate(output, taskDescription = '', criteria = null) {
  const defaultCriteria = ['accuracy', 'completeness', 'clarity', 'relevance', 'quality'];
  const activeCriteria = criteria || defaultCriteria;

  const system = `You are a quality evaluator. Critically assess the given output.
${taskDescription ? `The task was: "${taskDescription}"` : ''}

Score each criterion 1-10. Be strict — 7 is "good", 10 is "exceptional".
Criteria: ${activeCriteria.join(', ')}

Return JSON:
{
  "scores": {"criterion": {"score": N, "reasoning": "why"}},
  "overall": N.N,
  "issues": ["specific problems found"],
  "suggestions": ["specific improvements"],
  "passesThreshold": true/false (average >= ${THRESHOLD})
}`;

  const result = await askLLM(system, `Output to evaluate:\n\n${output}`);
  saveEvaluation('general', output, taskDescription, result);
  return result;
}

/**
 * Generate optimization plan from evaluation feedback.
 */
export async function optimize(output, evaluation) {
  const evalStr = typeof evaluation === 'string' ? evaluation : JSON.stringify(evaluation);

  const system = `You are an optimization expert. Given output and its evaluation feedback,
create a specific, actionable improvement plan.

Return JSON:
{
  "improvements": [
    {"what": "specific change", "why": "addresses which issue", "how": "exact instructions", "priority": "high|medium|low"}
  ],
  "priority_order": [0, 1, 2],
  "estimated_effort": "quick fix|moderate|significant rework",
  "improved_version": "if possible, provide the improved output"
}`;

  return askLLM(system, `Original output:\n${output}\n\nEvaluation:\n${evalStr}`);
}

/**
 * Evaluate code quality.
 */
export async function evaluateCode(code, language = 'javascript') {
  const system = `You are a senior ${language} code reviewer. Evaluate the code critically.

Check for:
- Syntax validity
- Error handling (try/catch, edge cases)
- Edge cases and boundary conditions
- Code style and consistency
- Documentation (comments, JSDoc)
- Security issues (injection, path traversal, etc.)
- Performance concerns
- Best practices for ${language}

Return JSON:
{
  "issues": [{"severity": "error|warning|info", "line": "~N", "description": "what's wrong", "fix": "how to fix"}],
  "suggestions": ["improvement ideas"],
  "quality_score": N,
  "summary": "brief overall assessment"
}`;

  const result = await askLLM(system, `\`\`\`${language}\n${code}\n\`\`\``);
  saveEvaluation('code', code.slice(0, 200), `${language} code review`, result);
  return result;
}

/**
 * Evaluate a report (marketing, analytics, etc.).
 */
export async function evaluateReport(report) {
  const system = `You are a report quality assessor for a Dubai/UAE marketing agency.

Check for:
- Structure: clear sections, logical flow, executive summary
- Data accuracy: numbers make sense, no contradictions
- Arabic quality: if Arabic text present, check grammar/formality
- Formatting: consistent headers, tables, bullet points
- Completeness: covers all expected sections
- Actionability: clear recommendations and next steps

Expected sections for marketing reports:
- Executive summary / overview
- Key metrics / KPIs
- Analysis / findings
- Recommendations
- Next steps / action items

Return JSON:
{
  "issues": [{"section": "where", "severity": "error|warning|info", "description": "what's wrong"}],
  "missing_sections": ["sections that should be included"],
  "quality_score": N,
  "arabic_quality": "good|needs_review|not_applicable",
  "summary": "brief overall assessment"
}`;

  const result = await askLLM(system, `Report to evaluate:\n\n${report}`);
  saveEvaluation('report', report.slice(0, 200), 'report evaluation', result);
  return result;
}

/**
 * Quick binary pass/fail check — no LLM needed for basic checks.
 */
export function quickCheck(output) {
  const issues = [];

  // Empty or too short
  if (!output || output.trim().length === 0) {
    return { pass: false, reason: 'Output is empty' };
  }
  if (output.trim().length < 10) {
    issues.push('Output is very short (< 10 chars)');
  }

  // Internal paths leaked
  const internalPaths = ['/home/node/', '/tmp/', 'file://', '~/.openclaw'];
  for (const p of internalPaths) {
    if (output.includes(p)) {
      issues.push(`Contains internal path: ${p}`);
    }
  }

  // API keys or secrets
  const secretPatterns = [/sk-[a-zA-Z0-9]{20,}/, /api[_-]?key\s*[:=]\s*[a-zA-Z0-9]{10,}/i, /Bearer\s+[a-zA-Z0-9._-]{20,}/];
  for (const pat of secretPatterns) {
    if (pat.test(output)) {
      issues.push('May contain API key or secret');
    }
  }

  // Obvious errors
  const errorPatterns = [/undefined/i, /\[object Object\]/, /NaN/, /null.*null.*null/];
  for (const pat of errorPatterns) {
    if (pat.test(output)) {
      issues.push(`Contains suspicious pattern: ${pat.source}`);
    }
  }

  // Placeholder text
  const placeholders = ['TODO', 'FIXME', 'XXX', 'PLACEHOLDER', '[INSERT', '{REPLACE'];
  for (const ph of placeholders) {
    if (output.toUpperCase().includes(ph)) {
      issues.push(`Contains placeholder: ${ph}`);
    }
  }

  if (issues.length > 0) {
    return { pass: false, reason: issues.join('; ') };
  }

  return { pass: true, reason: 'Basic checks passed' };
}

/**
 * Get evaluation history with trends.
 */
export function getEvaluationHistory(days = 7) {
  const db = ensureTable();
  
  const rows = db.prepare(`
    SELECT * FROM evaluations
    WHERE created_at >= datetime('now', '-' || ? || ' days')
    ORDER BY created_at DESC
  `).all(days);

  if (rows.length === 0) {
    return { message: 'No evaluations in this period.', days, count: 0 };
  }

  const byType = {};
  let totalScore = 0;
  let passCount = 0;

  for (const row of rows) {
    if (!byType[row.eval_type]) byType[row.eval_type] = { count: 0, avgScore: 0, passed: 0, total: 0 };
    byType[row.eval_type].count++;
    byType[row.eval_type].total += row.overall_score || 0;
    if (row.passed) byType[row.eval_type].passed++;
    totalScore += row.overall_score || 0;
    if (row.passed) passCount++;
  }

  for (const type in byType) {
    byType[type].avgScore = +(byType[type].total / byType[type].count).toFixed(1);
    byType[type].passRate = `${Math.round(byType[type].passed / byType[type].count * 100)}%`;
    delete byType[type].total;
  }

  return {
    days,
    total_evaluations: rows.length,
    average_score: +(totalScore / rows.length).toFixed(1),
    pass_rate: `${Math.round(passCount / rows.length * 100)}%`,
    by_type: byType,
    recent: rows.slice(0, 5).map(r => ({
      type: r.eval_type,
      score: r.overall_score,
      passed: !!r.passed,
      date: r.created_at,
      preview: r.input_preview?.slice(0, 80)
    }))
  };
}

// ─── CLI ─────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command) {
    console.log(`Usage:
  node evaluator.mjs check "output text"
  node evaluator.mjs evaluate "output" --task "task description"
  node evaluator.mjs code /path/to/file.mjs
  node evaluator.mjs report "report text"
  node evaluator.mjs optimize "output" --evaluation '{"issues":[...]}'
  node evaluator.mjs history [--days 7]`);
    process.exit(0);
  }

  try {
    switch (command) {
      case 'check': {
        const output = args[1];
        if (!output) { console.error('Usage: node evaluator.mjs check "output"'); process.exit(1); }
        const result = quickCheck(output);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'evaluate': {
        const output = args[1];
        if (!output) { console.error('Usage: node evaluator.mjs evaluate "output" --task "desc"'); process.exit(1); }
        const taskIdx = args.indexOf('--task');
        const task = taskIdx > -1 ? args[taskIdx + 1] : '';
        const result = await evaluate(output, task);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'code': {
        const filePath = args[1];
        if (!filePath) { console.error('Usage: node evaluator.mjs code /path/to/file'); process.exit(1); }
        if (!existsSync(filePath)) { console.error(`File not found: ${filePath}`); process.exit(1); }
        const code = readFileSync(filePath, 'utf8');
        const ext = extname(filePath).slice(1);
        const langMap = { mjs: 'javascript', js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash' };
        const lang = langMap[ext] || ext || 'javascript';
        const result = await evaluateCode(code, lang);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'report': {
        const report = args[1];
        if (!report) { console.error('Usage: node evaluator.mjs report "report text"'); process.exit(1); }
        const result = await evaluateReport(report);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'optimize': {
        const output = args[1];
        if (!output) { console.error('Usage: node evaluator.mjs optimize "output" --evaluation \'{}\''); process.exit(1); }
        const evalIdx = args.indexOf('--evaluation');
        const evalData = evalIdx > -1 ? args[evalIdx + 1] : '{"issues":["general improvement needed"]}';
        const result = await optimize(output, evalData);
        console.log(JSON.stringify(result, null, 2));
        break;
      }

      case 'history': {
        const daysIdx = args.indexOf('--days');
        const days = daysIdx > -1 ? parseInt(args[daysIdx + 1]) || 7 : 7;
        const result = getEvaluationHistory(days);
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
