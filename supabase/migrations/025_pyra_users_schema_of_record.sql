-- Migration 025 — Schema of record for pyra_users (HR/payroll organization Phase 1)
-- Adds the fields that make pyra_users the single source of truth:
--   * salary_currency — first-class per-employee pay currency (enables EGP staff
--     without the salary=0 hack; default 'AED' so all existing rows stay correct)
--   * onboarding_id   — links a user to the onboarding record that created them
--     (replaces fragile username-matching; ON DELETE SET NULL keeps the user)
--   * salary_breakdown — the basic/housing/transport/etc. split captured by the
--     onboarding wizard (was lost to offer_data JSON); salary stays the monthly total
--
-- All additive + idempotent. No data migration needed (defaults are correct).
-- pyra_onboarding.id is varchar(24) — the FK column matches.

ALTER TABLE pyra_users
  ADD COLUMN IF NOT EXISTS salary_currency varchar(3) NOT NULL DEFAULT 'AED';

ALTER TABLE pyra_users
  ADD COLUMN IF NOT EXISTS onboarding_id varchar(24) NULL
    REFERENCES pyra_onboarding(id) ON DELETE SET NULL;

ALTER TABLE pyra_users
  ADD COLUMN IF NOT EXISTS salary_breakdown jsonb NULL;
