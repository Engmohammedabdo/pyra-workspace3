-- =============================================================
-- Migration 023: payroll integrity (FK + orphan cleanup)
-- =============================================================
-- Context: Payroll Integrity Fixes (Phase F).
--
-- 1) Symmetry: pyra_payroll_items.payroll_id has an FK to
--    pyra_payroll_runs but pyra_employee_payments.payroll_id did not.
--    Add it (ON DELETE SET NULL — unlink payments if a run is deleted).
--    Pre-verified clean: 0 rows with payroll_id pointing at a missing run.
-- 2) Delete the orphan salary_history row for 'abeer' (no such user) —
--    the missing-FK gap that allowed it. username-as-FK is intentionally
--    avoided system-wide (mutable text keys), so we only delete the orphan.
--
-- Risk tier: 2 (touches existing data — orphan delete). Backup taken.
-- Forward-only (Phase 14.2). Rollback = a new forward migration.
-- =============================================================

DELETE FROM pyra_salary_history
WHERE username = 'abeer'
  AND NOT EXISTS (SELECT 1 FROM pyra_users u WHERE u.username = pyra_salary_history.username);

ALTER TABLE pyra_employee_payments
  DROP CONSTRAINT IF EXISTS pyra_employee_payments_payroll_id_fkey;

ALTER TABLE pyra_employee_payments
  ADD CONSTRAINT pyra_employee_payments_payroll_id_fkey
  FOREIGN KEY (payroll_id) REFERENCES pyra_payroll_runs(id) ON DELETE SET NULL;

-- -- DOWN (informational only — never auto-run):
-- -- ALTER TABLE pyra_employee_payments DROP CONSTRAINT IF EXISTS pyra_employee_payments_payroll_id_fkey;
