#!/usr/bin/env node
/**
 * Reflexion Loop — Self-evaluation system for PyraAI
 * 
 * After completing a task, the agent evaluates its own performance
 * across multiple dimensions: accuracy, completeness, efficiency, creativity.
 * 
 * Usage:
 *   node reflexion.mjs reflect "task description" "what I did"
 *   node reflexion.mjs history [--days 7]
 *   node reflexion.mjs lessons "upcoming task"
 *   node reflexion.mjs trend [--days 30]
 *   node reflexion.mjs report
 */

import { getDb } from '../memory/db.mjs';

// ─── Table Setup ───────────────────────────────────────────

function ensureTable() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS reflexion_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task TEXT NOT NULL,
      output TEXT,
      context TEXT,
      scores_json TEXT NOT NULL,
      strengths TEXT,
      improvements TEXT,
      lessons TEXT,
      overall_score REAL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
    )
  `);
  return db;
}

// ─── Core Functions ────────────────────────────────────────

/**
 * Evaluate a completed task and produce a structured reflection.
 */
export function reflect(taskDescription, output, context = null) {
  const scores = evaluateTask(taskDescription, output, context);
  const overall = (scores.accuracy + scores.completeness + scores.efficiency + scores.creativity) / 4;

  const strengths = [];
  const improvements = [];

  if (scores.accuracy >= 8) strengths.push('High accuracy in task execution');
  if (scores.completeness >= 8) strengths.push('Thorough and complete output');
  if (scores.efficiency >= 8) strengths.push('Efficient use of resources and time');
  if (scores.creativity >= 8) strengths.push('Creative approach or solution');

  if (scores.accuracy < 6) improvements.push('Improve accuracy — double-check outputs');
  if (scores.completeness < 6) improvements.push('Ensure all requirements are addressed');
  if (scores.efficiency < 6) improvements.push('Optimize workflow — reduce unnecessary steps');
  if (scores.creativity < 6) improvements.push('Explore more creative approaches');

  // Derive lessons from the task
  const lessons = deriveLessons(taskDescription, output, scores);

  return {
    task: taskDescription,
    output: output || '',
    context: context || '',
    scores,
    overall,
    strengths,
    improvements,
    lessons,
    created_at: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
  };
}

/**
 * Heuristic scoring based on task and output characteristics.
 * In practice, an LLM call would do this — but for the CLI we use heuristics.
 */
function evaluateTask(task, output, context) {
  const outputLen = (output || '').length;
  const taskLen = (task || '').length;

  // Base scores
  let accuracy = 7;
  let completeness = 7;
  let efficiency = 7;
  let creativity = 6;

  // Output length relative to task complexity suggests completeness
  if (outputLen > taskLen * 3) completeness = Math.min(10, completeness + 2);
  if (outputLen > taskLen * 5) completeness = Math.min(10, completeness + 1);
  if (outputLen < taskLen) completeness = Math.max(3, completeness - 2);

  // Keywords suggesting quality
  const outputLower = (output || '').toLowerCase();
  if (outputLower.includes('error') || outputLower.includes('failed')) accuracy = Math.max(3, accuracy - 2);
  if (outputLower.includes('successfully') || outputLower.includes('complete')) accuracy = Math.min(10, accuracy + 1);
  if (outputLower.includes('optimized') || outputLower.includes('improved')) efficiency = Math.min(10, efficiency + 1);
  if (outputLower.includes('creative') || outputLower.includes('novel') || outputLower.includes('innovative')) creativity = Math.min(10, creativity + 2);

  // Context bonus
  if (context) {
    accuracy = Math.min(10, accuracy + 1);
  }

  return { accuracy, completeness, efficiency, creativity };
}

/**
 * Derive lessons learned from the task.
 */
function deriveLessons(task, output, scores) {
  const lessons = [];
  const taskLower = (task || '').toLowerCase();

  if (scores.accuracy < 6) lessons.push('Always validate outputs before delivering');
  if (scores.efficiency < 6) lessons.push('Plan before executing to avoid rework');
  if (taskLower.includes('email')) lessons.push('Email tasks benefit from templates and checklists');
  if (taskLower.includes('code') || taskLower.includes('script')) lessons.push('Code tasks: test incrementally, not all at once');
  if (taskLower.includes('research')) lessons.push('Research tasks: set time limits, prioritize sources');
  if (taskLower.includes('meeting') || taskLower.includes('brief')) lessons.push('Meeting prep: start with agenda, end with action items');

  if (lessons.length === 0) lessons.push('Task completed — maintain current approach');

  return lessons;
}

// ─── Persistence ───────────────────────────────────────────

/**
 * Save a reflection to the database.
 */
export function saveReflection(reflection) {
  const db = ensureTable();
  const stmt = db.prepare(`
    INSERT INTO reflexion_log (task, output, context, scores_json, strengths, improvements, lessons, overall_score, created_at)
    VALUES (@task, @output, @context, @scores_json, @strengths, @improvements, @lessons, @overall_score, @created_at)
  `);

  const result = stmt.run({
    task: reflection.task,
    output: reflection.output || '',
    context: reflection.context || '',
    scores_json: JSON.stringify(reflection.scores),
    strengths: JSON.stringify(reflection.strengths),
    improvements: JSON.stringify(reflection.improvements),
    lessons: JSON.stringify(reflection.lessons),
    overall_score: reflection.overall,
    created_at: reflection.created_at,
  });

  return { id: result.lastInsertRowid, ...reflection };
}

/**
 * Retrieve past reflections with optional filters.
 */
export function getReflections(options = {}) {
  const db = ensureTable();
  const conditions = [];
  const params = {};

  if (options.days) {
    conditions.push("created_at >= datetime('now', @daysAgo)");
    params.daysAgo = `-${options.days} days`;
  }
  if (options.since) {
    conditions.push('created_at >= @since');
    params.since = options.since;
  }
  if (options.minScore != null) {
    conditions.push('overall_score >= @minScore');
    params.minScore = options.minScore;
  }
  if (options.maxScore != null) {
    conditions.push('overall_score <= @maxScore');
    params.maxScore = options.maxScore;
  }
  if (options.taskType) {
    conditions.push('task LIKE @taskType');
    params.taskType = `%${options.taskType}%`;
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = options.limit || 50;

  return db.prepare(`SELECT * FROM reflexion_log ${where} ORDER BY created_at DESC LIMIT ${limit}`).all(params);
}

/**
 * Find relevant lessons from past reflections for an upcoming task.
 * Uses simple text matching (keyword overlap) as a lightweight alternative to vector similarity.
 */
export function getLessonsForTask(taskType) {
  const db = ensureTable();
  const rows = db.prepare(`
    SELECT task, lessons, overall_score, created_at FROM reflexion_log
    ORDER BY created_at DESC LIMIT 100
  `).all();

  const taskWords = new Set(taskType.toLowerCase().split(/\s+/).filter(w => w.length > 3));
  const scored = [];

  for (const row of rows) {
    const rowWords = new Set(row.task.toLowerCase().split(/\s+/).filter(w => w.length > 3));
    let overlap = 0;
    for (const w of taskWords) {
      if (rowWords.has(w)) overlap++;
    }
    if (overlap > 0) {
      scored.push({
        task: row.task,
        lessons: JSON.parse(row.lessons || '[]'),
        relevance: overlap / Math.max(taskWords.size, 1),
        score: row.overall_score,
        date: row.created_at,
      });
    }
  }

  scored.sort((a, b) => b.relevance - a.relevance);
  return scored.slice(0, 5);
}

/**
 * Get performance trends over time.
 */
export function getPerformanceTrend(days = 30) {
  const db = ensureTable();
  const rows = db.prepare(`
    SELECT 
      date(created_at) as day,
      COUNT(*) as tasks,
      AVG(overall_score) as avg_overall,
      AVG(json_extract(scores_json, '$.accuracy')) as avg_accuracy,
      AVG(json_extract(scores_json, '$.completeness')) as avg_completeness,
      AVG(json_extract(scores_json, '$.efficiency')) as avg_efficiency,
      AVG(json_extract(scores_json, '$.creativity')) as avg_creativity
    FROM reflexion_log
    WHERE created_at >= datetime('now', @daysAgo)
    GROUP BY date(created_at)
    ORDER BY day ASC
  `).all({ daysAgo: `-${days} days` });

  // Identify trends
  const trends = {};
  if (rows.length >= 2) {
    const first = rows[0];
    const last = rows[rows.length - 1];
    for (const dim of ['avg_accuracy', 'avg_completeness', 'avg_efficiency', 'avg_creativity']) {
      const diff = (last[dim] || 0) - (first[dim] || 0);
      const name = dim.replace('avg_', '');
      trends[name] = diff > 0.5 ? '📈 improving' : diff < -0.5 ? '📉 declining' : '➡️ stable';
    }
  }

  return { days: rows, trends };
}

/**
 * Generate a comprehensive self-evaluation report.
 */
export function generateSelfReport() {
  const db = ensureTable();
  
  const total = db.prepare('SELECT COUNT(*) as count FROM reflexion_log').get().count;
  if (total === 0) {
    return { summary: 'No reflections recorded yet.', total: 0 };
  }

  const overall = db.prepare(`
    SELECT 
      COUNT(*) as total,
      AVG(overall_score) as avg_overall,
      AVG(json_extract(scores_json, '$.accuracy')) as avg_accuracy,
      AVG(json_extract(scores_json, '$.completeness')) as avg_completeness,
      AVG(json_extract(scores_json, '$.efficiency')) as avg_efficiency,
      AVG(json_extract(scores_json, '$.creativity')) as avg_creativity,
      MIN(overall_score) as min_score,
      MAX(overall_score) as max_score
    FROM reflexion_log
  `).get();

  // Find top strengths (dimensions with highest avg)
  const dims = [
    { name: 'Accuracy', score: overall.avg_accuracy },
    { name: 'Completeness', score: overall.avg_completeness },
    { name: 'Efficiency', score: overall.avg_efficiency },
    { name: 'Creativity', score: overall.avg_creativity },
  ].sort((a, b) => b.score - a.score);

  const topStrengths = dims.slice(0, 2).map(d => `${d.name} (${d.score?.toFixed(1)})`);
  const focusAreas = dims.slice(-2).map(d => `${d.name} (${d.score?.toFixed(1)})`);

  // Recent lessons
  const recentLessons = db.prepare(`
    SELECT lessons FROM reflexion_log ORDER BY created_at DESC LIMIT 10
  `).all();

  const allLessons = [];
  for (const r of recentLessons) {
    try {
      allLessons.push(...JSON.parse(r.lessons || '[]'));
    } catch {}
  }
  const uniqueLessons = [...new Set(allLessons)].slice(0, 10);

  // Trend (last 30 days)
  const trend = getPerformanceTrend(30);

  return {
    total: overall.total,
    averageScore: overall.avg_overall?.toFixed(2),
    scoreRange: `${overall.min_score?.toFixed(1)} – ${overall.max_score?.toFixed(1)}`,
    dimensions: {
      accuracy: overall.avg_accuracy?.toFixed(2),
      completeness: overall.avg_completeness?.toFixed(2),
      efficiency: overall.avg_efficiency?.toFixed(2),
      creativity: overall.avg_creativity?.toFixed(2),
    },
    topStrengths,
    focusAreas,
    recentLessons: uniqueLessons,
    trends: trend.trends,
    summary: `Completed ${overall.total} reflections. Average score: ${overall.avg_overall?.toFixed(1)}/10. ` +
      `Top strengths: ${topStrengths.join(', ')}. Focus areas: ${focusAreas.join(', ')}.`,
  };
}

// ─── CLI ───────────────────────────────────────────────────

function printHelp() {
  console.log(`
Reflexion Loop — Self-evaluation CLI

Usage:
  node reflexion.mjs reflect "task description" "what I did"
  node reflexion.mjs history [--days 7]
  node reflexion.mjs lessons "upcoming task"
  node reflexion.mjs trend [--days 30]
  node reflexion.mjs report
  `);
}

function formatReflection(r) {
  const scores = typeof r.scores_json === 'string' ? JSON.parse(r.scores_json) : (r.scores || r.scores_json);
  const strengths = typeof r.strengths === 'string' ? JSON.parse(r.strengths) : r.strengths;
  const improvements = typeof r.improvements === 'string' ? JSON.parse(r.improvements) : r.improvements;
  const lessons = typeof r.lessons === 'string' ? JSON.parse(r.lessons) : r.lessons;
  const overall = r.overall_score ?? r.overall;

  return `
📝 Task: ${r.task}
📊 Overall: ${typeof overall === 'number' ? overall.toFixed(1) : overall}/10
   Accuracy: ${scores.accuracy}  Completeness: ${scores.completeness}  Efficiency: ${scores.efficiency}  Creativity: ${scores.creativity}
✅ Strengths: ${(strengths || []).join('; ') || 'N/A'}
🔧 Improvements: ${(improvements || []).join('; ') || 'N/A'}
💡 Lessons: ${(lessons || []).join('; ') || 'N/A'}
🕐 Date: ${r.created_at}
${'─'.repeat(60)}`;
}

async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd || cmd === 'help' || cmd === '--help') {
    printHelp();
    process.exit(0);
  }

  switch (cmd) {
    case 'reflect': {
      const task = args[1];
      const output = args[2] || '';
      if (!task) {
        console.error('Usage: node reflexion.mjs reflect "task" "output"');
        process.exit(1);
      }
      const reflection = reflect(task, output);
      const saved = saveReflection(reflection);
      console.log('✅ Reflection saved!');
      console.log(formatReflection(saved));
      break;
    }

    case 'history': {
      const daysIdx = args.indexOf('--days');
      const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1], 10) : 7;
      const reflections = getReflections({ days });
      if (reflections.length === 0) {
        console.log('No reflections found for the given period.');
      } else {
        console.log(`📋 Reflections (last ${days} days): ${reflections.length} entries\n`);
        for (const r of reflections) {
          console.log(formatReflection(r));
        }
      }
      break;
    }

    case 'lessons': {
      const taskType = args[1];
      if (!taskType) {
        console.error('Usage: node reflexion.mjs lessons "upcoming task description"');
        process.exit(1);
      }
      const results = getLessonsForTask(taskType);
      if (results.length === 0) {
        console.log('No relevant lessons found. Fresh territory! 🌟');
      } else {
        console.log(`🧠 Lessons for: "${taskType}"\n`);
        for (const r of results) {
          console.log(`  From: "${r.task}" (score: ${r.score?.toFixed(1)}, relevance: ${(r.relevance * 100).toFixed(0)}%)`);
          for (const l of r.lessons) {
            console.log(`    💡 ${l}`);
          }
        }
      }
      break;
    }

    case 'trend': {
      const daysIdx = args.indexOf('--days');
      const days = daysIdx >= 0 ? parseInt(args[daysIdx + 1], 10) : 30;
      const trend = getPerformanceTrend(days);
      if (trend.days.length === 0) {
        console.log('No data for trend analysis.');
      } else {
        console.log(`📈 Performance Trend (last ${days} days)\n`);
        for (const d of trend.days) {
          console.log(`  ${d.day}: ${d.tasks} tasks, avg ${d.avg_overall?.toFixed(1)} | A:${d.avg_accuracy?.toFixed(1)} C:${d.avg_completeness?.toFixed(1)} E:${d.avg_efficiency?.toFixed(1)} Cr:${d.avg_creativity?.toFixed(1)}`);
        }
        if (Object.keys(trend.trends).length > 0) {
          console.log('\n  Trends:');
          for (const [dim, direction] of Object.entries(trend.trends)) {
            console.log(`    ${dim}: ${direction}`);
          }
        }
      }
      break;
    }

    case 'report': {
      const report = generateSelfReport();
      if (report.total === 0) {
        console.log(report.summary);
      } else {
        console.log('🧠 Self-Evaluation Report\n');
        console.log(`  Total reflections: ${report.total}`);
        console.log(`  Average score: ${report.averageScore}/10`);
        console.log(`  Score range: ${report.scoreRange}`);
        console.log('\n  Dimensions:');
        for (const [dim, score] of Object.entries(report.dimensions)) {
          console.log(`    ${dim}: ${score}/10`);
        }
        console.log(`\n  🏆 Top Strengths: ${report.topStrengths.join(', ')}`);
        console.log(`  🎯 Focus Areas: ${report.focusAreas.join(', ')}`);
        if (report.recentLessons.length > 0) {
          console.log('\n  💡 Recent Lessons:');
          for (const l of report.recentLessons) {
            console.log(`    • ${l}`);
          }
        }
        if (Object.keys(report.trends).length > 0) {
          console.log('\n  📊 Trends:');
          for (const [dim, direction] of Object.entries(report.trends)) {
            console.log(`    ${dim}: ${direction}`);
          }
        }
        console.log(`\n  ${report.summary}`);
      }
      break;
    }

    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
