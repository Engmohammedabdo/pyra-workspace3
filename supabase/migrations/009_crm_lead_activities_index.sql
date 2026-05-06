-- =============================================
-- Migration 009: CRM Phase 1 — pyra_lead_activities additive ops
-- PRD ref: CRM-PRD/02-DATABASE-AND-MIGRATION.md crm_005_lead_activity_types.sql
-- Tier: 1 (additive — IF NOT EXISTS, idempotent)
-- Reversible: YES
-- Notes:
--   - `metadata jsonb` ALREADY EXISTS in this DB (per baseline-schema.txt) —
--     the ALTER below is a no-op. Kept for idempotence parity with the PRD.
--   - The composite index is the actual value-add: timeline queries on a
--     single lead are sorted by created_at DESC.
--   - Activity type values are NOT enforced by a CHECK constraint — they're
--     enforced in TypeScript via the LEAD_ACTIVITY_TYPES union in
--     lib/constants/statuses.ts. This avoids breaking legacy rows.
--   - Column is `description` (not `content` as some PRD prose says) — per
--     Q-DB-003 answer in CRM-PRD/06-OPEN-QUESTIONS.md.
-- =============================================

-- UP
ALTER TABLE pyra_lead_activities
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_lead_activities_lead_created
  ON pyra_lead_activities(lead_id, created_at DESC);

-- DOWN
-- ALTER TABLE pyra_lead_activities DROP COLUMN IF EXISTS metadata;
-- DROP INDEX IF EXISTS idx_lead_activities_lead_created;
