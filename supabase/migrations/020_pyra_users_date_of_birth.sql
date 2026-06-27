-- ============================================================
-- 020_pyra_users_date_of_birth.sql
-- ============================================================
-- HR bundle v1 — adds date_of_birth so the HR Overview
-- "Celebrations" widget can surface birthdays alongside work
-- anniversaries (derived from the existing hire_date column).
--
-- Risk tier 1 (additive, nullable, no backfill). Idempotent.
-- ============================================================

ALTER TABLE pyra_users
  ADD COLUMN IF NOT EXISTS date_of_birth date NULL;

-- ============================================================
-- Verification (run after migration):
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'pyra_users' AND column_name = 'date_of_birth';
-- Expected 1 row: date_of_birth | date | YES
-- ============================================================
