/**
 * task-tracker.mjs — Proactive Task Monitoring & Auto-Detection
 * 
 * 1. Detects task-like phrases in messages ("تابعي", "ذكريني", "follow up")
 * 2. Generates alerts for overdue/stale tasks
 * 3. Writes alerts to HEARTBEAT.md for agent pickup
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { listTasks, getOverdueTasks, getStaleTasks, createTask } from './task-queue.mjs';

const HEARTBEAT_PATH = '/home/node/openclaw/HEARTBEAT.md';

// ─── Task Detection from Messages ────────────────────

const TRACK_TRIGGERS_AR = [
  { pattern: /تابع(ي|و|ها|وها)?(\s|$)/i, type: 'follow-up' },
  { pattern: /ذكر(ي|و|ني|وني|يني)?(\s|$)/i, type: 'reminder' },
  { pattern: /لا تنس(ي|و|ى|وا)?(\s|$)/i, type: 'reminder' },
  { pattern: /خل(ي|و)ها?\s+(على|في)\s+(البال|الحسبان)/i, type: 'track' },
  { pattern: /راجع(ي|و)?(\s|$)/i, type: 'review' },
  { pattern: /تأكد(ي|و)?(\s|$)/i, type: 'verify' },
  { pattern: /نبّه(ي|و|ني)?(\s|$)/i, type: 'alert' },
];

const TRACK_TRIGGERS_EN = [
  { pattern: /follow[\s-]?up/i, type: 'follow-up' },
  { pattern: /remind\s*(me|us)?/i, type: 'reminder' },
  { pattern: /don'?t\s+forget/i, type: 'reminder' },
  { pattern: /check\s+(on|back|in)/i, type: 'follow-up' },
  { pattern: /track\s+this/i, type: 'track' },
  { pattern: /make\s+sure/i, type: 'verify' },
  { pattern: /keep\s+an?\s+eye/i, type: 'track' },
];

const ALL_TRIGGERS = [...TRACK_TRIGGERS_AR, ...TRACK_TRIGGERS_EN];

/**
 * Detect if a message contains a task trigger.
 * @param {string} message
 * @returns {{ detected: boolean, type: string|null, pattern: string|null }}
 */
export function detectTaskTrigger(message) {
  if (!message || typeof message !== 'string') return { detected: false, type: null };
  
  for (const trigger of ALL_TRIGGERS) {
    if (trigger.pattern.test(message)) {
      return { detected: true, type: trigger.type, pattern: trigger.pattern.source };
    }
  }
  
  return { detected: false, type: null };
}

/**
 * Extract a task title from a message containing a trigger.
 * Tries to get the meaningful part after the trigger word.
 */
export function extractTaskTitle(message) {
  if (!message) return message;
  
  // Remove common prefixes
  let cleaned = message
    .replace(/^(تابعي|تابعو|ذكريني|ذكروني|لا تنسي|لا تنسوا|follow up on|remind me to|don't forget to|check on|make sure)\s*/i, '')
    .trim();
  
  // Trim to reasonable length
  if (cleaned.length > 100) cleaned = cleaned.substring(0, 97) + '...';
  if (cleaned.length < 5) cleaned = message.substring(0, 100);
  
  return cleaned;
}

/**
 * Auto-create a task from a detected trigger message.
 */
export function createTaskFromMessage(message, options = {}) {
  const trigger = detectTaskTrigger(message);
  if (!trigger.detected) return null;
  
  const title = extractTaskTitle(message);
  const priority = trigger.type === 'alert' ? 'high' : 'medium';
  
  // Set default due date based on type
  let dueAt = null;
  if (trigger.type === 'reminder') {
    // Default: tomorrow
    dueAt = new Date(Date.now() + 86400000).toISOString().slice(0, 19) + 'Z';
  } else if (trigger.type === 'follow-up') {
    // Default: 2 days
    dueAt = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 19) + 'Z';
  }
  
  return createTask(title, {
    priority: options.priority || priority,
    dueAt: options.dueAt || dueAt,
    source: 'auto-detected',
    tags: `auto,${trigger.type}`,
    metadata: { triggerType: trigger.type, originalMessage: message.substring(0, 200) },
    ...options,
  });
}

// ─── Alert Generation ─────────────────────────────────

/**
 * Generate alerts for tasks needing attention.
 * @returns {Array<{type, severity, message, task_id}>}
 */
export function generateAlerts() {
  const alerts = [];
  
  // 1. Overdue tasks
  try {
    const overdue = getOverdueTasks();
    for (const task of overdue) {
      const daysOverdue = Math.floor((Date.now() - new Date(task.due_at).getTime()) / 86400000);
      alerts.push({
        type: 'overdue',
        severity: task.priority === 'critical' ? 'urgent' : daysOverdue > 3 ? 'urgent' : 'warning',
        message: `⏰ مهمة متأخرة (${daysOverdue} يوم): "${task.title}"`,
        task_id: task.id,
        task_title: task.title,
      });
    }
  } catch {}
  
  // 2. Stale tasks (no progress for 48h)
  try {
    const stale = getStaleTasks(48);
    for (const task of stale) {
      const hoursSinceUpdate = Math.floor((Date.now() - new Date(task.updated_at).getTime()) / 3600000);
      alerts.push({
        type: 'stale',
        severity: hoursSinceUpdate > 96 ? 'warning' : 'info',
        message: `🔄 مهمة بدون تقدم (${hoursSinceUpdate}h): "${task.title}"`,
        task_id: task.id,
        task_title: task.title,
      });
    }
  } catch {}
  
  // 3. High-priority pending tasks
  try {
    const critical = listTasks({ priority: 'critical', status: 'pending' });
    for (const task of critical) {
      const hoursOld = Math.floor((Date.now() - new Date(task.created_at).getTime()) / 3600000);
      if (hoursOld > 4) {  // Critical tasks pending > 4 hours
        alerts.push({
          type: 'critical-pending',
          severity: 'urgent',
          message: `🔴 مهمة حرجة لم تبدأ بعد (${hoursOld}h): "${task.title}"`,
          task_id: task.id,
          task_title: task.title,
        });
      }
    }
  } catch {}
  
  // Sort: urgent first, then warning, then info
  const severityOrder = { urgent: 0, warning: 1, info: 2 };
  alerts.sort((a, b) => (severityOrder[a.severity] || 9) - (severityOrder[b.severity] || 9));
  
  return alerts;
}

// ─── Heartbeat Integration ────────────────────────────

/**
 * Write task alerts to HEARTBEAT.md for agent to pick up.
 * Only writes if there are urgent/warning alerts.
 * Returns the number of alerts written.
 */
export function updateHeartbeatWithAlerts() {
  const alerts = generateAlerts();
  
  // Only write meaningful alerts (not info-level)
  const important = alerts.filter(a => a.severity === 'urgent' || a.severity === 'warning');
  
  if (important.length === 0) {
    // Don't modify HEARTBEAT.md if no important alerts
    return 0;
  }
  
  // Read existing HEARTBEAT.md
  let existing = '';
  try {
    if (existsSync(HEARTBEAT_PATH)) {
      existing = readFileSync(HEARTBEAT_PATH, 'utf-8');
    }
  } catch {}
  
  // Remove old task alerts section
  const cleaned = existing.replace(/## Task Alerts[\s\S]*?(?=##|$)/, '').trim();
  
  // Build alerts section
  const alertLines = important.map(a => `- ${a.message}`).join('\n');
  const alertSection = `\n\n## Task Alerts\n${alertLines}\n`;
  
  // Write back
  const newContent = cleaned 
    ? `# HEARTBEAT.md\n${cleaned}${alertSection}`
    : `# HEARTBEAT.md${alertSection}`;
  
  writeFileSync(HEARTBEAT_PATH, newContent);
  
  return important.length;
}

/**
 * Get a summary of all tasks for display.
 */
export function getTaskSummary() {
  const pending = listTasks({ status: 'pending' });
  const inProgress = listTasks({ status: 'in_progress' });
  const overdue = getOverdueTasks();
  const stale = getStaleTasks(48);
  
  return {
    pending: pending.length,
    inProgress: inProgress.length,
    overdue: overdue.length,
    stale: stale.length,
    urgentAlerts: generateAlerts().filter(a => a.severity === 'urgent').length,
    tasks: {
      pending: pending.map(t => ({ id: t.id.substring(0, 8), title: t.title, priority: t.priority })),
      inProgress: inProgress.map(t => ({ id: t.id.substring(0, 8), title: t.title, priority: t.priority })),
    },
  };
}

// ─── CLI ──────────────────────────────────────────────

const isMain = process.argv[1]?.endsWith('task-tracker.mjs');
if (isMain) {
  const cmd = process.argv[2];
  
  if (cmd === 'alerts') {
    const alerts = generateAlerts();
    if (alerts.length === 0) {
      console.log('✅ No alerts — all tasks on track!');
    } else {
      console.log(`\n⚠️ ${alerts.length} alert(s):\n`);
      for (const a of alerts) {
        const icon = a.severity === 'urgent' ? '🔴' : a.severity === 'warning' ? '🟡' : '🔵';
        console.log(`  ${icon} ${a.message}`);
      }
    }
  } else if (cmd === 'detect') {
    const message = process.argv.slice(3).join(' ');
    if (!message) { console.log('Usage: task-tracker.mjs detect <message>'); process.exit(1); }
    const result = detectTaskTrigger(message);
    console.log('Detection:', result);
    if (result.detected) {
      const title = extractTaskTitle(message);
      console.log('Extracted title:', title);
    }
  } else if (cmd === 'heartbeat') {
    const count = updateHeartbeatWithAlerts();
    console.log(`Updated HEARTBEAT.md with ${count} alert(s)`);
  } else if (cmd === 'summary') {
    const summary = getTaskSummary();
    console.log('\n📋 Task Summary:');
    console.log(`  Pending:     ${summary.pending}`);
    console.log(`  In Progress: ${summary.inProgress}`);
    console.log(`  Overdue:     ${summary.overdue}`);
    console.log(`  Stale:       ${summary.stale}`);
    console.log(`  Urgent:      ${summary.urgentAlerts}`);
  } else {
    console.log('Usage:');
    console.log('  node task-tracker.mjs alerts      — Show current alerts');
    console.log('  node task-tracker.mjs detect <msg> — Test trigger detection');
    console.log('  node task-tracker.mjs heartbeat    — Update HEARTBEAT.md');
    console.log('  node task-tracker.mjs summary      — Task summary');
  }
  
  const { closeDb } = await import('./db.mjs');
  closeDb();
}
