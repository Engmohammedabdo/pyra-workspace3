/**
 * shared-memory.mjs — Sub-agent Knowledge Sharing System
 * 
 * Enables sub-agents to publish findings to a staging area,
 * which the main agent reviews and promotes to permanent memory.
 * 
 * Uses existing memory_staging table.
 */

import crypto from 'node:crypto';
import { getDb } from './db.mjs';
import { ingestMemory } from './ingest.mjs';
import { setCacheDb } from './embeddings.mjs';

// ─── Publish (Sub-agent writes findings) ─────────────

/**
 * Sub-agent publishes a finding to staging.
 * @param {string} agentId - e.g. 'sa1-fact-extraction', 'research-agent'
 * @param {object} finding - { content, type, subtype, importance, tags, metadata }
 * @returns {string} staging entry ID
 */
export function publishFinding(agentId, finding) {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  
  db.prepare(`
    INSERT INTO memory_staging (id, agent_id, content, type, subtype, importance, tags, metadata, created_at, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
  `).run(
    id,
    agentId,
    finding.content,
    finding.type || 'semantic',
    finding.subtype || null,
    finding.importance || 5,
    finding.tags ? (Array.isArray(finding.tags) ? JSON.stringify(finding.tags) : finding.tags) : null,
    finding.metadata ? (typeof finding.metadata === 'object' ? JSON.stringify(finding.metadata) : finding.metadata) : null,
    now
  );
  
  return id;
}

/**
 * Publish multiple findings at once (batch).
 */
export function publishFindings(agentId, findings) {
  const ids = [];
  for (const finding of findings) {
    ids.push(publishFinding(agentId, finding));
  }
  return ids;
}

// ─── Review (Main agent reads pending) ────────────────

/**
 * Get all pending findings from staging.
 */
export function getPendingFindings(options = {}) {
  const db = getDb();
  const { limit = 50, agentId = null } = options;
  
  let sql = "SELECT * FROM memory_staging WHERE status = 'pending'";
  const params = [];
  
  if (agentId) {
    sql += ' AND agent_id = ?';
    params.push(agentId);
  }
  
  sql += ' ORDER BY importance DESC, created_at ASC LIMIT ?';
  params.push(limit);
  
  return db.prepare(sql).all(...params);
}

/**
 * Get staging stats.
 */
export function getStagingStats() {
  const db = getDb();
  const byStatus = db.prepare(`
    SELECT status, COUNT(*) as count FROM memory_staging GROUP BY status
  `).all();
  const byAgent = db.prepare(`
    SELECT agent_id, COUNT(*) as count FROM memory_staging WHERE status = 'pending' GROUP BY agent_id
  `).all();
  return {
    byStatus: Object.fromEntries(byStatus.map(r => [r.status, r.count])),
    byAgent: Object.fromEntries(byAgent.map(r => [r.agent_id, r.count])),
  };
}

// ─── Approve/Reject ───────────────────────────────────

/**
 * Approve a staging entry and promote to permanent memory.
 */
export async function approveFinding(stagingId) {
  const db = getDb();
  setCacheDb(db);
  
  const staging = db.prepare('SELECT * FROM memory_staging WHERE id = ?').get(stagingId);
  if (!staging) throw new Error(`Staging entry not found: ${stagingId}`);
  if (staging.status !== 'pending') throw new Error(`Entry already ${staging.status}`);
  
  // Parse tags
  let tags = [];
  if (staging.tags) {
    try { tags = JSON.parse(staging.tags); } catch { tags = staging.tags.split(','); }
  }
  tags.push(`from-agent:${staging.agent_id}`);
  
  // Ingest to permanent memory
  const result = await ingestMemory(db, staging.content, {
    type: staging.type || 'semantic',
    subtype: staging.subtype,
    importance: staging.importance || 5,
    tags,
    source: `sub-agent:${staging.agent_id}`,
    channel: 'shared-memory',
  });
  
  // Mark as approved
  db.prepare("UPDATE memory_staging SET status = 'approved' WHERE id = ?").run(stagingId);
  
  return { stagingId, action: result.action, memoryId: result.memory?.id };
}

/**
 * Reject a staging entry.
 */
export function rejectFinding(stagingId, reason = null) {
  const db = getDb();
  const staging = db.prepare('SELECT * FROM memory_staging WHERE id = ?').get(stagingId);
  if (!staging) throw new Error(`Staging entry not found: ${stagingId}`);
  
  const metadata = staging.metadata ? JSON.parse(staging.metadata) : {};
  metadata.rejectionReason = reason;
  
  db.prepare("UPDATE memory_staging SET status = 'rejected', metadata = ? WHERE id = ?")
    .run(JSON.stringify(metadata), stagingId);
  
  return true;
}

// ─── Auto-Approve ─────────────────────────────────────

/**
 * Auto-approve high-importance findings.
 * Runs during maintenance — promotes trusted sub-agent findings.
 */
export async function autoApproveFindings(options = {}) {
  const { minImportance = 7 } = options;
  
  const pending = getPendingFindings();
  const highPriority = pending.filter(f => (f.importance || 0) >= minImportance);
  
  let approved = 0, errors = 0;
  const details = [];
  
  for (const finding of highPriority) {
    try {
      const result = await approveFinding(finding.id);
      approved++;
      details.push({ id: finding.id, agent: finding.agent_id, action: result.action });
    } catch (err) {
      errors++;
      details.push({ id: finding.id, agent: finding.agent_id, error: err.message });
    }
  }
  
  return { total: pending.length, highPriority: highPriority.length, approved, errors, details };
}

// ─── Cleanup ──────────────────────────────────────────

/**
 * Clean old approved/rejected entries.
 */
export function cleanupStaging(daysOld = 7) {
  const db = getDb();
  const cutoff = new Date(Date.now() - daysOld * 86400000).toISOString();
  const result = db.prepare(`
    DELETE FROM memory_staging 
    WHERE status IN ('approved', 'rejected') AND created_at < ?
  `).run(cutoff);
  return result.changes;
}
