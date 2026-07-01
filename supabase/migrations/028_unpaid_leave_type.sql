-- Migration 028: seed an unpaid leave type
--
-- The payroll calculate route deducts approved UNPAID leave by matching
-- pyra_leave_requests.type against pyra_leave_types.name WHERE is_paid=false.
-- No is_paid=false type existed, so unpaid-leave deduction was operationally
-- dead. This seeds one canonical unpaid type. Admins can add more via the
-- existing Leave Settings types UI.
--
-- Risk tier 1 (additive seed, idempotent via ON CONFLICT).

INSERT INTO pyra_leave_types
  (id, name, name_ar, icon, color, default_days, max_carry_over,
   requires_attachment, is_paid, is_active, sort_order)
VALUES
  ('lt_unpaid', 'Unpaid', 'إجازة بدون راتب', 'CalendarX', 'gray',
   0, 0, false, false, true, 10)
ON CONFLICT (id) DO NOTHING;

-- DOWN (informational only — forward-only policy):
-- -- DELETE FROM pyra_leave_types WHERE id = 'lt_unpaid';
