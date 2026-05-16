-- ────────────────────────────────────────────────────────────────────────────
-- Migration 018 — pyra_lead_tasks (Phase 15.1 Commit 2)
--
-- Phase:        15.1 Commit 2
-- Author:       abdou
-- Date:         2026-05-16
-- Reversible:   YES (rollback hints inline below)
-- Touches data: NO (DDL only)
-- Risk tier:    1 (deterministic, no existing data touched)
--
-- Purpose:
--   Per-lead task tracking. CRM-PRD Phase 15.1 lock Q2 = (c) lead-attached
--   tasks — a NEW dedicated table, NOT a reuse of pyra_tasks (project-board
--   tasks). Rationale: lead lifecycle is independent from project boards;
--   forcing leads to live on a board would either (a) require N hidden
--   boards or (b) bloat board columns with mixed lead+project work. A
--   dedicated table keeps lead tasks scoped to lead detail UX + the
--   my-tasks aggregator without coupling to the kanban schema.
--
-- Permission model (locked Commit 2):
--   - leads.update (REUSE — matches Phase 11.5 link-client precedent)
--   - canAccessLead() scope gate (admin OR assigned_to == self)
--   - DELETE: admin OR creator (mirrors Phase 15.2 attachments)
--
-- Idempotency contract:
--   All DDL uses IF NOT EXISTS / IF EXISTS so re-apply is safe on:
--     (a) an empty database during fresh bootstrap, AND
--     (b) the live production database after the migration has already run.
--   No data backfill — DDL only.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] `pnpm db:check-drift` clean before writing this file (17 tracked)
--   [x] No backup needed (Risk tier 1 — empty new table, no existing data)
--   [x] IF NOT EXISTS / IF EXISTS guards on every DDL statement
--   [x] No backfill (DDL only)
--   [x] Manual verification query stub: SELECT * FROM pyra_lead_tasks LIMIT 0;
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS pyra_lead_tasks (
  id            varchar PRIMARY KEY,
  lead_id       varchar NOT NULL REFERENCES pyra_sales_leads(id) ON DELETE CASCADE,
  title         varchar NOT NULL CHECK (length(title) > 0),
  description   text,
  due_date      date,
  priority      varchar CHECK (priority IN ('low','medium','high','urgent')),
  status        varchar NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','in_progress','completed','cancelled')),
  assigned_to   varchar,
  created_by    varchar NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT NOW(),
  completed_at  timestamptz,
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Per-lead view ordered by due date (tasks tab on lead detail)
CREATE INDEX IF NOT EXISTS idx_lead_tasks_lead_due
  ON pyra_lead_tasks (lead_id, due_date);

-- my-tasks aggregator + assignee-scoped queries (open work for an agent)
CREATE INDEX IF NOT EXISTS idx_lead_tasks_assignee_status
  ON pyra_lead_tasks (assigned_to, status, due_date);


-- ────────────────────────────────────────────────────────────────────────────
-- Column documentation
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE pyra_lead_tasks IS
  'Per-lead tasks (Phase 15.1 Commit 2). Independent from pyra_tasks (board tasks). ON DELETE CASCADE clears rows when lead is deleted. Permission: leads.update + canAccessLead.';

COMMENT ON COLUMN pyra_lead_tasks.title IS
  'Task title — required, non-empty (CHECK length > 0). API validates before DB to surface a friendly Arabic message instead of raw constraint error.';

COMMENT ON COLUMN pyra_lead_tasks.priority IS
  'Optional priority. NULL means unset (no priority filter). When set: low/medium/high/urgent.';

COMMENT ON COLUMN pyra_lead_tasks.status IS
  'Task lifecycle: pending (default) → in_progress → completed; cancelled is a terminal off-ramp. Sort ordering in API: pending(0) < in_progress(1) < completed(2) < cancelled(3).';

COMMENT ON COLUMN pyra_lead_tasks.assigned_to IS
  'pyra_users.username of the assignee. NULL means unassigned (the lead''s assigned_to picks it up implicitly via the my-tasks aggregator scope, but the task itself is not surfaced in that user''s personal list).';

COMMENT ON COLUMN pyra_lead_tasks.created_by IS
  'pyra_users.username of the creator. NEVER from request body — server-derived from auth context. Used for the admin-OR-creator delete gate.';

COMMENT ON COLUMN pyra_lead_tasks.completed_at IS
  'Set to NOW() by the PATCH handler when status transitions TO completed; reset to NULL when transitioning AWAY from completed. Never set by client.';

COMMENT ON COLUMN pyra_lead_tasks.metadata IS
  'Free-form jsonb for future fields (recurrence, dependencies, custom tags). Unindexed — query via Postgres jsonb operators if needed.';


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Rollback philosophy: forward-only. To revert:
--   (b) Write a new migration NNN+1 that DROPs the table.
--
-- Inline hints (commented out so they never execute by accident):
--
-- -- DROP INDEX IF EXISTS idx_lead_tasks_assignee_status;
-- -- DROP INDEX IF EXISTS idx_lead_tasks_lead_due;
-- -- DROP TABLE IF EXISTS pyra_lead_tasks;
