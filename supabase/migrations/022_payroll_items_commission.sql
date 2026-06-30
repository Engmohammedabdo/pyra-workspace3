-- =============================================================
-- Migration 022: pyra_payroll_items.commission column
-- =============================================================
-- Context: Payroll Integrity Fixes (Phase E — commission as a
-- first-class line item).
--
-- Before this migration, the payroll calculate route summed
-- `source_type='commission'` employee_payments into net_pay but
-- stored NO `commission` column on pyra_payroll_items. As a result
-- the payslip breakdown (base + task + overtime + bonus - deductions)
-- did NOT reconcile to net_pay whenever a commission existed.
--
-- This adds a dedicated, non-null `commission` column (default 0) so
-- the calculate route can store it and every payslip surface can show
-- it. Existing rows backfill to 0 (no commission was ever broken out).
--
-- Risk tier: 1 (additive, NOT NULL DEFAULT 0 — no data loss).
-- Forward-only (Phase 14.2). Rollback = a new forward migration.
-- =============================================================

ALTER TABLE pyra_payroll_items
  ADD COLUMN IF NOT EXISTS commission numeric NOT NULL DEFAULT 0;

-- -- DOWN (informational only — never auto-run):
-- -- ALTER TABLE pyra_payroll_items DROP COLUMN IF EXISTS commission;
