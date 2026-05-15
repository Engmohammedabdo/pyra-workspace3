-- ────────────────────────────────────────────────────────────────────────────
-- Migration NNN — <topic in 4-8 words>
--
-- Phase:        <e.g. "14.2 Commit 2" / "15.1" / "hotfix" / "bootstrap">
-- Author:       <pyra_users.username — e.g. "abdou">
-- Date:         YYYY-MM-DD
-- Reversible:   YES (rollback hints inline below)  |  NO (forward-only)
-- Touches data: NO (DDL only)  |  YES (UPDATE/INSERT — note expected row count)
-- Risk tier:    1 (deterministic, no existing data touched)
--               2 (touches existing data — must run on staging first when v1.1
--                  staging exists; until then, MUST backup via
--                  `pnpm db:backup pre-NNN`)
--
-- Purpose:
--   <2-4 sentences. Why this migration exists. What problem it solves.
--    Link to the Phase doc or issue ref where helpful.>
--
-- Idempotency contract:
--   All DDL uses IF NOT EXISTS / IF EXISTS so re-apply is safe on:
--     (a) an empty database during fresh bootstrap, AND
--     (b) the live production database after the migration has already run.
--   Any data backfill (UPDATE / INSERT) is guarded via `WHERE col IS NULL`,
--   `ON CONFLICT ... DO NOTHING`, or equivalent — so re-apply does NOT
--   duplicate rows or overwrite hand-edits made after the original apply.
--
-- Pre-flight checklist (per docs/MIGRATIONS.md §4):
--   [ ] `pnpm db:check-drift` clean before writing this file
--   [ ] `pnpm db:backup pre-NNN` BEFORE applying (mandatory for Risk tier 2)
--   [ ] IF NOT EXISTS / IF EXISTS guards on every DDL statement
--   [ ] Any data backfill is idempotent (ON CONFLICT / WHERE IS NULL)
--   [ ] Manual verification query stub ready (see §6 of runbook)
-- ────────────────────────────────────────────────────────────────────────────


-- ─── UP ─────────────────────────────────────────────────────────────────────

-- DDL statements here. Examples (delete those that don't apply, fill the rest):
--
--   CREATE TABLE IF NOT EXISTS pyra_<name> (
--     id          varchar PRIMARY KEY,
--     col_a       text NOT NULL,
--     col_b       integer NOT NULL CHECK (col_b >= 0),
--     created_at  timestamptz NOT NULL DEFAULT NOW()
--   );
--
--   CREATE INDEX IF NOT EXISTS idx_<name>_<col>
--     ON pyra_<name> (col_a);
--
--   ALTER TABLE pyra_<existing>
--     ADD COLUMN IF NOT EXISTS new_col text;
--
--   -- For ADD COLUMN with NOT NULL on a populated table, use the 3-step
--   -- pattern documented in docs/MIGRATIONS.md §5.5.


-- ─── DATA BACKFILL (optional — delete this block if Touches data = NO) ──────

-- Idempotent backfill examples:
--
--   UPDATE pyra_<table>
--   SET    new_col = '<default>'
--   WHERE  new_col IS NULL;                   -- only un-backfilled rows
--
--   INSERT INTO pyra_<table> (id, col_a) VALUES
--     ('seed_1', 'value_1'),
--     ('seed_2', 'value_2')
--   ON CONFLICT (id) DO NOTHING;              -- skip already-seeded rows


-- ─── DOWN (informational — NOT executed by any tool) ───────────────────────

-- Rollback philosophy: forward-only. The Pyra migration system does NOT run
-- down-scripts automatically. To revert this migration's effect, EITHER:
--
--   (a) Restore from the `pnpm db:backup pre-NNN` snapshot captured before
--       the migration was applied (preferred when data changed), OR
--   (b) Write a new migration NNN+1 that reverses the relevant DDL (preferred
--       when no data backfill needs to be undone).
--
-- Inline hints (commented out so they never execute by accident):
--
-- -- DROP INDEX IF EXISTS idx_<name>_<col>;
-- -- ALTER TABLE pyra_<existing> DROP COLUMN IF EXISTS new_col;
-- -- DROP TABLE IF EXISTS pyra_<name>;
