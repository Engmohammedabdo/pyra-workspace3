-- Migration 050: allow explicit computed-deduction approval for the current
-- Dubai payroll month. Migration 046 temporarily blocked the current month
-- while live totals were mutable; the API now rebuilds trusted evidence at the
-- approval instant and the atomic function rechecks payroll, salary, currency,
-- aggregate cap, and idempotency before it writes anything.

DO $migration$
DECLARE
  v_signature pg_catalog.regprocedure := pg_catalog.to_regprocedure(
    'public.pyra_approve_employee_deduction(varchar,varchar,varchar,date,numeric,varchar,numeric,numeric,numeric,varchar,numeric,numeric,numeric,numeric,boolean,integer,boolean,numeric,numeric,jsonb,jsonb,text,text,varchar)'
  );
  v_definition text;
  v_updated_definition text;
  v_old_guard text := $guard$  -- Current-month computed totals are still mutable. Reject before any existing
  -- case/user/payroll lookup so this temporary policy is deterministic.
  IF p_period_month = v_current_month THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'deduction_current_period';
  END IF;

$guard$;
BEGIN
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'pyra_approve_employee_deduction signature is missing';
  END IF;

  SELECT pg_catalog.pg_get_functiondef(v_signature)
  INTO v_definition;

  IF pg_catalog.strpos(v_definition, 'deduction_current_period') = 0 THEN
    -- Idempotent re-run: the temporary current-month guard is already gone.
    RETURN;
  END IF;

  IF pg_catalog.strpos(v_definition, v_old_guard) = 0 THEN
    RAISE EXCEPTION 'pyra_approve_employee_deduction guard differs from migration 046';
  END IF;

  v_updated_definition := pg_catalog.replace(v_definition, v_old_guard, '');
  IF v_updated_definition = v_definition
     OR pg_catalog.strpos(v_updated_definition, 'deduction_current_period') > 0 THEN
    RAISE EXCEPTION 'current-month deduction guard was not removed';
  END IF;

  EXECUTE v_updated_definition;
END;
$migration$;

-- CREATE OR REPLACE preserves ACLs, but restate the service-role-only contract.
REVOKE ALL ON FUNCTION public.pyra_approve_employee_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  numeric, varchar, numeric, numeric, numeric, numeric, boolean, integer,
  boolean, numeric, numeric, jsonb, jsonb, text, text, varchar
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.pyra_approve_employee_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  numeric, varchar, numeric, numeric, numeric, numeric, boolean, integer,
  boolean, numeric, numeric, jsonb, jsonb, text, text, varchar
) FROM anon;
REVOKE ALL ON FUNCTION public.pyra_approve_employee_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  numeric, varchar, numeric, numeric, numeric, numeric, boolean, integer,
  boolean, numeric, numeric, jsonb, jsonb, text, text, varchar
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.pyra_approve_employee_deduction(
  varchar, varchar, varchar, date, numeric, varchar, numeric, numeric,
  numeric, varchar, numeric, numeric, numeric, numeric, boolean, integer,
  boolean, numeric, numeric, jsonb, jsonb, text, text, varchar
) TO service_role;

-- -- DOWN (manual only): re-apply migration 046's complete
-- -- pyra_approve_employee_deduction definition and ACL block.
