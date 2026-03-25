/**
 * task-queue.mjs — Persistent Task Queue for cross-session task management
 * Stores tasks in bayra.db SQLite database.
 */

import crypto from 'node:crypto';
import { getDb } from './db.mjs';

// ─── Schema ──────────────────────────────────────────────

export function initTaskSchema(db) {
  db.exec(`
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
      source TEXT,
      checkpoint TEXT,
      tags TEXT,
      parent_task_id TEXT REFERENCES tasks(id),
      metadata TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_at);
  `);
}

// ─── CRUD ────────────────────────────────────────────────

export function createTask(title, options = {}) {
  const db = getDb();
  initTaskSchema(db);
  const id = crypto.randomUUID();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  
  db.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, created_at, updated_at, due_at, assigned_to, source, tags, parent_task_id, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    title,
    options.description || null,
    options.status || 'pending',
    options.priority || 'medium',
    now, now,
    options.dueAt || null,
    options.assignedTo || 'bayra',
    options.source || 'user',
    options.tags ? (Array.isArray(options.tags) ? options.tags.join(',') : options.tags) : null,
    options.parentTaskId || null,
    options.metadata ? JSON.stringify(options.metadata) : null
  );
  
  return getTask(id);
}

export function getTask(id) {
  const db = getDb();
  initTaskSchema(db);
  // Support partial ID
  let task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(id);
  if (!task) {
    task = db.prepare('SELECT * FROM tasks WHERE id LIKE ? LIMIT 1').get(id + '%');
  }
  return task || null;
}

export function updateTask(id, updates) {
  const db = getDb();
  initTaskSchema(db);
  const task = getTask(id);
  if (!task) throw new Error(`Task not found: ${id}`);
  
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const fields = [];
  const values = [];
  
  for (const [key, val] of Object.entries(updates)) {
    if (['title','description','status','priority','due_at','assigned_to','source','checkpoint','tags','metadata'].includes(key)) {
      fields.push(`${key} = ?`);
      values.push(key === 'metadata' || key === 'checkpoint' ? (typeof val === 'object' ? JSON.stringify(val) : val) : val);
    }
  }
  
  if (updates.status === 'done') {
    fields.push('completed_at = ?');
    values.push(now);
  }
  
  fields.push('updated_at = ?');
  values.push(now);
  values.push(task.id);
  
  db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  return getTask(task.id);
}

export function completeTask(id, result = null) {
  const updates = { status: 'done' };
  if (result) updates.metadata = JSON.stringify({ result });
  return updateTask(id, updates);
}

export function deleteTask(id) {
  const db = getDb();
  initTaskSchema(db);
  const task = getTask(id);
  if (!task) throw new Error(`Task not found: ${id}`);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(task.id);
  return true;
}

export function listTasks(filters = {}) {
  const db = getDb();
  initTaskSchema(db);
  
  const conditions = [];
  const params = [];
  
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  } else if (!filters.includeCompleted) {
    conditions.push("status NOT IN ('done', 'cancelled')");
  }
  
  if (filters.priority) {
    conditions.push('priority = ?');
    params.push(filters.priority);
  }
  
  if (filters.assignedTo) {
    conditions.push('assigned_to = ?');
    params.push(filters.assignedTo);
  }
  
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = filters.limit || 50;
  const orderBy = "ORDER BY CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 END, created_at DESC";
  
  return db.prepare(`SELECT * FROM tasks ${where} ${orderBy} LIMIT ?`).all(...params, limit);
}

export function saveCheckpoint(id, checkpoint) {
  return updateTask(id, { checkpoint: typeof checkpoint === 'object' ? JSON.stringify(checkpoint) : checkpoint });
}

export function loadCheckpoint(id) {
  const task = getTask(id);
  if (!task || !task.checkpoint) return null;
  try { return JSON.parse(task.checkpoint); } catch { return task.checkpoint; }
}

export function getOverdueTasks() {
  const db = getDb();
  initTaskSchema(db);
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  return db.prepare(`
    SELECT * FROM tasks 
    WHERE due_at IS NOT NULL AND due_at < ? AND status NOT IN ('done', 'cancelled')
    ORDER BY due_at ASC
  `).all(now);
}

export function getStaleTasks(hours = 48) {
  const db = getDb();
  initTaskSchema(db);
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
  return db.prepare(`
    SELECT * FROM tasks
    WHERE status = 'in_progress' AND updated_at < ?
    ORDER BY updated_at ASC
  `).all(cutoff);
}

export function getTaskStats() {
  const db = getDb();
  initTaskSchema(db);
  const stats = db.prepare(`
    SELECT status, COUNT(*) as count FROM tasks GROUP BY status
  `).all();
  const overdue = getOverdueTasks().length;
  const stale = getStaleTasks().length;
  return { byStatus: Object.fromEntries(stats.map(s => [s.status, s.count])), overdue, stale };
}
