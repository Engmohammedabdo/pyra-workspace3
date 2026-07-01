-- Migration 029: track when an employee was deactivated (for turnover metrics)
--
-- pyra_users had only status (active/inactive/suspended) with no timestamp of
-- WHEN the flip happened, so turnover/attrition ("how many left in the last 90
-- days") was impossible. This adds a nullable timestamp stamped on the
-- active → inactive/suspended transition (and cleared on reactivation).
--
-- Risk tier 1 (additive, nullable). Existing inactive users backfill to NULL
-- (departure date unknown) — they simply won't appear in departed-in-window
-- counts, which is correct (we don't know when they left).

ALTER TABLE pyra_users
  ADD COLUMN IF NOT EXISTS deactivated_at timestamptz NULL;

-- DOWN (informational only — forward-only policy):
-- -- ALTER TABLE pyra_users DROP COLUMN IF EXISTS deactivated_at;
