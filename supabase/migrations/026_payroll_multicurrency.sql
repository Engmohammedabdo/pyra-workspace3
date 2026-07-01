-- Migration 026 — First-class multi-currency payroll (HR/payroll organization Phase 2)
--
-- 1. pyra_payroll_items gets a `currency` column (populated from the run's currency
--    at calculate time) so every line item is self-describing.
-- 2. The run uniqueness moves from (month, year) to (month, year, currency) so an
--    AED run AND an EGP run can coexist for the same month. Each run stays
--    SINGLE-currency: calculate includes only employees whose salary_currency
--    matches the run currency — no cross-currency sums, no mislabelled amounts.
--
-- Idempotent. No data migration needed (existing items/runs are AED by default).

ALTER TABLE pyra_payroll_items
  ADD COLUMN IF NOT EXISTS currency varchar(3) NOT NULL DEFAULT 'AED';

ALTER TABLE pyra_payroll_runs
  DROP CONSTRAINT IF EXISTS pyra_payroll_runs_month_year_key;

ALTER TABLE pyra_payroll_runs
  ADD CONSTRAINT pyra_payroll_runs_month_year_currency_key UNIQUE (month, year, currency);
