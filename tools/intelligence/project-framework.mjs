#!/usr/bin/env node

/**
 * Multi-Day Project Framework — Plan and execute projects across sessions.
 * 
 * Tracks phases, tasks, progress, and generates session briefs for continuity.
 * Uses bayra.db (via ../memory/db.mjs) with tables created on first use.
 * 
 * Usage:
 *   node project-framework.mjs create "Name" --phases "Phase 1,Phase 2"
 *   node project-framework.mjs list [--status active]
 *   node project-framework.mjs status <id>
 *   node project-framework.mjs advance <id> "task" "notes"
 *   node project-framework.mjs pause <id> "reason"
 *   node project-framework.mjs brief <id>
 *   node project-framework.mjs overdue
 *   node project-framework.mjs report <id>
 */

import { getDb } from '../memory/db.mjs';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';

// ===== Schema Bootstrap =====

let _initialized = false;

function ensureTables() {
  if (_initialized) return;
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'planning'
        CHECK(status IN ('planning','active','paused','completed','cancelled')),
      phases_json TEXT NOT NULL DEFAULT '[]',
      current_phase INTEGER NOT NULL DEFAULT 0,
      progress_pct REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      completed_at TEXT,
      estimated_hours REAL,
      actual_hours REAL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS project_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      project_id TEXT NOT NULL REFERENCES projects(id),
      phase TEXT,
      action TEXT NOT NULL,
      details TEXT,
      session_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
    CREATE INDEX IF NOT EXISTS idx_project_logs_project ON project_logs(project_id, created_at DESC);
  `);

  _initialized = true;
}

function now() {
  return new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// ===== 1. Create Project =====

/**
 * Create a new multi-phase project.
 * @param {string} name
 * @param {string} description
 * @param {Array<{name: string, tasks?: string[], estimated_hours?: number, dependencies?: string[]}>} phases
 * @returns {object} The created project
 */
export function createProject(name, description = '', phases = []) {
  ensureTables();
  const db = getDb();
  const id = `proj-${Date.now().toString(36)}-${randomUUID().slice(0, 6)}`;
  const ts = now();

  // Normalize phases: add completed_tasks array to each
  const normalizedPhases = phases.map((p, i) => ({
    name: p.name || `Phase ${i + 1}`,
    tasks: (p.tasks || []).map(t => (typeof t === 'string' ? { name: t, done: false } : t)),
    estimated_hours: p.estimated_hours || 0,
    dependencies: p.dependencies || [],
    completed: false,
  }));

  const totalEstimated = normalizedPhases.reduce((s, p) => s + (p.estimated_hours || 0), 0);

  db.prepare(`
    INSERT INTO projects (id, name, description, status, phases_json, current_phase,
      progress_pct, created_at, updated_at, estimated_hours, actual_hours)
    VALUES (?, ?, ?, 'planning', ?, 0, 0, ?, ?, ?, 0)
  `).run(id, name, description, JSON.stringify(normalizedPhases), ts, ts, totalEstimated || null);

  logAction(db, id, normalizedPhases[0]?.name || null, 'created', `Project "${name}" created with ${normalizedPhases.length} phases`);

  return getProject(db, id);
}

// ===== 2. Advance Project =====

/**
 * Mark a task complete, update progress, optionally auto-advance phase.
 * @param {string} projectId
 * @param {string} completedTask - Name of the completed task
 * @param {string} notes
 * @returns {object} Updated project
 */
export function advanceProject(projectId, completedTask, notes = '') {
  ensureTables();
  const db = getDb();
  const project = getProject(db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  if (project.status === 'completed' || project.status === 'cancelled') {
    throw new Error(`Cannot advance ${project.status} project`);
  }

  const phases = JSON.parse(project.phases_json);
  let phaseIdx = project.current_phase;
  let taskFound = false;

  // Find and mark the task
  for (let pi = phaseIdx; pi < phases.length && !taskFound; pi++) {
    for (const task of phases[pi].tasks) {
      if (task.name === completedTask && !task.done) {
        task.done = true;
        task.completed_at = now();
        taskFound = true;
        phaseIdx = pi;
        break;
      }
    }
  }

  if (!taskFound) {
    // Try matching partial task name
    for (let pi = phaseIdx; pi < phases.length && !taskFound; pi++) {
      for (const task of phases[pi].tasks) {
        if (!task.done && task.name.toLowerCase().includes(completedTask.toLowerCase())) {
          task.done = true;
          task.completed_at = now();
          taskFound = true;
          phaseIdx = pi;
          break;
        }
      }
    }
  }

  if (!taskFound) {
    throw new Error(`Task not found: "${completedTask}"`);
  }

  // Check if current phase is done
  const currentPhase = phases[phaseIdx];
  const allDone = currentPhase.tasks.length > 0 && currentPhase.tasks.every(t => t.done);
  if (allDone) {
    currentPhase.completed = true;
    currentPhase.completed_at = now();
    // Auto-advance to next phase
    if (phaseIdx < phases.length - 1) {
      phaseIdx++;
    }
  }

  // Calculate overall progress
  const totalTasks = phases.reduce((s, p) => s + p.tasks.length, 0);
  const doneTasks = phases.reduce((s, p) => s + p.tasks.filter(t => t.done).length, 0);
  const progressPct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  // Check if all phases complete
  const allPhasesComplete = phases.every(p => p.completed);
  const status = allPhasesComplete ? 'completed' : (project.status === 'planning' ? 'active' : project.status);

  const ts = now();
  db.prepare(`
    UPDATE projects SET phases_json = ?, current_phase = ?, progress_pct = ?,
      status = ?, updated_at = ?, completed_at = ?
    WHERE id = ?
  `).run(JSON.stringify(phases), phaseIdx, progressPct, status,
    ts, allPhasesComplete ? ts : null, projectId);

  logAction(db, projectId, currentPhase.name, 'task_completed',
    `Completed: "${completedTask}"${notes ? ` — ${notes}` : ''}${allDone ? ' (phase complete!)' : ''}`);

  return getProject(db, projectId);
}

// ===== 3. Get Project Status =====

/**
 * Get detailed project status.
 * @param {string} projectId
 * @returns {object} Detailed status
 */
export function getProjectStatus(projectId) {
  ensureTables();
  const db = getDb();
  const project = getProject(db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const phases = JSON.parse(project.phases_json);
  const current = phases[project.current_phase];

  const totalTasks = phases.reduce((s, p) => s + p.tasks.length, 0);
  const doneTasks = phases.reduce((s, p) => s + p.tasks.filter(t => t.done).length, 0);
  const remainingTasks = totalTasks - doneTasks;

  const estimatedRemaining = phases
    .filter((_, i) => i >= project.current_phase)
    .reduce((s, p) => {
      const phaseDoneRatio = p.tasks.length > 0
        ? p.tasks.filter(t => t.done).length / p.tasks.length
        : 0;
      return s + (p.estimated_hours || 0) * (1 - phaseDoneRatio);
    }, 0);

  // Recent logs
  const recentLogs = db.prepare(`
    SELECT * FROM project_logs WHERE project_id = ? ORDER BY created_at DESC LIMIT 10
  `).all(projectId);

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    status: project.status,
    progress: `${project.progress_pct}%`,
    currentPhase: current ? {
      index: project.current_phase,
      name: current.name,
      completedTasks: current.tasks.filter(t => t.done).map(t => t.name),
      remainingTasks: current.tasks.filter(t => !t.done).map(t => t.name),
    } : null,
    phases: phases.map((p, i) => ({
      index: i,
      name: p.name,
      completed: p.completed,
      tasks: `${p.tasks.filter(t => t.done).length}/${p.tasks.length}`,
      estimated_hours: p.estimated_hours,
    })),
    summary: {
      totalTasks,
      doneTasks,
      remainingTasks,
      estimatedHoursRemaining: Math.round(estimatedRemaining * 10) / 10,
      actualHours: project.actual_hours,
    },
    recentActivity: recentLogs.map(l => ({
      action: l.action,
      details: l.details,
      phase: l.phase,
      at: l.created_at,
    })),
    created: project.created_at,
    updated: project.updated_at,
    completed: project.completed_at,
  };
}

// ===== 4. List Projects =====

/**
 * List all projects, optionally filtered by status.
 * @param {string} [filter] - Status filter: active, paused, completed, planning, cancelled
 * @returns {object[]}
 */
export function listProjects(filter = null) {
  ensureTables();
  const db = getDb();

  let sql = 'SELECT * FROM projects';
  const params = [];
  if (filter) {
    sql += ' WHERE status = ?';
    params.push(filter);
  }
  sql += ' ORDER BY updated_at DESC';

  const projects = db.prepare(sql).all(...params);

  return projects.map(p => {
    const phases = JSON.parse(p.phases_json);
    const totalTasks = phases.reduce((s, ph) => s + ph.tasks.length, 0);
    const doneTasks = phases.reduce((s, ph) => s + ph.tasks.filter(t => t.done).length, 0);
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      progress: `${p.progress_pct}%`,
      currentPhase: phases[p.current_phase]?.name || '—',
      tasks: `${doneTasks}/${totalTasks}`,
      estimated_hours: p.estimated_hours,
      updated: p.updated_at,
    };
  });
}

// ===== 5. Pause Project =====

/**
 * Pause a project with a reason.
 * @param {string} projectId
 * @param {string} reason
 * @returns {object} Updated project
 */
export function pauseProject(projectId, reason = '') {
  ensureTables();
  const db = getDb();
  const project = getProject(db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const ts = now();
  db.prepare(`UPDATE projects SET status = 'paused', updated_at = ? WHERE id = ?`).run(ts, projectId);

  const phases = JSON.parse(project.phases_json);
  logAction(db, projectId, phases[project.current_phase]?.name, 'paused',
    reason || 'Project paused');

  return getProject(db, projectId);
}

// ===== 6. Generate Project Brief =====

/**
 * Generate a markdown brief for loading at session start.
 * Includes what was done, what's next, blockers, decisions made.
 * @param {string} projectId
 * @returns {string} Markdown brief
 */
export function generateProjectBrief(projectId) {
  ensureTables();
  const db = getDb();
  const project = getProject(db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const phases = JSON.parse(project.phases_json);
  const current = phases[project.current_phase];

  // Get all logs
  const logs = db.prepare(`
    SELECT * FROM project_logs WHERE project_id = ? ORDER BY created_at ASC
  `).all(projectId);

  // Build brief
  const lines = [
    `# Project Brief: ${project.name}`,
    `**ID:** ${project.id}`,
    `**Status:** ${project.status} | **Progress:** ${project.progress_pct}%`,
    `**Created:** ${project.created_at}`,
    project.description ? `\n> ${project.description}` : '',
    '',
    '## Phases Overview',
  ];

  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const marker = i === project.current_phase ? '👉' : p.completed ? '✅' : '⬜';
    lines.push(`${marker} **Phase ${i + 1}: ${p.name}**${p.estimated_hours ? ` (~${p.estimated_hours}h)` : ''}`);
    for (const t of p.tasks) {
      lines.push(`   ${t.done ? '✅' : '⬜'} ${t.name}${t.completed_at ? ` (done ${t.completed_at.split('T')[0]})` : ''}`);
    }
  }

  if (current) {
    const remaining = current.tasks.filter(t => !t.done);
    if (remaining.length > 0) {
      lines.push('', '## What\'s Next');
      remaining.forEach(t => lines.push(`- [ ] ${t.name}`));
    }
  }

  // Recent decisions / notes from logs
  const decisions = logs.filter(l => l.details && l.details.length > 20).slice(-10);
  if (decisions.length > 0) {
    lines.push('', '## Recent Activity');
    for (const d of decisions) {
      lines.push(`- **${d.action}** (${d.created_at.split('T')[0]}): ${d.details}`);
    }
  }

  // Blockers (if paused)
  const pauseLogs = logs.filter(l => l.action === 'paused');
  if (pauseLogs.length > 0) {
    lines.push('', '## Blockers');
    for (const p of pauseLogs) {
      lines.push(`- ${p.details} (${p.created_at.split('T')[0]})`);
    }
  }

  return lines.filter(l => l !== undefined).join('\n');
}

// ===== 7. Overdue Projects =====

/**
 * Find projects that are behind schedule.
 * @returns {object[]} Overdue projects
 */
export function getOverdueProjects() {
  ensureTables();
  const db = getDb();

  const projects = db.prepare(`
    SELECT * FROM projects WHERE status IN ('active','planning') AND estimated_hours IS NOT NULL
  `).all();

  const overdue = [];
  for (const p of projects) {
    const phases = JSON.parse(p.phases_json);
    const totalEstimated = p.estimated_hours || 0;
    if (totalEstimated <= 0) continue;

    // Calculate time elapsed since creation
    const createdMs = new Date(p.created_at).getTime();
    const elapsedHours = (Date.now() - createdMs) / (1000 * 60 * 60);

    // If progress is significantly behind time elapsed relative to estimate
    const expectedProgress = Math.min(100, (elapsedHours / totalEstimated) * 100);
    const actualProgress = p.progress_pct;

    if (expectedProgress > actualProgress + 20) { // More than 20% behind
      overdue.push({
        id: p.id,
        name: p.name,
        status: p.status,
        progress: `${actualProgress}%`,
        expectedProgress: `${Math.round(expectedProgress)}%`,
        behind: `${Math.round(expectedProgress - actualProgress)}%`,
        estimatedHours: totalEstimated,
        elapsedHours: Math.round(elapsedHours * 10) / 10,
        currentPhase: phases[p.current_phase]?.name,
      });
    }
  }

  return overdue;
}

// ===== 8. Project Report =====

/**
 * Generate a comprehensive project report.
 * @param {string} projectId
 * @returns {string} Markdown report
 */
export function projectReport(projectId) {
  ensureTables();
  const db = getDb();
  const project = getProject(db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const phases = JSON.parse(project.phases_json);
  const logs = db.prepare(`
    SELECT * FROM project_logs WHERE project_id = ? ORDER BY created_at ASC
  `).all(projectId);

  const totalTasks = phases.reduce((s, p) => s + p.tasks.length, 0);
  const doneTasks = phases.reduce((s, p) => s + p.tasks.filter(t => t.done).length, 0);

  const createdMs = new Date(project.created_at).getTime();
  const endMs = project.completed_at ? new Date(project.completed_at).getTime() : Date.now();
  const durationDays = Math.round((endMs - createdMs) / (1000 * 60 * 60 * 24) * 10) / 10;

  const lines = [
    `# 📊 Project Report: ${project.name}`,
    '',
    '## Summary',
    `| Field | Value |`,
    `|-------|-------|`,
    `| ID | ${project.id} |`,
    `| Status | ${project.status} |`,
    `| Progress | ${project.progress_pct}% |`,
    `| Tasks | ${doneTasks}/${totalTasks} completed |`,
    `| Phases | ${phases.filter(p => p.completed).length}/${phases.length} completed |`,
    `| Duration | ${durationDays} days |`,
    `| Est. Hours | ${project.estimated_hours || '—'} |`,
    `| Actual Hours | ${project.actual_hours || '—'} |`,
    `| Created | ${project.created_at} |`,
    `| Last Updated | ${project.updated_at} |`,
    project.completed_at ? `| Completed | ${project.completed_at} |` : '',
    '',
    '## Phase Breakdown',
  ];

  for (let i = 0; i < phases.length; i++) {
    const p = phases[i];
    const done = p.tasks.filter(t => t.done).length;
    const total = p.tasks.length;
    lines.push(`### Phase ${i + 1}: ${p.name} ${p.completed ? '✅' : `(${done}/${total})`}`);
    if (p.estimated_hours) lines.push(`Estimated: ${p.estimated_hours}h`);
    for (const t of p.tasks) {
      lines.push(`- ${t.done ? '✅' : '⬜'} ${t.name}`);
    }
    lines.push('');
  }

  lines.push('## Activity Log');
  for (const l of logs) {
    lines.push(`- **${l.created_at}** [${l.action}] ${l.details || ''}`);
  }

  return lines.filter(l => l !== undefined).join('\n');
}

// ===== Helpers =====

function getProject(db, id) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id) || null;
}

function logAction(db, projectId, phase, action, details) {
  db.prepare(`
    INSERT INTO project_logs (project_id, phase, action, details, session_id, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectId, phase, action, details, process.env.SESSION_ID || null, now());
}

// ===== Extra: Resume / Cancel =====

export function resumeProject(projectId) {
  ensureTables();
  const db = getDb();
  const project = getProject(db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);
  if (project.status !== 'paused') throw new Error('Only paused projects can be resumed');

  const ts = now();
  db.prepare(`UPDATE projects SET status = 'active', updated_at = ? WHERE id = ?`).run(ts, projectId);
  const phases = JSON.parse(project.phases_json);
  logAction(db, projectId, phases[project.current_phase]?.name, 'resumed', 'Project resumed');
  return getProject(db, projectId);
}

export function cancelProject(projectId, reason = '') {
  ensureTables();
  const db = getDb();
  const project = getProject(db, projectId);
  if (!project) throw new Error(`Project not found: ${projectId}`);

  const ts = now();
  db.prepare(`UPDATE projects SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(ts, projectId);
  logAction(db, projectId, null, 'cancelled', reason || 'Project cancelled');
  return getProject(db, projectId);
}

export function addHours(projectId, hours) {
  ensureTables();
  const db = getDb();
  const ts = now();
  db.prepare(`UPDATE projects SET actual_hours = actual_hours + ?, updated_at = ? WHERE id = ?`).run(hours, ts, projectId);
  logAction(db, projectId, null, 'hours_logged', `Added ${hours}h`);
  return getProject(db, projectId);
}

// ===== CLI =====

async function cli() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }

  const command = args[0];

  // Parse flags
  const flags = {};
  const positional = [];
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      flags[key] = args[i + 1] || true;
      i++;
    } else {
      positional.push(args[i]);
    }
  }

  switch (command) {
    case 'create': {
      const name = positional[0];
      if (!name) { console.error('❌ Usage: project-framework.mjs create "Name" --phases "P1,P2"'); process.exit(1); }
      const description = positional[1] || flags.desc || '';
      const phasesStr = flags.phases || '';
      const phases = phasesStr
        ? phasesStr.split(',').map(p => ({ name: p.trim(), tasks: [], estimated_hours: 0 }))
        : [];
      const project = createProject(name, description, phases);
      console.log(`✅ Created project: ${project.id}`);
      console.log(JSON.stringify(project, null, 2));
      break;
    }

    case 'list': {
      const filter = flags.status || positional[0] || null;
      const projects = listProjects(filter);
      if (projects.length === 0) {
        console.log('📭 No projects found');
      } else {
        console.log(`\n📋 Projects${filter ? ` (${filter})` : ''}:\n`);
        for (const p of projects) {
          console.log(`  ${p.id}  ${p.name.padEnd(30)} ${p.status.padEnd(10)} ${p.progress.padStart(5)} ${p.tasks} tasks  Phase: ${p.currentPhase}`);
        }
        console.log('');
      }
      break;
    }

    case 'status': {
      const id = positional[0];
      if (!id) { console.error('❌ Usage: project-framework.mjs status <project-id>'); process.exit(1); }
      const status = getProjectStatus(id);
      console.log(JSON.stringify(status, null, 2));
      break;
    }

    case 'advance': {
      const id = positional[0];
      const task = positional[1];
      const notes = positional[2] || '';
      if (!id || !task) { console.error('❌ Usage: project-framework.mjs advance <id> "task" "notes"'); process.exit(1); }
      const project = advanceProject(id, task, notes);
      const phases = JSON.parse(project.phases_json);
      const totalTasks = phases.reduce((s, p) => s + p.tasks.length, 0);
      const doneTasks = phases.reduce((s, p) => s + p.tasks.filter(t => t.done).length, 0);
      console.log(`✅ Task completed! Progress: ${project.progress_pct}% (${doneTasks}/${totalTasks})`);
      break;
    }

    case 'pause': {
      const id = positional[0];
      const reason = positional[1] || '';
      if (!id) { console.error('❌ Usage: project-framework.mjs pause <id> "reason"'); process.exit(1); }
      const project = pauseProject(id, reason);
      console.log(`⏸️  Project paused: ${project.name}`);
      break;
    }

    case 'resume': {
      const id = positional[0];
      if (!id) { console.error('❌ Usage: project-framework.mjs resume <id>'); process.exit(1); }
      const project = resumeProject(id);
      console.log(`▶️  Project resumed: ${project.name}`);
      break;
    }

    case 'cancel': {
      const id = positional[0];
      const reason = positional[1] || '';
      if (!id) { console.error('❌ Usage: project-framework.mjs cancel <id> "reason"'); process.exit(1); }
      const project = cancelProject(id, reason);
      console.log(`❌ Project cancelled: ${project.name}`);
      break;
    }

    case 'brief': {
      const id = positional[0];
      if (!id) { console.error('❌ Usage: project-framework.mjs brief <id>'); process.exit(1); }
      const brief = generateProjectBrief(id);
      console.log(brief);
      break;
    }

    case 'report': {
      const id = positional[0];
      if (!id) { console.error('❌ Usage: project-framework.mjs report <id>'); process.exit(1); }
      const report = projectReport(id);
      console.log(report);
      break;
    }

    case 'overdue': {
      const overdue = getOverdueProjects();
      if (overdue.length === 0) {
        console.log('✅ No overdue projects');
      } else {
        console.log(`\n⚠️  ${overdue.length} overdue project(s):\n`);
        console.log(JSON.stringify(overdue, null, 2));
      }
      break;
    }

    case 'hours': {
      const id = positional[0];
      const hours = parseFloat(positional[1]);
      if (!id || isNaN(hours)) { console.error('❌ Usage: project-framework.mjs hours <id> <hours>'); process.exit(1); }
      addHours(id, hours);
      console.log(`⏱️  Logged ${hours}h`);
      break;
    }

    default:
      console.error(`❌ Unknown command: ${command}`);
      printHelp();
      process.exit(1);
  }
}

function printHelp() {
  console.log(`
📋 Multi-Day Project Framework

Commands:
  create <name> [--phases "P1,P2,..."]   Create a new project
  list [--status active|paused|...]      List projects
  status <id>                            Detailed project status
  advance <id> "task" "notes"            Mark task complete
  pause <id> "reason"                    Pause project
  resume <id>                            Resume paused project
  cancel <id> "reason"                   Cancel project
  brief <id>                             Generate session brief (markdown)
  report <id>                            Full project report
  overdue                                Find overdue projects
  hours <id> <hours>                     Log hours worked

Examples:
  node project-framework.mjs create "Website Redesign" --phases "Design,Develop,Launch"
  node project-framework.mjs advance proj-abc123 "Create wireframes" "Done in Figma"
  node project-framework.mjs brief proj-abc123
`);
}

const isMain = process.argv[1] && (
  process.argv[1] === fileURLToPath(import.meta.url) ||
  process.argv[1].endsWith('project-framework.mjs')
);

if (isMain) {
  cli().catch(e => {
    console.error(`❌ Error: ${e.message}`);
    process.exit(1);
  });
}
