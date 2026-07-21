-- =============================================================
-- Migration 040: Employee Offboarding
-- =============================================================
-- One permanent record per employee exit. Survives a re-hire (no unique
-- constraint on employee_username, exactly like pyra_onboarding). Adds the
-- last_working_day column on pyra_users as a denormalised convenience for
-- payroll/settlement; the pyra_offboarding row is the source of truth.
-- Risk tier: 1 (additive -- new table + one nullable column).
-- Forward-only (Phase 14.2).
-- =============================================================

CREATE TABLE IF NOT EXISTS pyra_offboarding (
  id                    varchar(24) PRIMARY KEY,
  employee_username     varchar NOT NULL,
  status                varchar(20) NOT NULL DEFAULT 'completed',
  last_working_day      date NOT NULL,
  exit_reason           varchar(30) NOT NULL,
  exit_notes            text,
  handover              jsonb NOT NULL DEFAULT '{}'::jsonb,
  settlement            jsonb NOT NULL DEFAULT '{}'::jsonb,
  settlement_payment_id varchar(24),
  locked                boolean NOT NULL DEFAULT false,
  lock_error            text,
  started_by            varchar NOT NULL,
  started_at            timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_offboarding_employee ON pyra_offboarding(employee_username);
CREATE INDEX IF NOT EXISTS idx_offboarding_status   ON pyra_offboarding(status);

ALTER TABLE pyra_users
  ADD COLUMN IF NOT EXISTS last_working_day date NULL;

-- Verification (run after applying):
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--    WHERE table_name = 'pyra_offboarding' ORDER BY ordinal_position;
--   SELECT column_name FROM information_schema.columns
--    WHERE table_name = 'pyra_users' AND column_name = 'last_working_day';

-- -- DOWN (informational only):
-- -- ALTER TABLE pyra_users DROP COLUMN IF EXISTS last_working_day;
-- -- DROP TABLE IF EXISTS pyra_offboarding;
