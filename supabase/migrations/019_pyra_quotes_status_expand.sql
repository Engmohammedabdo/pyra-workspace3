-- ────────────────────────────────────────────────────────────────────────────
-- Migration 019 — Expand pyra_quotes.status CHECK constraint
--
-- Phase:        Q (Quote System Fixes) Commit 1
-- Author:       abdou
-- Date:         2026-05-19
-- Reversible:   YES (rollback hints inline below)
-- Touches data: NO (DDL only; constraint relaxation never invalidates existing
--               rows — verified pre-flight: prod has only draft/sent/signed
--               which are all in the new allowed list)
-- Risk tier:    1 (deterministic; existing rows are a strict subset of the
--               new allowed values)
--
-- Purpose:
--   Close the DB-vs-code status mismatch surfaced by the Phase Q audit. The
--   pre-Phase-Q pyra_quotes_status_check allowed only 6 statuses, but the
--   API code (QUOTE_STATUS + QUOTE_VALID_TRANSITIONS) references 9. Any
--   sales_agent quote creation would have INSERT-failed at the DB level
--   with constraint violation (status='pending_approval') — production
--   never triggered this because admin (Abdou) created all 15 quotes via
--   his admin path which skips pending_approval.
--
-- Pre-flight verification (run before applying):
--   SELECT DISTINCT status FROM pyra_quotes;
--   Expected: {draft, sent, signed} — all 3 are in the new allowed list.
--   If unexpected statuses appear, audit + decide before applying.
--
-- New allowed values (matches lib/constants/statuses.ts QUOTE_STATUS):
--   draft, pending_approval, sent, viewed, signed, invoiced, rejected,
--   expired, cancelled
--
-- Idempotency contract:
--   DROP CONSTRAINT IF EXISTS — safe re-apply on:
--     (a) empty database (constraint doesn't exist yet — DROP is no-op)
--     (b) live production (constraint exists from this migration — DROP
--         removes it, ADD re-creates it)
--   The ADD is plain ALTER (no IF NOT EXISTS — Postgres doesn't support
--   that on constraints), relying on the preceding DROP for re-apply safety.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [x] `pnpm db:check-drift` clean before writing this file (18 tracked)
--   [x] No backup needed (Risk tier 1; constraint relaxation never
--       invalidates existing rows)
--   [x] DROP IF EXISTS guard on the destructive operation
--   [x] No data backfill (DDL only)
--   [x] Pre-flight verification query stub above
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

ALTER TABLE pyra_quotes
  DROP CONSTRAINT IF EXISTS pyra_quotes_status_check;

ALTER TABLE pyra_quotes
  ADD CONSTRAINT pyra_quotes_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text,
    'pending_approval'::text,
    'sent'::text,
    'viewed'::text,
    'signed'::text,
    'invoiced'::text,
    'rejected'::text,
    'expired'::text,
    'cancelled'::text
  ]));


-- ────────────────────────────────────────────────────────────────────────────
-- Comment for future maintainers
-- ────────────────────────────────────────────────────────────────────────────

COMMENT ON CONSTRAINT pyra_quotes_status_check ON pyra_quotes IS
  'Allowed quote statuses (Phase Q Commit 1). Mirror of lib/constants/statuses.ts QUOTE_STATUS. ADDING a new status requires re-applying this migration with the expanded ARRAY. REMOVING a status requires verifying no rows hold that value first (and a fresh migration to re-create the constraint).';


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Rollback philosophy: forward-only. To revert:
--   (b) Write a new migration that restores the pre-Phase-Q 6-status list:
--
-- -- ALTER TABLE pyra_quotes DROP CONSTRAINT IF EXISTS pyra_quotes_status_check;
-- -- ALTER TABLE pyra_quotes
-- --   ADD CONSTRAINT pyra_quotes_status_check
-- --   CHECK (status = ANY (ARRAY[
-- --     'draft'::text, 'sent'::text, 'viewed'::text, 'signed'::text,
-- --     'expired'::text, 'cancelled'::text
-- --   ]));
--
-- WARNING before rollback: query for rows with status IN ('pending_approval',
-- 'invoiced', 'rejected') first — if any exist, the rollback will FAIL with
-- constraint violation. Handle those rows before re-shrinking the allowed set.
